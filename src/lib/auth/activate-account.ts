import { and, eq, sql } from 'drizzle-orm'
import { authDb } from '@/lib/db/auth'
import { users } from '@/lib/db/schema'

/** Only call after a provider has verified the user's OTP or passkey. */
export async function activateAccountForSignIn(userId: string): Promise<boolean> {
    // The conditional write serializes acceptance with cancellation/suspension.
    const [user] = await authDb.update(users).set({
        status: 'active', lastLogin: sql`now()`,
        emailVerified: sql`coalesce(${users.emailVerified}, now())`,
    }).where(and(eq(users.id, userId), sql`${users.status} IS DISTINCT FROM 'deactivated'`,
        sql`(${users.status} = 'active' OR ${users.invitationExpiresAt} IS NULL OR ${users.invitationExpiresAt} > now())`,
    )).returning({ id: users.id })
    return !!user
}
