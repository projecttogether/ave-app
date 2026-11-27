import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), profile: vi.fn() }))
vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/db', () => ({ db: { query: { users: { findFirst: mocks.profile } } } }))

import { getDataScope } from '@/lib/access'

beforeEach(() => vi.resetAllMocks())

describe('data scope authentication', () => {
  it.each([null, { user: { email: 'session@example.org' } }])(
    'redirects a missing user identity before querying the database', async session => {
      mocks.auth.mockResolvedValue(session)
      const error = await getDataScope().catch(error => error)
      expect(isRedirectError(error)).toBe(true)
      expect(error.digest).toContain('/login')
      expect(mocks.profile).not.toHaveBeenCalled()
    },
  )

  it('still denies an authenticated user with a deactivated profile', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'user' } })
    mocks.profile.mockResolvedValue({ status: 'deactivated' })
    await expect(getDataScope()).rejects.toThrow('Zugriff verweigert')
    expect(mocks.profile).toHaveBeenCalledOnce()
  })

  it('still rejects an invalid scope before querying the database', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'user' } })
    await expect(getDataScope({ organizationId: 'invalid' })).rejects.toThrow('Zugriff verweigert')
    expect(mocks.profile).not.toHaveBeenCalled()
  })
})
