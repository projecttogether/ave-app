import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), select: vi.fn(), write: vi.fn(), audit: vi.fn(), link: vi.fn() }))
vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {
    select: () => ({ from: () => ({ where: mocks.select }) }),
    update: () => ({ set: (data: unknown) => ({ where: async () => mocks.write('update', data) }) }),
    insert: () => ({ values: async (data: unknown) => mocks.write('insert', data) }),
    query: { appContent: { findFirst: mocks.link } },
} }))

import { updateAppContent } from '@/app/admin/actions/content'
import { getDashboardLinks } from '@/app/actions/links'

beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.auth.mockResolvedValue({ user: { id: 'admin', roles: ['admin'] } })
    mocks.select.mockResolvedValue([])
})

describe('editable content', () => {
    it('accepts dotted text keys and records the change', async () => {
        expect(await updateAppContent('page.dashboard.subtitle', 'Neu')).toEqual({ success: true })
        expect(mocks.write).toHaveBeenCalledWith('insert', expect.objectContaining({ key: 'page.dashboard.subtitle', value: 'Neu' }))
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ resource: 'content:page.dashboard.subtitle' }))
    })
    it('refuses other app_content rows and oversized values', async () => {
        for (const [key, value] of [['dashboard_links', '{}'], ['__proto__', 'x'], ['page.title', 'x'.repeat(20001)]]) {
            expect(await updateAppContent(key, value)).toEqual({ error: 'Invalid content' })
        }
        expect(mocks.write).not.toHaveBeenCalled()
    })
})

describe('dashboard links', () => {
    it('drops stored values that do not satisfy the link rules', async () => {
        for (const value of ['{}', '[{"id":"1","name":"x","url":"javascript:alert(1)"}]', 'not json']) {
            mocks.link.mockResolvedValueOnce({ value })
            expect(await getDashboardLinks()).toEqual([])
        }
        mocks.link.mockResolvedValueOnce({ value: '[{"id":"1","name":"Docs","url":"https://example.org"}]' })
        expect(await getDashboardLinks()).toEqual([{ id: '1', name: 'Docs', url: 'https://example.org' }])
    })
})
