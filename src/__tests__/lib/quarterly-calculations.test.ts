import { describe, expect, it } from 'vitest'
import { aggregateIndicator, aggregateTrend, selectIndicatorRows, type ReportingRow } from '@/lib/indicators/aggregation'
import { calculateFoodWaste, calculateFoodWasteTrend, type FoodWasteRecord } from '@/lib/indicators/food-waste'
import { comparableCoverage, fullYearCoverage } from '@/lib/operating-data/coverage'
import { validatePublication, type Publication } from '@/lib/operating-data/publication'
import { periodColumns } from '@/lib/operating-data/periods'
import { buildCalculationReport } from '@/lib/indicators/report'

const q = (index: number, values: Record<string, unknown> = {}): ReportingRow => ({ subOrganizationId: 'kitchen', ...periodColumns({ kind: 'quarter', year: 2025, index }), ...values })
const m = (index: number, values: Record<string, unknown> = {}): ReportingRow => ({ subOrganizationId: 'kitchen', ...periodColumns({ kind: 'month', year: 2025, index }), ...values })
const waste = (index: number, amount: string | null = '210', baseline: string | null = '1200'): FoodWasteRecord => ({ subOrganizationId: 'kitchen', ...periodColumns({ kind: 'quarter', year: 2025, index }), foodWasteAmount: amount, baseline })
const now = new Date('2026-09-29T12:00:00Z')
const publication = (overrides: Partial<Publication> = {}): Publication => ({ subOrganizationId: '00000000-0000-4000-8000-000000000001', requestId: '00000000-0000-4000-8000-000000000002', year: 2025, workflow: 'quarter', entries: [{ period: { kind: 'quarter', year: 2025, index: 1 }, expectedRevision: 0, coverageConfirmed: true, values: { totalFoodSpend: '1000' } }], ...overrides })

describe('quarterly arithmetic reference cases', () => {
  it('one quarter matches exactly three measured months for sums and weighted percentages', () => {
    const months = [m(1, { totalFoodSpend: '100', organicSpend: '90' }), m(2, { totalFoodSpend: '900', organicSpend: '0' }), m(3, { totalFoodSpend: '1000', organicSpend: '110' })]
    const quarter = [q(1, { totalFoodSpend: '2000', organicSpend: '200' })]
    expect(aggregateIndicator(selectIndicatorRows(quarter, 'organic_percentage', 'auto'), 'organic_percentage')).toBe(10)
    expect(aggregateTrend(months, 'organic_percentage', 'quarterly')[0].value).toBe(10)
    expect(aggregateIndicator(quarter, 'total_spend')).toBe(2000)
  })
  it('four quarters equal an annual input, but an incomplete year is not annualized', () => {
    const rows = [1, 2, 3, 4].map(i => q(i, { totalFoodSpend: '1000' }))
    expect(aggregateIndicator(rows, 'total_spend')).toBe(4000)
    expect(fullYearCoverage(rows)).toBe(true)
    expect(fullYearCoverage(rows.slice(0, 3))).toBe(false)
    expect(aggregateIndicator(rows.slice(0, 3), 'total_spend')).toBe(3000)
  })
  it('does not duplicate a quarterly amount across monthly points or use it as annual input', () => {
    const rows = [q(1, { totalFoodSpend: '900' })]
    expect(selectIndicatorRows(rows, 'total_spend', 'yearly')).toEqual([])
    expect(aggregateTrend(rows, 'total_spend', 'monthly')).toEqual([])
    expect(aggregateTrend(rows, 'total_spend', 'quarterly')).toEqual([{ period: 'Q1 2025', value: 900, target: undefined }])
  })
  it('combines different kitchens without taking the arithmetic mean of percentages', () => {
    const rows = [q(1, { totalFoodSpend: '100', organicSpend: '100' }), ...[1, 2, 3].map(i => m(i, { subOrganizationId: 'other', totalFoodSpend: '300', organicSpend: '0' }))]
    expect(aggregateTrend(rows, 'organic_percentage', 'quarterly')[0].value).toBe(10)
  })
  it('rejects conflicting quarter/month inputs before calculating instead of double counting', () => {
    expect(() => selectIndicatorRows([q(1, { organicSpend: '100' }), m(1, { organicSpend: '100' })], 'organic_percentage')).toThrow('überschneiden')
  })
  it('uses 300 baseline kg for one quarter and preserves measured zero', () => {
    expect(calculateFoodWaste([waste(1)])).toMatchObject({ matchedBaseline: 300, matchedAmount: 210, reduction: -30 })
    expect(calculateFoodWaste([waste(1, '0')]).reduction).toBe(-100)
    expect(calculateFoodWaste([waste(1, null)]).reduction).toBeNull()
    expect(calculateFoodWaste([waste(1, '210', null)]).reduction).toBeNull()
  })
  it('uses only reported quarters in baseline coverage, including a gap', () => {
    expect(calculateFoodWaste([waste(1), waste(3)])).toMatchObject({ matchedBaseline: 600, matchedAmount: 420, reduction: -30 })
    expect(calculateFoodWaste([waste(1), waste(2), waste(3), waste(4)])).toMatchObject({ matchedBaseline: 1200, reduction: -30 })
  })
  it('keeps gaps null and does not invent changes across gaps', () => {
    const trend = aggregateTrend([q(1, { totalFoodSpend: '100' }), q(3, { totalFoodSpend: '300' })], 'total_spend', 'quarterly')
    expect(trend.map(p => p.value)).toEqual([100, null, 300])
    expect(trend.some(p => p.change !== undefined)).toBe(false)
    const wasteTrend = calculateFoodWasteTrend([waste(1), waste(3)], { year: 2025, month: 1 }, { year: 2025, month: 9 }, 'quarterly')
    expect(wasteTrend.map(p => p.value)).toEqual([-30, null, -30])
    expect(wasteTrend.some(p => p.change !== undefined)).toBe(false)
  })
  it('compares equal coverage across years regardless of source granularity', () => {
    const previous = [1, 2, 3].map(i => ({ ...m(i), reportingYear: 2024 }))
    expect(comparableCoverage([q(1)], previous)).toBe(true)
    expect(comparableCoverage([q(2)], previous)).toBe(false)
    expect(comparableCoverage([q(1)], previous.slice(0, 2))).toBe(false)
    expect(comparableCoverage([q(1)], previous.map(row => ({ ...row, subOrganizationId: 'other' })))).toBe(false)
  })
  it('keeps six decimal places through calculation-report inputs and labels quarter rows', () => {
    const report = buildCalculationReport({ year: 2025, granularity: 'auto', rows: [q(1, { totalFoodSpend: '1000.000001', organicSpend: '500' })], history: [], answers: [], kitchens: [{ id: 'kitchen', organizationId: 'org', name: 'Kitchen', foodWasteBaseAmount: '1200' }] }, 'revision')
    expect(report.inputs.rows[0].totalFoodSpend).toBe('1000.000001')
    expect(report.indicators.find(i => i.slug === 'organic_percentage')?.rows[0]).toMatchObject({ month: null, period: { kind: 'quarter', index: 1 } })
  })
})

describe('publication invariants', () => {
  it.each([
    { period: { kind: 'quarter', year: 2026, index: 3 }, coverageConfirmed: true },
    { period: { kind: 'quarter', year: 2025, index: 1 }, coverageConfirmed: false },
    { period: { kind: 'quarter', year: 2025, index: 5 }, coverageConfirmed: true },
  ])('rejects open, incomplete and invalid quarters', entry => {
    const input = publication(); input.year = entry.period.year; input.entries[0] = { ...input.entries[0], ...entry } as Publication['entries'][number]
    expect(() => validatePublication(input, now)).toThrow()
  })
  it('rejects cross-year entries and duplicate periods', () => {
    const input = publication(); input.entries.push(input.entries[0]); expect(() => validatePublication(input, now)).toThrow('mehrfach')
    expect(() => validatePublication(publication({ year: 2024 }), now)).toThrow('Jahr')
  })
  it('rejects malformed and normalized impossible dates', () => {
    for (const date of ['2025-02-30', '2025-13-01', '2099-01-01', 'foo']) expect(() => validatePublication(publication({ baseline: { amount: '1200', date, expectedRevision: 0 } }), now)).toThrow('Basisdatum')
  })
  it.each([
    ['2026-09-29T22:30:00Z', '2026-09-30', '2026-10-01'],
    ['2026-01-01T23:30:00Z', '2026-01-02', '2026-01-03'],
  ])('accepts the current Berlin baseline date at %s but rejects tomorrow', (instant, today, tomorrow) => {
    const withDate = (date: string) => publication({ baseline: { amount: '1200', date, expectedRevision: 0 } })
    expect(() => validatePublication(withDate(today), new Date(instant))).not.toThrow()
    expect(() => validatePublication(withDate(tomorrow), new Date(instant))).toThrow('Basisdatum')
  })
  it('requires an explicit reason, confirmation and source version for corrections', () => {
    expect(() => validatePublication(publication({ workflow: 'conversion' }), now)).toThrow()
    expect(() => validatePublication(publication({ workflow: 'conversion', conversion: { mode: 'quarterly', reason: 'Correction', expectedSourceRevision: 'hash', confirmed: false as true } }), now)).toThrow()
  })
})
