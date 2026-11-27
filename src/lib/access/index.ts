import { auth } from '@/auth'
import { db } from '@/lib/db'
import { users, organizations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { canViewAllOrgData } from '@/lib/roles'
import { AccessDenied, resolveScope } from './scope'
import { z } from 'zod'
import { redirect } from 'next/navigation'

/** RLS filters the directory first; this module validates the requested narrowing. */
export async function getDataScope(requested: { organizationId?: string; subOrganizationId?: string } = {}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  for (const id of [requested.organizationId, requested.subOrganizationId]) {
    if (id !== undefined && !z.uuid().safeParse(id).success) throw new AccessDenied()
  }
  const profile = await db.query.users.findFirst({
    where: eq(users.id, session.user.id), with: { userRoles: true, organization: true },
  })
  if (!profile || profile.status === 'deactivated') throw new AccessDenied()
  const roles = profile.userRoles.map(r => r.roleId)
  const subOrgs = await db.query.subOrganizations.findMany({
    columns: { id: true, name: true, organizationId: true }, orderBy: (t, { asc }) => [asc(t.name)],
  })
  const scope = resolveScope({ ...profile, roles }, subOrgs, requested)
  const availableOrganizations = canViewAllOrgData(roles) ? await db.query.organizations.findMany({
    columns: { id: true, name: true }, orderBy: (t, { asc }) => [asc(t.name)],
  }) : undefined
  if (requested.organizationId && !availableOrganizations?.some(o => o.id === requested.organizationId)) throw new AccessDenied()
  const selectedOrg = scope.organizationId ? await db.query.organizations.findFirst({
    where: eq(organizations.id, scope.organizationId), columns: { name: true },
  }) : undefined
  return { ...scope, roles, email: profile.email, availableOrganizations,
    organizationName: selectedOrg?.name ?? 'Alle Organisationen' }
}

export type DataScope = Awaited<ReturnType<typeof getDataScope>>
