import { and, eq, sql } from 'drizzle-orm'
import { operatingReportingPreferences, subOrganizations, dataFreezes } from '@/lib/db/schema'
import type { OperatingTransaction } from './write'
import type { ReportingFrequency } from './preferences'

export const preferenceWhere = (subOrganizationId: string, year: number) => and(
  eq(operatingReportingPreferences.subOrganizationId, subOrganizationId), eq(operatingReportingPreferences.reportingYear, year))

export async function lockReportingPreference(tx: OperatingTransaction, subOrganizationId: string, year: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(1936028722, ${year})`)
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${subOrganizationId}, 1936028723))`)
  const kitchen = await tx.query.subOrganizations.findFirst({ where: eq(subOrganizations.id, subOrganizationId) })
  if (!kitchen) throw new Error('Zugriff verweigert.')
  const permission = await tx.execute(sql`SELECT app_private.can_write(${kitchen.organizationId}::uuid, ${kitchen.id}::uuid) AS allowed`)
  if (!permission.rows[0]?.allowed) throw new Error('Keine Berechtigung zum Bearbeiten.')
  if (await tx.query.dataFreezes.findFirst({ where: eq(dataFreezes.year, year) })) throw new Error('Das Berichtsjahr ist gesperrt.')
  return kitchen
}

export async function checkPreferenceRevision(tx: OperatingTransaction, subOrganizationId: string, year: number, expected?: number) {
  const preference = await tx.query.operatingReportingPreferences.findFirst({ where: preferenceWhere(subOrganizationId, year) })
  if (expected !== undefined && expected !== (preference?.revision ?? 0)) {
    throw new Error('Der Erfassungsrhythmus oder die Jahresbestätigung wurde inzwischen geändert. Bitte neu laden.')
  }
  return preference
}

/** Called inside the same year/kitchen lock and transaction as conversions. */
export async function writeReportingPreference(tx: OperatingTransaction, kitchen: { id: string; organizationId: string },
  year: number, frequency: ReportingFrequency, expected: number) {
  const previous = await checkPreferenceRevision(tx, kitchen.id, year, expected)
  if (previous?.frequency === frequency) return previous
  const values = { frequency, source: 'user' as const }
  if (previous) {
    const [updated] = await tx.update(operatingReportingPreferences).set(values)
      .where(preferenceWhere(kitchen.id, year)).returning()
    if (!updated) throw new Error('Keine Berechtigung zum Bearbeiten.')
    return updated
  }
  const [created] = await tx.insert(operatingReportingPreferences).values({ ...values,
    organizationId: kitchen.organizationId, subOrganizationId: kitchen.id, reportingYear: year }).returning()
  return created
}

