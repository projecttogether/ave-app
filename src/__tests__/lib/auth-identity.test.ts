import { describe, expect, it } from 'vitest'
import { refreshIdentity, type IdentityProfile } from '@/lib/auth/identity'
import { authConfig } from '@/auth.config'

const alice: IdentityProfile = { id: 'alice', name: 'Alice', email: 'alice@example.invalid', organizationId: 'a', status: 'active', roles: ['basic_user'] }
const admin: IdentityProfile = { ...alice, id: 'admin', roles: ['super_admin'] }
const load = async (id: string) => [alice, admin].find(u => u.id === id)

describe('trusted session identity', () => {
  it('ignores browser attempts to overwrite identity, organization, and roles', async () => {
    const token = await refreshIdentity({ id: alice.id, roles: ['super_admin'] }, { id: admin.id, organizationId: 'b', roles: ['super_admin'] }, load)
    expect(token).toMatchObject({ id: alice.id, roles: ['basic_user'], organizationId: 'a' })
  })
  it('denies impersonation commands from normal users and reports them', async () => {
    const denied: string[][] = []
    expect(await refreshIdentity({ id: alice.id }, { impersonateUserId: admin.id, impersonateUserRoles: ['super_admin'] }, load,
      async (userId, targetId) => { denied.push([userId, targetId]) })).toBeNull()
    expect(denied).toEqual([[alice.id, admin.id]])
  })
  it('loads the real target permissions and restores the original identity', async () => {
    const token = await refreshIdentity({ id: admin.id }, { impersonateUserId: alice.id, impersonateUserRoles: ['super_admin'] }, load)
    expect(token).toMatchObject({ id: alice.id, roles: ['basic_user'], realUserId: admin.id })
    expect(await refreshIdentity(token!, { stopImpersonating: true }, load)).toMatchObject({ id: admin.id, roles: ['super_admin'], isImpersonating: false })
  })
  it('ends impersonation after the original admin loses permission', async () => {
    expect(await refreshIdentity({ id: alice.id, realUserId: admin.id, isImpersonating: true }, {}, async id => ({ ...alice, id }))).toBeNull()
  })
  it('rejects deactivated or deleted users', async () => {
    expect(await refreshIdentity({ id: alice.id }, {}, async () => ({ ...alice, status: 'deactivated' }))).toBeNull()
    expect(await refreshIdentity({ id: 'deleted' }, {}, load)).toBeNull()
  })
  it('rejects expired pending invitations but preserves active accounts after their original deadline', async () => {
    const invitationExpiresAt = new Date(Date.now() - 1000)
    for (const status of ['pending', 'invited']) {
      expect(await refreshIdentity({ id: alice.id }, {}, async () => ({ ...alice, status, invitationExpiresAt }))).toBeNull()
    }
    expect(await refreshIdentity({ id: alice.id }, {}, async () => ({ ...alice, invitationExpiresAt }))).toMatchObject({ id: alice.id })
  })
  it('invalidates legacy tokens and ignores arbitrary browser updates in the proxy', async () => {
    const jwt = authConfig.callbacks.jwt
    expect(await jwt({ token: { id: alice.id }, trigger: 'update', session: { authVersion: 2 } } as any)).toBeNull()
    const token = await jwt({ token: { id: alice.id, authVersion: 2, authenticatedAt: Date.now() }, trigger: 'update', session: { id: admin.id, roles: ['super_admin'] } } as any)
    expect(token?.id).toBe(alice.id)
    expect(token?.roles).toBeUndefined()
  })
})
