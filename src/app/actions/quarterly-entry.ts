'use server'

import { checkPreferenceRevision } from '@/lib/operating-data/preference-store'
import { operatingResult } from '@/lib/operating-data/result'
import { z } from 'zod'
import { and, eq, isNull, or, desc, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { indicatorData, subOrganizations, operatingReportingModes, operatingEntryDrafts, operatingDataRevisions, dataFreezes } from '@/lib/db/schema'
import { INPUT_FIELDS } from '@/lib/indicators/validation'
import { revalidatePath } from 'next/cache'
import { operatingValuesSchema, publicationSchema, type EntryDraft, type Publication, validatePublication } from '@/lib/operating-data/publication'
import { inputPeriodSchema, periodKey, periodState, recordPeriod } from '@/lib/operating-data/periods'
import { OperatingConflict, publishOperatingTransaction, operatingSourceRevision } from '@/lib/operating-data/write'
import { buildCalculationReport } from '@/lib/indicators/report'
import { loadCalculationReport } from '@/lib/indicators/report-data'
import { inputRevision } from '@/lib/indicators/revision'

const selectionSchema = z.object({ subOrganizationId: z.uuid(), year: z.number().int().min(2000).max(2100), quarter: z.number().int().min(1).max(4), workflow: z.enum(['quarter', 'batch', 'year']) }).strict()
type Selection = z.infer<typeof selectionSchema>
const draftSchema = z.object({ entries: z.array(z.object({ period: inputPeriodSchema, expectedRevision: z.number().int().nonnegative(),
  values: operatingValuesSchema, coverageConfirmed: z.boolean() }).strict()).max(3),
  baseline: publicationSchema.shape.baseline, expectedModeRevision: z.number().int().nonnegative(), expectedPreferenceRevision: z.number().int().nonnegative().optional() }).strict()

async function actor() {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Nicht eingeloggt.')
  return session.user.id
}

async function loadQuarterlyEntryInternal(input: Selection) {
  const selection = selectionSchema.parse(input)
  const authorId = await actor()
  return db.transaction(async tx => {
    const kitchen = await tx.query.subOrganizations.findFirst({ where: eq(subOrganizations.id, selection.subOrganizationId) })
    if (!kitchen) throw new Error('Zugriff verweigert.')
    const rows = await tx.query.indicatorData.findMany({ where: and(eq(indicatorData.subOrganizationId, kitchen.id), eq(indicatorData.reportingYear, selection.year), isNull(indicatorData.supersededAt)), orderBy: indicatorData.id })
    const mode = await tx.query.operatingReportingModes.findFirst({ where: and(eq(operatingReportingModes.subOrganizationId, kitchen.id), eq(operatingReportingModes.reportingYear, selection.year)) })
    const draft = await tx.query.operatingEntryDrafts.findFirst({ where: and(eq(operatingEntryDrafts.authorId, authorId), eq(operatingEntryDrafts.subOrganizationId, kitchen.id), eq(operatingEntryDrafts.reportingYear, selection.year), eq(operatingEntryDrafts.quarter, selection.quarter), eq(operatingEntryDrafts.workflow, selection.workflow)) })
    const revisions = await tx.query.operatingDataRevisions.findMany({
      where: and(eq(operatingDataRevisions.subOrganizationId, kitchen.id), or(eq(operatingDataRevisions.reportingYear, selection.year), isNull(operatingDataRevisions.reportingYear))),
      orderBy: desc(operatingDataRevisions.createdAt), limit: 50,
    })
    const frozen = Boolean(await tx.query.dataFreezes.findFirst({ where: eq(dataFreezes.year, selection.year) }))
    const permission = await tx.execute(sql`SELECT app_private.can_write(${kitchen.organizationId}::uuid, ${kitchen.id}::uuid) AS allowed`)
    const preference = await checkPreferenceRevision(tx, kitchen.id, selection.year)
    const periods = selection.workflow === 'year' ? [inputPeriodSchema.parse({ kind: 'year', year: selection.year, index: 1 })] : selection.workflow === 'quarter'
      ? [inputPeriodSchema.parse({ kind: 'quarter', year: selection.year, index: selection.quarter })]
      : [0, 1, 2].map(i => inputPeriodSchema.parse({ kind: 'month', year: selection.year, index: (selection.quarter - 1) * 3 + 1 + i }))
    const initial: EntryDraft = { expectedPreferenceRevision: preference?.revision ?? 0, expectedModeRevision: mode?.revision ?? 0, entries: periods.map(period => {
      const row = rows.find(row => periodKey(recordPeriod(row)) === periodKey(period))
      return { period, expectedRevision: row?.revision ?? 0, coverageConfirmed: row?.coverageConfirmed ?? false,
        values: Object.fromEntries(INPUT_FIELDS.map(field => [field, row?.[field] ?? null])) }
    }) }
    // Published revisions are never overwritten by a stale stored draft silently.
    return { selection, revisions, frequency: preference?.frequency ?? null, preferenceRevision: preference?.revision ?? 0, mode: mode?.mode ?? 'legacy', modeRevision: mode?.revision ?? 0, draft: draft?.payload ?? initial,
      draftRevision: draft?.revision ?? 0, saved: initial, frozen, canWrite: Boolean(permission.rows[0]?.allowed),
      baseline: { amount: kitchen.foodWasteBaseAmount, date: kitchen.foodWasteBaseDate?.toISOString().slice(0, 10) ?? null, expectedRevision: kitchen.baselineRevision },
      existingPeriods: rows.filter(row => INPUT_FIELDS.some(field => row[field] !== null)).map(row => ({ period: recordPeriod(row), revision: row.revision })),
      sourceRevision: operatingSourceRevision(rows, { amount: kitchen.foodWasteBaseAmount, date: kitchen.foodWasteBaseDate, revision: kitchen.baselineRevision }, mode) }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

async function saveQuarterlyDraftInternal(input: Selection, payload: EntryDraft, expectedRevision: number) {
  const selection = selectionSchema.parse(input)
  const draft = draftSchema.parse(payload)
  z.number().int().nonnegative().parse(expectedRevision)
  const authorId = await actor()
  const seen = new Set<string>()
  for (const entry of draft.entries) {
    if (entry.period.year !== selection.year || entry.period.kind !== (selection.workflow === 'quarter' ? 'quarter' : selection.workflow === 'year' ? 'year' : 'month') ||
      (entry.period.kind === 'year' ? 1 : entry.period.kind === 'quarter' ? entry.period.index : Math.ceil(entry.period.index / 3)) !== selection.quarter || (periodState(entry.period) === 'future' && Object.values(entry.values).some(value => value !== null && value !== ''))) throw new Error('Ungültige Entwurfsperiode.')
    if (seen.has(periodKey(entry.period))) throw new Error('Doppelte Entwurfsperiode.')
    seen.add(periodKey(entry.period))
  }
  return db.transaction(async tx => {
    const kitchen = await tx.query.subOrganizations.findFirst({ where: eq(subOrganizations.id, selection.subOrganizationId) })
    if (!kitchen) throw new Error('Zugriff verweigert.')
    const permission = await tx.execute(sql`SELECT app_private.can_write(${kitchen.organizationId}::uuid, ${kitchen.id}::uuid) AS allowed`)
    if (!permission.rows[0]?.allowed) throw new Error('Keine Berechtigung zum Bearbeiten.')
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${authorId}:${kitchen.id}:${selection.year}:${selection.workflow}:${selection.quarter}`}, 1936028725))`)
    await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(1936028722, ${selection.year})`)
    if (await tx.query.dataFreezes.findFirst({ where: eq(dataFreezes.year, selection.year) })) throw new Error('Das Berichtsjahr ist gesperrt.')
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${kitchen.id}, 1936028723))`)
    await checkPreferenceRevision(tx, kitchen.id, selection.year, draft.expectedPreferenceRevision)
    const where = and(eq(operatingEntryDrafts.authorId, authorId), eq(operatingEntryDrafts.subOrganizationId, kitchen.id), eq(operatingEntryDrafts.reportingYear, selection.year), eq(operatingEntryDrafts.quarter, selection.quarter), eq(operatingEntryDrafts.workflow, selection.workflow))
    const existing = await tx.query.operatingEntryDrafts.findFirst({ where })
    if (existing && existing.revision !== expectedRevision && inputRevision(existing.payload) === inputRevision(draft)) return { revision: existing.revision }
    if ((existing?.revision ?? 0) !== expectedRevision) throw new OperatingConflict('Der Entwurf wurde in einem anderen Fenster geändert. Bitte vor dem Überschreiben neu laden.')
    if (existing) {
      const updated = await tx.update(operatingEntryDrafts).set({ payload: draft, revision: existing.revision + 1, updatedAt: new Date() }).where(eq(operatingEntryDrafts.id, existing.id)).returning({ id: operatingEntryDrafts.id })
      if (!updated.length) throw new Error('Keine Berechtigung zum Bearbeiten.')
      return { revision: existing.revision + 1 }
    }
    await tx.insert(operatingEntryDrafts).values({ organizationId: kitchen.organizationId, subOrganizationId: kitchen.id, reportingYear: selection.year, authorId, workflow: selection.workflow, quarter: selection.quarter, payload: draft })
    return { revision: 1 }
  })
}

async function publishQuarterlyEntryInternal(input: Publication) {
  if (input.workflow === 'legacy') throw new Error('Ungültiger Erfassungsweg.')
  const actorId = await actor()
  const result = await db.transaction(tx => publishOperatingTransaction(tx, actorId, input))
  for (const path of ['/dashboard', '/indikatoren', '/vergleich', '/datasets', '/tasks']) revalidatePath(path)
  return result
}

async function previewPeriodConversionInternal(input: Omit<Publication, 'conversion' | 'workflow'>, mode: 'legacy' | 'quarterly') {
  await actor()
  const request = validatePublication({ ...input, workflow: mode === 'quarterly' ? 'quarter' : 'legacy' })
  z.enum(['legacy', 'quarterly']).parse(mode)
  return db.transaction(async tx => {
    const kitchen = await tx.query.subOrganizations.findFirst({ where: eq(subOrganizations.id, request.subOrganizationId) })
    if (!kitchen) throw new Error('Zugriff verweigert.')
    const rows = await tx.query.indicatorData.findMany({ where: and(eq(indicatorData.subOrganizationId, kitchen.id), eq(indicatorData.reportingYear, request.year), isNull(indicatorData.supersededAt)), orderBy: indicatorData.id })
    const sourceMode = await tx.query.operatingReportingModes.findFirst({ where: and(eq(operatingReportingModes.subOrganizationId, kitchen.id), eq(operatingReportingModes.reportingYear, request.year)) })
    const before = await loadCalculationReport(tx, { organizationId: kitchen.organizationId, subOrganizationId: kitchen.id }, request.year, 'auto')
    const proposedRows = request.entries.map((e, i) => ({ id: `proposed-${i}`, subOrganizationId: kitchen.id, reportingYear: request.year,
      reportingMonth: e.period.kind === 'quarter' ? null : e.period.kind === 'year' ? 0 : e.period.index,
      periodKind: e.period.kind, periodIndex: e.period.index, ...e.values }))
    const afterInputs = { ...before.inputs, rows: proposedRows, reportingModes: [{ subOrganizationId: kitchen.id, mode, revision: (sourceMode?.revision ?? 0) + 1 }], kitchens: before.inputs.kitchens.map(k => request.baseline ? { ...k, foodWasteBaseAmount: request.baseline.amount, foodWasteBaseDate: request.baseline.date } : k) }
    const after = buildCalculationReport(afterInputs, inputRevision(afterInputs))
    return { before, after, sourceRevision: operatingSourceRevision(rows, { amount: kitchen.foodWasteBaseAmount, date: kitchen.foodWasteBaseDate, revision: kitchen.baselineRevision }, sourceMode),
      replacedPeriods: rows.map(recordPeriod), targetMode: mode }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

export async function loadQuarterlyEntry(...args: Parameters<typeof loadQuarterlyEntryInternal>) {
  return operatingResult(() => loadQuarterlyEntryInternal(...args))
}

export async function saveQuarterlyDraft(...args: Parameters<typeof saveQuarterlyDraftInternal>) {
  return operatingResult(() => saveQuarterlyDraftInternal(...args))
}

export async function publishQuarterlyEntry(...args: Parameters<typeof publishQuarterlyEntryInternal>) {
  return operatingResult(() => publishQuarterlyEntryInternal(...args))
}

export async function previewPeriodConversion(...args: Parameters<typeof previewPeriodConversionInternal>) {
  return operatingResult(() => previewPeriodConversionInternal(...args))
}
