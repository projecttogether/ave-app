import type { FoodWasteSummary } from './food-waste'
import { decimal, roundCalculation } from './decimal'
import { DashboardOverview, DashboardOverviewStats, IndicatorTargets } from './types'

/**
 * Transforms the raw RPC stats response into the application's DashboardOverview format.
 * Includes rounding and null handling.
 */
export function transformDashboardStats(stats: DashboardOverviewStats | null): DashboardOverview {
    const value = (key: keyof DashboardOverview): number | null => {
        const raw = stats?.[key]
        if (raw === null || raw === undefined) return null
        const number = Number(raw)
        return Number.isFinite(number) ? number : null
    }
    return {
        total_spend: value('total_spend'),
        plant_based_percentage: value('plant_based_percentage'),
        organic_percentage: value('organic_percentage'),
        fair_trade_percentage: value('fair_trade_percentage'),
        food_waste: value('food_waste'),
        plant_based_scoring_result: value('plant_based_scoring_result'),
        organic_scoring_result: value('organic_scoring_result'),
        fair_trade_scoring_result: value('fair_trade_scoring_result'),
        food_waste_scoring_result: value('food_waste_scoring_result'),
        regional_scoring_result: value('regional_scoring_result'),
        seasonal_scoring_result: value('seasonal_scoring_result'),
        guest_satisfaction_scoring_result: value('guest_satisfaction_scoring_result'),
    }
}

// ─── Indicator key mapping ────────────────────────────────────────────────────

/** Qualitative-only indicators that have no operational data. */
export const QUAL_ONLY_INDICATORS = new Set(['regional', 'seasonal', 'guest_satisfaction'])

/** Maps INDICATOR_CONFIG slugs (used on detail pages) to DashboardOverview keys. */
export const OVERVIEW_KEY_BY_CONFIG_SLUG: Record<string, keyof DashboardOverview> = {
    total_spend:            'total_spend',
    plant_based_percentage: 'plant_based_percentage',
    organic_percentage:     'organic_percentage',
    fair_trade_percentage:  'fair_trade_percentage',
    regional_score:         'regional_scoring_result',
    seasonal_score:         'seasonal_scoring_result',
    guest_satisfaction:     'guest_satisfaction_scoring_result',
    food_waste:             'food_waste',
}

/** Maps the master indicator ID to the matching DashboardOverview key. */
export const INDICATOR_KEY_MAP: Record<string, keyof DashboardOverview> = {
    plant_based:        'plant_based_percentage',
    organic:            'organic_percentage',
    fair_trade:         'fair_trade_percentage',
    regional:           'regional_scoring_result',
    seasonal:           'seasonal_scoring_result',
    guest_satisfaction: 'guest_satisfaction_scoring_result',
    food_waste:         'food_waste',
}

// ─── Qualitative scoring result shape ────────────────────────────────────────

export type QualScoringForChart = {
    regional: number | null
    seasonal: number | null
    guest_satisfaction: number | null
}

// ─── Canonical progress computation ──────────────────────────────────────────

export type IndicatorProgress = {
    /** Raw value used for display (percentage-change for food_waste, raw score otherwise) */
    value: number | null
    /** Progress towards target, 0-100 */
    progress: number | null
    /** Where the data came from */
    dataSource: 'operational' | 'scoring' | 'none'
}

/**
 * Computes the goal-achievement progress (0–100) for a single indicator.
 *
 * This is the **single source of truth** for all charts. Every chart that shows
 * goal progress must call this function instead of implementing its own formula.
 *
 * @param indicatorId  - Master indicator ID (e.g. "food_waste", "plant_based")
 * @param overview     - Aggregated operational stats for one organisation / scope
 * @param targets      - Target values (same shape as DashboardOverview)
 * @param foodWaste - Matched food-waste result with reporting coverage.
 *                        Must be provided for food_waste to be meaningful.
 * @param qualScoring  - Scoring-question results (0–100) for qual-only indicators.
 */
export function computeIndicatorProgress(
    indicatorId: string,
    overview: DashboardOverview,
    targets: IndicatorTargets,
    foodWaste?: FoodWasteSummary | null,
    qualScoring?: QualScoringForChart | null,
): IndicatorProgress {
    const key = INDICATOR_KEY_MAP[indicatorId] ?? (indicatorId as keyof DashboardOverview)
    const isQual = QUAL_ONLY_INDICATORS.has(indicatorId)

    // ── Qualitative-only indicators ──────────────────────────────────────────
    if (isQual) {
        const raw = qualScoring?.[indicatorId as keyof QualScoringForChart] ?? null
        if (raw === null) return { value: 0, progress: 0, dataSource: 'none' }
        const target = targets[key] || 100
        const progress = roundCalculation(Math.min(100, Math.max(0, decimal(raw).times(100).div(target).toNumber())), 0)!
        return { value: raw, progress, dataSource: 'scoring' }
    }

    // ── Food-waste: relative-change from baseline ────────────────────────────
    if (indicatorId === 'food_waste') {
        return {
            value: foodWaste?.reduction ?? null,
            progress: foodWaste?.progress ?? null,
            dataSource: foodWaste?.reduction != null ? 'operational' : 'none',
        }
    }

    // ── Standard operational indicators ─────────────────────────────────────
    const raw = overview[key]
    if (raw === null) return { value: 0, progress: 0, dataSource: 'none' }
    const target = targets[key]
    let progress = 0
    if (target === 0) {
        progress = raw > 0 ? 50 : 0
    } else {
        progress = roundCalculation(Math.min(100, Math.max(0, decimal(raw).times(100).div(target).toNumber())), 0)!
    }

    return { value: raw, progress, dataSource: 'operational' }
}
