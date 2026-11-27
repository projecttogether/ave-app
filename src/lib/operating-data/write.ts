import { and, eq, isNull, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { indicatorData, operatingReportingModes, operatingMutationReceipts, subOrganizations, dataFreezes } from '@/lib/db/schema'
import { INPUT_FIELDS, normalizeIndicatorInput } from '@/lib/indicators/validation'
import { inputRevision } from '@/lib/indicators/revision'
import { checkedOperatingPatch, validatePublication, type Publication, type PublicationResult } from './publication'
import { periodColumns, periodKey, recordPeriod } from './periods'
import { checkPreferenceRevision, writeReportingPreference } from './preference-store'
import { frequencyKind } from './preferences'

export type OperatingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export class OperatingConflict extends Error {
  constructor(message = 'Die Daten wurden inzwischen geändert. Bitte neu laden und die Änderungen prüfen.') { super(message); this.name = 'OperatingConflict' }
}

export function operatingSourceRevision(rows: unknown, baseline: unknown, mode: unknown) {
  return inputRevision({ rows, baseline, mode })
}

/** Transaction owner supplies authenticated actor identity. Every mutation is
 * additionally authorized by RLS, including baseline and receipt writes. */
export async function publishOperatingTransaction(tx: OperatingTransaction, actorId: string, input: Publication): Promise<PublicationResult> {
  const request = validatePublication(input)
  const hash = inputRevision(request)
  await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(1936028722, ${request.year})`)
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${request.subOrganizationId}, 1936028723))`)
  const [kitchen] = await tx.select().from(subOrganizations).where(eq(subOrganizations.id, request.subOrganizationId))
  if (!kitchen) throw new Error('Zugriff verweigert.')
  const permission = await tx.execute(sql`SELECT app_private.can_write(${kitchen.organizationId}::uuid, ${kitchen.id}::uuid) AS allowed`)
  if (!permission.rows[0]?.allowed) throw new Error('Keine Berechtigung zum Bearbeiten.')
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${actorId + ':' + request.requestId}, 1936028724))`)
  const prior = await tx.query.operatingMutationReceipts.findFirst({ where: and(eq(operatingMutationReceipts.actorId, actorId), eq(operatingMutationReceipts.requestId, request.requestId)) })
  if (prior) {
    if (prior.payloadHash !== hash) throw new OperatingConflict('Dieser Speichervorgang wurde mit anderem Inhalt bereits verwendet.')
    return prior.result
  }
  if (await tx.query.dataFreezes.findFirst({ where: eq(dataFreezes.year, request.year) })) throw new Error('Das Berichtsjahr ist für die Bearbeitung gesperrt.')
  const preference = await checkPreferenceRevision(tx, kitchen.id, request.year, request.expectedPreferenceRevision)
  if (request.conversion && preference && !request.conversion.frequency) {
    throw new OperatingConflict('Bitte den Erfassungsrhythmus für die Jahreskorrektur ausdrücklich wählen.')
  }
  if (!request.conversion && preference && request.entries.some(entry => entry.period.kind !== frequencyKind(preference.frequency))) {
    throw new OperatingConflict('Die Eingaben passen nicht zum gespeicherten Erfassungsrhythmus. Bitte den Rhythmus ausdrücklich ändern.')
  }
  await tx.execute(sql`SELECT set_config('app.operating_request', ${request.requestId}, true), set_config('app.operating_reason', ${request.conversion?.reason ?? request.workflow}, true)`)
  const whereMode = and(eq(operatingReportingModes.subOrganizationId, kitchen.id), eq(operatingReportingModes.reportingYear, request.year))
  let [mode] = await tx.select().from(operatingReportingModes).where(whereMode).for('update')
  if (!mode) {
    if (request.expectedModeRevision !== undefined && request.expectedModeRevision !== 0) throw new OperatingConflict()
    ;[mode] = await tx.insert(operatingReportingModes).values({ organizationId: kitchen.organizationId, subOrganizationId: kitchen.id, reportingYear: request.year }).returning()
  } else if (request.expectedModeRevision !== undefined && mode.revision !== request.expectedModeRevision) throw new OperatingConflict()
  const whereRows = and(eq(indicatorData.subOrganizationId, kitchen.id), eq(indicatorData.reportingYear, request.year), isNull(indicatorData.supersededAt))
  let rows = await tx.select().from(indicatorData).where(whereRows).orderBy(indicatorData.id).for('update')
  if (request.conversion) {
    const revision = operatingSourceRevision(rows, { amount: kitchen.foodWasteBaseAmount, date: kitchen.foodWasteBaseDate, revision: kitchen.baselineRevision }, mode)
    if (revision !== request.conversion.expectedSourceRevision) throw new OperatingConflict('Die Korrekturvorschau ist veraltet.')
    // Preserve original rows and their numerical contents. All readers use active rows.
    for (const row of rows.filter(row => INPUT_FIELDS.some(field => row[field] !== null))) {
      await tx.update(indicatorData).set({ supersededAt: new Date(), updatedBy: actorId }).where(eq(indicatorData.id, row.id))
    }
    rows = rows.filter(row => INPUT_FIELDS.every(field => row[field] === null))
    ;[mode] = await tx.update(operatingReportingModes).set({ mode: request.conversion.mode }).where(whereMode).returning()
  } else if (request.workflow === 'quarter' && mode.mode !== 'quarterly') {
    if (rows.some(row => INPUT_FIELDS.some(field => row[field] !== null))) throw new OperatingConflict('Für dieses Jahr sind Monats- oder Jahreswerte vorhanden. Eine ausdrückliche Korrektur ist erforderlich.')
    ;[mode] = await tx.update(operatingReportingModes).set({ mode: 'quarterly' }).where(whereMode).returning()
  }
  const revisions: Record<string, number> = {}
  for (const entry of request.entries) {
    const key = periodKey(entry.period)
    const existing = rows.find(row => periodKey(recordPeriod(row)) === key)
    if (!request.conversion && (existing?.revision ?? 0) !== entry.expectedRevision) throw new OperatingConflict()
    if ((entry.period.kind === 'quarter') !== (mode.mode === 'quarterly')) throw new OperatingConflict('Quartalswerte dürfen nicht mit Monats- oder Jahreswerten vermischt werden.')
    checkedOperatingPatch(existing, entry.values)
    const values = normalizeIndicatorInput(entry.values)
    if (INPUT_FIELDS.every(field => (field in values ? values[field] : existing?.[field]) == null)) {
      // Keep a versioned empty row: deleting its identity would let an old
      // expectedRevision=0 edit resurrect a value after somebody cleared it.
      if (existing) {
        const [cleared] = await tx.update(indicatorData).set({ ...values, coverageConfirmed: existing.coverageConfirmed,
          updatedBy: actorId, updatedAt: new Date() }).where(eq(indicatorData.id, existing.id)).returning({ revision: indicatorData.revision })
        revisions[key] = cleared.revision
      } else revisions[key] = 0
      continue
    }
    const payload = { ...values, coverageConfirmed: entry.coverageConfirmed, updatedBy: actorId, updatedAt: new Date() }
    if (existing) {
      const [saved] = await tx.update(indicatorData).set(payload).where(eq(indicatorData.id, existing.id)).returning({ revision: indicatorData.revision })
      revisions[key] = saved.revision
    } else {
      const columns = periodColumns(entry.period)
      const previous = await tx.execute(sql`SELECT COALESCE(MAX(revision),0)::int AS revision FROM indicator_data WHERE sub_organization_id=${kitchen.id}::uuid AND reporting_year=${request.year} AND period_kind=${columns.periodKind} AND period_index=${columns.periodIndex}`)
      const [saved] = await tx.insert(indicatorData).values({ ...payload, ...columns, organizationId: kitchen.organizationId, subOrganizationId: kitchen.id,
        revision: Number(previous.rows[0]?.revision ?? 0) + 1, createdBy: actorId }).returning({ revision: indicatorData.revision })
      revisions[key] = saved.revision
    }
  }
  let baselineRevision = kitchen.baselineRevision
  if (request.baseline) {
    if (request.baseline.expectedRevision !== kitchen.baselineRevision) throw new OperatingConflict('Der jährliche Basiswert wurde inzwischen geändert.')
    const saved = await tx.execute(sql`SELECT app_private.set_operating_baseline(${kitchen.id}::uuid, ${request.baseline.expectedRevision}, ${request.baseline.amount}::numeric, ${request.baseline.date}::date) AS revision`)
    baselineRevision = Number(saved.rows[0].revision)
  }
  const finalPreference = request.conversion?.frequency ? await writeReportingPreference(tx, kitchen, request.year,
    request.conversion.frequency, request.expectedPreferenceRevision!) : preference
  const result = { revisions, baselineRevision, modeRevision: mode.revision, preferenceRevision: finalPreference?.revision ?? 0 }
  await tx.insert(operatingMutationReceipts).values({ actorId, requestId: request.requestId, organizationId: kitchen.organizationId, subOrganizationId: kitchen.id, payloadHash: hash, result })
  return result
}
