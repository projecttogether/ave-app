import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTableName } from 'drizzle-orm'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUser: vi.fn(), transaction: vi.fn(), seedRoles: vi.fn(), audit: vi.fn(), revalidate: vi.fn(), limit: vi.fn(), superAdminRows: vi.fn(), sendMail: vi.fn(), insert: vi.fn() }))
vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/db', () => ({ db: {
    query: { users: { findFirst: mocks.findUser } },
    transaction: mocks.transaction,
    insert: (table: Parameters<typeof getTableName>[0]) => ({ values: (data: unknown) => Object.assign(Promise.resolve(mocks.insert(getTableName(table), data)), { onConflictDoNothing: mocks.seedRoles }) }),
    // Lookup of protected (super admin) accounts among the mutation targets
    select: () => ({ from: () => ({ where: mocks.superAdminRows }) }),
} }))
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }))
vi.mock('@/lib/rate-limit', () => ({ apiLimiter: {}, checkRateLimit: mocks.limit }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('Redirect') } }))
vi.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: mocks.sendMail }) }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { bulkUpdateUsers, createUser, deactivateUser, deleteUser, updateUser, updateUserEmail, updateUserSubOrganizations } from '@/app/admin/actions'
import { revokeUserSessions } from '@/app/actions/session'

type Write = { table: string; operation: string; data?: unknown }
let committed: Write[]
let rejectMembership: boolean
const userId = '11111111-1111-4111-8111-111111111111'
const orgId = '22222222-2222-4222-8222-222222222222'
const subId = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
    vi.resetAllMocks()
    committed = []
    rejectMembership = false
    mocks.auth.mockResolvedValue({ user: { id: 'admin', email: 'admin@example.com', roles: ['admin'] } })
    mocks.limit.mockResolvedValue({ allowed: true })
    mocks.findUser.mockResolvedValue(undefined)
    mocks.superAdminRows.mockResolvedValue([])
    mocks.sendMail.mockResolvedValue({ rejected: [], pending: [] })
    mocks.transaction.mockImplementation(async callback => {
        // Commit only the writes made inside the callback, as a database transaction does.
        const staged: Write[] = []
        const tx = {
            update: (table: Parameters<typeof getTableName>[0]) => ({ set: (data: unknown) => ({ where: async () => { staged.push({ table: getTableName(table), operation: 'update', data }) } }) }),
            delete: (table: Parameters<typeof getTableName>[0]) => ({ where: async () => { staged.push({ table: getTableName(table), operation: 'delete' }) } }),
            insert: (table: Parameters<typeof getTableName>[0]) => ({ values: (data: unknown) => {
                const name = getTableName(table)
                if (name === 'sub_organization_members' && rejectMembership) throw new Error('Membership must belong to the user organization')
                staged.push({ table: name, operation: 'insert', data })
                return Object.assign(Promise.resolve(), { returning: async () => [{ id: userId, email: 'new@example.com', emailVerified: new Date(), createdAt: new Date() }] })
            } }),
        }
        const result = await callback(tx)
        committed.push(...staged)
        return result
    })
})

describe('admin user saves', () => {
    it('updates profile fields without writing roles, memberships or session revocations', async () => {
        await updateUser(userId, { name: 'Updated name' })
        expect(committed).toEqual([{ table: 'user', operation: 'update', data: { name: 'Updated name' } }])
    })
    it('saves an organization move and replacement memberships in one transaction', async () => {
        await updateUser(userId, { organizationId: orgId, subOrganizationIds: [subId] })
        expect(mocks.transaction).toHaveBeenCalledTimes(1)
        expect(committed.map(write => write.table)).toEqual(['user', 'sub_organization_members', 'sub_organization_members', 'revoked_sessions'])
        expect(committed[2].data).toEqual([{ userId, subOrganizationId: subId }])
    })
    it('does not commit a partial move or announce success when new memberships are rejected', async () => {
        rejectMembership = true
        await expect(updateUser(userId, { organizationId: orgId, subOrganizationIds: [subId] })).rejects.toThrow('Membership')
        expect(committed).toEqual([])
        expect(mocks.audit).not.toHaveBeenCalled()
        expect(mocks.revalidate).not.toHaveBeenCalled()
    })
    it('keeps the existing server support for multiple roles', async () => {
        await updateUser(userId, { roles: ['basic_user', 'org_view_only'] })
        expect(committed.find(write => write.table === 'user_roles' && write.operation === 'insert')?.data).toEqual([
            { userId, roleId: 'basic_user' }, { userId, roleId: 'org_view_only' },
        ])
    })
    it('retains the existing admin and super-admin assignment checks', async () => {
        await expect(updateUser(userId, { roles: ['super_admin'] })).rejects.toThrow('Only Super Admins')
        mocks.auth.mockResolvedValue({ user: { id: userId, email: 'user@example.com', roles: ['basic_user'] } })
        await expect(updateUser(userId, { name: 'Changed' })).rejects.toThrow('Unauthorized')
        expect(mocks.transaction).not.toHaveBeenCalled()
    })
    it('creates the account, existing role assignments and selected memberships together', async () => {
        const result = await createUser('new@example.com', ['basic_user'], orgId, [subId])
        expect(result.user.id).toBe(userId)
        expect(committed.map(write => write.table)).toEqual(['user', 'user_roles', 'sub_organization_members'])
        expect(mocks.audit).toHaveBeenCalledTimes(1)
    })
    it('does not leave a half-created account when its memberships fail', async () => {
        rejectMembership = true
        await expect(createUser('new@example.com', ['basic_user'], orgId, [subId])).rejects.toThrow('Membership')
        expect(committed).toEqual([])
        expect(mocks.audit).not.toHaveBeenCalled()
    })
    it('does not let a regular admin create a super admin account', async () => {
        await expect(createUser('new@example.com', ['super_admin'], orgId)).rejects.toThrow('Only Super Admins')
        expect(mocks.transaction).not.toHaveBeenCalled()
        mocks.auth.mockResolvedValue({ user: { id: 'root', email: 'root@example.com', roles: ['super_admin'] } })
        await createUser('new@example.com', ['super_admin'], orgId)
        expect(committed.map(write => write.table)).toEqual(['user', 'user_roles'])
    })
    it('does not let a regular admin modify, deactivate or delete a super admin', async () => {
        mocks.superAdminRows.mockResolvedValue([{ userId }])
        await expect(updateUser(userId, { name: 'Renamed' })).rejects.toThrow('Super Admin accounts')
        await expect(deactivateUser(userId)).rejects.toThrow('Super Admin accounts')
        await expect(deleteUser(userId)).rejects.toThrow('Super Admin accounts')
        await expect(bulkUpdateUsers([userId], { status: 'deactivated' })).rejects.toThrow('Super Admin accounts')
        expect(mocks.transaction).not.toHaveBeenCalled()
        mocks.auth.mockResolvedValue({ user: { id: 'root', email: 'root@example.com', roles: ['super_admin'] } })
        await updateUser(userId, { name: 'Renamed' })
        expect(committed).toEqual([{ table: 'user', operation: 'update', data: { name: 'Renamed' } }])
    })
    it('does not let an admin remove their own admin access', async () => {
        mocks.auth.mockResolvedValue({ user: { id: userId, email: 'admin@example.com', roles: ['admin'] } })
        await expect(updateUser(userId, { roles: ['basic_user'] })).rejects.toThrow('eigenen Admin-Zugang')
        await expect(deactivateUser(userId)).rejects.toThrow('eigenen Admin-Zugang')
        await expect(deleteUser(userId)).rejects.toThrow('eigenen Admin-Zugang')
        await expect(bulkUpdateUsers([orgId, userId], { status: 'deactivated' })).rejects.toThrow('eigenen Admin-Zugang')
        // Keeping admin access or editing the own profile stays allowed
        await updateUser(userId, { roles: ['admin', 'org_manager'], name: 'Me' })
        expect(committed.map(write => write.table)).toContain('user_roles')
    })
    it('applies bulk changes to all selected users in one transaction', async () => {
        await bulkUpdateUsers([userId, orgId, userId], { roles: ['org_manager'], status: 'active' })
        expect(mocks.transaction).toHaveBeenCalledTimes(1)
        expect(committed.map(write => `${write.table}:${write.operation}`)).toEqual([
            'user:update', 'user_roles:delete', 'user_roles:insert', 'revoked_sessions:insert',
        ])
        expect(committed[2].data).toEqual([{ userId, roleId: 'org_manager' }, { userId: orgId, roleId: 'org_manager' }])
        expect(committed[3].data).toEqual([{ userId, reason: 'admin_revoked' }, { userId: orgId, reason: 'admin_revoked' }])
    })
    it('rejects malformed status values and ids', async () => {
        await expect(updateUser(userId, { status: 'disabled' as never })).rejects.toThrow()
        await expect(bulkUpdateUsers(['not-a-uuid'], { status: 'active' })).rejects.toThrow()
        expect(mocks.transaction).not.toHaveBeenCalled()
    })
})

describe('login email changes', () => {
    const credentialWrites = ['user:update', 'authenticator:delete', 'revoked_sessions:insert']
    it('ends sessions, removes passkeys, audits and notifies the previous address', async () => {
        mocks.findUser.mockResolvedValueOnce({ email: 'old@example.com' }).mockResolvedValueOnce(undefined)
        await updateUserEmail(userId, ' New@Example.com ')
        expect(committed.map(write => `${write.table}:${write.operation}`)).toEqual(credentialWrites)
        expect(committed[0].data).toEqual({ email: 'new@example.com' })
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ severity: 'critical',
            details: expect.objectContaining({ action: 'login_email_change', previousEmail: 'old@example.com', newEmail: 'new@example.com' }) }))
        expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'old@example.com' }))
        expect(mocks.sendMail.mock.calls[0][0].text).toContain('n****@example.com')
        expect(mocks.sendMail.mock.calls[0][0].text).not.toContain('new@example.com')
    })
    it('applies the same handling when the full editor changes the email', async () => {
        mocks.findUser.mockResolvedValueOnce({ email: 'old@example.com' }).mockResolvedValueOnce(undefined)
        await updateUser(userId, { email: 'new@example.com', name: 'Renamed' })
        expect(committed.map(write => `${write.table}:${write.operation}`)).toEqual(credentialWrites)
        expect(mocks.sendMail).toHaveBeenCalledTimes(1)
    })
    it('does nothing to credentials when the address is unchanged', async () => {
        mocks.findUser.mockResolvedValue({ email: 'same@example.com' })
        await updateUserEmail(userId, 'same@example.com')
        await updateUser(userId, { email: 'same@example.com' })
        expect(committed.map(write => write.table)).not.toContain('authenticator')
        expect(mocks.sendMail).not.toHaveBeenCalled()
    })
    it('rejects empty or malformed addresses instead of storing them', async () => {
        await expect(updateUser(userId, { email: '' })).rejects.toThrow()
        await expect(updateUserEmail(userId, 'a@b.c, d@e.f')).rejects.toThrow()
        await expect(updateUser(userId, { name: 'x'.repeat(101) })).rejects.toThrow()
        expect(mocks.transaction).not.toHaveBeenCalled()
    })
    it('lets only super admins change another administrator\'s login email', async () => {
        mocks.superAdminRows.mockResolvedValueOnce([]).mockResolvedValueOnce([{ userId }])
        await expect(updateUserEmail(userId, 'new@example.com')).rejects.toThrow('Super Admins')
        mocks.superAdminRows.mockResolvedValueOnce([]).mockResolvedValueOnce([{ userId }])
        await expect(updateUser(userId, { email: 'new@example.com' })).rejects.toThrow('Super Admins')
        expect(mocks.transaction).not.toHaveBeenCalled()
        mocks.auth.mockResolvedValue({ user: { id: 'root', email: 'root@example.com', roles: ['super_admin'] } })
        mocks.findUser.mockResolvedValueOnce({ email: 'old@example.com' }).mockResolvedValueOnce(undefined)
        await updateUserEmail(userId, 'new@example.com')
        expect(committed.map(write => `${write.table}:${write.operation}`)).toEqual(credentialWrites)
    })
})

describe('other admin account changes', () => {
    it('validates, protects and audits kitchen membership replacements', async () => {
        await expect(updateUserSubOrganizations('not-a-uuid', [subId])).rejects.toThrow()
        await expect(updateUserSubOrganizations(userId, ['not-a-uuid'])).rejects.toThrow()
        mocks.superAdminRows.mockResolvedValueOnce([{ userId }])
        await expect(updateUserSubOrganizations(userId, [subId])).rejects.toThrow('Super Admin accounts')
        expect(mocks.transaction).not.toHaveBeenCalled()
        await updateUserSubOrganizations(userId, [subId, subId])
        expect(committed).toEqual([{ table: 'sub_organization_members', operation: 'delete' },
            { table: 'sub_organization_members', operation: 'insert', data: [{ userId, subOrganizationId: subId }] }])
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.user_update', resource: `user:${userId}` }))
    })
    it('does not let a regular admin revoke a super admin\'s sessions', async () => {
        mocks.superAdminRows.mockResolvedValueOnce([{ userId }])
        await expect(revokeUserSessions(userId)).rejects.toThrow('Super Admin accounts')
        await expect(revokeUserSessions('not-a-uuid')).rejects.toThrow()
        expect(mocks.insert).not.toHaveBeenCalled()
        await revokeUserSessions(userId)
        expect(mocks.insert).toHaveBeenCalledWith('revoked_sessions', { userId, reason: 'admin_revoked' })
    })
})
