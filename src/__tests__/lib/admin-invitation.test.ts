import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({ find: vi.fn(), mail: vi.fn(), update: vi.fn(), where: vi.fn(), audit: vi.fn() }))
vi.mock('@/app/admin/actions', () => ({ checkAdmin: async () => ({ user: { id: 'admin' } }) }))
vi.mock('@/lib/db', () => ({ db: { query: { users: { findFirst: mocks.find } }, update: () => ({ set: mocks.update }) } }))
vi.mock('@/lib/invitation-mail', () => ({ deliverInvitation: mocks.mail }))
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }))
vi.mock('@/lib/rate-limit', () => ({ adminLimiter: {}, checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { sendInviteEmail } from '@/app/admin/actions/send-invite'

beforeEach(() => {
    vi.resetAllMocks()
    mocks.update.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue(undefined)
    mocks.mail.mockResolvedValue(undefined)
})

describe('admin invitation resends', () => {
    it('does not email or reactivate a disabled account', async () => {
        mocks.find.mockResolvedValue({ id: 'user', email: 'user@example.com', status: 'deactivated' })
        expect(await sendInviteEmail('user')).toMatchObject({ success: false })
        expect(mocks.mail).not.toHaveBeenCalled()
        expect(mocks.update).not.toHaveBeenCalled()
    })
    it('conditions the delivery update on a still-pending account', async () => {
        mocks.find.mockResolvedValue({ id: 'user', email: 'user@example.com', status: 'pending' })
        expect(await sendInviteEmail('user')).toEqual({ success: true })
        const where = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0])
        expect(where.sql).toContain('"user"."status" in')
        expect(where.params).toEqual(['user', 'pending', 'invited'])
    })
    it('does not mark an invitation sent when SMTP fails', async () => {
        mocks.find.mockResolvedValue({ id: 'user', email: 'user@example.com', status: 'pending' })
        mocks.mail.mockRejectedValue(new Error('SMTP offline'))
        expect(await sendInviteEmail('user')).toMatchObject({ success: false })
        expect(mocks.update).not.toHaveBeenCalled()
        expect(mocks.audit).not.toHaveBeenCalled()
    })
})
