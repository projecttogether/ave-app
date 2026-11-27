import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn(), pathname: '/detail/plant_based_percentage' }))
vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('next/navigation', () => ({
    redirect: mocks.redirect,
    notFound: () => { throw new Error('Not found') },
    usePathname: () => mocks.pathname,
    useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/content/content', () => ({ getAppContent: async () => ({}) }))
vi.mock('@/components/form/reflection-entry-form', () => ({ ReflectionEntryForm: () => null }))

import ReflectionDataEntryPage from '@/app/(data)/detail/[slug]/reflection/page'
import { SecondaryNav } from '@/components/secondary-nav'

const params = Promise.resolve({ slug: 'plant_based_percentage' })

beforeEach(() => {
    vi.resetAllMocks()
    mocks.redirect.mockImplementation((url: string) => { throw new Error(`Redirect: ${url}`) })
})

describe('indicator reflection access', () => {
    it('sends users who cannot enter reflection answers back to the indicator overview', async () => {
        mocks.auth.mockResolvedValue({ user: { email: 'kitchen@example.invalid', roles: ['basic_user'] } })
        await expect(ReflectionDataEntryPage({ params })).rejects.toThrow('Redirect: /detail/plant_based_percentage')
    })

    it('shows the reflection form to organization managers', async () => {
        mocks.auth.mockResolvedValue({ user: { email: 'manager@example.invalid', roles: ['org_manager'] } })
        expect(renderToString(await ReflectionDataEntryPage({ params }))).toContain('Reflexionsfragen erfassen')
        expect(mocks.redirect).not.toHaveBeenCalled()
    })

    it('links indicator reflection questions only for users who may enter them', () => {
        expect(renderToString(<SecondaryNav roles={['basic_user']} />)).not.toContain('Reflexionsfragen')
        expect(renderToString(<SecondaryNav roles={['org_manager']} />)).toContain('/detail/plant_based_percentage/reflection')
    })
})
