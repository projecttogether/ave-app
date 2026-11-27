import { z } from 'zod'
import { hasOperatingValues } from './coverage'
import { periodState, recordPeriod, type InputPeriod, type PeriodRecord } from './periods'

export const reportingFrequencySchema = z.enum(['monthly', 'quarterly', 'yearly'])
export type ReportingFrequency = z.infer<typeof reportingFrequencySchema>
export const FREQUENCY_LABELS: Record<ReportingFrequency, string> = {
  monthly: 'Monatlich', quarterly: 'Quartalsweise', yearly: 'Jährlich',
}
export function frequencyKind(frequency: ReportingFrequency): InputPeriod['kind'] {
  return frequency === 'monthly' ? 'month' : frequency === 'quarterly' ? 'quarter' : 'year'
}
export type AnnualConfirmation = { annualRecordId: string | null; annualRecordRevision: number | null }
export type OperatingTask = { period: InputPeriod; state: 'due' | 'in_progress'; reason: 'missing_data' | 'annual_review' }
export type TaskRecord = PeriodRecord & { id: string; revision: number; supersededAt?: Date | null } & Record<string, unknown>

/** Only homogeneous published records can suggest a frequency. Empty and mixed
 * data never turn an absent choice into monthly reporting. */
export function inferReportingFrequency(rows: readonly TaskRecord[], mode?: string | null): ReportingFrequency | null {
  if (mode === 'quarterly') return 'quarterly'
  const kinds = new Set(rows.filter(r => !r.supersededAt && hasOperatingValues(r)).map(r => recordPeriod(r).kind))
  if (kinds.size !== 1) return null
  return kinds.has('month') ? 'monthly' : kinds.has('year') ? 'yearly' : 'quarterly'
}

export function annualIsConfirmed(row: TaskRecord | undefined, confirmation?: AnnualConfirmation | null) {
  return Boolean(row && hasOperatingValues(row) && !row.supersededAt && confirmation
    && confirmation.annualRecordId === row.id && confirmation.annualRecordRevision === row.revision)
}

export function getOperatingTasks(year: number, frequency: ReportingFrequency | null,
  rows: readonly TaskRecord[], confirmation?: AnnualConfirmation | null, now = new Date()): OperatingTask[] {
  if (!frequency) return []
  const kind = frequencyKind(frequency)
  const active = rows.filter(row => row.reportingYear === year && !row.supersededAt && hasOperatingValues(row))
  const periods: InputPeriod[] = Array.from({ length: kind === 'month' ? 12 : kind === 'quarter' ? 4 : 1 },
    (_, i) => ({ kind, year, index: i + 1 }) as InputPeriod)
  return periods.flatMap(period => {
    const state = periodState(period, now)
    if (state === 'future' || (kind !== 'year' && state !== 'closed')) return []
    const row = active.find(row => {
      const source = recordPeriod(row)
      return source.kind === kind && source.index === period.index
    })
    if (kind === 'year') {
      if (state === 'closed' && annualIsConfirmed(row, confirmation)) return []
      return [{ period, state: state === 'open' ? 'in_progress' : 'due', reason: row ? 'annual_review' : 'missing_data' }]
    }
    return row ? [] : [{ period, state: 'due', reason: 'missing_data' }]
  })
}
