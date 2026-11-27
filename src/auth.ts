import NextAuth from "next-auth"
import { captureException } from "@sentry/nextjs"
import Credentials from "next-auth/providers/credentials"
import WebAuthn from "next-auth/providers/webauthn"
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { authDb as db } from "@/lib/db/auth"
import { eq } from "drizzle-orm"
import { accounts, sessions, users, verificationTokens, authenticators, revokedSessions } from "@/lib/db/schema"
import { and, gte, inArray } from "drizzle-orm"
import { authConfig } from "./auth.config"
import { refreshIdentity } from "@/lib/auth/identity"
import { consumeOtp } from "@/lib/auth/verify-otp"
import { readOtpFlowId } from "@/lib/otp"
import { auditLog } from "@/lib/audit"
import type { JWT } from "next-auth/jwt"
import { requireEnrollmentSession } from "@/lib/auth/passkey-enrollment"
import { emailSchema } from "@/lib/validation"
import { activateAccountForSignIn } from '@/lib/auth/activate-account'

async function validateIdentity(base: JWT, update?: unknown): Promise<JWT | null> {
  const token = await refreshIdentity(base, update, async (id) => {
    const profile = await db.query.users.findFirst({
      where: eq(users.id, id),
      with: { userRoles: true },
    })
    return profile ? { ...profile, roles: profile.userRoles.map(r => r.roleId) } : undefined
  }, (userId, targetId) => auditLog({ action: 'authz.denied', userId, resource: `user:${targetId}`, resourceType: 'user',
    details: { reason: 'impersonation_requires_super_admin' }, severity: 'critical' }))
  if (!token) return null
  const identities = [token.id as string]
  if (typeof token.realUserId === 'string') identities.push(token.realUserId)
  const revoked = await db.query.revokedSessions.findFirst({
    where: and(inArray(revokedSessions.userId, identities),
      gte(revokedSessions.revokedAt, new Date(token.authenticatedAt as number))),
  })
  return revoked ? null : token
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth((request) => {
  // Per-request state: populated only by the registration verifier below.
  let enrollmentSession: Awaited<ReturnType<typeof requireEnrollmentSession>> | undefined
  return {
    ...authConfig,
    callbacks: {
      ...authConfig.callbacks,
      async signIn({ user }) {
        // The signed challenge's user must match the session completing enrollment.
        if (enrollmentSession) {
          const current = await requireEnrollmentSession(request, validateIdentity)
          if (user.id !== enrollmentSession.userId || current.userId !== enrollmentSession.userId) return false
          enrollmentSession = current
        }
        if (!user.id) return true
        if (!await activateAccountForSignIn(user.id)) {
          auditLog({ action: 'auth.login_failed', userId: user.id, details: { reason: 'account_unavailable_or_invitation_expired' }, severity: 'warning' })
          return false // Block login
        }
        return true
      },
      async jwt(params) {
        const base = await authConfig.callbacks.jwt(params)
        if (!base) return null
        // Adding a credential is not a fresh sign-in. Preserve the original age
        // even though Auth.js invokes this callback with a sign-in trigger.
        if (enrollmentSession) base.authenticatedAt = enrollmentSession.authenticatedAt
        // Auth.js turns a failure here into a missing session and only logs it to
        // the console, so a database outage would sign users out unnoticed.
        const token = await validateIdentity(base, params.trigger === 'update' ? params.session : undefined)
          .catch((error: unknown) => { captureException(error); throw error })
        if (!token) return null

        if (token.id !== base.id || !!token.isImpersonating !== !!base.isImpersonating) {
          // Name the impersonated account in both entries; on stop, token.id is the admin again.
          await auditLog({ action: token.isImpersonating ? 'admin.impersonate_start' : 'admin.impersonate_stop',
            userId: (token.realUserId ?? token.id) as string, resource: `user:${token.isImpersonating ? token.id : base.id}`,
            resourceType: 'user', severity: 'critical' })
        }

        return token;
      }
    },
    experimental: {
      enableWebAuthn: true,
    },
    events: {
      async signIn({ user }) {
        if (user.id) {
          await auditLog({ action: 'auth.login', userId: user.id })
        }
      },
    },
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
      authenticatorsTable: authenticators,
    }),
    providers: [
      Credentials({
        id: "otp",
        name: "OTP",
        credentials: {
          email: { type: "email" },
          code: { type: "text" },
        },
        async authorize(credentials, request) {
          const parsedEmail = emailSchema.safeParse(credentials?.email)
          const flowId = readOtpFlowId(request?.headers?.get('cookie'))
          if (!parsedEmail.success || !await consumeOtp(parsedEmail.data, credentials?.code, flowId)) return null
          const email = parsedEmail.data

          // The provider itself verifies the OTP, including direct callback requests.
          const user = await db.query.users.findFirst({
            where: eq(users.email, email),
          })

          if (!user) {
            // Invite-only: do not auto-create users
            return null
          }

          return { id: user.id, email: user.email, name: user.name }
        },
      }),
      WebAuthn({
        relayingParty: {
          id: new URL(process.env.AUTH_URL || "http://localhost:3000").hostname,
          origin: (process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, ""),
          name: "AVE Plattform",
        },
        authenticationOptions: {
          userVerification: "preferred",
        },
        registrationOptions: {
          authenticatorSelection: {
            // Login offers discoverable credentials only (see getUserInfo).
            residentKey: "required",
            userVerification: "preferred",
          },
        },
        // Auth.js calls this only without a session. Resolving the email would
        // list that account's credentials in the login options, so anyone could
        // test which addresses have accounts. The default would also let unknown
        // emails register new accounts. Enrollment always uses the session user.
        async getUserInfo() {
          return null
        },
        simpleWebAuthn: {
          generateAuthenticationOptions,
          async generateRegistrationOptions(opts) {
            await requireEnrollmentSession(request, validateIdentity)
            return generateRegistrationOptions(opts)
          },
          async verifyRegistrationResponse(opts) {
            enrollmentSession = await requireEnrollmentSession(request, validateIdentity)
            return verifyRegistrationResponse({ ...opts, requireUserVerification: true })
          },
          verifyAuthenticationResponse: (opts: any) => verifyAuthenticationResponse({ ...opts, requireUserVerification: true }),
        },
      }),
    ],
  }
})
