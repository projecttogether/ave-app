"use server"

import { signIn, signOut } from "@/auth"
import { AuthError } from "next-auth"
import { cookies, headers } from "next/headers"
import { after } from "next/server"
import { captureException } from "@sentry/nextjs"
import { authLimiter, otpDailyEmailLimiter, otpEmailLimiter, otpFailureLimiter, checkRateLimit } from "@/lib/rate-limit"
import { auditLog, getClientIp } from "@/lib/audit"
import { logger } from "@/lib/logger"
import { errorSummary } from "@/lib/errors"
import { generateOtp, hashOtp, isOtpFlowId, newOtpFlowId, OTP_MAX_AGE, otpFlowCookieName, otpFlowCookieOptions, otpFlowKey, otpIdentifier } from "@/lib/otp"
import { authDb as db } from "@/lib/db/auth"
import { users, verificationTokens } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { createTransport } from "nodemailer"
import { otpCodeHtml, otpCodeText } from "@/lib/email-templates"
import { normalizeCallbackUrl } from "@/lib/auth/callback-url"
import { emailSchema } from "@/lib/validation"

export type OtpState = {
  error?: string
  success?: boolean
  email?: string
  callbackUrl?: string
}

function formatRetryAfter(ms: number): string {
  const minutes = Math.ceil(ms / 60000)
  if (minutes <= 1) return "in einer Minute"
  return `in ${minutes} Minuten`
}

export async function requestOtp(prevState: OtpState | undefined, formData: FormData): Promise<OtpState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"))
  const callbackUrl = normalizeCallbackUrl(formData.get("callbackUrl"))
  if (!parsedEmail.success) return { error: "Bitte geben Sie eine gültige E-Mail-Adresse ein.", callbackUrl }
  const email = parsedEmail.data

  // Rate limit by IP and by target email (the email key is not spoofable
  // via headers and also caps email bombing of a single address)
  const headerStore = await headers()
  const ip = getClientIp(headerStore)
  const { allowed, retryAfterMs } = await checkRateLimit(authLimiter, ip)
  if (!allowed) {
    return { error: `Zu viele Anmeldeversuche von dieser Verbindung. Bitte versuchen Sie es ${formatRetryAfter(retryAfterMs ?? 60000)} erneut.`, callbackUrl }
  }
  const emailLimit = await checkRateLimit(otpEmailLimiter, email)
  if (!emailLimit.allowed) {
    return { error: `Zu viele Codes für diese E-Mail-Adresse angefordert. Bitte versuchen Sie es ${formatRetryAfter(emailLimit.retryAfterMs ?? 60000)} erneut.`, callbackUrl }
  }
  const dailyLimit = await checkRateLimit(otpDailyEmailLimiter, email)
  if (!dailyLimit.allowed) {
    return { error: `Zu viele Codes für diese E-Mail-Adresse angefordert. Bitte versuchen Sie es ${formatRetryAfter(dailyLimit.retryAfterMs ?? 60000)} erneut oder melden Sie sich mit einem Passkey an.`, callbackUrl }
  }

  try {
    // Bind the code to this browser. A new request from the same browser
    // replaces its earlier code; codes requested elsewhere stay valid.
    const cookieStore = await cookies()
    const existingFlow = cookieStore.get(otpFlowCookieName())?.value
    const flowId = isOtpFlowId(existingFlow) ? existingFlow : newOtpFlowId()
    cookieStore.set(otpFlowCookieName(), flowId, otpFlowCookieOptions())
    // Each new code gets its own guess budget (see otpFailureLimiter).
    await otpFailureLimiter.delete(otpFlowKey(flowId))

    // Everything that depends on whether the address has an account runs
    // after the response, so neither its content nor its timing reveals it.
    after(() => issueOtp(email, flowId, ip))
    return { success: true, email, callbackUrl }
  } catch (error) {
    logger.error("Error requesting OTP", errorSummary(error))
    return { error: "Ein unerwarteter Fehler ist aufgetreten. Bitte laden Sie die Seite neu und versuchen Sie es erneut.", callbackUrl }
  }
}

/** Invite-only: only addresses with an account get a code. */
async function issueOtp(email: string, flowId: string, ip: string) {
  try {
    const account = await db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } })
    if (!account) {
      await auditLog({ action: 'auth.otp_failed', details: { email, reason: 'unknown_email' }, ipAddress: ip, severity: 'warning' })
      return
    }

    const code = generateOtp()
    const identifier = otpIdentifier(email, flowId)
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier))
    await db.insert(verificationTokens).values({
      identifier,
      token: hashOtp(code),
      expires: new Date(Date.now() + OTP_MAX_AGE * 1000),
    })

    const transport = createTransport({
      host: process.env.EMAIL_SERVER_HOST,
      port: Number(process.env.EMAIL_SERVER_PORT),
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
    })

    const baseUrl = process.env.AUTH_URL || 'http://localhost:3000'
    const { host } = new URL(baseUrl)

    const result = await transport.sendMail({
      to: email,
      from: `AVE Plattform <${process.env.EMAIL_FROM}>`,
      subject: `Ihr Anmeldecode – AVE Dashboard`,
      text: otpCodeText({ code, host }),
      html: otpCodeHtml({ code, host }),
    })

    const failed = result.rejected.concat(result.pending ?? []).filter(Boolean)
    if (failed.length) throw new Error(`OTP email rejected for ${failed.length} recipient(s)`)

    await auditLog({ action: 'auth.otp_requested', userId: account.id, details: { email }, ipAddress: ip })
  } catch (error) {
    // The user already saw the code step and can request a new code.
    logger.error("Failed to issue OTP", errorSummary(error))
    captureException(error)
  }
}

export async function verifyOtp(prevState: OtpState | undefined, formData: FormData): Promise<OtpState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"))
  const rawCode = formData.get("code")
  const code = typeof rawCode === 'string' ? rawCode.trim() : undefined
  const callbackUrl = normalizeCallbackUrl(formData.get("callbackUrl"))
  if (!parsedEmail.success) return { error: "Bitte geben Sie eine gültige E-Mail-Adresse ein.", callbackUrl }
  const email = parsedEmail.data

  if (!email || !code) {
    return { error: "Bitte geben Sie den 6-stelligen Code aus der E-Mail ein.", email, callbackUrl }
  }

  if (!/^\d{6}$/.test(code)) {
    return { error: "Der Code muss 6 Ziffern lang sein.", email, callbackUrl }
  }

  // Rate limit by IP and by email (the email key is not spoofable via headers)
  const headerStore = await headers()
  const ip = getClientIp(headerStore)
  const { allowed, retryAfterMs } = await checkRateLimit(authLimiter, ip)
  if (!allowed) {
    return { error: `Zu viele Code-Eingaben. Bitte fordern Sie ${formatRetryAfter(retryAfterMs ?? 60000)} einen neuen Code an.`, email, callbackUrl }
  }

  try {
    await signIn("otp", { email, code, redirectTo: callbackUrl })
  } catch (error) {
    if ((error as Error & { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) {
      // Signed in: the code is consumed and the browser no longer needs its flow.
      const cookieStore = await cookies()
      cookieStore.delete(otpFlowCookieName())
      throw error
    }
    if (error instanceof AuthError) {
      logger.error("Auth error during OTP verification", { errorType: error.type })
      auditLog({ action: 'auth.login_failed', details: { email, errorType: error.type }, ipAddress: ip, severity: 'warning' })
      if (error.type === "CredentialsSignin") {
        return { error: "Der Code ist ungültig oder abgelaufen, oder das Konto ist nicht freigeschaltet. Bitte fordern Sie einen neuen Code an.", email, callbackUrl }
      }
      if (error.type === "AccessDenied") {
        return { error: "Ihr Konto ist deaktiviert oder Ihre Einladung ist abgelaufen. Bitte wenden Sie sich an Ihre Organisationsleitung oder den AVE-Administrator.", email, callbackUrl }
      }
      return { error: "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut oder fordern Sie einen neuen Code an.", email, callbackUrl }
    }
    logger.error("Unknown error during OTP verification", errorSummary(error))
    return { error: "Ein unerwarteter Fehler ist aufgetreten. Bitte laden Sie die Seite neu und versuchen Sie es erneut.", email, callbackUrl }
  }

  // This won't be reached due to redirect, but TypeScript needs it
  return { email, callbackUrl }
}

export async function logout() {
  try {
    await signOut({ redirectTo: "/login" })
  } catch (error) {
    if ((error as Error & { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    logger.error("Error during logout", errorSummary(error))
    throw error
  }
}
