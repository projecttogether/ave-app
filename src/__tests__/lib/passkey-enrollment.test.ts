import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { Auth, type AuthConfig } from '@auth/core'
import { encode, getToken, type JWT } from '@auth/core/jwt'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { encodeCBOR } from '@levischuck/tiny-cbor'
import { PgDialect } from 'drizzle-orm/pg-core'

// Use the real Auth.js router, encrypted cookies and WebAuthn verifier. Only storage is replaced.
const state = vi.hoisted(() => ({ factory: null as any, revokedAt: 0, linked: [] as any[], credentials: [] as any[],
  users: [] as any[] }))
vi.mock('next-auth', () => ({ default: (factory: any) => { state.factory = factory; return {} } }))
vi.mock('@/lib/audit', () => ({ auditLog: async () => {} }))
vi.mock('@/lib/auth/verify-otp', () => ({ consumeOtp: async () => false }))
vi.mock('@/lib/db/auth', () => ({ authDb: {
  query: { users: { findFirst: async ({ where }: any) => {
    const [id] = new PgDialect().sqlToQuery(where).params
    return state.users.find(user => user.id === id)
  } }, revokedSessions: { findFirst: async ({ where }: any) => {
    const params = new PgDialect().sqlToQuery(where).params
    return state.revokedAt >= new Date(params.at(-1) as string).valueOf() ? { revokedAt: new Date(state.revokedAt) } : undefined
  } } },
  update: () => ({ set: () => ({ where: (where: any) => ({ returning: async () => {
    const [id] = new PgDialect().sqlToQuery(where).params
    const user = state.users.find(user => user.id === id)
    if (!user || user.status === 'deactivated' || (user.status !== 'active'
      && user.invitationExpiresAt && user.invitationExpiresAt <= new Date())) return []
    user.status = 'active'
    return [{ id }]
  } }) }) }),
} }))
vi.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: () => ({
  getUser: async (id: string) => state.users.find(user => user.id === id) ?? null,
  getUserByEmail: async (email: string) => state.users.find(user => user.email === email) ?? null,
  getUserByAccount: async ({ providerAccountId }: any) => {
    const account = state.linked.find(a => a.providerAccountId === providerAccountId)
    return state.users.find(user => user.id === account?.userId) ?? null
  },
  listAuthenticatorsByUserId: async (id: string) => state.credentials.filter(c => c.userId === id),
  linkAccount: async (account: any) => { state.linked.push(account); return account },
  createAuthenticator: async (credential: any) => { state.credentials.push(credential); return credential },
  getAccount: async (id: string) => state.linked.find(a => a.providerAccountId === id),
  getAuthenticator: async (id: string) => state.credentials.find(c => c.credentialID === id),
  updateAuthenticatorCounter: async (id: string, counter: number) => {
    const credential = state.credentials.find(c => c.credentialID === id)
    credential.counter = counter
    return credential
  },
  createUser: async () => { throw new Error('Unexpected new user') },
  updateUser: async (user: any) => user,
  createSession: async () => null, getSessionAndUser: async () => null,
  updateSession: async () => null, deleteSession: async () => null,
}) }))

const secret = 'test-only-passkey-secret-never-used-outside-tests'
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest()

async function browser(secure = false, chunked = false) {
  const origin = `${secure ? 'https' : 'http'}://localhost:3000`
  vi.stubEnv('AUTH_URL', origin)
  const cookieName = `${secure ? '__Secure-' : ''}authjs.session-token`
  const jar = new Map<string, string>()
  async function session(changes: JWT = {}) {
    for (const name of jar.keys()) if (name.startsWith(cookieName)) jar.delete(name)
    const token = await encode({ secret, salt: cookieName, maxAge: 8 * 3600, token: {
      sub: 'alice', id: 'alice', email: 'alice@example.invalid', authVersion: 2,
      authenticatedAt: Date.now() - 60_000, ...changes,
    } })
    if (chunked) {
      jar.set(`${cookieName}.0`, token.slice(0, 300)); jar.set(`${cookieName}.1`, token.slice(300))
    } else jar.set(cookieName, token)
    return token
  }
  const request = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    headers.set('cookie', [...jar].map(([k,v]) => `${k}=${v}`).join('; '))
    const req = new Request(`${origin}/api/auth/${path}`, { ...init, headers })
    const config: AuthConfig & { raw?: undefined } = { ...state.factory(req), secret, trustHost: true, basePath: '/api/auth',
      logger: { error: () => {}, warn: () => {}, debug: () => {} } }
    const result = await Auth(req, config)
    for (const cookie of result.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]; const index = pair.indexOf('=')
      if (pair.slice(index + 1)) jar.set(pair.slice(0,index), pair.slice(index+1))
      else jar.delete(pair.slice(0,index))
    }
    return result
  }
  const callback = async (action: string, data: unknown, format = 'form') => {
    const { csrfToken } = await (await request('csrf')).json()
    const body = { csrfToken, action, data: JSON.stringify(data), callbackUrl: origin + '/dashboard' }
    return request('callback/webauthn/', format === 'json'
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : { method: 'POST', body: new URLSearchParams([
        ...(format === 'duplicates' ? [['action', 'authenticate']] : []), ...Object.entries(body),
      ]) })
  }
  await session()
  const token = () => getToken({ secret, secureCookie: secure,
    req: { headers: new Headers({ cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; ') }) } })
  return { origin, jar, request, session, callback, token }
}

function authenticator(origin: string, challenge: string) {
  const id = randomBytes(32)
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = publicKey.export({ format: 'jwk' })
  const cose = encodeCBOR(new Map<any, any>([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x!, 'base64url'))], [-3, new Uint8Array(Buffer.from(jwk.y!, 'base64url'))]]))
  const length = Buffer.alloc(2); length.writeUInt16BE(id.length)
  const authData = Buffer.concat([sha256('localhost'), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), length, id, Buffer.from(cose)])
  const attestation = encodeCBOR(new Map<any, any>([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(authData)]]))
  const common = { id: id.toString('base64url'), rawId: id.toString('base64url'), type: 'public-key', clientExtensionResults: {} }
  return {
    registration: { ...common, response: {
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', origin, challenge })).toString('base64url'),
      attestationObject: Buffer.from(attestation).toString('base64url'), transports: ['internal'],
    } },
    assertion(challenge: string) {
      const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', origin, challenge }))
      const authData = Buffer.concat([sha256('localhost'), Buffer.from([0x05, 0, 0, 0, 1])])
      return { ...common, response: { clientDataJSON: clientData.toString('base64url'),
        authenticatorData: authData.toString('base64url'),
        signature: sign('sha256', Buffer.concat([authData, sha256(clientData)]), privateKey).toString('base64url'),
      } }
    },
  }
}

describe('session and passkey enrollment authorization', () => {
  beforeAll(async () => { await import('@/auth') })
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', secret)
    state.revokedAt = 0; state.linked = []; state.credentials = []
    state.users = ['alice', 'bob'].map(id => ({ id, email: `${id}@example.invalid`, name: id,
      status: 'active', organizationId: null, userRoles: [{ roleId: 'super_admin' }] }))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  const scenarios = ['revoked', 'old-auth', 'expired', 'deactivated', 'deleted', 'impersonating', 'changed-owner'] as const
  async function invalidate(client: Awaited<ReturnType<typeof browser>>, scenario: typeof scenarios[number]) {
    if (scenario === 'revoked') state.revokedAt = Date.now()
    if (scenario === 'old-auth') await client.session({ authenticatedAt: Date.now() - 600_001 })
    if (scenario === 'expired') await client.session({ authenticatedAt: Date.now() - 8 * 3600_000 })
    if (scenario === 'deactivated') state.users[0].status = 'deactivated'
    if (scenario === 'deleted') state.users.shift()
    if (scenario === 'impersonating') await client.session({ id: 'bob', realUserId: 'alice', isImpersonating: true })
    if (scenario === 'changed-owner') await client.session({ id: 'bob', sub: 'bob', email: 'bob@example.invalid' })
  }

  it('returns identical login options for existing and unknown emails', async () => {
    state.credentials = [{ userId: 'alice', credentialID: Buffer.from('alice-cred').toString('base64'), transports: 'internal', counter: 0 }]
    const client = await browser()
    client.jar.clear()
    const shape = async (email: string) => {
      const response = await client.request(`webauthn-options/webauthn?action=authenticate&email=${encodeURIComponent(email)}`)
      const { options } = await response.json()
      return { status: response.status, keys: Object.keys(options).sort(), allowCredentials: options.allowCredentials }
    }
    const known = await shape('alice@example.invalid')
    expect(known).toEqual(await shape('bob@example.invalid'))
    expect(known).toEqual(await shape('nobody@example.invalid'))
    expect(known.allowCredentials).toBeUndefined()
    // Without a session there is still no way to register an account.
    expect((await client.request('webauthn-options/webauthn?action=register&email=nobody%40example.invalid')).status).not.toBe(200)
  })

  it('keeps an idle login valid for eight hours but still requires a recent sign-in for enrollment', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const client = await browser()
    const authenticatedAt = Date.now() - 7 * 3600_000
    await client.session({ authenticatedAt, lastActivity: Math.floor(authenticatedAt / 1000) })
    const response = await client.request('session')
    expect((await response.json()).user.id).toBe('alice')
    expect((await client.token())?.authenticatedAt).toBe(authenticatedAt)
    const renewedAt = (await client.token())!.iat! * 1000
    const sessionCookie = response.headers.getSetCookie().find(cookie => cookie.startsWith('authjs.session-token='))!
    const cookieExpiresAt = new Date(sessionCookie.match(/Expires=([^;]+)/)![1]).valueOf()
    expect(cookieExpiresAt - renewedAt).toBe(8 * 3600_000)
    expect((await client.request('webauthn-options/webauthn?action=register')).status).not.toBe(200)
  })

  it.each(['revoked', 'expired', 'deactivated', 'deleted'] as const)('ends a %s login session', async scenario => {
    const client = await browser()
    await invalidate(client, scenario)
    expect(await (await client.request('session')).json()).toBeNull()
    expect(await client.token()).toBeNull()
  })

  it.each(scenarios.filter(s => s !== 'changed-owner'))('denies options with a %s session', async scenario => {
    const client = await browser()
    await invalidate(client, scenario)
    const response = await client.request('webauthn-options/webauthn/?action=authenticate&action=register')
    expect(response.status).not.toBe(200)
    expect(state.credentials).toHaveLength(0)
  })

  it.each(scenarios)('denies completion after the session becomes %s', async scenario => {
    const client = await browser()
    const options = await (await client.request('webauthn-options/webauthn?action=register')).json()
    const device = authenticator(client.origin, options.options.challenge)
    await invalidate(client, scenario)
    const response = await client.callback('register', device.registration, 'duplicates')
    expect(response.headers.get('location')).not.toBe(client.origin + '/dashboard')
    expect(state.linked).toHaveLength(0)
    expect(state.credentials).toHaveLength(0)
  })

  it('rejects a JSON callback with only a bearer token and no session cookie', async () => {
    const client = await browser()
    const options = await (await client.request('webauthn-options/webauthn?action=register')).json()
    const device = authenticator(client.origin, options.options.challenge)
    const bearer = await client.session()
    client.jar.delete('authjs.session-token')
    const { csrfToken } = await (await client.request('csrf')).json()
    await client.request('callback/webauthn', { method: 'POST', headers: {
      'content-type': 'application/json', authorization: `Bearer ${bearer}`,
    }, body: JSON.stringify({ csrfToken, action: 'register', data: JSON.stringify(device.registration) }) })
    expect(state.credentials).toHaveLength(0)
    expect(state.linked).toHaveLength(0)
  })

  it.each([
    { secure: false, email: undefined },
    { secure: true, email: undefined },
    { secure: false, email: '  ALICE@Example.Invalid  ' },
    { secure: true, email: '  ALICE@Example.Invalid  ' },
  ])('allows recent enrollment and subsequent passkey login (secure/chunked=$secure, email=$email)', async ({ secure, email }) => {
    const client = await browser(secure, secure)
    const authenticatedAt = Date.now() - 590_000
    await client.session({ authenticatedAt })
    const response = await client.request('webauthn-options/webauthn?action=register')
    expect(response.status).toBe(200)
    const options = await response.json()
    expect(options.options.authenticatorSelection.residentKey).toBe('required')
    const device = authenticator(client.origin, options.options.challenge)
    expect((await client.callback('register', device.registration, 'json')).headers.get('location')).toBe(client.origin + '/dashboard')
    expect(state.credentials).toHaveLength(1)
    expect(state.credentials[0].userId).toBe('alice')
    expect((await client.token())?.authenticatedAt).toBe(authenticatedAt)
    client.jar.clear()
    const params = new URLSearchParams({ action: 'authenticate' })
    if (email !== undefined) params.set('email', email)
    const authOptions = await (await client.request(`webauthn-options/webauthn?${params}`)).json()
    // Login never lists credentials, even for a known email.
    expect(authOptions.options.allowCredentials).toBeUndefined()
    const result = await client.callback('authenticate', device.assertion(authOptions.options.challenge))
    expect(result.headers.get('location')).toBe(client.origin + '/dashboard')
    expect((await (await client.request('session')).json())?.user?.id).toBe('alice')
    expect(state.credentials[0].counter).toBe(1)
  })
})
