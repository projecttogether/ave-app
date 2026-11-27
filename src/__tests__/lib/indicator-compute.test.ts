import { describe, it, expect } from 'vitest'
import { computeIndicatorValues, computeIndicatorPercentage, rowHasIndicatorData } from '@/lib/indicators/compute'

// Mirrors the FILTER (WHERE ... IS NOT NULL) semantics of get_dashboard_stats:
// a row only counts toward an indicator when at least one of the indicator's
// own columns has a value.
describe('computeIndicatorValues NULL handling', () => {
    it('excludes rows with no animal-spend data from plant_based (was: counted as 100%)', () => {
        const row = { totalFoodSpend: '1000', meatSpend: null, fishSpend: null, dairySpend: null, eggSpend: null, mixedProductSpend: null }
        expect(rowHasIndicatorData(row, 'plant_based_percentage')).toBe(false)
        expect(computeIndicatorValues(row, 'plant_based_percentage')).toEqual({ spend: 0, denominator: 0 })
        expect(computeIndicatorPercentage('plant_based_percentage', row)).toBe(0)
    })

    it('computes plant_based with weights when animal spend is present', () => {
        const row = { totalFoodSpend: '1000', meatSpend: '150', fishSpend: null, dairySpend: null, eggSpend: null, mixedProductSpend: '100' }
        const vals = computeIndicatorValues(row, 'plant_based_percentage')
        // 1000 - (150 + 100*0.5) = 800
        expect(vals).toEqual({ spend: 800, denominator: 1000 })
    })

    it('treats explicit 0 as data (100% plant-based)', () => {
        const row = { totalFoodSpend: '1000', meatSpend: '0', fishSpend: null, dairySpend: null, eggSpend: null, mixedProductSpend: null }
        expect(computeIndicatorPercentage('plant_based_percentage', row)).toBe(100)
    })

    it('excludes rows without organicSpend from organic (was: diluted the percentage)', () => {
        const noData = { totalFoodSpend: '1000', organicSpend: null }
        expect(computeIndicatorValues(noData, 'organic_percentage')).toEqual({ spend: 0, denominator: 0 })

        const withData = { totalFoodSpend: '1000', organicSpend: '100' }
        expect(computeIndicatorPercentage('organic_percentage', withData)).toBe(10)
    })

    it('excludes rows without fair-trade values even when base spends exist', () => {
        const row = {
            coffeeSpend: '100', cocoaSpend: '50', bananasSpend: null, cocoaMixedSpend: null,
            fairTradeCoffeeSpend: null, fairTradeCocoaSpend: null, fairTradeBananasSpend: null, fairTradeCocoaMixedSpend: null,
        }
        expect(computeIndicatorValues(row, 'fair_trade_percentage')).toEqual({ spend: 0, denominator: 0 })
    })
})
