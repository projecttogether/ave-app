import { describe, expect, it } from 'vitest'
import reference from '../fixtures/indicator-reference.json'
import { buildCalculationReport } from '@/lib/indicators/report'
import { inputRevision } from '@/lib/indicators/revision'
import { aggregateIndicator, aggregateTrend, foodWasteChange, selectIndicatorRows } from '@/lib/indicators/aggregation'
import { aggregateQualitativeScores, calculateScoreForIndicator } from '@/lib/qualitative/scoring'
import { validateIndicatorInput, normalizeIndicatorInput, validateAmount } from '@/lib/indicators/validation'
import { calculationReportCsv } from '@/lib/indicators/report-export'
import { roundCalculation } from '@/lib/indicators/decimal'
import { SCORING_QUESTIONS } from '@/lib/qualitative/constants'
import { FORMULA_POLICY } from '@/lib/indicators/policy'

describe('independent arithmetic reference', () => {
    it('matches literal expected values for all seven indicators and spending', () => {
        const report = buildCalculationReport(reference.inputs, inputRevision(reference.inputs))
        expect(Object.fromEntries(report.indicators.map(i => [i.slug, i.value]))).toEqual(reference.expected)
        expect(aggregateQualitativeScores(reference.inputs.answers)).toEqual(reference.qualitative)
    })
    it('explains weights, excluded annual rows, coverage and prorated baselines', () => {
        const report = buildCalculationReport(reference.inputs, 'revision')
        const fair = report.indicators.find(i => i.slug === 'fair_trade_percentage')!
        expect(fair).toMatchObject({ numerator: '300', denominator: '1500', value: 20 })
        expect(fair.rows.find(r => r.id === 'a-year-excluded')).toMatchObject({ included: false, reason: 'Jahreswert durch Monatswerte ersetzt' })
        expect(fair.coverage).toEqual([{ kitchen: 'Kitchen A', reportedMonths: 2, expectedMonths: 12, annual: false }, { kitchen: 'Kitchen B', reportedMonths: 12, expectedMonths: 12, annual: true }])
        expect(report.indicators.find(i => i.slug === 'food_waste')?.baselineSources.map(b => b.amount)).toEqual([200, 1000])
    })
    it('preserves archived inputs, answers, rules and results after source changes', () => {
        const inputs = structuredClone(reference.inputs)
        const archived = buildCalculationReport(inputs, inputRevision(inputs))
        inputs.kitchens[0].foodWasteBaseAmount = '2400'
        inputs.answers[0].responseOption = 'Nein'
        inputs.rows[0].fairTradeCoffeeSpend = '0'
        const changed = buildCalculationReport(inputs, inputRevision(inputs))
        expect(changed.inputRevision).not.toBe(archived.inputRevision)
        expect(archived.inputs.kitchens[0].foodWasteBaseAmount).toBe('1200')
        expect(archived.inputs.answers[0].responseOption).toBe('Ja')
        expect(archived.indicators.find(i => i.slug === 'fair_trade_percentage')?.value).toBe(20)
        expect(JSON.parse(JSON.stringify(archived))).toEqual(archived)
        expect(archived.methodology).not.toBe(FORMULA_POLICY)
    })
    it('exports exclusions, exact totals, answers and revision metadata', () => {
        const csv = calculationReportCsv(buildCalculationReport(reference.inputs, 'revision-123'))
        expect(csv).toContain('ausgeschlossen')
        expect(csv).toContain('300,1500,20')
        expect(csv).toContain('revision-123')
        expect(csv).toContain('Antwort,regional')
    })
    it('uses the same matched population in report values, totals and baseline exclusions', () => {
        const report = buildCalculationReport({
            year: 2026, granularity: 'monthly', answers: [],
            kitchens: [
                { id: 'a', organizationId: 'org', name: 'Kitchen A', foodWasteBaseAmount: 1200 },
                { id: 'b', organizationId: 'org', name: 'Kitchen B', foodWasteBaseAmount: null },
            ],
            rows: [
                { id: 'a-jan', subOrganizationId: 'a', reportingYear: 2026, reportingMonth: 1, foodWasteAmount: 80 },
                { id: 'b-jan', subOrganizationId: 'b', reportingYear: 2026, reportingMonth: 1, foodWasteAmount: 500 },
            ],
            history: [{ subOrganizationId: 'b', reportingYear: 2025, reportingMonth: 0, foodWasteAmount: 6000 }],
        }, 'matched-revision')
        const waste = report.indicators.find(indicator => indicator.slug === 'food_waste')!
        expect(waste).toMatchObject({ value: -20, numerator: '80', denominator: '100' })
        expect(waste.rows.find(row => row.id === 'b-jan')).toMatchObject({ included: false, reason: 'Kein gültiger konfigurierter Basiswert' })
        expect(waste.warnings).toContain('Teilberechnung: 1 von 2 meldenden Betrieben berücksichtigt; 1 ohne gültigen Basiswert.')
        expect(report.formulaVersion).toBe('2026-10-28.1')
    })
    it('keeps scoring form options and the released policy synchronized', () => {
        const scored = new Set(FORMULA_POLICY.questions.map(q => q.key))
        const questions = SCORING_QUESTIONS.filter(q => scored.has(q.key) || (q.type === 'single-select' && (q.options?.includes('Ja') || q.options?.includes('<10%'))))
        expect(questions.map(q => q.key)).toEqual(FORMULA_POLICY.questions.map(q => q.key))
        for (const question of questions) expect(Object.keys(FORMULA_POLICY.questions.find(q => q.key === question.key)!.points)).toEqual(question.options)
    })
    it('scores guest-satisfaction survey frequency from nie = 0 to täglich = 6 of 28 points', () => {
        const frequency = (option: string) => calculateScoreForIndicator({ gs_score_1_falls_bei_euch_die_gaestezufri: { option } }, 'guest_satisfaction')
        expect(['nie', 'jährlich', 'halbjährlich', 'quartalsweise', 'monatlich', 'wöchentlich', 'täglich'].map(frequency)).toEqual([0, 4, 7, 11, 14, 18, 21])
        const all = Object.fromEntries(FORMULA_POLICY.questions.filter(q => q.indicator === 'guest_satisfaction')
            .map(q => [q.key, { option: q.key === 'gs_score_1_falls_bei_euch_die_gaestezufri' ? 'täglich' : 'Ja' }]))
        expect(calculateScoreForIndicator(all, 'guest_satisfaction')).toBe(100)
    })
})

describe('input contract', () => {
    it.each(['constructor', '__proto__', 'unsupported'])('ignores unsupported questionnaire option %s', option => {
        expect(calculateScoreForIndicator({ ft_score_1_werden_nachweise_regelmaessig_: { option } }, 'fair_trade')).toBeNull()
    })
    it.each([Infinity, -Infinity, NaN, 'NaN', 'Infinity', '0x10', '1e3', '1,25', '1.234,56', true, {}, -1, ' ', '0.0000001', 1e13])('rejects malformed or unsupported amount %s', value => {
        expect(validateIndicatorInput({ totalFoodSpend: value })).not.toEqual([])
    })
    it('normalizes decimals without confusing missing values and zero', () => {
        expect(normalizeIndicatorInput({ coffeeSpend: '100.0100', fairTradeCoffeeSpend: 0, totalFoodSpend: '' })).toEqual({ coffeeSpend: '100.01', fairTradeCoffeeSpend: '0', totalFoodSpend: null })
        expect(validateIndicatorInput({ coffeeSpend: 100, fairTradeCoffeeSpend: 0 })).toEqual([])
    })
    it('rejects certified amounts above their matching category or without it', () => {
        expect(validateIndicatorInput({ coffeeSpend: 100, fairTradeCoffeeSpend: 101 })[0].field).toBe('fairTradeCoffeeSpend')
        expect(validateIndicatorInput({ fairTradeCoffeeSpend: 0 })[0].field).toBe('fairTradeCoffeeSpend')
        expect(validateIndicatorInput({ organicSpend: 500, totalFoodSpend: 400 })[0].field).toBe('organicSpend')
    })
    it('checks exclusive purchase categories without double counting organic and Fairtrade', () => {
        expect(validateIndicatorInput({ totalFoodSpend: 100, meatSpend: 60, mixedProductSpend: 50 })).not.toEqual([])
        expect(validateIndicatorInput({ totalFoodSpend: 100, meatSpend: 50, organicSpend: 80, coffeeSpend: 50, fairTradeCoffeeSpend: 40 })).toEqual([])
        expect(validateAmount(0.1, 'baseline', 'Basis')).toBeNull()
    })
})

describe('calculation invariants', () => {
    // Deterministic generated datasets exercise decimal boundaries and weights.
    for (let seed = 1; seed <= 40; seed++) {
        it(`preserves ordering, scaling and row-splitting invariance (${seed})`, () => {
            const rows = Array.from({ length: 5 }, (_, i) => ({ coffeeSpend: ((seed + i) * 17.23).toFixed(2), fairTradeCoffeeSpend: ((seed + i) * 6.11).toFixed(2), cocoaMixedSpend: ((seed + i) * 2.34).toFixed(2), fairTradeCocoaMixedSpend: ((seed + i) * 1.22).toFixed(2) }))
            const value = aggregateIndicator(rows, 'fair_trade_percentage')!
            expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(100)
            expect(aggregateIndicator([...rows].reverse(), 'fair_trade_percentage')).toBe(value)
            const scaled = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, v]) => [key, (Number(v) * 10).toFixed(2)])))
            expect(aggregateIndicator(scaled, 'fair_trade_percentage')).toBeCloseTo(value, 12)
            const split = rows.flatMap(row => Array.from({ length: 2 }, () => Object.fromEntries(Object.entries(row).map(([key, v]) => [key, (Number(v) / 2).toFixed(3)]))))
            expect(aggregateIndicator(split, 'fair_trade_percentage')).toBeCloseTo(value, 12)
            const improved = rows.map(row => ({ ...row, fairTradeCoffeeSpend: row.coffeeSpend }))
            expect(aggregateIndicator(improved, 'fair_trade_percentage')).toBeGreaterThan(value)
        })
    }
    it('does not invent values from missing data or denominator zero', () => {
        expect(aggregateIndicator([{ coffeeSpend: 100 }], 'fair_trade_percentage')).toBeNull()
        expect(aggregateIndicator([{ coffeeSpend: 0, fairTradeCoffeeSpend: 0 }], 'fair_trade_percentage')).toBeNull()
        expect(aggregateIndicator([{ coffeeSpend: 100, fairTradeCoffeeSpend: 0 }], 'fair_trade_percentage')).toBe(0)
    })
    it('uses explicit commercial rounding, including negative ties', () => {
        expect(roundCalculation(1.005)).toBe(1.01)
        expect(roundCalculation(-1.005)).toBe(-1.01)
    })
    it('requires a configured baseline even when historical months match', () => {
        const rows = [{ subOrganizationId: 'a', reportingYear: 2026, reportingMonth: 2, foodWasteAmount: 80 }]
        const history = [{ subOrganizationId: 'a', reportingYear: 2025, reportingMonth: 1, foodWasteAmount: 100 }]
        expect(foodWasteChange(rows, { baselines: [], history })).toBeNull()
        expect(foodWasteChange(rows, { baselines: [], history: [{ ...history[0], reportingMonth: 2 }] })).toBeNull()
    })
    it('calculates trend changes before rounding displayed percentages', () => {
        const rows = [1, 2].map(month => ({ subOrganizationId: 'a', reportingYear: 2026, reportingMonth: month, coffeeSpend: 10000, fairTradeCoffeeSpend: month }))
        expect(aggregateTrend(rows, 'fair_trade_percentage', 'monthly')[1].change).toBe(100)
        expect(selectIndicatorRows(reference.inputs.rows, 'fair_trade_percentage')).toHaveLength(3)
    })
})
