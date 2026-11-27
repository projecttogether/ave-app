import { getQualitativeResponses, saveAllQualitativeResponses } from '@/app/actions/qualitative'
import { isYearFrozen } from '@/app/actions/data-freeze'
import type { QualitativeFormData } from '@/lib/qualitative/constants'
import { reportingPeriodKey, type PeriodAdapter } from './period-autosave'
import { createPendingWrites } from './pending-writes'

const writes = createPendingWrites()

export function qualitativePeriodAdapter(onError: PeriodAdapter<QualitativeFormData>['onError']): PeriodAdapter<QualitativeFormData> {
  return {
    onError,
    load(period) {
      return writes.read(reportingPeriodKey(period)!, async () => {
        const [frozen, data] = await Promise.all([
          isYearFrozen(period.year),
          getQualitativeResponses(period.organizationId, period.subOrganizationId, period.year),
        ])
        return { frozen, data }
      })
    },
    save(period, data) {
      return writes.write(reportingPeriodKey(period)!, async () => {
        const result = await saveAllQualitativeResponses(period.organizationId, period.subOrganizationId, period.year, data)
        if (result.error) throw new Error(result.error)
      })
    },
  }
}
