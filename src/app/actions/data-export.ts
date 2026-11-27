'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { users, indicatorData, qualitativeResponses, intakeResponses, subOrganizationMembers, userRoles, auditLogs } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { isAdmin } from '@/lib/roles'
import { auditLog } from '@/lib/audit'

/**
 * Export all data associated with a user (GDPR data portability).
 * Users can export their own data; admins can export any user's data.
 */
export async function exportUserData(targetUserId?: string): Promise<{ data: Record<string, unknown> }> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const userId = targetUserId || session.user.id

  // Only admins can export other users' data
  if (userId !== session.user.id) {
    const roles = (session.user as any).roles || []
    if (!isAdmin(roles)) throw new Error('Unauthorized')
  }

  const [user, indicatorRows, qualitativeRows, intakeRows, memberships, roles, auditEntries] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, name: true, email: true, createdAt: true, status: true, lastLogin: true, onboardingCompletedAt: true },
    }),
    db.query.indicatorData.findMany({
      where: eq(indicatorData.createdBy, userId),
    }),
    db.query.qualitativeResponses.findMany({
      where: eq(qualitativeResponses.createdBy, userId),
    }),
    db.query.intakeResponses.findMany({
      where: eq(intakeResponses.createdBy, userId),
    }),
    db.query.subOrganizationMembers.findMany({
      where: eq(subOrganizationMembers.userId, userId),
    }),
    db.query.userRoles.findMany({
      where: eq(userRoles.userId, userId),
    }),
    db.select({
      id: auditLogs.id,
      timestamp: auditLogs.timestamp,
      action: auditLogs.action,
      resource: auditLogs.resource,
      severity: auditLogs.severity,
    })
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .limit(1000),
  ])

  auditLog({ action: 'data.export', userId: session.user.id, resource: `user:${userId}`, resourceType: 'user' })

  return {
    data: {
      exportedAt: new Date().toISOString(),
      profile: user,
      roles: roles.map(r => r.roleId),
      organizationMemberships: memberships,
      indicatorData: indicatorRows,
      qualitativeResponses: qualitativeRows,
      intakeResponses: intakeRows,
      auditLog: auditEntries,
    },
  }
}
