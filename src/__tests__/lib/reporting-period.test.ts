import { describe, expect, it } from 'vitest'
import {
  getAllowedReportingMonths,
  getAllowedReportingYears,
  isFutureReportingPeriod,
  toDateInputValue,
} from '@/lib/reporting-period'

describe('toDateInputValue', () => {
  it('uses the local calendar date, not the UTC date', () => {
    // Shortly after local midnight the UTC date may still be the previous day
    const localMidnight = new Date(2026, 0, 1, 0, 30)
    expect(toDateInputValue(localMidnight)).toBe('2026-01-01')
    expect(toDateInputValue(new Date(2026, 11, 9, 23, 59))).toBe('2026-12-09')
  })
})

describe('reporting period validation', () => {
  const may2026 = new Date(2026, 4, 5)

  it('allows monthly data up to the current month', () => {
    expect(isFutureReportingPeriod(2026, 5, may2026)).toBe(false)
    expect(isFutureReportingPeriod(2026, 6, may2026)).toBe(true)
    expect(isFutureReportingPeriod(2027, 1, may2026)).toBe(true)
  })

  it('allows yearly data from the start of the current year', () => {
    const janFirst2026 = new Date(2026, 0, 1)

    expect(isFutureReportingPeriod(2025, 0, may2026)).toBe(false)
    expect(isFutureReportingPeriod(2026, 0, may2026)).toBe(false)
    expect(isFutureReportingPeriod(2026, 0, janFirst2026)).toBe(false)
    expect(isFutureReportingPeriod(2027, 0, may2026)).toBe(true)
  })

  it('builds selector options without future periods', () => {
    expect(getAllowedReportingYears('monthly', may2026)).toEqual([2025, 2026])
    expect(getAllowedReportingYears('yearly', may2026)).toEqual([2025, 2026])
    expect(getAllowedReportingMonths(2026, may2026)).toEqual([1, 2, 3, 4, 5])
  })
})
