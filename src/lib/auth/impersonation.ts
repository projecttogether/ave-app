import { headers } from 'next/headers'
import { getToken } from 'next-auth/jwt'

export const IMPERSONATION_BLOCKED = 'Diese Aktion ist in der Benutzeransicht nicht möglich. Beenden Sie zuerst die Benutzeransicht.'

/** Credential and session self-service belongs to the account owner, not a super admin viewing as them. */
export function isImpersonating(session: { user?: unknown } | null | undefined): boolean {
    return !!(session?.user as { isImpersonating?: boolean } | undefined)?.isImpersonating
}

/**
 * The super admin behind the current request when it acts as another user.
 * Reads the session cookie directly: auditLog also runs inside Auth.js
 * callbacks, where calling auth() would recurse. Outside a request: undefined.
 */
export async function currentImpersonator(): Promise<string | undefined> {
    try {
        const cookie = (await headers()).get('cookie')
        if (!cookie) return undefined
        const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? ''
        const token = await getToken({
            req: { headers: new Headers({ cookie }) },
            secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
            secureCookie: url.startsWith('https:'),
        })
        return token?.isImpersonating && typeof token.realUserId === 'string' ? token.realUserId : undefined
    } catch {
        return undefined
    }
}
