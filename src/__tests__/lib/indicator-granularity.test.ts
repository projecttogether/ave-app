import { describe, expect, it } from 'vitest'
import { resolveGranularity } from '@/lib/indicators/granularity'

describe('reporting view selection', () => {
  it.each([undefined, null, '', 'unsupported'])('uses all reported periods without a valid filter: %s', value => {
    expect(resolveGranularity(value)).toBe('auto')
  })
  it.each(['monthly', 'yearly', 'quarterly', 'auto'] as const)('preserves an explicit %s filter', value => {
    expect(resolveGranularity(value)).toBe(value)
  })
})
