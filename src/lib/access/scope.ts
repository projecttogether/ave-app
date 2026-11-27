import { canViewAllOrgData, isSubOrganizationScoped } from '@/lib/roles'

export class AccessDenied extends Error {
  constructor() { super('Zugriff verweigert'); this.name = 'AccessDenied' }
}

export type ScopeProfile = {
  id: string
  organizationId: string | null
  roles: string[]
}
export type AccessibleSubOrganization = { id: string; organizationId: string; name: string }

export function resolveScope(profile: ScopeProfile, subOrganizations: AccessibleSubOrganization[],
  requested: { organizationId?: string; subOrganizationId?: string } = {}) {
  const global = canViewAllOrgData(profile.roles)
  if (!global && (!profile.organizationId || !profile.roles.some(r => ['basic_user','org_manager','org_view_only'].includes(r)))) throw new AccessDenied()
  if (requested.organizationId && !global) throw new AccessDenied()
  const organizationId = global ? requested.organizationId || null : profile.organizationId
  const subOrganizationId = requested.subOrganizationId || null
  const availableSubOrgs = subOrganizations.filter(s => !organizationId || s.organizationId === organizationId)
  if (subOrganizationId && !availableSubOrgs.some(s => s.id === subOrganizationId)) throw new AccessDenied()
  if (isSubOrganizationScoped(profile.roles) && !availableSubOrgs.length) throw new AccessDenied()
  return { organizationId, subOrganizationId, availableSubOrgs }
}
