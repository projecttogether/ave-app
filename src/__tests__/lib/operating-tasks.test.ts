import { describe, expect, it } from 'vitest'
import { getOperatingTasks, inferReportingFrequency, type TaskRecord } from '@/lib/operating-data/preferences'
import { periodColumns, type InputPeriod } from '@/lib/operating-data/periods'
const now = new Date('2026-09-30T12:00:00Z')
const row = (period: InputPeriod, values = { totalFoodSpend: '0' }): TaskRecord => ({
  id: `${period.kind}-${period.index}`, revision: 1, ...periodColumns(period), ...values,
})

describe('tasks follow the chosen reporting frequency', () => {
  it('does not infer monthly when no choice or data exists', () => {
    expect(getOperatingTasks(2026, null, [], null, now)).toEqual([])
    expect(inferReportingFrequency([])).toBeNull()
    expect(inferReportingFrequency([row({ kind: 'month', year: 2026, index: 1 }), row({ kind: 'year', year: 2026, index: 1 })])).toBeNull()
  })
  it('lists only missing closed months and counts explicit zero', () => {
    const tasks = getOperatingTasks(2026, 'monthly', [row({ kind: 'month', year: 2026, index: 1 })], null, now)
    expect(tasks.map(task => task.period.index)).toEqual([2, 3, 4, 5, 6, 7, 8])
    expect(tasks.every(task => task.period.kind === 'month' && task.state === 'due')).toBe(true)
  })
  it('lists quarters, never monthly reminders, at the Berlin quarter boundary', () => {
    const rows = [row({ kind: 'quarter', year: 2026, index: 1 })]
    expect(getOperatingTasks(2026, 'quarterly', rows, null, now).map(task => task.period.index)).toEqual([2])
    expect(getOperatingTasks(2026, 'quarterly', rows, null, new Date('2026-09-30T21:59:59Z')).map(task => task.period.index)).toEqual([2])
    expect(getOperatingTasks(2026, 'quarterly', rows, null, new Date('2026-09-30T22:00:00Z')).map(task => task.period.index)).toEqual([2, 3])
  })
  it('keeps one annual task in progress with or without saved interim values', () => {
    for (const rows of [[], [row({ kind: 'year', year: 2026, index: 1 })]]) {
      expect(getOperatingTasks(2026, 'yearly', rows, null, now)).toEqual([
        { period: { kind: 'year', year: 2026, index: 1 }, state: 'in_progress', reason: rows.length ? 'annual_review' : 'missing_data' },
      ])
    }
  })
  it('makes the annual task due at Berlin year-end until the exact source is confirmed', () => {
    const annual = row({ kind: 'year', year: 2026, index: 1 })
    const closed = new Date('2026-12-31T23:00:00Z')
    expect(getOperatingTasks(2026, 'yearly', [annual], null, new Date('2026-12-31T22:59:59Z'))[0].state).toBe('in_progress')
    expect(getOperatingTasks(2026, 'yearly', [annual], null, closed)[0].state).toBe('due')
    const confirmation = { annualRecordId: annual.id, annualRecordRevision: 1 }
    expect(getOperatingTasks(2026, 'yearly', [annual], confirmation, closed)).toEqual([])
    expect(getOperatingTasks(2026, 'yearly', [{ ...annual, revision: 2 }], confirmation, closed)).toHaveLength(1)
    expect(getOperatingTasks(2026, 'yearly', [], confirmation, closed)).toHaveLength(1)
  })
  it('does not treat other record kinds, blank or superseded records as the chosen input basis', () => {
    const month = row({ kind: 'month', year: 2026, index: 1 })
    const rows = [row({ kind: 'year', year: 2026, index: 1 }), { ...month, totalFoodSpend: null }, { ...month, supersededAt: now }]
    expect(getOperatingTasks(2026, 'monthly', rows, null, now)).toHaveLength(8)
    expect(getOperatingTasks(2027, 'yearly', [], null, now)).toEqual([])
  })
})
