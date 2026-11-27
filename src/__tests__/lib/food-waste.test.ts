import { describe, expect, it } from 'vitest'
import { calculateFoodWaste, calculateFoodWasteTrend, compareFoodWaste, describeFoodWaste, type FoodWasteRecord } from '@/lib/indicators/food-waste'
import { computeIndicatorProgress, transformDashboardStats } from '@/lib/indicators/engine'
import { INDICATOR_TARGETS } from '@/lib/indicators/targets'

const record = (id: string, month: number, amount: number | null, baseline: number | null = 1200): FoodWasteRecord => ({
  subOrganizationId: id, reportingYear: 2026, reportingMonth: month, foodWasteAmount: amount, baseline,
})

describe('food-waste reduction', () => {
  it('matches each reporting sub-organization to its own month coverage', () => {
    const result = calculateFoodWaste([record('a', 1, 100), record('a', 2, 100), record('b', 3, 200, 2400), record('c', 1, null)], 'monthly')
    expect(result).toMatchObject({ reduction: 0, matchedAmount: 400, matchedBaseline: 400, reportingSubOrganizations: 2, status: 'available' })
  })

  it('excludes missing baselines from reduction while retaining absolute waste and reporting coverage', () => {
    const result = calculateFoodWaste([record('a', 1, 100), record('b', 1, 500, null)], 'monthly')
    expect(result).toMatchObject({ reportedAmount: 600, matchedAmount: 100, reduction: 0, status: 'partial', missingBaselineSubOrganizations: 1 })
    expect(describeFoodWaste(result)).toContain('1 von 2')
  })

  it('distinguishes measured zero, missing waste and missing or invalid baselines', () => {
    expect(calculateFoodWaste([record('a', 0, 0)], 'yearly')).toMatchObject({ reduction: -100, progress: 100, status: 'available' })
    expect(calculateFoodWaste([record('a', 0, null)], 'yearly')).toMatchObject({ reduction: null, progress: null, status: 'no-data' })
    for (const baseline of [null, 0, -1, Infinity]) {
      expect(calculateFoodWaste([record('a', 0, 0, baseline)], 'yearly')).toMatchObject({ reduction: null, progress: null, status: 'missing-baseline' })
    }
  })

  it('selects monthly or yearly records explicitly and prefers monthly per sub-organization in auto mode', () => {
    const rows = [record('a', 1, 100), record('a', 0, 600), record('b', 0, 1200)]
    expect(calculateFoodWaste(rows).matchedAmount).toBe(1300)
    expect(calculateFoodWaste(rows).matchedBaseline).toBe(1300)
    expect(calculateFoodWaste(rows, 'monthly').matchedAmount).toBe(100)
    expect(calculateFoodWaste(rows, 'yearly').matchedAmount).toBe(1800)
  })

  it('has no display-row limit and does not fabricate a historical baseline', () => {
    const rows = Array.from({ length: 72 }, (_, i) => record(`org-${Math.floor(i / 12)}`, i % 12 + 1, 100))
    expect(calculateFoodWaste(rows, 'monthly')).toMatchObject({ matchedAmount: 7200, matchedBaseline: 7200, reduction: 0 })
    expect(calculateFoodWaste([record('a', 0, 500, null)])).toMatchObject({ reduction: null, matchedAmount: 0 })
  })

  it('passes unavailable and zero reduction through the production progress calculation', () => {
    const overview = { ...transformDashboardStats(null), food_waste: 99999 }
    const unavailable = calculateFoodWaste([record('a', 1, 500, null)])
    expect(computeIndicatorProgress('food_waste', overview, INDICATOR_TARGETS, unavailable)).toEqual({ value: null, progress: null, dataSource: 'none' })
    const matched = calculateFoodWaste([record('a', 1, 100)])
    expect(computeIndicatorProgress('food_waste', overview, INDICATOR_TARGETS, matched)).toEqual({ value: 0, progress: 0, dataSource: 'operational' })
  })

  it('compares periods using their own coverage and omits undefined relative changes', () => {
    const previous = calculateFoodWaste([record('a', 1, 50)])
    const current = calculateFoodWaste([record('a', 1, 25), record('a', 2, 25)])
    expect(compareFoodWaste(current, previous)).toBe(-50)
    expect(compareFoodWaste(calculateFoodWaste([]), previous)).toBeUndefined()
    expect(compareFoodWaste(current, calculateFoodWaste([record('a', 1, 100)]))).toBeUndefined()
  })
})

describe('food-waste trends', () => {
  it('weights quarters by matched baselines rather than averaging monthly percentages', () => {
    const rows = [record('a', 1, 100), record('b', 2, 0, 12000)]
    const points = calculateFoodWasteTrend(rows, { year: 2026, month: 1 }, { year: 2026, month: 3 }, 'quarterly')
    expect(points).toHaveLength(1)
    expect(points[0].value).toBeCloseTo(-1000 / 1100 * 100)
  })

  it('keeps unavailable months as gaps and avoids changes across missing periods', () => {
    const points = calculateFoodWasteTrend([record('a', 1, 0), record('a', 3, 100)], { year: 2026, month: 1 }, { year: 2026, month: 3 })
    expect(points.map(point => point.value)).toEqual([-100, null, 0])
    expect(points.map(point => point.change)).toEqual([undefined, undefined, undefined])
  })

  it('refuses trend ranges beyond the supported window', () => {
    expect(calculateFoodWasteTrend([], { year: 2024, month: 1 }, { year: 2026, month: 12 })).toHaveLength(36)
    expect(() => calculateFoodWasteTrend([], { year: 2023, month: 12 }, { year: 2026, month: 12 })).toThrow('Trend range is too large')
    expect(() => calculateFoodWasteTrend([], { year: -248000, month: 1 }, { year: 2026, month: 12 })).toThrow('Trend range is too large')
  })
})
