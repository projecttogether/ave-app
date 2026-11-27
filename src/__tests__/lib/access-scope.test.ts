import { describe, expect, it } from 'vitest'
import { resolveScope } from '@/lib/access/scope'

const a = { id: 'sub-a', organizationId: 'a', name: 'A' }
const b = { id: 'sub-b', organizationId: 'b', name: 'B' }

describe('organization selection authorization', () => {
  it.each(['admin', 'super_admin', 'global_view_only'])('%s can narrow global access, even with a home organization', role => {
    const profile = { id: 'user', organizationId: 'a', roles: [role] }
    expect(resolveScope(profile, [a,b]).organizationId).toBeNull()
    expect(resolveScope(profile, [a,b], { organizationId: 'b' }).availableSubOrgs).toEqual([b])
    expect(() => resolveScope(profile, [a,b], { organizationId: 'a', subOrganizationId: 'sub-b' })).toThrow()
  })
  it.each(['basic_user', 'org_manager', 'org_view_only'])('%s cannot supply the global organization filter', role => {
    expect(() => resolveScope({ id: 'user', organizationId: 'a', roles: [role] }, [a], { organizationId: 'b' })).toThrow()
  })
  it('uses broader read permissions when a user has multiple roles', () => {
    expect(resolveScope({ id: 'user', organizationId: 'a', roles: ['basic_user','admin'] }, [a,b], { organizationId: 'b', subOrganizationId: 'sub-b' }).organizationId).toBe('b')
    expect(resolveScope({ id: 'user', organizationId: 'a', roles: ['basic_user','org_view_only'] }, []).organizationId).toBe('a')
  })
  it('rejects missing organization, unknown roles, unassigned sub-orgs and empty memberships', () => {
    for (const profile of [
      { id: 'user', organizationId: null, roles: ['basic_user'] },
      { id: 'user', organizationId: 'a', roles: [] },
      { id: 'user', organizationId: 'a', roles: ['basic_user'] },
    ]) expect(() => resolveScope(profile, [])).toThrow()
    expect(() => resolveScope({ id: 'user', organizationId: 'a', roles: ['basic_user'] }, [a], { subOrganizationId: b.id })).toThrow()
  })
})
