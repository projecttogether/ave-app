import { FORMULA_POLICY } from './policy'

/**
 * Indicator Master Table
 *
 * Single source of truth for all indicator metadata.
 * Every chart, form, and export should reference this table
 * to ensure consistent naming and ordering.
 */

export interface Indicator {
  /** Stable slug used in DB, URLs, and code (e.g. "plant_based") */
  id: string
  /** Display order across all charts (1-based) */
  order: number
  /** Full German display name (e.g. "Pflanzliche Lebensmittel") */
  name: string
  /** Short label for compact UI like radar charts (e.g. "Pflanzlich") */
  shortName: string
  /** Target value for this indicator (e.g. 75 for 75%) */
  target: number
  /** Unit of measurement (e.g. "%", "kg") */
  unit: string
}

/**
 * The ordered master list of all 7 AVE indicators.
 */
export const INDICATORS: readonly Indicator[] = FORMULA_POLICY.indicators

// ─── Derived helpers ───────────────────────────────────────────────────────

/** All indicator IDs in display order */
export const INDICATOR_IDS = INDICATORS.map((i) => i.id)

/** Union type of all indicator IDs */
export type IndicatorId = (typeof INDICATORS)[number]['id']

/** Full names keyed by indicator ID */
export const INDICATOR_LABELS: Record<string, string> = Object.fromEntries(
  INDICATORS.map((i) => [i.id, i.name]),
)

/** Short names keyed by indicator ID */
export const INDICATOR_SHORT_LABELS: Record<string, string> = Object.fromEntries(
  INDICATORS.map((i) => [i.id, i.shortName]),
)

/** Look up a single indicator by its ID */
export function getIndicator(id: string): Indicator | undefined {
  return INDICATORS.find((i) => i.id === id)
}
