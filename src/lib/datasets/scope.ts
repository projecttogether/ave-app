import { auth } from '@/auth'
import { db } from '@/lib/db'
import { users, subOrganizations, subOrganizationMembers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { isOrgManager, isOrgViewOnly, isBasicUser, canViewAllOrgData, isGlobalViewOnly } from '@/lib/roles'
import { uuidSchema } from '@/lib/validation'

export async function getUserScope(requested: { organizationId?: string } = {}) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const profile = await db.query.users.findFirst({
    where: eq(users.id, session.user.id!),
    with: { organization: true, userRoles: { with: { role: true } } },
  })
  if (!profile) throw new Error('Profile not found')

  const roles = profile.userRoles.map((ur) => ur.roleId)
  // Global readers may switch to any organization; every other role keeps its own.
  const selected = canViewAllOrgData(roles) && uuidSchema.safeParse(requested.organizationId).success
    ? requested.organizationId! : null
  const organizationId = selected ?? (isGlobalViewOnly(roles) ? null : profile.organizationId || null)

  let accessibleSubOrgIds: string[] | null = [] // default deny

  if (canViewAllOrgData(roles)) {
    if (organizationId) {
      // Org-scoped admin: only their org's sub-orgs
      const subs = await db.query.subOrganizations.findMany({
        where: eq(subOrganizations.organizationId, organizationId),
        columns: { id: true },
      })
      accessibleSubOrgIds = subs.map(s => s.id)
    } else {
      // Global read roles: see all
      accessibleSubOrgIds = null
    }
  } else if (isOrgManager(roles) || isOrgViewOnly(roles)) {
    if (!organizationId) throw new Error('Keine Organisation zugewiesen')
    const subs = await db.query.subOrganizations.findMany({
      where: eq(subOrganizations.organizationId, organizationId),
      columns: { id: true },
    })
    accessibleSubOrgIds = subs.map(s => s.id)
  } else if (isBasicUser(roles)) {
    // organization_user: only their assigned sub-orgs
    const memberships = await db.query.subOrganizationMembers.findMany({
      where: eq(subOrganizationMembers.userId, session.user.id!),
      columns: { subOrganizationId: true },
    })
    accessibleSubOrgIds = memberships.map(m => m.subOrganizationId)
    if (accessibleSubOrgIds.length === 0) {
      return { userId: profile.id, roles, organizationId, accessibleSubOrgIds: [] }
    }
  }

  return { userId: profile.id, roles, organizationId, accessibleSubOrgIds }
}

// Reflection answers belong to the organization, not to individual sites.
export function getReflectionOrganizationIds(scope: { roles: string[]; organizationId: string | null }): string[] | null {
  if (canViewAllOrgData(scope.roles)) return scope.organizationId ? [scope.organizationId] : null
  if (isOrgManager(scope.roles) || isOrgViewOnly(scope.roles)) {
    return scope.organizationId ? [scope.organizationId] : []
  }
  return []
}
