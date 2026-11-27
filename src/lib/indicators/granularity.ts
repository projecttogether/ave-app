import type { Granularity } from './aggregation'

/** An unfiltered overview includes whichever period types were reported. */
export function resolveGranularity(value?: string | null): Granularity {
  return value === 'monthly' || value === 'yearly' || value === 'quarterly' ? value : 'auto'
}
