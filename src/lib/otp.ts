import { createHash, randomBytes } from 'crypto'

export const OTP_MAX_AGE = 10 * 60 // 10 minutes in seconds

/**
 * Generate a cryptographically secure 6-digit OTP code.
 */
export function generateOtp(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const num = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
  return String(num % 1000000).padStart(6, '0')
}

/**
 * Hash an OTP code with the AUTH_SECRET for secure storage.
 * Same pattern as NextAuth's verification token hashing.
 */
export function hashOtp(code: string): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is required')
  return createHash('sha256').update(`${code}${secret}`).digest('hex')
}

/**
 * Each code belongs to the browser that requested it. The flow id lives in an
 * HttpOnly cookie, so wrong guesses from other browsers neither consume nor
 * discard a user's pending code.
 */
export function newOtpFlowId(): string {
  return randomBytes(32).toString('base64url')
}

export function isOtpFlowId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
}

/** Cookies with the __Host- prefix require HTTPS, so plain-HTTP development uses a plain name. */
export function otpFlowCookieName(): string {
  return (process.env.AUTH_URL ?? '').startsWith('https:') ? '__Host-ave-otp-flow' : 'ave-otp-flow'
}

export function otpFlowCookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: otpFlowCookieName().startsWith('__Host-'), path: '/', maxAge: OTP_MAX_AGE }
}

/** Read the flow id from a raw Cookie header, e.g. on direct Auth.js callback requests. */
export function readOtpFlowId(cookieHeader: string | null | undefined): string | undefined {
  const name = otpFlowCookieName()
  for (const part of (cookieHeader ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) {
      const flowId = value.join('=')
      return isOtpFlowId(flowId) ? flowId : undefined
    }
  }
  return undefined
}

/** Key for a flow's codes and guess budget. Stores only a digest of the cookie value. */
export function otpFlowKey(flowId: string): string {
  return createHash('sha256').update(flowId).digest('hex')
}

/** verificationToken identifier: one pending code per browser and email. */
export function otpIdentifier(email: string, flowId: string): string {
  return `otp:${otpFlowKey(flowId)}:${email}`
}
