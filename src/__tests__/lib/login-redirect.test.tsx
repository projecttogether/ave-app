import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn() }))
vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/app/(auth)/login/login-client', () => ({ default: () => null }))

import LoginPage from '@/app/(auth)/login/page'

beforeEach(() => {
    vi.resetAllMocks()
    mocks.redirect.mockImplementation((url: string) => { throw new Error(`Redirect: ${url}`) })
})

describe('login redirects', () => {
    it('lets a revoked super admin session reach the login form despite its signed cookie', async () => {
        // The proxy passes the signed cookie (proxy-login.test.ts), but storage
        // validation rejects it after an organization change.
        mocks.auth.mockResolvedValue(null)
        const page = await LoginPage({ searchParams: Promise.resolve({ callbackUrl: '/admin/users' }) })
        expect(page.props.callbackUrl).toBe('/admin/users')
        expect(mocks.auth).toHaveBeenCalledOnce()
        expect(mocks.redirect).not.toHaveBeenCalled()
    })

    it('shows the login form without a session', async () => {
        mocks.auth.mockResolvedValue(null)
        const page = await LoginPage({ searchParams: Promise.resolve({}) })
        expect(page.props.callbackUrl).toBe('/dashboard')
        expect(mocks.redirect).not.toHaveBeenCalled()
    })

    it.each([
        ['/admin/users', '/admin/users'],
        ['/form/reflection?year=2026', '/form/reflection?year=2026'],
        ['https://app.ave-gastro.org/settings', '/settings'],
        ['/login?callbackUrl=/admin/users', '/dashboard'],
        [undefined, '/dashboard'],
    ])('redirects a validated session with callback %s to %s', async (callbackUrl, target) => {
        mocks.auth.mockResolvedValue({ user: { email: 'admin@example.invalid' } })
        await expect(LoginPage({ searchParams: Promise.resolve({ callbackUrl }) })).rejects.toThrow(`Redirect: ${target}`)
        expect(mocks.redirect).toHaveBeenCalledWith(target)
    })
})
