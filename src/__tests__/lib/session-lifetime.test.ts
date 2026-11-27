import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JWT } from 'next-auth/jwt'
import { authConfig } from '@/auth.config'
import { isSessionCurrent } from '@/lib/auth/session-lifetime'

const signedInAt = Date.UTC(2026, 8, 29, 8)
const eightHours = 8 * 60 * 60 * 1000
const tokenAtSignIn = (): JWT => ({
  id: 'alice',
  authVersion: 2,
  authenticatedAt: signedInAt,
  iat: Math.floor(signedInAt / 1000),
})
const readSession = (token: JWT, update?: Record<string, unknown>) =>
  authConfig.callbacks.jwt({ token, ...(update && { trigger: 'update', session: update }) } as any)

describe('eight-hour session lifetime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(signedInAt)
  })
  afterEach(() => vi.useRealTimers())

  it.each([31 * 60 * 1000, eightHours - 1])('keeps an idle session valid after %i ms', async elapsed => {
    vi.setSystemTime(signedInAt + elapsed)
    // Cookies issued before the inactivity timeout was removed still carry this field.
    const token = { ...tokenAtSignIn(), lastActivity: Math.floor(signedInAt / 1000) }
    expect(await readSession(token)).toMatchObject({ id: 'alice', authenticatedAt: signedInAt })
  })

  it('keeps a session without activity tracking valid until the eight-hour limit', async () => {
    vi.setSystemTime(signedInAt + eightHours - 1)
    expect(await readSession(tokenAtSignIn())).toMatchObject({ id: 'alice' })
  })

  it.each([eightHours, eightHours + 1])('expires at %i ms even with recent activity', async elapsed => {
    vi.setSystemTime(signedInAt + elapsed)
    expect(await readSession({ ...tokenAtSignIn(), lastActivity: Math.floor(Date.now() / 1000) })).toBeNull()
  })

  it('does not extend the deadline when the user is active or submits a session update', async () => {
    let token = tokenAtSignIn()
    for (let hour = 1; hour < 8; hour++) {
      vi.setSystemTime(signedInAt + hour * 60 * 60 * 1000)
      const current = await readSession(token, { authenticatedAt: Date.now() })
      expect(current?.authenticatedAt).toBe(signedInAt)
      // Auth.js renews the JWT's issued-at time on session reads.
      token = { ...current!, iat: Math.floor(Date.now() / 1000) }
    }
    vi.setSystemTime(signedInAt + eightHours)
    expect(await readSession(token, { authenticatedAt: Date.now() })).toBeNull()
  })

  it('starts a new eight-hour window on a fresh sign-in', async () => {
    vi.setSystemTime(signedInAt + eightHours)
    const token = await authConfig.callbacks.jwt({ token: tokenAtSignIn(), user: { id: 'alice' } } as any)
    expect(token?.authenticatedAt).toBe(Date.now())
    expect(isSessionCurrent({ ...token!, iat: Math.floor(Date.now() / 1000) })).toBe(true)
  })

  it.each([undefined, 'invalid', NaN, Infinity, signedInAt + 1])('rejects invalid authentication time %s', authenticatedAt => {
    expect(isSessionCurrent({ ...tokenAtSignIn(), authenticatedAt })).toBe(false)
  })

  it('rejects tokens with an authentication time after issuance', () => {
    expect(isSessionCurrent({ ...tokenAtSignIn(), iat: signedInAt / 1000 - 2 })).toBe(false)
  })

  it('rejects legacy tokens', () => {
    expect(isSessionCurrent({ ...tokenAtSignIn(), authVersion: 1 })).toBe(false)
  })
})
