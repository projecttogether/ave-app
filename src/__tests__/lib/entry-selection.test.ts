import { describe, expect, it } from 'vitest'
import { operatingEntryHref, readEntrySelection } from '@/lib/operating-data/entry-selection'
const now = new Date('2026-09-30T12:00:00Z')
describe('operating task destinations', () => {
  it.each([
    { kind: 'month' as const, year: 2026, index: 8 },
    { kind: 'quarter' as const, year: 2026, index: 2 },
    { kind: 'year' as const, year: 2026, index: 1 as const },
  ])('round trips an explicit $kind period', period => {
    const url = new URL(operatingEntryHref('kitchen', period), 'https://ave.invalid')
    expect(readEntrySelection(url.searchParams, { quarterly: period.kind === 'quarter', now })).toMatchObject({ period, subOrgId: 'kitchen' })
  })
  it('preserves batch months and annual conversion selection', () => {
    expect(operatingEntryHref('kitchen', { kind: 'month', year: 2026, index: 8 }, 'batch')).toContain('quarter=3&workflow=batch')
    const url = new URL(operatingEntryHref('kitchen', { kind: 'quarter', year: 2025, index: 1 }, 'year'), 'https://ave.invalid')
    expect(readEntrySelection(url.searchParams, { quarterly: true, now }).period).toEqual({ kind: 'year', year: 2025, index: 1 })
  })
  it.each(['year=2026.5', 'year=2026junk', 'year=2027', 'year=2024', 'month=13', 'month=10', 'month=0', 'entryMode=quarterly', 'year=2026&year=2025', 'subOrgId='])('rejects %s', query => {
    expect(() => readEntrySelection(new URLSearchParams(query), { now })).toThrow()
  })
  it.each(['quarter=5', 'quarter=4', 'quarter=1.5', 'quarter=2&quarter=1', 'workflow=unknown'])('rejects quarterly destination %s', query => {
    expect(() => readEntrySelection(new URLSearchParams(query), { quarterly: true, now })).toThrow()
  })
})
