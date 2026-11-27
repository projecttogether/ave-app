import { reportingToday } from './operating-data/periods'

export const REPORTING_START_YEAR = 2025

export type ReportingGranularity = 'monthly' | 'yearly'

/** Calendar date in the local time zone as an HTML date input value (YYYY-MM-DD). */
export function toDateInputValue(date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
}

export function getCurrentReportingPeriod(now = new Date()) {
  return {
    year: reportingToday(now).year,
    month: reportingToday(now).month,
  }
}

export function isFutureReportingPeriod(
  year: number,
  month: number,
  now = new Date(),
) {
  const current = getCurrentReportingPeriod(now)

  if (month === 0) {
    return year > current.year
  }

  if (year > current.year) return true
  if (year === current.year && month > current.month) return true
  return false
}

export function getAllowedReportingYears(
  _granularity: ReportingGranularity,
  now = new Date(),
) {
  const currentYear = reportingToday(now).year
  const endYear = currentYear

  if (endYear < REPORTING_START_YEAR) return []

  return Array.from(
    { length: endYear - REPORTING_START_YEAR + 1 },
    (_, i) => REPORTING_START_YEAR + i,
  )
}

export function getAllowedReportingMonths(year: number, now = new Date()) {
  const current = getCurrentReportingPeriod(now)
  const maxMonth = year === current.year ? current.month : 12

  if (year > current.year) return []
  return Array.from({ length: maxMonth }, (_, i) => i + 1)
}

export function getFutureReportingPeriodMessage(year: number, month: number) {
  if (month === 0) {
    return `Das Berichtsjahr ${year} liegt in der Zukunft und kann nicht bearbeitet werden.`
  }

  return `Der Berichtsmonat ${month}/${year} liegt in der Zukunft und kann nicht bearbeitet werden.`
}
