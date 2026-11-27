import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encode } from '@auth/core/jwt'

const mocks = vi.hoisted(() => ({ cookie: '', inserted: vi.fn(), auth: vi.fn(), write: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers(mocks.cookie ? { cookie: mocks.cookie } : {}) }))
vi.mock('@/lib/db/auth', () => ({ authDb: { insert: () => ({ values: async (row: unknown) => mocks.inserted(row) }) } }))
vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('Redirect') } }))
vi.mock('@/lib/db', () => ({ db: {
    update: () => ({ set: () => ({ where: async () => mocks.write('update') }) }),
    delete: () => ({ where: async () => mocks.write('delete') }),
    insert: () => ({ values: async () => mocks.write('insert') }),
} }))

import { auditLog } from '@/lib/audit'
import { deletePasskey, renamePasskey } from '@/app/actions/passkeys'
import { revokeAllMySessions } from '@/app/actions/session'

const secret = 'test-only-audit-secret-never-used-outside-tests'
async function sessionCookie(token: Record<string, unknown>) {
    const value = await encode({ secret, salt: 'authjs.session-token', token })
    return `authjs.session-token=${value}`
}

beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('AUTH_SECRET', secret)
    vi.stubEnv('AUTH_URL', 'http://localhost:3000')
    mocks.cookie = ''
})

describe('audit attribution during impersonation', () => {
    it('records the super admin behind an impersonated action', async () => {
        mocks.cookie = await sessionCookie({ sub: 'root', id: 'member', realUserId: 'root', isImpersonating: true })
        await auditLog({ action: 'data.update', userId: 'member', details: { field: 'x' } })
        expect(mocks.inserted).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member', details: { field: 'x', impersonatedBy: 'root' } }))
    })
    it('leaves ordinary and malformed sessions unchanged', async () => {
        mocks.cookie = await sessionCookie({ sub: 'member', id: 'member' })
        await auditLog({ action: 'data.update', userId: 'member' })
        mocks.cookie = 'authjs.session-token=not-a-token'
        await auditLog({ action: 'data.update', userId: 'member', details: { field: 'y' } })
        expect(mocks.inserted.mock.calls.map(([row]) => row.details)).toEqual([null, { field: 'y' }])
    })
})

describe('account self-service while impersonating', () => {
    it('refuses passkey changes and session revocation for the viewed account', async () => {
        mocks.auth.mockResolvedValue({ user: { id: 'member', email: 'member@example.invalid', isImpersonating: true } })
        await expect(renamePasskey('cred', 'Name')).rejects.toThrow('Benutzeransicht')
        await expect(deletePasskey('cred')).rejects.toThrow('Benutzeransicht')
        await expect(revokeAllMySessions()).rejects.toThrow('Benutzeransicht')
        expect(mocks.write).not.toHaveBeenCalled()
    })
    it('bounds passkey names', async () => {
        mocks.auth.mockResolvedValue({ user: { id: 'member', email: 'member@example.invalid' } })
        await expect(renamePasskey('cred', '   ')).rejects.toThrow()
        await expect(renamePasskey('cred', 'x'.repeat(101))).rejects.toThrow()
        expect(mocks.write).not.toHaveBeenCalled()
        await renamePasskey('cred', '  Laptop  ')
        expect(mocks.write).toHaveBeenCalledWith('update')
    })
    it('still lets the account owner manage their own passkeys', async () => {
        mocks.auth.mockResolvedValue({ user: { id: 'member', email: 'member@example.invalid' } })
        await deletePasskey('cred')
        expect(mocks.write).toHaveBeenCalledWith('delete')
    })
})
