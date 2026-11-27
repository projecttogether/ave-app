import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rateLimit: vi.fn(), remove: vi.fn(), insert: vi.fn(), findUser: vi.fn(), sendMail: vi.fn(), signIn: vi.fn(), audit: vi.fn(), captureException: vi.fn(),
  afterResponse: [] as (() => Promise<void>)[], jar: new Map<string, string>(), cookieOptions: vi.fn() }))
vi.mock('@/auth', () => ({ signIn: mocks.signIn, signOut: vi.fn() }))
vi.mock('next-auth', async () => ({ AuthError: (await import('@auth/core/errors')).AuthError }))
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({
  get: (name: string) => mocks.jar.has(name) ? { name, value: mocks.jar.get(name) } : undefined,
  set: (name: string, value: string, options: unknown) => { mocks.jar.set(name, value); mocks.cookieOptions(name, options) },
  delete: (name: string) => mocks.jar.delete(name),
}) }))
vi.mock('@/lib/rate-limit', () => ({ authLimiter: {}, otpEmailLimiter: {}, otpDailyEmailLimiter: {}, otpVerifyLimiter: {}, otpFailureLimiter: { delete: vi.fn(async () => true) }, checkRateLimit: mocks.rateLimit }))
vi.mock('next/server', () => ({ after: (task: () => Promise<void>) => { mocks.afterResponse.push(task) } }))
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }))
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit, getClientIp: () => '127.0.0.1' }))
vi.mock('@/lib/db/auth', () => ({ authDb: { delete: mocks.remove, insert: mocks.insert, query: { users: { findFirst: mocks.findUser } } } }))
vi.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: mocks.sendMail }) }))

import { requestOtp, verifyOtp } from '@/app/actions/auth'
import { consumeOtp } from '@/lib/auth/verify-otp'

describe('OTP input boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('AUTH_SECRET', 'test-only-otp-secret-never-used-outside-tests')
    // The flow cookie's name depends on the scheme; never inherit the build's AUTH_URL.
    vi.stubEnv('AUTH_URL', 'http://localhost:3000')
    mocks.rateLimit.mockResolvedValue({ allowed: true })
    mocks.remove.mockReturnValue({ where: async () => [] })
    mocks.insert.mockReturnValue({ values: async () => {} })
    mocks.findUser.mockResolvedValue({ id: 'user-1' })
    mocks.sendMail.mockResolvedValue({ rejected: [], pending: [] })
    mocks.afterResponse.length = 0
    mocks.jar.clear()
  })

  async function finishResponse() {
    for (const task of mocks.afterResponse.splice(0)) await task()
  }
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    ['oversized parser payload', 'a,'.repeat(64_000) + 'user@example.invalid'],
    ['multiple recipients', 'a@example.invalid,b@example.invalid'],
    ['semicolon list', 'a@example.invalid;b@example.invalid'],
    ['display name', 'Alice <alice@example.invalid>'],
    ['comment', '(Alice)alice@example.invalid'],
    ['header injection', 'alice@example.invalid\r\nBcc:bob@example.invalid'],
    ['file', new Blob(['alice@example.invalid'])],
    ['missing', null],
  ])('rejects %s before rate limits, storage or mail', async (_, value) => {
    const form = new FormData()
    if (value !== null) form.set('email', value)
    form.set('code', '123456')
    expect((await requestOtp(undefined, form)).error).toBeTruthy()
    expect((await verifyOtp(undefined, form)).error).toBeTruthy()
    expect(await consumeOtp(value, '123456', 'a'.repeat(43))).toBe(false)
    expect(mocks.rateLimit).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.sendMail).not.toHaveBeenCalled()
    expect(mocks.signIn).not.toHaveBeenCalled()
  })

  it('looks up the account and sends its code only after the response', async () => {
    const form = new FormData()
    form.set('email', 'alice@example.invalid')
    expect(await requestOtp(undefined, form)).toMatchObject({ success: true, email: 'alice@example.invalid' })
    expect(mocks.findUser).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.sendMail).not.toHaveBeenCalled()
    await finishResponse()
    expect(mocks.insert).toHaveBeenCalledTimes(1)
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice@example.invalid' }))
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.otp_requested', userId: 'user-1' }))
  })

  it('answers unknown addresses like existing ones without storing or sending a code', async () => {
    const known = new FormData()
    known.set('email', 'alice@example.invalid')
    const knownState = await requestOtp(undefined, known)
    const knownCookie = mocks.cookieOptions.mock.calls[0]
    vi.clearAllMocks()
    mocks.afterResponse.length = 0
    mocks.jar.clear()

    mocks.findUser.mockResolvedValue(undefined)
    const unknown = new FormData()
    unknown.set('email', 'mallory@example.invalid')
    const unknownState = await requestOtp(undefined, unknown)
    expect(unknownState).toEqual({ ...knownState, email: 'mallory@example.invalid' })
    expect(mocks.cookieOptions.mock.calls).toEqual([knownCookie])
    expect(mocks.findUser).not.toHaveBeenCalled()
    await finishResponse()
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.sendMail).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.otp_failed', details: { email: 'mallory@example.invalid', reason: 'unknown_email' } }))
  })

  it('reports delivery failures without changing the response', async () => {
    mocks.sendMail.mockResolvedValue({ rejected: ['alice@example.invalid'], pending: [] })
    const form = new FormData()
    form.set('email', 'alice@example.invalid')
    expect(await requestOtp(undefined, form)).toMatchObject({ success: true })
    await finishResponse()
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
    expect(String(mocks.captureException.mock.calls[0][0])).not.toContain('alice@')
    expect(mocks.audit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.otp_requested' }))
  })

  it('normalizes a legitimate tagged email for delivery', async () => {
    const form = new FormData()
    form.set('email', ' Alice+Tag@Example.COM ')
    expect(await requestOtp(undefined, form)).toMatchObject({ success: true, email: 'alice+tag@example.com' })
    await finishResponse()
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice+tag@example.com' }))
  })

  it('rejects file-valued codes without throwing or calling signIn', async () => {
    const form = new FormData()
    form.set('email', 'alice@example.invalid')
    form.set('code', new Blob(['123456']))
    expect((await verifyOtp(undefined, form)).error).toBeTruthy()
    expect(mocks.signIn).not.toHaveBeenCalled()
  })

  it('binds each code to the requesting browser with an HttpOnly cookie', async () => {
    const form = new FormData()
    form.set('email', 'alice@example.invalid')
    const stored: { identifier: string }[] = []
    mocks.insert.mockReturnValue({ values: async (row: { identifier: string }) => { stored.push(row) } })
    expect(await requestOtp(undefined, form)).toMatchObject({ success: true })
    await finishResponse()
    const [[name, options]] = mocks.cookieOptions.mock.calls
    expect(name).toBe('ave-otp-flow')
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
    const flowId = mocks.jar.get('ave-otp-flow')!
    expect(flowId).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(stored[0].identifier).toMatch(/^otp:[0-9a-f]{64}:alice@example\.invalid$/)
    expect(stored[0].identifier).not.toContain(flowId)
    // A second request from the same browser reuses its flow, replacing only its own code.
    await requestOtp(undefined, form)
    await finishResponse()
    expect(mocks.jar.get('ave-otp-flow')).toBe(flowId)
    expect(stored[1].identifier).toBe(stored[0].identifier)
  })

  it('uses a secure __Host- flow cookie on HTTPS', async () => {
    vi.stubEnv('AUTH_URL', 'https://app.example.invalid')
    const form = new FormData()
    form.set('email', 'alice@example.invalid')
    expect(await requestOtp(undefined, form)).toMatchObject({ success: true })
    expect(mocks.cookieOptions).toHaveBeenCalledWith('__Host-ave-otp-flow', expect.objectContaining({ secure: true, path: '/' }))
  })

  it('refuses codes without a valid browser flow before touching storage', async () => {
    for (const flow of [undefined, '', 'short', 'x'.repeat(44), 'a'.repeat(42) + '!']) {
      expect(await consumeOtp('alice@example.invalid', '123456', flow)).toBe(false)
    }
    expect(mocks.rateLimit).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
