import { INDICATOR_CONFIG } from './config'
import { decimal } from './decimal'

type IndicatorConfigEntry = (typeof INDICATOR_CONFIG)[string]

/**
 * Single source of truth for computing indicator values from a data row.
 *
 * Every chart, table, and server action that needs a percentage or value
 * for a computed indicator MUST call this function instead of inlining
 * the formula. This prevents formula drift across the codebase.
 *
 * @param row - A data row (from DB or form) with numeric spend fields.
 * @param configOrKey - Either a config key string (e.g. 'plant_based_percentage')
 *                      or a resolved config object from INDICATOR_CONFIG.
 */
export function computeIndicatorValues(row: Record<string, unknown>, configOrKey: string | IndicatorConfigEntry): { spend: number; denominator: number } {
    const result = computeIndicatorDecimals(row, configOrKey)
    return { spend: result.spend.toNumber(), denominator: result.denominator.toNumber() }
}

export function computeIndicatorDecimals(row: Record<string, unknown>, configOrKey: string | IndicatorConfigEntry) {
    const config = typeof configOrKey === 'string' ? INDICATOR_CONFIG[configOrKey] : configOrKey
    if (!config || ((config.spendColumn || config.spendColumns) && !rowHasIndicatorData(row, config))) {
        return { spend: decimal(0), denominator: decimal(0) }
    }
    const sum = (columns: string[]) => columns.reduce((total, col) =>
        total.plus(decimal(row[col]).times(config.weights?.[col as keyof typeof config.weights] ?? 1)), decimal(0))
    let spend = config.spendColumn ? decimal(row[config.spendColumn]) : sum(config.spendColumns ?? [])
    if (config.calculation === 'inverse_sum') {
        spend = decimal(row.totalFoodSpend).minus(spend)
        if (spend.lt(0)) spend = decimal(0)
    }
    const denominator = config.denominatorColumns ? sum(config.denominatorColumns) : decimal(row.totalFoodSpend)
    return { spend, denominator }
}

/**
 * True if the row has a value in at least one of the indicator's own columns
 * (the same NULL-filter the SQL stats functions apply).
 */
export function rowHasIndicatorData(
    row: Record<string, unknown>,
    configOrKey: string | IndicatorConfigEntry
): boolean {
    const config = typeof configOrKey === 'string'
        ? INDICATOR_CONFIG[configOrKey]
        : configOrKey
    if (!config) return false
    const cols = config.spendColumn ? [config.spendColumn] : config.spendColumns ?? (config.column ? [config.column] : [])
    return cols.some((col: string) => {
        const val = row[col]
        return val !== null && val !== undefined && val !== ''
    })
}

/**
 * Compute the percentage for a computed indicator from a single data row.
 * Returns 0 when the denominator is zero.
 */
export function computeIndicatorPercentage(
    configKey: string,
    row: Record<string, unknown>
): number {
    const { spend, denominator } = computeIndicatorDecimals(row, configKey)
    if (denominator.isZero()) return 0
    return spend.times(100).div(denominator).toNumber()
}
