'use server'

import { readOperatingDataset } from '@/lib/datasets/operating'

import { db } from '@/lib/db'
import {
  indicatorData,
  qualitativeResponses,
  intakeResponses,
  organizations,
} from '@/lib/db/schema'
import { eq, and, inArray, desc, ilike, not } from 'drizzle-orm'
import { checkAdmin } from '@/app/admin/actions'
import { INDICATOR_HEADERS, QUALITATIVE_HEADERS, serializeIndicatorCsv, serializeScoringCsv, serializeReflectionCsv } from '@/lib/datasets/csv'
import { auditLog } from '@/lib/audit'
import { uuidSchema, yearSchema } from '@/lib/validation'

// Admins may export any organization, including when their account has a home
// organization (see docs/tenant-isolation.md). Test organizations are excluded.
async function getExportableOrganizationIds(orgIds?: string[]): Promise<string[]> {
  orgIds = uuidSchema.array().optional().parse(orgIds)
  if (orgIds && orgIds.length === 0) return []

  const conditions = [not(ilike(organizations.name, '%test%'))]
  if (orgIds) {
    conditions.push(inArray(organizations.id, orgIds))
  }

  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(...conditions))

  return rows.map((row) => row.id)
}

// ---------------------------------------------------------------------------
// Export indicator_data as CSV
// ---------------------------------------------------------------------------
export async function exportIndicatorDataCsv(
  year: number,
  orgIds?: string[]
): Promise<string> {
  await checkAdmin()
  year = yearSchema.parse(year)

  orgIds = await getExportableOrganizationIds(orgIds)
  if (orgIds.length === 0) return INDICATOR_HEADERS.join(',')

  const conditions = [
    eq(indicatorData.reportingYear, year),
    inArray(indicatorData.organizationId, orgIds),
  ]

  const rows = await readOperatingDataset({
    where: and(...conditions),
    orderBy: [desc(indicatorData.reportingYear)],
  })

  return serializeIndicatorCsv(rows)
}

// ---------------------------------------------------------------------------
// Export qualitative_responses as CSV
// ---------------------------------------------------------------------------
export async function exportQualitativeDataCsv(
  year: number,
  orgIds?: string[]
): Promise<string> {
  await checkAdmin()
  year = yearSchema.parse(year)

  orgIds = await getExportableOrganizationIds(orgIds)
  if (orgIds.length === 0) return QUALITATIVE_HEADERS.join(',')

  const conditions = [
    eq(qualitativeResponses.reportingYear, year),
    inArray(qualitativeResponses.organizationId, orgIds),
  ]

  const rows = await db.query.qualitativeResponses.findMany({
    where: and(...conditions),
    with: {
      organization: { columns: { name: true } },
      subOrganization: { columns: { name: true } },
    },
    orderBy: [
      desc(qualitativeResponses.reportingYear),
      desc(qualitativeResponses.updatedAt),
    ],
  })

  return serializeScoringCsv(rows)
}

export async function exportReflectionDataCsv(orgIds?: string[]): Promise<string> {
  const session = await checkAdmin()
  const organizationIds = await getExportableOrganizationIds(orgIds)
  const rows = organizationIds.length === 0 ? [] : await db.query.intakeResponses.findMany({
    where: inArray(intakeResponses.organizationId, organizationIds),
    with: { organization: { columns: { name: true } } },
    orderBy: [desc(intakeResponses.updatedAt)],
  })
  await auditLog({
    action: 'data.export', userId: session.user.id,
    resourceType: 'intake_responses', details: { rowCount: rows.length },
  })
  return serializeReflectionCsv(rows)
}
