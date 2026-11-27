import { INPUT_FIELDS } from '@/lib/indicators/validation'
import { coveredMonths, type PeriodRecord } from './periods'

export function hasOperatingValues(row: Record<string, unknown>) {
  return INPUT_FIELDS.some(field => row[field] !== null && row[field] !== undefined && row[field] !== '')
}

export function reportingCoverage(rows: readonly (PeriodRecord & { subOrganizationId: string })[]) {
  const groups = new Map<string, PeriodRecord[]>()
  for (const row of rows) groups.set(row.subOrganizationId, [...(groups.get(row.subOrganizationId) ?? []), row])
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([id, records]) => ({ id, months: coveredMonths(records) }))
}

/** Only compare the same kitchens and months; never extrapolate an incomplete year. */
export function comparableCoverage(a: readonly (PeriodRecord & { subOrganizationId: string })[], b: readonly (PeriodRecord & { subOrganizationId: string })[]) {
  return a.length > 0 && b.length > 0 && JSON.stringify(reportingCoverage(a)) === JSON.stringify(reportingCoverage(b))
}

export function fullYearCoverage(rows: readonly (PeriodRecord & { subOrganizationId: string })[]) {
  const coverage = reportingCoverage(rows)
  return coverage.length > 0 && coverage.every(kitchen => kitchen.months.length === 12)
}
