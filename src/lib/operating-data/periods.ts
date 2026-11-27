import { z } from 'zod'

export const REPORTING_TIMEZONE = 'Europe/Berlin'
export const inputPeriodSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('month'), year: z.number().int().min(2000).max(2100), index: z.number().int().min(1).max(12) }).strict(),
  z.object({ kind: z.literal('quarter'), year: z.number().int().min(2000).max(2100), index: z.number().int().min(1).max(4) }).strict(),
  z.object({ kind: z.literal('year'), year: z.number().int().min(2000).max(2100), index: z.literal(1) }).strict(),
])
export type InputPeriod = z.infer<typeof inputPeriodSchema>
export type PeriodKind = InputPeriod['kind']
export type PeriodRecord = {
  reportingYear: number
  reportingMonth: number | null
  periodKind?: string | null
  periodIndex?: number | null
}

/** Only the legacy month field has a compatibility interpretation. Unknown
 * explicit period kinds must never silently become annual measurements. */
export function recordPeriod(row: PeriodRecord): InputPeriod {
  if (row.periodKind != null) {
    const period = inputPeriodSchema.parse({ kind: row.periodKind, year: row.reportingYear, index: row.periodIndex })
    const month = period.kind === 'quarter' ? null : period.kind === 'year' ? 0 : period.index
    if (row.reportingMonth !== month) throw new Error('Widersprüchliche Berichtsperiode.')
    return period
  }
  if (row.reportingMonth === null) throw new Error('Berichtsperiode fehlt.')
  return inputPeriodSchema.parse({ kind: row.reportingMonth === 0 ? 'year' : 'month',
    year: row.reportingYear, index: row.reportingMonth === 0 ? 1 : row.reportingMonth })
}

export function periodColumns(input: InputPeriod) {
  const period = inputPeriodSchema.parse(input)
  return { reportingYear: period.year, reportingMonth: period.kind === 'quarter' ? null : period.kind === 'year' ? 0 : period.index,
    periodKind: period.kind, periodIndex: period.index }
}

export function periodMonths(input: InputPeriod): number[] {
  const period = inputPeriodSchema.parse(input)
  const start = period.kind === 'year' ? 1 : period.kind === 'quarter' ? (period.index - 1) * 3 + 1 : period.index
  const length = period.kind === 'year' ? 12 : period.kind === 'quarter' ? 3 : 1
  return Array.from({ length }, (_, i) => start + i)
}

export function periodKey(period: InputPeriod) {
  inputPeriodSchema.parse(period)
  return `${period.year}:${period.kind}:${period.index}`
}

export function reportingToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: REPORTING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => Number(parts.find(p => p.type === type)!.value)
  return { year: part('year'), month: part('month'), day: part('day') }
}

export function periodState(period: InputPeriod, now = new Date()): 'future' | 'open' | 'closed' {
  const months = periodMonths(period)
  const today = reportingToday(now)
  const current = today.year * 12 + today.month
  if (period.year * 12 + months[0] > current) return 'future'
  return period.year * 12 + months[months.length - 1] < current ? 'closed' : 'open'
}

export function periodLabel(period: InputPeriod): string {
  const months = periodMonths(period)
  const monthName = (month: number) => new Intl.DateTimeFormat('de-DE', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(period.year, month - 1, 1)))
  return period.kind === 'year' ? `Jahr ${period.year}` : period.kind === 'month' ? `${monthName(period.index)} ${period.year}`
    : `Q${period.index} ${period.year} · ${monthName(months[0])} bis ${monthName(months[2])}`
}

export function coveredMonths(rows: readonly PeriodRecord[]) {
  return [...new Set(rows.flatMap(row => periodMonths(recordPeriod(row))))].sort((a, b) => a - b)
}

export function assertNoQuarterOverlap(rows: readonly (PeriodRecord & { subOrganizationId: string })[]) {
  const groups = new Map<string, typeof rows[number][]>()
  for (const row of rows) {
    const key = `${row.subOrganizationId}:${row.reportingYear}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  for (const group of groups.values()) {
    const periods = group.map(recordPeriod)
    if (!periods.some(p => p.kind === 'quarter')) continue
    if (periods.some(p => p.kind !== 'quarter') || new Set(periods.map(periodKey)).size !== periods.length) {
      throw new Error('Datenkonflikt: Quartalswerte überschneiden sich mit anderen Betriebsdaten.')
    }
  }
}
