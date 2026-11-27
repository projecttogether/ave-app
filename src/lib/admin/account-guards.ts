import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userRoles } from '@/lib/db/schema'
import { isAdmin, isSuperAdmin } from '@/lib/roles'
import { uuidSchema } from '@/lib/validation'
import type { AppRole, UserStatus } from '@/types/auth'

export type ActorSession = { user: { id?: string | null } }

export function actorRoles(session: ActorSession): string[] {
    return (session.user as { roles?: string[] }).roles ?? []
}

/**
 * Guards every mutation of existing accounts:
 * - regular admins may not modify, deactivate or delete super admins
 * - an admin may not strip their own admin access, deactivate or delete
 *   themselves (this also guarantees at least one admin always remains)
 * - only super admins change another administrator's login email, which
 *   decides who can sign in to that account
 */
export async function assertCanManageUsers(
    session: ActorSession,
    userIds: string[],
    change: { roles?: AppRole[]; status?: UserStatus; remove?: boolean; email?: boolean },
) {
    const targets = [...new Set(userIds)]
    if (targets.length === 0) return
    targets.forEach(id => uuidSchema.parse(id))

    const removesAdminAccess = change.remove === true
        || change.status === 'deactivated'
        || (change.roles !== undefined && !isAdmin(change.roles))
    if (removesAdminAccess && session.user.id && targets.includes(session.user.id)) {
        throw new Error('Sie koennen Ihren eigenen Admin-Zugang nicht entfernen')
    }

    if (isSuperAdmin(actorRoles(session))) return
    const protectedRows = await db.select({ userId: userRoles.userId })
        .from(userRoles)
        .where(and(inArray(userRoles.userId, targets), eq(userRoles.roleId, 'super_admin')))
    if (protectedRows.length > 0) {
        throw new Error('Only Super Admins can modify Super Admin accounts')
    }

    const others = targets.filter(id => id !== session.user.id)
    if (change.email && others.length > 0) {
        const administrators = await db.select({ userId: userRoles.userId })
            .from(userRoles)
            .where(and(inArray(userRoles.userId, others), inArray(userRoles.roleId, ['admin', 'super_admin'])))
        if (administrators.length > 0) {
            throw new Error('Nur Super Admins koennen die Anmelde-E-Mail anderer Administratoren aendern')
        }
    }
}
