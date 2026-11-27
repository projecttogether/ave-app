import { describe, expect, it } from 'vitest'
import { aggregateIndicator, aggregateTrend, foodWasteForRows, foodWasteBaseline, foodWasteChange, selectIndicatorRows, type ReportingRow } from '@/lib/indicators/aggregation'
import { computeIndicatorProgress, transformDashboardStats } from '@/lib/indicators/engine'
import { INDICATOR_TARGETS } from '@/lib/indicators/targets'
import { indicatorChartDomain } from '@/lib/indicators/chart-domain'

const row = (values: Record<string, unknown> = {}): ReportingRow => ({ subOrganizationId: 'a', reportingYear: 2026, reportingMonth: 1, ...values })
const context = { baselines: [{ id: 'a', foodWasteBaseAmount: '1200' }, { id: 'b', foodWasteBaseAmount: '1200' }], history: [] }

describe('indicator aggregation', () => {
    it.each([
        ['fair_trade_percentage', { coffeeSpend: 100, fairTradeCoffeeSpend: 90 }, { coffeeSpend: 900, fairTradeCoffeeSpend: 0 }],
        ['organic_percentage', { totalFoodSpend: 100, organicSpend: 90 }, { totalFoodSpend: 900, organicSpend: 0 }],
        ['plant_based_percentage', { totalFoodSpend: 100, meatSpend: 10 }, { totalFoodSpend: 900, meatSpend: 900 }],
    ])('weights %s quarterly results by spending', (slug, january, february) => {
        const points = aggregateTrend([row(january), row({ ...february, reportingMonth: 2 })], slug, 'quarterly', 90)
        expect(points).toEqual([{ period: 'Q1 2026', value: 9, target: 90 }])
    })
    it('preserves half weighting for cocoa mixed products in both sums', () => {
        expect(aggregateIndicator([{ coffeeSpend: 100, cocoaSpend: 100, bananasSpend: 100, cocoaMixedSpend: 200, fairTradeCoffeeSpend: 80, fairTradeCocoaSpend: 20, fairTradeBananasSpend: 0, fairTradeCocoaMixedSpend: 200 }], 'fair_trade_percentage')).toBe(50)
    })
    it('distinguishes blank Fairtrade values from explicit zero', () => {
        const january = row({ coffeeSpend: 100, fairTradeCoffeeSpend: 90 })
        const february = row({ reportingMonth: 2, coffeeSpend: 900 })
        expect(aggregateTrend([january, february], 'fair_trade_percentage', 'quarterly')[0].value).toBe(90)
        expect(aggregateIndicator([february], 'fair_trade_percentage')).toBeNull()
        expect(aggregateIndicator([{ ...february, fairTradeCoffeeSpend: 0 }], 'fair_trade_percentage')).toBe(0)
    })
    it('sums quarterly spending across a year boundary', () => {
        expect(aggregateTrend([
            row({ reportingYear: 2025, reportingMonth: 12, totalFoodSpend: 100 }),
            row({ totalFoodSpend: 100 }), row({ reportingMonth: 2, totalFoodSpend: 900 }),
        ], 'total_spend', 'quarterly')).toEqual([
            { period: 'Q4 2025', value: 100, target: undefined },
            { period: 'Q1 2026', value: 1000, target: undefined },
        ])
    })
    it('selects annual fallbacks per kitchen and per indicator', () => {
        const rows = [row({ coffeeSpend: 100, fairTradeCoffeeSpend: 90 }), row({ reportingMonth: 0, coffeeSpend: 500, fairTradeCoffeeSpend: 500 }),
            row({ subOrganizationId: 'b', reportingMonth: 0, coffeeSpend: 900, fairTradeCoffeeSpend: 0 }),
            row({ subOrganizationId: 'b', organicSpend: 50, totalFoodSpend: 100 })]
        const selected = selectIndicatorRows(rows, 'fair_trade_percentage')
        expect(selected).toEqual([rows[0], rows[2]])
        expect(aggregateIndicator(selected, 'fair_trade_percentage')).toBe(9)
        expect(selectIndicatorRows(rows, 'fair_trade_percentage', 'yearly')).toEqual([rows[1], rows[2]])
        expect(selectIndicatorRows(rows, 'fair_trade_percentage', 'monthly')).toEqual([rows[0]])
    })
    it('applies annual/monthly selection independently for every reporting year', () => {
        const rows = [row({ reportingYear: 2025, reportingMonth: 0, coffeeSpend: 100, fairTradeCoffeeSpend: 90 }), row({ coffeeSpend: 100, fairTradeCoffeeSpend: 50 })]
        expect(selectIndicatorRows(rows, 'fair_trade_percentage')).toEqual(rows)
    })
})

describe('food-waste baselines and missing values', () => {
    it('compares a measured month against one twelfth of its annual baseline', () => {
        expect(foodWasteBaseline([row({ foodWasteAmount: 80 })], context)).toBe(100)
        expect(foodWasteChange([row({ foodWasteAmount: 80 })], context)).toBe(-20)
    })
    it('uses each kitchen’s actual months and excludes unmeasured kitchens', () => {
        const rows = [row({ foodWasteAmount: 80 }), row({ reportingMonth: 2, foodWasteAmount: 80 }), row({ subOrganizationId: 'b', foodWasteAmount: 80 })]
        expect(foodWasteBaseline(rows, context)).toBe(300)
        expect(foodWasteChange(rows, context)).toBe(-20)
        expect(foodWasteBaseline(rows.slice(0, 2), context)).toBe(200)
    })
    it('uses a complete annual baseline for an annual measurement', () => {
        expect(foodWasteChange([row({ reportingMonth: 0, foodWasteAmount: 840 })], context)).toBe(-30)
    })
    it('preserves measured zero and returns no result for missing measurements', () => {
        expect(foodWasteChange([row({ foodWasteAmount: 0 })], context)).toBe(-100)
        expect(foodWasteChange([row({ foodWasteAmount: null })], context)).toBeNull()
        expect(foodWasteChange([row({ foodWasteAmount: 80 })], { baselines: [], history: [] })).toBeNull()
    })
    it('does not compare a partial baseline population against the full measured total', () => {
        const rows = [row({ foodWasteAmount: 80 }), row({ subOrganizationId: 'c', foodWasteAmount: 80 })]
        expect(foodWasteChange(rows, context)).toBe(-20)
    })
    it('does not infer a configured baseline from historical months', () => {
        const historical = { baselines: [], history: [row({ reportingYear: 2025, foodWasteAmount: 100 }), row({ reportingYear: 2025, reportingMonth: 2, foodWasteAmount: 200 })] }
        expect(foodWasteChange([row({ foodWasteAmount: 80 })], historical)).toBeNull()
        expect(foodWasteBaseline([row({ reportingMonth: 3, foodWasteAmount: 80 })], historical)).toBeNull()
        expect(foodWasteBaseline([row({ reportingMonth: 0, foodWasteAmount: 840 })], historical)).toBeNull()
    })
    it('normalizes food-waste quarterly values against covered kitchen months', () => {
        const rows = [row({ foodWasteAmount: 80 }), row({ reportingMonth: 2, foodWasteAmount: 60 })]
        expect(aggregateTrend(rows, 'food_waste', 'quarterly', -30, context)).toEqual([{ period: 'Q1 2026', value: -30, target: -30 }])
    })
    it('does not show success when the dashboard has no food-waste measurement', () => {
        const empty = transformDashboardStats(null)
        expect(computeIndicatorProgress('food_waste', empty, INDICATOR_TARGETS, foodWasteForRows([], context)).dataSource).toBe('none')
        expect(computeIndicatorProgress('food_waste', { ...empty, food_waste: 0 }, INDICATOR_TARGETS, foodWasteForRows([row({ foodWasteAmount: 0 })], context))).toEqual({ value: -100, progress: 100, dataSource: 'operational' })
        expect(computeIndicatorProgress('food_waste', { ...empty, food_waste: 80 }, INDICATOR_TARGETS, null).dataSource).toBe('none')
    })
})

describe('progress and chart scales', () => {
    it('uses configured targets for qualitative scores and keeps zero scores visible', () => {
        const overview = transformDashboardStats(null)
        expect(computeIndicatorProgress('regional', overview, INDICATOR_TARGETS, null, { regional: 20, seasonal: null, guest_satisfaction: null }).progress).toBe(100)
        expect(computeIndicatorProgress('regional', overview, INDICATOR_TARGETS, null, { regional: 0, seasonal: null, guest_satisfaction: null })).toEqual({ value: 0, progress: 0, dataSource: 'scoring' })
    })
    it('includes negative reductions and the negative food-waste target on charts', () => {
        const domain = indicatorChartDomain([-20, null, -100], -30)
        expect(domain.min).toBeLessThan(-100)
        expect(domain.max).toBeGreaterThanOrEqual(0)
        expect(indicatorChartDomain([null], -30).min).toBeLessThan(-30)
    })
})
