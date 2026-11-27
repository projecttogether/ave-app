import current from './policies/2026-10-28.1.json'

// Released policies are immutable. Add a new file/version when the methodology
// changes; archived reports carry the complete policy that produced them.
export const FORMULA_POLICY = current
export const FORMULA_VERSION = current.version
export type FormulaPolicy = typeof current
