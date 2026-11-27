'use server'

import { serializeOperatingV2 } from '@/lib/operating-data/csv'
import { db } from '@/lib/db'
import { readOperatingDataset } from '@/lib/datasets/operating'
import { indicatorData, qualitativeResponses, intakeResponses } from '@/lib/db/schema'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { uuidSchema, yearSchema } from '@/lib/validation'
import { getUserScope, getReflectionOrganizationIds } from '@/lib/datasets/scope'
import { serializeIndicatorCsv, serializeScoringCsv, serializeReflectionCsv } from '@/lib/datasets/csv'
import { auditLog } from '@/lib/audit'

const exportTypeSchema = z.enum(['operating', 'operating-import', 'scoring', 'reflection'])
const filtersSchema = z.object({
  organizationId: uuidSchema.optional(),
  subOrganizationId: uuidSchema.optional(),
  year: yearSchema.optional(),
})

export type DatasetExportType = z.infer<typeof exportTypeSchema>
export type DatasetExportFilters = z.infer<typeof filtersSchema>

export async function exportDataSetsCsv(type: DatasetExportType, filters: DatasetExportFilters = {}): Promise<string> {
  const kind = exportTypeSchema.parse(type)
  const filter = filtersSchema.parse(filters)
  const scope = await getUserScope({ organizationId: filter.organizationId })
  let csv: string
  let rowCount: number

  if (kind === 'reflection') {
    const organizationIds = getReflectionOrganizationIds(scope)
    const conditions = []
    if (organizationIds !== null) {
      if (organizationIds.length === 0) throw new Error('Zugriff verweigert')
      conditions.push(inArray(intakeResponses.organizationId, organizationIds))
    }
    if (filter.organizationId) conditions.push(eq(intakeResponses.organizationId, filter.organizationId))
    // Reflection is organization-wide and has no reporting year or site.
    if (filter.year || filter.subOrganizationId) throw new Error('Reflexionsdaten haben keinen Jahres- oder Standortfilter')
    const rows = await db.query.intakeResponses.findMany({
      where: and(...conditions),
      with: { organization: { columns: { name: true } } },
      orderBy: [asc(intakeResponses.organizationId), asc(intakeResponses.indicatorSlug), asc(intakeResponses.questionKey)],
    })
    csv = serializeReflectionCsv(rows)
    rowCount = rows.length
  } else {
    const table = (kind === 'operating' || kind === 'operating-import') ? indicatorData : qualitativeResponses
    const conditions = []
    if (scope.accessibleSubOrgIds !== null) {
      if (scope.accessibleSubOrgIds.length === 0) {
        return (kind === 'operating' || kind === 'operating-import') ? serializeIndicatorCsv([]) : serializeScoringCsv([])
      }
      conditions.push(inArray(table.subOrganizationId, scope.accessibleSubOrgIds))
    }
    if (scope.organizationId) conditions.push(eq(table.organizationId, scope.organizationId))
    if (filter.organizationId) conditions.push(eq(table.organizationId, filter.organizationId))
    if (filter.subOrganizationId) conditions.push(eq(table.subOrganizationId, filter.subOrganizationId))
    if (filter.year) conditions.push(eq(table.reportingYear, filter.year))

    if ((kind === 'operating' || kind === 'operating-import')) {
      const rows = await readOperatingDataset({
        where: and(...conditions),
        orderBy: [asc(indicatorData.subOrganizationId), asc(indicatorData.reportingYear), asc(indicatorData.reportingMonth)],
      })
      csv = kind === 'operating-import' ? serializeOperatingV2(rows) : serializeIndicatorCsv(rows)
      rowCount = rows.length
    } else {
      const rows = await db.query.qualitativeResponses.findMany({
        where: and(...conditions),
        with: {
          organization: { columns: { name: true } },
          subOrganization: { columns: { name: true } },
        },
        orderBy: [asc(qualitativeResponses.subOrganizationId), asc(qualitativeResponses.reportingYear), asc(qualitativeResponses.questionKey)],
      })
      csv = serializeScoringCsv(rows)
      rowCount = rows.length
    }
  }

  await auditLog({ action: 'data.export', userId: scope.userId, resourceType: kind, details: { ...filter, rowCount } })
  return csv
}
