import type { JWT } from 'next-auth/jwt'

export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60

/** Shared by normal session reads and passkey enrollment. Expires from sign-in, regardless of activity. */
export function isSessionCurrent(token: JWT, signingIn = false): boolean {
  const now = Date.now()
  return token.authVersion === 2
    && typeof token.authenticatedAt === 'number' && Number.isFinite(token.authenticatedAt)
    && token.authenticatedAt <= now
    && now - token.authenticatedAt < SESSION_MAX_AGE_SECONDS * 1000
    && (signingIn || typeof token.iat !== 'number' || token.authenticatedAt <= (token.iat + 1) * 1000)
}
