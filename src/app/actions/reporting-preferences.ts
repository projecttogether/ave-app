'use server'

import { z } from 'zod'
import { and, eq, isNull, sql, desc } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { dataFreezes, indicatorData, operatingReportingModes, operatingReportingPreferences, subOrganizations } from '@/lib/db/schema'
import { revalidatePath } from 'next/cache'
import { annualIsConfirmed, getOperatingTasks, inferReportingFrequency, reportingFrequencySchema } from '@/lib/operating-data/preferences'
import { periodState, recordPeriod, reportingToday } from '@/lib/operating-data/periods'
import { operatingEntryHref } from '@/lib/operating-data/entry-selection'
import { hasOperatingValues } from '@/lib/operating-data/coverage'
import { checkPreferenceRevision, lockReportingPreference, preferenceWhere, writeReportingPreference } from '@/lib/operating-data/preference-store'
import { operatingResult } from '@/lib/operating-data/result'
import { INPUT_FIELDS } from '@/lib/indicators/validation'
import { REPORTING_START_YEAR } from '@/lib/reporting-period'

const scopeSchema = z.object({ subOrganizationId: z.uuid(), year: z.number().int().min(REPORTING_START_YEAR).max(2100) })
const changeSchema = scopeSchema.extend({ frequency: reportingFrequencySchema, expectedRevision: z.number().int().nonnegative(), confirmed: z.boolean().default(false) }).strict()
async function actor() {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Nicht eingeloggt.')
  return session.user.id
}

export async function getReportingPreference(input: z.infer<typeof scopeSchema>) {
  return operatingResult(async () => {
    const { subOrganizationId, year } = scopeSchema.parse(input)
    await actor()
    return db.transaction(async tx => {
      const kitchen = await tx.query.subOrganizations.findFirst({ where: eq(subOrganizations.id, subOrganizationId) })
      if (!kitchen) throw new Error('Zugriff verweigert.')
      const preference = await tx.query.operatingReportingPreferences.findFirst({ where: preferenceWhere(subOrganizationId, year) })
      const previous = await tx.query.operatingReportingPreferences.findMany({ where: eq(operatingReportingPreferences.subOrganizationId, subOrganizationId), orderBy: desc(operatingReportingPreferences.reportingYear) })
      const rows = await tx.query.indicatorData.findMany({ where: and(eq(indicatorData.subOrganizationId, subOrganizationId), eq(indicatorData.reportingYear, year), isNull(indicatorData.supersededAt)) })
      const mode = await tx.query.operatingReportingModes.findFirst({ where: and(eq(operatingReportingModes.subOrganizationId, subOrganizationId), eq(operatingReportingModes.reportingYear, year)) })
      const permission = await tx.execute(sql`SELECT app_private.can_write(${kitchen.organizationId}::uuid, ${kitchen.id}::uuid) AS allowed`)
      const annual = rows.find(row => recordPeriod(row).kind === 'year' && hasOperatingValues(row))
      return { frequency: preference?.frequency ?? null, revision: preference?.revision ?? 0, source: preference?.source ?? null,
        suggestion: inferReportingFrequency(rows, mode?.mode) ?? previous.find(p => p.reportingYear < year)?.frequency ?? null,
        canWrite: Boolean(permission.rows[0]?.allowed), frozen: Boolean(await tx.query.dataFreezes.findFirst({ where: eq(dataFreezes.year, year) })),
        yearClosed: periodState({ kind: 'year', year, index: 1 }) === 'closed',
        existingPeriods: rows.filter(hasOperatingValues).map(recordPeriod),
        annual: annual ? { id: annual.id, revision: annual.revision, values: Object.fromEntries(INPUT_FIELDS.map(field => [field, annual[field]])), confirmed: annualIsConfirmed(annual, preference) } : null }
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
  })
}

export async function setReportingFrequency(input: z.input<typeof changeSchema>) {
  return operatingResult(async () => {
    const request = changeSchema.parse(input)
    await actor()
    if (request.year > reportingToday().year) throw new Error('Ein zukünftiges Berichtsjahr kann noch nicht eingerichtet werden.')
    const result = await db.transaction(async tx => {
      const kitchen = await lockReportingPreference(tx, request.subOrganizationId, request.year)
      const previous = await checkPreferenceRevision(tx, kitchen.id, request.year, request.expectedRevision)
      const rows = await tx.query.indicatorData.findMany({ where: and(eq(indicatorData.subOrganizationId, kitchen.id), eq(indicatorData.reportingYear, request.year), isNull(indicatorData.supersededAt)) })
      const active = rows.filter(hasOperatingValues)
      const incompatible = active.some(row => (recordPeriod(row).kind === 'quarter') !== (request.frequency === 'quarterly'))
      if (incompatible) {
        const quarter = request.year === reportingToday().year ? Math.ceil(reportingToday().month / 3) : 1
        return { kind: 'conversion' as const, href: operatingEntryHref(kitchen.id, { kind: 'quarter', year: request.year, index: quarter },
          request.frequency === 'yearly' ? 'year' : request.frequency === 'monthly' ? 'batch' : undefined) }
      }
      if (active.length && previous?.frequency !== request.frequency && !request.confirmed) {
        return { kind: 'preview' as const, periods: active.map(recordPeriod), tasks: getOperatingTasks(request.year, request.frequency, rows, previous) }
      }
      const whereMode = and(eq(operatingReportingModes.subOrganizationId, kitchen.id), eq(operatingReportingModes.reportingYear, request.year))
      const mode = await tx.query.operatingReportingModes.findFirst({ where: whereMode })
      const nextMode = request.frequency === 'quarterly' ? 'quarterly' as const : 'legacy' as const
      await tx.execute(sql`SELECT set_config('app.operating_reason', 'Erfassungsrhythmus gewählt', true)`)
      if (mode && mode.mode !== nextMode) await tx.update(operatingReportingModes).set({ mode: nextMode }).where(whereMode)
      else if (!mode) await tx.insert(operatingReportingModes).values({ organizationId: kitchen.organizationId, subOrganizationId: kitchen.id, reportingYear: request.year, mode: nextMode })
      const saved = await writeReportingPreference(tx, kitchen, request.year, request.frequency, request.expectedRevision)
      return { kind: 'saved' as const, frequency: saved.frequency, revision: saved.revision }
    })
    if (result.kind === 'saved') { revalidatePath('/tasks'); revalidatePath('/form/operating'); revalidatePath('/operating-periods') }
    return result
  })
}

export async function confirmAnnualReporting(input: { subOrganizationId: string; year: number; expectedRevision: number; recordId: string; recordRevision: number }) {
  return operatingResult(async () => {
    const request = scopeSchema.extend({ expectedRevision: z.number().int().nonnegative(), recordId: z.uuid(), recordRevision: z.number().int().positive() }).strict().parse(input)
    const actorId = await actor()
    const result = await db.transaction(async tx => {
      const kitchen = await lockReportingPreference(tx, request.subOrganizationId, request.year)
      const preference = await tx.query.operatingReportingPreferences.findFirst({ where: preferenceWhere(kitchen.id, request.year) })
      if (preference?.frequency !== 'yearly' || periodState({ kind: 'year', year: request.year, index: 1 }) !== 'closed') throw new Error('Nur abgeschlossene Jahre mit jährlicher Erfassung können bestätigt werden.')
      const row = await tx.query.indicatorData.findFirst({ where: and(eq(indicatorData.id, request.recordId), eq(indicatorData.subOrganizationId, kitchen.id), eq(indicatorData.reportingYear, request.year), eq(indicatorData.periodKind, 'year'), isNull(indicatorData.supersededAt)) })
      if (!row || !hasOperatingValues(row) || row.revision !== request.recordRevision) throw new Error('Die Jahresdaten wurden geändert oder sind leer. Bitte erneut prüfen.')
      if (annualIsConfirmed(row, preference)) return { revision: preference.revision }
      await checkPreferenceRevision(tx, kitchen.id, request.year, request.expectedRevision)
      await tx.execute(sql`SELECT set_config('app.operating_reason', 'Jahresdaten bestätigt', true)`)
      const [saved] = await tx.update(operatingReportingPreferences).set({ annualRecordId: row.id, annualRecordRevision: row.revision,
        annualConfirmedAt: new Date(), annualConfirmedBy: actorId, annualConfirmationSource: 'user' }).where(preferenceWhere(kitchen.id, request.year)).returning()
      if (!saved) throw new Error('Keine Berechtigung zum Bestätigen.')
      return { revision: saved.revision }
    })
    revalidatePath('/tasks'); revalidatePath('/form/operating')
    return result
  })
}
