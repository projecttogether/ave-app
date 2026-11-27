import { getToken, type JWT } from 'next-auth/jwt'
import { isSessionCurrent } from './session-lifetime'

export const PASSKEY_AUTH_MAX_AGE_MS = 10 * 60 * 1000

/** Auth.js's registration path decodes cookies without running our JWT callback. */
export async function requireEnrollmentSession(
  request: Request | undefined,
  validateIdentity: (token: JWT) => Promise<JWT | null>,
): Promise<{ userId: string; authenticatedAt: number }> {
  if (!request) throw new Error('Passkey enrollment requires a session')
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  const url = new URL(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? request.url)
  // Registration itself only uses cookies, never Authorization bearer tokens.
  const token = await getToken({
    req: { headers: new Headers({ cookie: request.headers.get('cookie') ?? '' }) },
    secret,
    secureCookie: url.protocol === 'https:',
  })
  if (!token || !isSessionCurrent(token)
    || Date.now() - (token.authenticatedAt as number) >= PASSKEY_AUTH_MAX_AGE_MS
    || typeof token.sub !== 'string' || token.id !== token.sub
    || token.isImpersonating || token.realUserId !== undefined) {
    throw new Error('Passkey enrollment requires a recent sign-in as the account owner')
  }
  const current = await validateIdentity(token)
  if (!current || current.id !== token.sub) throw new Error('Passkey enrollment session is no longer valid')
  return { userId: token.sub, authenticatedAt: token.authenticatedAt as number }
}
