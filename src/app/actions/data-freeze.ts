'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { dataFreezes, users, subOrganizations } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { archiveCalculationReport, loadCalculationReport } from '@/lib/indicators/report-data'
import { isAdmin } from '@/lib/roles'
import { revalidatePath } from 'next/cache'
import { auditLog } from '@/lib/audit'
import { yearSchema } from '@/lib/validation'

/**
 * Check if a specific year is frozen.
 * Can be called by any authenticated user (used in form components).
 */
export async function isYearFrozen(year: number): Promise<boolean> {
  const row = await db.query.dataFreezes.findFirst({
    where: eq(dataFreezes.year, year),
  })
  return !!row
}

/**
 * Get all frozen year numbers.
 * Can be called by any authenticated user.
 */
export async function getFrozenYearNumbers(): Promise<number[]> {
  const rows = await db.query.dataFreezes.findMany({
    columns: { year: true },
  })
  return rows.map(r => r.year)
}

/**
 * Get all frozen years with metadata. Admin only.
 */
export async function getFrozenYears() {
  const session = await auth()
  if (!session?.user?.email) throw new Error('Unauthorized')

  const profile = await db.query.users.findFirst({
    where: eq(users.id, session.user.id!),
    with: { userRoles: { with: { role: true } } }
  })
  if (!profile) throw new Error('Admin access required')

  const roles = profile.userRoles.map((ur: any) => ur.roleId)
  if (!isAdmin(roles)) throw new Error('Admin access required')

  const rows = await db.query.dataFreezes.findMany({
    columns: { id: true, year: true, frozenAt: true, frozenBy: true },
  })

  // Resolve user emails for display
  const result = await Promise.all(
    rows.map(async (row) => {
      let frozenByEmail: string | null = null
      if (row.frozenBy) {
        const u = await db.query.users.findFirst({
          where: eq(users.id, row.frozenBy),
          columns: { email: true },
        })
        frozenByEmail = u?.email ?? null
      }
      return {
        id: row.id,
        year: row.year,
        frozenAt: row.frozenAt,
        frozenByEmail,
      }
    })
  )

  return result.sort((a, b) => b.year - a.year)
}

/**
 * Freeze a year. Admin only.
 */
export async function freezeYear(year: number) {
  yearSchema.parse(year)
  const session = await auth()
  if (!session?.user?.email) throw new Error('Unauthorized')

  const profile = await db.query.users.findFirst({
    where: eq(users.id, session.user.id!),
    with: { userRoles: { with: { role: true } } }
  })
  if (!profile) throw new Error('Admin access required')

  const roles = profile.userRoles.map((ur: any) => ur.roleId)
  if (!isAdmin(roles)) throw new Error('Admin access required')

  await db.transaction(async tx => {
    // Keep source rows and baselines stable while the complete year is archived.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1936028722, ${year})`)
    const kitchens = await tx.query.subOrganizations.findMany({ columns: { id: true, organizationId: true }, orderBy: subOrganizations.id })
    for (const kitchen of kitchens) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${kitchen.id}, 1936028723))`)
      for (const granularity of [null, 'monthly', 'yearly', 'quarterly'] as const) {
        const report = await loadCalculationReport(tx, { organizationId: kitchen.organizationId, subOrganizationId: kitchen.id }, year, granularity)
        await archiveCalculationReport(tx, report, session.user!.id!)
      }
    }
    await tx.insert(dataFreezes).values({ year, frozenBy: session.user!.id }).onConflictDoNothing()
  })

  auditLog({ action: 'data.freeze', userId: session.user.id!, resourceType: 'dataFreeze', details: { year } })

  revalidatePath('/admin/data-freeze')
  return { success: true }
}

/**
 * Unfreeze a year. Admin only.
 */
export async function unfreezeYear(year: number) {
  yearSchema.parse(year)
  const session = await auth()
  if (!session?.user?.email) throw new Error('Unauthorized')

  const profile = await db.query.users.findFirst({
    where: eq(users.id, session.user.id!),
    with: { userRoles: { with: { role: true } } }
  })
  if (!profile) throw new Error('Admin access required')

  const roles = profile.userRoles.map((ur: any) => ur.roleId)
  if (!isAdmin(roles)) throw new Error('Admin access required')

  await db.delete(dataFreezes).where(eq(dataFreezes.year, year))

  auditLog({ action: 'data.unfreeze', userId: session.user.id!, resourceType: 'dataFreeze', details: { year }, severity: 'warning' })

  revalidatePath('/admin/data-freeze')
  return { success: true }
}
