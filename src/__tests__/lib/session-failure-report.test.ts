import { beforeEach, describe, expect, it, vi } from 'vitest'

// Load the real Auth.js callbacks. Only storage and Sentry are replaced.
const state = vi.hoisted(() => ({ factory: null as any, findUser: vi.fn(), captureException: vi.fn() }))
vi.mock('next-auth', () => ({ default: (factory: any) => { state.factory = factory; return {} } }))
vi.mock('@sentry/nextjs', () => ({ captureException: state.captureException }))
vi.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: () => ({}) }))
vi.mock('@/lib/audit', () => ({ auditLog: async () => {} }))
vi.mock('@/lib/db/auth', () => ({ authDb: { query: {
  users: { findFirst: state.findUser },
  revokedSessions: { findFirst: async () => undefined },
} } }))

import '@/auth'

const token = { sub: 'alice', id: 'alice', email: 'alice@example.invalid', authVersion: 2, authenticatedAt: Date.now() - 60_000 }
const jwt = (params: Record<string, unknown>) =>
  state.factory(new Request('http://localhost:3000/api/auth/session')).callbacks.jwt(params)

beforeEach(() => vi.resetAllMocks())

describe('session validation failures', () => {
  it('reports a storage failure to Sentry and still rejects the session', async () => {
    // Auth.js only logs this and treats the visitor as signed out.
    const failure = new Error('Connection terminated unexpectedly')
    state.findUser.mockRejectedValue(failure)
    await expect(jwt({ token })).rejects.toBe(failure)
    expect(state.captureException).toHaveBeenCalledExactlyOnceWith(failure)
  })

  it('does not report a session that storage rejects', async () => {
    state.findUser.mockResolvedValue(undefined)
    await expect(jwt({ token })).resolves.toBeNull()
    expect(state.captureException).not.toHaveBeenCalled()
  })
})
