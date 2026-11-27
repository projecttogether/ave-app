import { describe, expect, it } from 'vitest'
import { assertNoQuarterOverlap, coveredMonths, inputPeriodSchema, periodColumns, periodKey, periodMonths, periodState, recordPeriod } from '@/lib/operating-data/periods'

describe('explicit operating periods', () => {
  it('keeps January, Q1 and the annual period distinct and maps legacy rows exactly', () => {
    const periods = ['month', 'quarter', 'year'].map(kind => inputPeriodSchema.parse({ kind, year: 2026, index: 1 }))
    expect(new Set(periods.map(periodKey)).size).toBe(3)
    expect(periods.map(periodColumns).map(recordPeriod)).toEqual(periods)
    expect(recordPeriod({ reportingYear: 2026, reportingMonth: 0 })).toEqual(periods[2])
    expect(recordPeriod({ reportingYear: 2026, reportingMonth: 1 })).toEqual(periods[0])
  })
  it('rejects unknown, incomplete and contradictory identities', () => {
    for (const index of [0, 5, 1.5]) expect(inputPeriodSchema.safeParse({ kind: 'quarter', year: 2026, index }).success).toBe(false)
    expect(() => recordPeriod({ reportingYear: 2026, reportingMonth: null })).toThrow()
    expect(() => recordPeriod({ reportingYear: 2026, reportingMonth: 3, periodKind: 'quarter', periodIndex: 1 })).toThrow()
    expect(() => recordPeriod({ reportingYear: 2026, reportingMonth: 0, periodKind: 'unknown', periodIndex: 1 })).toThrow()
  })
  it('closes quarters at Berlin midnight, including leap years and Q4', () => {
    const quarter = { kind: 'quarter', year: 2026, index: 1 } as const
    expect(periodState(quarter, new Date('2026-03-31T21:59:59Z'))).toBe('open')
    expect(periodState(quarter, new Date('2026-03-31T22:00:00Z'))).toBe('closed')
    expect(periodState({ ...quarter, index: 2 }, new Date('2026-03-31T21:59:59Z'))).toBe('future')
    expect(periodState({ ...quarter, year: 2025, index: 4 }, new Date('2025-12-31T23:00:00Z'))).toBe('closed')
    expect(periodState({ ...quarter, year: 2024 }, new Date('2024-02-29T12:00:00Z'))).toBe('open')
  })
  it('measures covered months, never row counts', () => {
    const quarter = periodColumns({ kind: 'quarter', year: 2026, index: 1 })
    expect(periodMonths(recordPeriod(quarter))).toEqual([1, 2, 3])
    expect(coveredMonths([quarter, quarter])).toEqual([1, 2, 3])
    expect(coveredMonths([1, 2].map(reportingMonth => ({ reportingYear: 2026, reportingMonth })))).toEqual([1, 2])
  })
  it('fails closed on quarter overlaps but retains legacy monthly/annual selection', () => {
    const quarter = { ...periodColumns({ kind: 'quarter', year: 2026, index: 1 }), subOrganizationId: 'a' }
    const month = { ...quarter, ...periodColumns({ kind: 'month', year: 2026, index: 1 }) }
    expect(() => assertNoQuarterOverlap([quarter, month])).toThrow('Datenkonflikt')
    expect(() => assertNoQuarterOverlap([quarter, quarter])).toThrow('Datenkonflikt')
    expect(() => assertNoQuarterOverlap([quarter, { ...month, subOrganizationId: 'b' }])).not.toThrow()
    expect(() => assertNoQuarterOverlap([month, { ...month, ...periodColumns({ kind: 'year', year: 2026, index: 1 }) }])).not.toThrow()
  })
})
