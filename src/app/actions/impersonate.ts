'use server'

import { auth, unstable_update } from '@/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { isSuperAdmin } from '@/lib/roles'

/**
 * Impersonate a user. Only super_admins can use this.
 * Injects the target user's identity into the current JWT token.
 */
export async function impersonateUser(targetUserId: string) {
    const session = await auth()
    if (!session?.user?.email) redirect('/login')

    // @ts-expect-error custom session field is added in auth.config.ts
    const currentRoles = session.user.isImpersonating
        // @ts-expect-error custom session field is added in auth.config.ts
        ? session.user.realUserRoles
        // @ts-expect-error custom session field is added in auth.config.ts
        : session.user.roles

    if (!isSuperAdmin(currentRoles)) {
        throw new Error('Only Super Admins can impersonate users')
    }

    // Fetch target user from DB
    const targetUser = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
        with: { userRoles: { with: { role: true } } }
    })

    if (!targetUser) {
        throw new Error('Target user not found')
    }

    // Update the JWT session with the target user's identity
    // We use `as any` because these are custom fields handled by the jwt callback
    const userRoles = targetUser.userRoles.map((ur: any) => ur.roleId)

    await unstable_update({
        impersonateUserId: targetUser.id,
        impersonateUserRoles: userRoles,
        impersonateUserOrgId: targetUser.organizationId || null,
        impersonateUserEmail: targetUser.email,
        impersonateUserName: targetUser.name || null,
    } as any)

    // The JWT callback records impersonation, including direct session-update requests.

    // Invalidate all cached pages so the impersonated view is fresh
    revalidatePath('/', 'layout')

    redirect('/dashboard')
}

/**
 * Stop impersonating and restore the real super_admin identity.
 */
export async function stopImpersonating() {
    const session = await auth()
    if (!session?.user?.email) redirect('/login')

    // @ts-expect-error custom session field is added in auth.config.ts
    if (!session.user.isImpersonating) {
        redirect('/dashboard')
    }

    await unstable_update({
        stopImpersonating: true,
    } as any)


    // Invalidate all cached pages so admin view is restored
    revalidatePath('/', 'layout')

    redirect('/admin')
}
