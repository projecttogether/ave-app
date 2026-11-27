import Decimal from 'decimal.js-light'
import { FORMULA_POLICY } from './policy'

export const CalculationDecimal = Decimal.clone({ precision: FORMULA_POLICY.precision, rounding: Decimal.ROUND_HALF_UP })

/** Null is absence, not invalid input. Never silently turn malformed numbers into zero. */
export function decimal(value: unknown): Decimal {
    if (value === null || value === undefined || value === '') return new CalculationDecimal(0)
    if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Ungültiger Zahlenwert')
    if (!Number.isFinite(Number(value)) || (typeof value === 'string' && !/^-?\d+(?:\.\d+)?$/.test(value))) {
        throw new Error('Ungültiger Zahlenwert')
    }
    return new CalculationDecimal(value)
}

export function roundCalculation(value: number | null, places = FORMULA_POLICY.displayDecimals): number | null {
    return value === null ? null : decimal(value).toDecimalPlaces(places, CalculationDecimal.ROUND_HALF_UP).toNumber()
}
