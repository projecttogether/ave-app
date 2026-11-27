import { calculateFoodWaste, type FoodWasteRecord } from './food-waste'
import { INDICATOR_CONFIG } from './config'
import { decimal, roundCalculation } from './decimal'
import { computeIndicatorDecimals, rowHasIndicatorData } from './compute'
import { reportingCoverage } from '@/lib/operating-data/coverage'
import { assertNoQuarterOverlap, periodMonths, recordPeriod } from '@/lib/operating-data/periods'

export type ReportingRow = Record<string, unknown> & {
    subOrganizationId: string
    reportingYear: number
    reportingMonth: number | null
    periodKind?: string | null
    periodIndex?: number | null
}
export type Granularity = 'monthly' | 'yearly' | 'quarterly' | 'auto'

/** Select periods per kitchen, year and indicator. Unrelated monthly data must
 * not suppress an annual value, and annual/monthly values must never be added. */
export function selectIndicatorRows<T extends ReportingRow>(rows: T[], slug: string, granularity?: Granularity | null): T[] {
    const relevant = rows.filter(row => rowHasIndicatorData(row, slug))
    assertNoQuarterOverlap(relevant)
    if (granularity === 'monthly') return relevant.filter(row => recordPeriod(row).kind === 'month')
    if (granularity === 'yearly') return relevant.filter(row => recordPeriod(row).kind === 'year')
    if (granularity === 'quarterly') return relevant.filter(row => recordPeriod(row).kind !== 'year')
    const monthly = new Set(relevant.filter(row => recordPeriod(row).kind !== 'year').map(row => `${row.subOrganizationId}:${row.reportingYear}`))
    return relevant.filter(row => recordPeriod(row).kind !== 'year' || !monthly.has(`${row.subOrganizationId}:${row.reportingYear}`))
}

/** Aggregate selected rows. A missing measurement is distinct from measured zero. */
export function aggregateIndicator(rows: Record<string, unknown>[], slug: string): number | null {
    const config = INDICATOR_CONFIG[slug]
    const relevant = rows.filter(row => rowHasIndicatorData(row, slug))
    if (!config || relevant.length === 0) return null
    if (config.computed) {
        const totals = relevant.reduce<{ spend: ReturnType<typeof decimal>; denominator: ReturnType<typeof decimal> }>((sum, row) => {
            const value = computeIndicatorDecimals(row, slug)
            return { spend: sum.spend.plus(value.spend), denominator: sum.denominator.plus(value.denominator) }
        }, { spend: decimal(0), denominator: decimal(0) })
        return totals.denominator.gt(0) ? totals.spend.times(100).div(totals.denominator).toNumber() : null
    }
    if (!config.column) return null
    const total = relevant.reduce((sum, row) => sum.plus(decimal(row[config.column!])), decimal(0))
    return (['regional_score', 'seasonal_score', 'guest_satisfaction'].includes(slug) ? total.div(relevant.length) : total).toNumber()
}

export type FoodWasteContext = {
    baselines: { id: string; foodWasteBaseAmount: string | number | null }[]
    history: ReportingRow[]
}

/** Match only configured positive baselines; history remains archive input, not a fallback. */
export function foodWasteForRows(rows: ReportingRow[], context: FoodWasteContext) {
    return calculateFoodWaste(rows.map(row => ({
        subOrganizationId: row.subOrganizationId, reportingYear: row.reportingYear, reportingMonth: row.reportingMonth,
        periodKind: row.periodKind, periodIndex: row.periodIndex,
        foodWasteAmount: row.foodWasteAmount as FoodWasteRecord['foodWasteAmount'] ?? null,
        baseline: context.baselines.find(b => b.id === row.subOrganizationId)?.foodWasteBaseAmount ?? null,
    })))
}

export function foodWasteBaseline(rows: ReportingRow[], context: FoodWasteContext): number | null {
    const result = foodWasteForRows(rows, context)
    return result.matchedBaseline > 0 ? result.matchedBaseline : null
}

export function foodWasteChange(rows: ReportingRow[], context: FoodWasteContext): number | null {
    return foodWasteForRows(rows, context).reduction
}

export type TrendPoint = { period: string; value: number | null; change?: number; target?: number }

/** Bucket raw records before calculating a percentage or summing quantities. */
export function aggregateTrend(rows: ReportingRow[], slug: string, mode: 'monthly' | 'quarterly', target?: number, foodWaste?: FoodWasteContext): TrendPoint[] {
    const buckets = new Map<number, ReportingRow[]>()
    const selected = selectIndicatorRows(rows, slug, mode)
    for (const row of selected) {
        const input = recordPeriod(row)
        const period = mode === 'quarterly' ? Math.ceil(periodMonths(input)[0] / 3) : input.index
        const key = row.reportingYear * (mode === 'quarterly' ? 4 : 12) + period - 1
        buckets.set(key, [...(buckets.get(key) ?? []), row])
    }
    const keys = [...buckets.keys()]
    if (!keys.length) return []
    for (let key = Math.min(...keys); key <= Math.max(...keys); key++) if (!buckets.has(key)) buckets.set(key, [])
    const sortedBuckets = [...buckets.entries()].sort(([a], [b]) => a - b)
    const points = sortedBuckets.sort(([a], [b]) => a - b).map(([key, bucket]) => {
        const perYear = mode === 'quarterly' ? 4 : 12
        const year = Math.floor(key / perYear)
        const period = key % perYear + 1
        const value = slug === 'food_waste' ? (foodWaste ? foodWasteChange(bucket, foodWaste) : null) : aggregateIndicator(bucket, slug)
        return {
            period: mode === 'quarterly' ? `Q${period} ${year}` : new Date(year, period - 1, 1).toLocaleString('de-DE', { month: 'short', year: 'numeric' }),
            value,
            target,
        } as TrendPoint
    })
    for (let i = 1; i < points.length; i++) {
        const previous = points[i - 1].value
        const current = points[i].value
        const coverage = (bucket: ReportingRow[]) => reportingCoverage(bucket)
        const currentCoverage = coverage(sortedBuckets[i][1])
        const previousCoverage = coverage(sortedBuckets[i - 1][1])
        const required = mode === 'quarterly' ? 3 : 1
        const adjacent = currentCoverage.length > 0 && currentCoverage.length === previousCoverage.length && currentCoverage.every((k, index) => k.id === previousCoverage[index].id && k.months.length === required && previousCoverage[index].months.length === required)
        if (adjacent && previous !== null && previous !== 0 && current !== null) points[i].change = roundCalculation(decimal(current).minus(previous).times(100).div(decimal(previous).abs()).toNumber())!
    }
    return points.map(point => ({ ...point, value: roundCalculation(point.value) }))
}
