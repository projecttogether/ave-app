import { reportingCoverage } from '@/lib/operating-data/coverage'
import { decimal, roundCalculation } from './decimal'
import { INDICATOR_TARGETS } from './targets'
import { assertNoQuarterOverlap, coveredMonths, periodMonths, recordPeriod } from '@/lib/operating-data/periods'

/** One reported period and the sub-organization's configured annual baseline. */
export type FoodWasteRecord = {
  subOrganizationId: string
  reportingYear: number
  reportingMonth: number | null
  periodKind?: string | null
  periodIndex?: number | null
  foodWasteAmount: string | number | null
  baseline: string | number | null
}

export type FoodWasteResult = {
  reportedAmount: number
  matchedAmount: number
  matchedBaseline: number
  reduction: number | null
  progress: number | null
  status: 'available' | 'partial' | 'no-data' | 'missing-baseline'
  reportingSubOrganizations: number
  matchedSubOrganizations: number
  missingBaselineSubOrganizations: number
}

/** Public comparisons need reduction and coverage, never the matched raw totals. */
export type FoodWasteSummary = Omit<FoodWasteResult, 'reportedAmount' | 'matchedAmount' | 'matchedBaseline'>

function numberOrNull(value: string | number | null): number | null {
  if (value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/**
 * Pair each sub-organization's waste with its own covered baseline before
 * aggregating. Callers pass complete rows for the period, never display pages.
 * Auto selection prefers monthly records per sub-organization and year.
 */
export function calculateFoodWaste(
  records: readonly FoodWasteRecord[],
  granularity?: string | null,
): FoodWasteResult {
  const groups = new Map<string, FoodWasteRecord[]>()
  for (const row of records) {
    const key = `${row.subOrganizationId}|${row.reportingYear}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }
  const reporters = new Set<string>()
  const matched = new Set<string>()
  const missing = new Set<string>()
  let reportedAmount = decimal(0)
  let matchedAmount = decimal(0)
  let matchedBaseline = decimal(0)
  for (const group of groups.values()) {
    const measured = group.filter(row => numberOrNull(row.foodWasteAmount) !== null)
    assertNoQuarterOverlap(measured)
    const monthly = measured.filter(row => recordPeriod(row).kind === 'month')
    const quarterly = measured.filter(row => recordPeriod(row).kind === 'quarter')
    const yearly = measured.filter(row => recordPeriod(row).kind === 'year')
    const selected = granularity === 'monthly' ? monthly
      : granularity === 'yearly' ? yearly
      : granularity === 'quarterly' ? [...monthly, ...quarterly]
      : quarterly.length ? quarterly : monthly.length ? monthly : yearly
    const reported = selected.filter(row => numberOrNull(row.foodWasteAmount) !== null)
    if (!reported.length) continue
    const id = reported[0].subOrganizationId
    reporters.add(id)
    const amount = reported.reduce((sum, row) => sum.plus(decimal(row.foodWasteAmount)), decimal(0))
    reportedAmount = reportedAmount.plus(amount)
    const baseline = numberOrNull(reported[0].baseline)
    if (baseline === null || baseline <= 0) {
      missing.add(id)
      continue
    }
    matched.add(id)
    const months = coveredMonths(reported).length
    matchedAmount = matchedAmount.plus(amount)
    matchedBaseline = matchedBaseline.plus(decimal(reported[0].baseline).times(months).div(12))
  }
  const reduction = matchedBaseline.gt(0)
    ? matchedAmount.minus(matchedBaseline).times(100).div(matchedBaseline).toNumber() : null
  return {
    reportedAmount: reportedAmount.toNumber(),
    matchedAmount: matchedAmount.toNumber(),
    matchedBaseline: matchedBaseline.toNumber(),
    reduction,
    progress: reduction === null ? null : roundCalculation(Math.min(100, Math.max(0, decimal(reduction).times(100).div(INDICATOR_TARGETS.food_waste).toNumber())), 0),
    status: !reporters.size ? 'no-data' : !matched.size ? 'missing-baseline' : missing.size ? 'partial' : 'available',
    reportingSubOrganizations: reporters.size,
    matchedSubOrganizations: matched.size,
    missingBaselineSubOrganizations: missing.size,
  }
}

/** Relative change between reductions, each calculated with its own reporting coverage. */
export function compareFoodWaste(current: FoodWasteResult, previous: FoodWasteResult): number | undefined {
  if (current.reduction === null || previous.reduction === null || previous.reduction === 0) return undefined
  return decimal(current.reduction).minus(previous.reduction).times(100).div(decimal(previous.reduction).abs()).toNumber()
}

/** User-facing explanation travels with the same result used for the value. */
export function describeFoodWaste(result?: FoodWasteSummary | null): string | null {
  if (!result || result.status === 'no-data') return 'Keine Abfalldaten für diesen Zeitraum.'
  if (result.status === 'missing-baseline') return 'Reduktion nicht berechenbar: Es fehlt ein gültiger Basiswert.'
  if (result.status === 'partial') {
    return `Teilberechnung: ${result.matchedSubOrganizations} von ${result.reportingSubOrganizations} meldenden Betrieben berücksichtigt; ${result.missingBaselineSubOrganizations} ohne gültigen Basiswert.`
  }
  return null
}

export type FoodWasteTrendPoint = {
  period: string
  value: number | null
  target: number
  change?: number
  foodWaste: FoodWasteResult
}

/** Longest trend window. Each month is one bucket, so callers must stay bounded. */
export const MAX_TREND_MONTHS = 36

/** Build complete time buckets, preserving gaps and weighting quarters by their baselines. */
export function calculateFoodWasteTrend(
  records: readonly FoodWasteRecord[],
  start: { year: number; month: number },
  end: { year: number; month: number },
  mode: 'monthly' | 'quarterly' = 'monthly',
): FoodWasteTrendPoint[] {
  const span = (end.year * 12 + end.month) - (start.year * 12 + start.month) + 1
  if (!Number.isFinite(span) || span > MAX_TREND_MONTHS) throw new Error('Trend range is too large')
  const buckets = new Map<string, { year: number; months: number[] }>()
  for (let index = start.year * 12 + start.month - 1; index <= end.year * 12 + end.month - 1; index++) {
    const year = Math.floor(index / 12)
    const month = index % 12 + 1
    const key = mode === 'quarterly' ? `Q${Math.ceil(month / 3)} ${year}`
      : new Date(year, month - 1, 1).toLocaleString('de-DE', { month: 'short', year: 'numeric' })
    if (!buckets.has(key)) buckets.set(key, { year, months: [] })
    buckets.get(key)!.months.push(month)
  }
  const points = [...buckets].map(([period, bucket]) => {
    const selected = records.filter(row => {
      const period = recordPeriod(row)
      return row.reportingYear === bucket.year && period.kind !== 'year' &&
        (mode === 'quarterly' || period.kind === 'month') && periodMonths(period).every(month => bucket.months.includes(month))
    })
    const foodWaste = calculateFoodWaste(selected, mode)
    const coverage = reportingCoverage(selected.filter(row => numberOrNull(row.foodWasteAmount) !== null && Number(row.baseline) > 0))
    return { period, value: foodWaste.reduction, target: INDICATOR_TARGETS.food_waste, foodWaste, coverage }
  })
  for (let i = 1; i < points.length; i++) {
    const current = points[i].coverage, previous = points[i - 1].coverage
    const months = mode === 'quarterly' ? 3 : 1
    if (current.length > 0 && current.length === previous.length && current.every((k, index) => k.id === previous[index].id && k.months.length === months && previous[index].months.length === months)) {
      (points[i] as FoodWasteTrendPoint).change = compareFoodWaste(points[i].foodWaste, points[i - 1].foodWaste)
    }
  }
  return points.map(({ coverage: _coverage, ...point }) => point)
}
