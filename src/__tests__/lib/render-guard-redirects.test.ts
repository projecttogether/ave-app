import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), profile: vi.fn() }))
vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/db', () => ({ db: { query: { users: { findFirst: mocks.profile } } } }))

import { getReportingFilterOptions } from '@/lib/reporting-filter-options'
import { getAllianceHealthData } from '@/app/actions/alliance'

beforeEach(() => vi.resetAllMocks())

// These loaders run while the page renders, in parallel with the layout's own
// login redirect. A thrown error reached Sentry (AVE-APP-8, AVE-APP-9).
describe.each([
  ['getReportingFilterOptions', () => getReportingFilterOptions()],
  ['getAllianceHealthData', () => getAllianceHealthData()],
])('%s without a session', (_, load) => {
  it('redirects to login before querying the database', async () => {
    mocks.auth.mockResolvedValue(null)
    const error = await load().catch(error => error)
    expect(isRedirectError(error)).toBe(true)
    expect(error.digest).toContain('/login')
    expect(mocks.profile).not.toHaveBeenCalled()
  })
})

it('still denies a deactivated profile', async () => {
  mocks.auth.mockResolvedValue({ user: { id: 'user' } })
  mocks.profile.mockResolvedValue({ status: 'deactivated', userRoles: [] })
  await expect(getReportingFilterOptions()).rejects.toThrow('Unauthorized')
})
