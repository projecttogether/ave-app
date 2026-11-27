import { REPORTING_START_YEAR } from '@/lib/reporting-period'
import { inputPeriodSchema, periodState, reportingToday, type InputPeriod } from './periods'
import type { ReportingFrequency } from './preferences'

export function operatingEntryHref(subOrgId: string, period: InputPeriod, workflow?: 'batch' | 'year') {
  const params = new URLSearchParams({ year: String(period.year), subOrgId })
  if (period.kind === 'quarter' || workflow) {
    params.set('quarter', String(period.kind === 'year' ? 1 : period.kind === 'month' ? Math.ceil(period.index / 3) : period.index))
    params.set('workflow', workflow ?? 'quarter')
    return `/operating-periods?${params}`
  }
  params.set('entryMode', period.kind === 'year' ? 'yearly' : 'monthly')
  if (period.kind === 'month') params.set('month', String(period.index))
  return `/form/operating?${params}`
}

/** Explicit bad parameters must not select a different editable period. */
export function readEntrySelection(params: URLSearchParams, options: {
  quarterly?: boolean; frequency?: ReportingFrequency | null; now?: Date
} = {}) {
  const now = options.now ?? new Date(), today = reportingToday(now)
  for (const key of ['year', 'subOrgId', 'month', 'quarter', 'entryMode', 'workflow']) {
    if (params.getAll(key).length > 1 || (params.has(key) && !params.get(key))) throw new Error('Ungültige Auswahl in der Adresse.')
  }
  const integer = (key: string, fallback: number) => {
    if (!params.has(key)) return fallback
    const value = params.get(key)!
    if (!/^\d+$/.test(value)) throw new Error('Ungültige Berichtsperiode in der Adresse.')
    return Number(value)
  }
  const year = integer('year', today.year)
  if (year < REPORTING_START_YEAR || year > today.year) throw new Error('Dieses Berichtsjahr kann nicht bearbeitet werden.')
  const workflow = params.get('workflow') ?? 'quarter'
  if (!['quarter', 'batch', 'year'].includes(workflow)) throw new Error('Ungültige Erfassungsart.')
  const mode = params.get('entryMode') ?? (options.frequency === 'yearly' ? 'yearly' : 'monthly')
  if (!['monthly', 'yearly'].includes(mode)) throw new Error('Ungültige Erfassungsart.')
  const quarter = integer('quarter', Math.ceil(today.month / 3))
  if (quarter < 1 || quarter > 4) throw new Error('Ungültiges Quartal.')
  const kind = options.quarterly ? workflow === 'year' ? 'year' : 'quarter' : mode === 'yearly' ? 'year' : 'month'
  const period = inputPeriodSchema.parse({ kind, year, index: kind === 'year' ? 1 : kind === 'quarter' ? quarter : integer('month', today.month) })
  if (periodState(period, now) === 'future') throw new Error('Zukünftige Perioden können nicht bearbeitet werden.')
  return { period, subOrgId: params.get('subOrgId') ?? undefined, quarter,
    workflow: workflow as 'quarter' | 'batch' | 'year', entryMode: mode as 'monthly' | 'yearly' }
}
