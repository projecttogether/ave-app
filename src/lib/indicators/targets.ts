import { DashboardOverview, IndicatorTargets } from './types'
import { INDICATORS } from './indicators'

/**
 * Indicator targets derived from the master table.
 *
 * Maps DashboardOverview keys to their target values.
 * total_spend has no target (set to 0).
 */

// Map master-table indicator IDs → DashboardOverview keys
const KEY_MAP: Record<string, keyof DashboardOverview> = {
  plant_based: 'plant_based_percentage',
  organic: 'organic_percentage',
  fair_trade: 'fair_trade_percentage',
  seasonal: 'seasonal_scoring_result',
  regional: 'regional_scoring_result',
  guest_satisfaction: 'guest_satisfaction_scoring_result',
  food_waste: 'food_waste',
}

export const INDICATOR_TARGETS: IndicatorTargets = {
  total_spend: 0,
  ...Object.fromEntries(
    INDICATORS.map((ind) => [KEY_MAP[ind.id] ?? ind.id, ind.target]),
  ),
} as IndicatorTargets

// Map INDICATOR_CONFIG slugs (used on detail pages) → target values.
// Needed because INDICATOR_CONFIG uses different keys than DashboardOverview.
const SLUG_MAP: Record<string, string> = {
  plant_based_percentage: 'plant_based',
  organic_percentage:     'organic',
  fair_trade_percentage:  'fair_trade',
  seasonal_score:         'seasonal',
  regional_score:         'regional',
  guest_satisfaction:     'guest_satisfaction',
  food_waste:             'food_waste',
}

export const INDICATOR_TARGETS_BY_SLUG: Record<string, number> = Object.fromEntries(
  Object.entries(SLUG_MAP).map(([slug, masterId]) => {
    const ind = INDICATORS.find((i) => i.id === masterId)
    return [slug, ind?.target ?? 0]
  }),
)
