import { RateLimiterMemory } from 'rate-limiter-flexible'

// NOTE: these limiters are in-memory, i.e. per process. Counters reset on
// restart/deploy and are not shared between instances — sufficient for the
// current single-instance deployment, but move to a shared store (Redis)
// before scaling out.

// Auth limiter: 10 attempts per 15 minutes per IP (brute force protection)
export const authLimiter = new RateLimiterMemory({
  points: 10,
  duration: 15 * 60, // 15 minutes
  keyPrefix: 'auth',
})

// OTP request limiter: 5 codes per 15 minutes per email address. Keyed on the
// target email (not spoofable via headers); also limits email bombing.
export const otpEmailLimiter = new RateLimiterMemory({
  points: 5,
  duration: 15 * 60,
  keyPrefix: 'otp-email',
})

// Codes per email address per day. Codes are bound to the requesting browser,
// so this cap bounds guessing across browsers: at most 20 codes x 5 guesses.
export const otpDailyEmailLimiter = new RateLimiterMemory({
  points: 20,
  duration: 24 * 60 * 60,
  keyPrefix: 'otp-email-day',
})

// OTP verify limiter: 10 attempts per 15 minutes per login flow (browser).
// Keyed per flow so other people's guesses cannot use up a user's attempts.
export const otpVerifyLimiter = new RateLimiterMemory({
  points: 10,
  duration: 15 * 60,
  keyPrefix: 'otp-verify',
})

// Wrong OTP guesses per login flow. The fifth wrong guess discards that flow's
// code, so each emailed code allows at most five guesses.
export const otpFailureLimiter = new RateLimiterMemory({
  points: 4,
  duration: 15 * 60,
  keyPrefix: 'otp-failure',
})

// API limiter: 100 requests per minute per user/IP
export const apiLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
  keyPrefix: 'api',
})

// Admin limiter: 30 requests per minute per user
export const adminLimiter = new RateLimiterMemory({
  points: 30,
  duration: 60,
  keyPrefix: 'admin',
})

// Shared across an organization's managers, including rejected duplicate attempts.
export const teamInviteLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60,
  keyPrefix: 'team-invite',
})

export async function checkRateLimit(
  limiter: RateLimiterMemory,
  key: string
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  try {
    await limiter.consume(key)
    return { allowed: true }
  } catch (rateLimiterRes: unknown) {
    const res = rateLimiterRes as { msBeforeNext?: number }
    return { allowed: false, retryAfterMs: res.msBeforeNext ?? 60000 }
  }
}
