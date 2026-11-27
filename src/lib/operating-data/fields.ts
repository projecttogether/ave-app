import { INPUT_FIELDS } from '@/lib/indicators/validation'
import { reportingPeriodKey, type ReportingPeriod } from '@/lib/forms/period-autosave'

export const OPERATING_FIELDS = INPUT_FIELDS

export type OperatingValues = Record<typeof OPERATING_FIELDS[number], string | number>
export type BaselineValues = { foodWasteBaseDate: string; foodWasteBaseAmount: string | number }
export type OperatingDataFields = OperatingValues & BaselineValues
export type OperatingPeriod = ReportingPeriod

export const EMPTY_OPERATING_DATA: OperatingDataFields = {
  ...Object.fromEntries(OPERATING_FIELDS.map(field => [field, ''])) as OperatingValues,
  foodWasteBaseDate: '', foodWasteBaseAmount: '',
}

export function operatingPeriodKey(period: OperatingPeriod) {
  return reportingPeriodKey(period)!
}
