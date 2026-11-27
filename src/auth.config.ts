import type { NextAuthConfig } from "next-auth"
import { isSessionCurrent, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session-lifetime"

export const authConfig = {
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
    pages: {
        signIn: '/login',
        error: '/error',
    },
    callbacks: {
        // No `authorized` callback: Auth.js ignores it once the proxy passes a
        // handler. src/proxy.ts redirects anonymous page requests itself.
        async jwt({ token, user }) {
            if (user) {
                // User is available during sign-in
                token.id = user.id
                token.authVersion = 2
                token.authenticatedAt = Date.now()
                // @ts-expect-error custom user field is provided by the database adapter
                token.organizationId = user.organizationId
            }

            // Browser session updates must never overwrite identity or roles.
            // Auth.js on the server handles the two supported impersonation commands.
            if (!isSessionCurrent(token, !!user)) return null

            return token
        },
        async session({ session, token }) {
            if (session.user && token?.id) {
                session.user.id = token.id as string
                // @ts-expect-error login identity for tab-local reporting preferences
                session.user.authenticatedAt = token.authenticatedAt
                // @ts-expect-error custom session field is declared locally
                session.user.roles = (token.roles as string[]) || []
                // @ts-expect-error custom session field is declared locally
                session.user.organizationId = token.organizationId
                // @ts-expect-error custom session field is declared locally
                session.user.isImpersonating = !!token.isImpersonating
                // @ts-expect-error custom session field is declared locally
                session.user.realUserEmail = (token.realUserEmail as string) || null
            }
            return session
        }
    },
    providers: [] // Configured in auth.ts
} satisfies NextAuthConfig
