'use server'

import { normalizeIndicatorInput, validateIndicatorInput, validateAmount } from '@/lib/indicators/validation'
import { getIndicatorAndBaseData } from './indicators'
import { isYearFrozen } from './data-freeze'
import { getFutureReportingPeriodMessage, isFutureReportingPeriod } from '@/lib/reporting-period'
import { EMPTY_OPERATING_DATA, OPERATING_FIELDS, type OperatingDataFields, type OperatingPeriod } from '@/lib/operating-data/fields'
import type { OperatingSave } from '@/lib/operating-data/editor'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { publishOperatingTransaction } from '@/lib/operating-data/write'
import { periodKey, recordPeriod } from '@/lib/operating-data/periods'
import { revalidatePath } from 'next/cache'
import { checkPreferenceRevision } from '@/lib/operating-data/preference-store'
import { frequencyKind } from '@/lib/operating-data/preferences'
import { userFacingError } from '@/lib/errors'

export async function loadOperatingDataDraft(period: OperatingPeriod) {
  const [result, frozen, preference] = await Promise.all([
    getIndicatorAndBaseData(period.subOrganizationId, period.year, period.month),
    isYearFrozen(period.year),
    db.transaction(tx => checkPreferenceRevision(tx, period.subOrganizationId, period.year)),
  ])
  const data: OperatingDataFields = { ...EMPTY_OPERATING_DATA }
  for (const field of OPERATING_FIELDS) {
    const value = result.indicatorData?.[field]
    data[field] = value === null || value === undefined ? '' : String(value)
  }
  data.foodWasteBaseDate = result.baseData?.foodWasteBaseDate
    ? new Date(result.baseData.foodWasteBaseDate).toISOString().slice(0, 10) : ''
  data.foodWasteBaseAmount = result.baseData?.foodWasteBaseAmount == null ? '' : String(result.baseData.foodWasteBaseAmount)
  return { data, frozen, quarterly: result.reportingMode === 'quarterly', preferenceRevision: preference?.revision ?? 0,
    frequency: preference?.frequency ?? null, canEditFrequency: Boolean(preference && frequencyKind(preference.frequency) === (period.month === 0 ? 'year' : 'month')),
    modeRevision: result.modeRevision ?? 0, revision: result.indicatorData?.revision ?? 0, baselineRevision: result.baseData?.baselineRevision ?? 0 }
}

export async function saveOperatingDataDraft({ period, data, baseline, expectedRevision = 0, expectedBaselineRevision = 0, expectedModeRevision, expectedPreferenceRevision, requestId }: OperatingSave) {
  if (isFutureReportingPeriod(period.year, period.month)) {
    return { error: getFutureReportingPeriodMessage(period.year, period.month) }
  }
  if (await isYearFrozen(period.year)) return { error: 'Das Berichtsjahr ist für die Bearbeitung gesperrt.' }
  const issues = data ? validateIndicatorInput(data) : []
  const baselineIssue = baseline ? validateAmount(baseline.foodWasteBaseAmount, 'foodWasteBaseAmount', 'Jährliche Basis-Abfallmenge') : null
  if (baselineIssue) issues.push(baselineIssue)
  if (issues.length) return { error: issues.map(issue => issue.message).join(' ') }
  try {
    const session = await auth()
    if (!session?.user?.id) return { error: 'Nicht eingeloggt.' }
    const inputPeriod = recordPeriod({ reportingYear: period.year, reportingMonth: period.month })
    const result = await db.transaction(tx => publishOperatingTransaction(tx, session.user!.id!, {
      subOrganizationId: period.subOrganizationId, year: period.year, requestId: requestId ?? crypto.randomUUID(), workflow: 'legacy', expectedModeRevision, expectedPreferenceRevision,
      entries: data ? [{ period: inputPeriod, expectedRevision, values: normalizeIndicatorInput(data) }] : [],
      baseline: baseline ? { amount: baseline.foodWasteBaseAmount === '' ? null : String(baseline.foodWasteBaseAmount), date: baseline.foodWasteBaseDate || null, expectedRevision: expectedBaselineRevision } : undefined,
    }))
    for (const path of ['/dashboard', '/indikatoren', '/vergleich', '/datasets', '/tasks']) revalidatePath(path)
    return { success: true, revision: result.revisions[periodKey(inputPeriod)] ?? expectedRevision, baselineRevision: result.baselineRevision, modeRevision: result.modeRevision }
  } catch (error) { return { error: userFacingError(error, 'Speichern fehlgeschlagen.') } }
}
