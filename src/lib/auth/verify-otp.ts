import { and, eq, gt } from 'drizzle-orm'
import { authDb } from '@/lib/db/auth'
import { verificationTokens } from '@/lib/db/schema'
import { hashOtp, isOtpFlowId, otpFlowKey, otpIdentifier } from '@/lib/otp'
import { otpFailureLimiter, otpVerifyLimiter, checkRateLimit } from '@/lib/rate-limit'
import { emailSchema } from '@/lib/validation'

// Runs at the credentials provider, including direct requests to its callback.
// The flow id comes from the requesting browser's cookie: a code only works in
// the browser that requested it, and guesses only count against that browser.
export async function consumeOtp(email: unknown, code: unknown, flowId: unknown): Promise<boolean> {
  const parsedEmail = emailSchema.safeParse(email)
  if (!parsedEmail.success) return false
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false
  if (!isOtpFlowId(flowId)) return false
  const flow = otpFlowKey(flowId)
  if (!(await checkRateLimit(otpVerifyLimiter, flow)).allowed) return false
  const identifier = otpIdentifier(parsedEmail.data, flowId)
  // Match and consume in one statement: guesses leave the valid OTP intact,
  // and concurrent correct submissions cannot both succeed.
  const [token] = await authDb.delete(verificationTokens)
    .where(and(
      eq(verificationTokens.identifier, identifier),
      eq(verificationTokens.token, hashOtp(code)),
      gt(verificationTokens.expires, new Date()),
    )).returning({ identifier: verificationTokens.identifier })
  if (token) {
    await otpFailureLimiter.delete(flow)
    return true
  }
  // Bound guesses per code: a code that survives five wrong guesses is discarded.
  if (!(await checkRateLimit(otpFailureLimiter, flow)).allowed) {
    await authDb.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier))
    await otpFailureLimiter.delete(flow)
  }
  return false
}
