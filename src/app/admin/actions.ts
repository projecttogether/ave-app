'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { users, organizations, subOrganizationMembers, userRoles, revokedSessions, roles as rolesTable } from '@/lib/db/schema'
import { eq, desc, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { AppRole, UserStatus } from '@/types/auth'
import { redirect } from 'next/navigation'
import { isAdmin, isSuperAdmin } from '@/lib/roles'
import { auditLog } from '@/lib/audit'
import { emailSchema, nameSchema, rolesArraySchema, organizationNameSchema, uuidSchema, userStatusSchema } from '@/lib/validation'
import { actorRoles, assertCanManageUsers } from '@/lib/admin/account-guards'
import { endLoginCredentials, recordLoginEmailChange } from '@/lib/admin/login-email'
import { z } from 'zod'
import { apiLimiter, checkRateLimit } from '@/lib/rate-limit'

const ROLE_DEFINITIONS: Record<AppRole, string> = {
    basic_user: 'Basic User',
    org_manager: 'Organization Manager',
    org_view_only: 'Organization View Only',
    global_view_only: 'Global View Only',
    admin: 'Admin',
    super_admin: 'Super Admin',
}

async function ensureRolesExist(roleIds: AppRole[]) {
    const uniqueRoleIds = Array.from(new Set(roleIds))
    if (uniqueRoleIds.length === 0) return

    await db.insert(rolesTable)
        .values(uniqueRoleIds.map(roleId => ({
            id: roleId,
            description: ROLE_DEFINITIONS[roleId],
        })))
        .onConflictDoNothing()
}

export async function checkAdmin() {
    const session = await auth()
    if (!session?.user?.email) redirect('/login')

    // @ts-expect-error roles is added in auth.ts
    if (!isAdmin(session.user.roles)) throw new Error('Unauthorized')

    // Throttle all admin actions per user (keyed on the session id, not
    // spoofable headers)
    const { allowed } = await checkRateLimit(apiLimiter, `admin:${session.user.id}`)
    if (!allowed) throw new Error('Zu viele Anfragen in kurzer Zeit. Bitte warten Sie einen Moment.')

    return session as NonNullable<typeof session> & { user: NonNullable<NonNullable<typeof session>['user']> }
}

type AdminSession = Awaited<ReturnType<typeof checkAdmin>>

/** Only super admins may grant the super_admin role. */
function assertCanAssignRoles(session: AdminSession, roles: AppRole[] | undefined) {
    if (roles?.includes('super_admin') && !isSuperAdmin(actorRoles(session))) {
        throw new Error('Only Super Admins can assign the Super Admin role')
    }
}

export async function getUsers() {
    await checkAdmin()

    try {
        // Try with new columns (post-migration)
        const allUsers = await db.query.users.findMany({
            with: {
                organization: true,
                userRoles: { with: { role: true } }
            },
            orderBy: [desc(users.createdAt)]
        })

        return allUsers.map(u => {
            const rawStatus = (u as Record<string, unknown>).status as string | undefined | null
            const rawLastLogin = (u as Record<string, unknown>).lastLogin as Date | undefined | null
            const roles = u.userRoles.map((ur: any) => ur.roleId) as AppRole[]
            return {
                ...u,
                roles,
                status: (rawStatus as UserStatus) || 'pending',
                lastLogin: rawLastLogin ? rawLastLogin.toISOString() : null,
                createdAt: u.createdAt ? u.createdAt.toISOString() : null,
                organizations: u.organization ? { name: u.organization.name } : null
            }
        })
    } catch {
        // Fallback: columns might not exist pre-migration, select only safe columns
        const allUsers = await db.select({
            id: users.id,
            name: users.name,
            email: users.email,
            organizationId: users.organizationId,
            createdAt: users.createdAt,
            emailVerified: users.emailVerified,
            image: users.image,
            orgName: organizations.name,
        })
        .from(users)
        .leftJoin(organizations, eq(users.organizationId, organizations.id))
        .orderBy(desc(users.createdAt))

        return allUsers.map(u => ({
            id: u.id!,
            name: u.name,
            email: u.email!,
            roles: ['basic_user'] as AppRole[],
            status: 'invited' as UserStatus,
            lastLogin: null,
            createdAt: u.createdAt ? u.createdAt.toISOString() : null,
            organizationId: u.organizationId,
            emailVerified: u.emailVerified ? u.emailVerified.toISOString() : null,
            image: u.image,
            organizations: u.orgName ? { name: u.orgName } : null,
        }))
    }
}

export async function updateUserRolesArray(userId: string, newRoles: AppRole[]) {
    const session = await checkAdmin()
    uuidSchema.parse(userId)
    rolesArraySchema.parse(newRoles)
    assertCanAssignRoles(session, newRoles)
    await assertCanManageUsers(session, [userId], { roles: newRoles })
    await ensureRolesExist(newRoles)

    await db.delete(userRoles).where(eq(userRoles.userId, userId))
    if (newRoles.length > 0) {
        await db.insert(userRoles).values(
            newRoles.map(roleId => ({
                userId,
                roleId
            }))
        )
    }

    // Roles live in the JWT until it expires; revoke sessions so the change
    // (especially a demotion) takes effect immediately
    await db.insert(revokedSessions).values({ userId, reason: 'admin_revoked' })

    auditLog({ action: 'admin.role_change', userId: session.user.id!, resource: `user:${userId}`, resourceType: 'user', details: { newRoles } })

    revalidatePath('/admin/users')
}

export async function updateUserOrganization(userId: string, organizationId: string | null) {
    const session = await checkAdmin()
    if (organizationId) uuidSchema.parse(organizationId)
    await assertCanManageUsers(session, [userId], {})

    await db.update(users)
        .set({ organizationId: organizationId })
        .where(eq(users.id, userId))

    // The organization id is part of the JWT and scopes tenant access;
    // revoke sessions so the change takes effect immediately
    await db.insert(revokedSessions).values({ userId, reason: 'admin_revoked' })

    auditLog({ action: 'admin.user_update', userId: session.user.id!, resource: `user:${userId}`, resourceType: 'user', details: { organizationId }, severity: 'warning' })

    revalidatePath('/admin/users')
}

export async function getOrganizations() {
    await checkAdmin()

    const allOrgs = await db.query.organizations.findMany({
        with: {
            subOrganizations: true
        },
        orderBy: (orgs, { asc }) => [asc(orgs.name)]
    })

    return allOrgs.map(org => ({
        ...org,
        createdAt: org.createdAt ? org.createdAt.toISOString() : null,
        subOrganizations: org.subOrganizations.map(sub => ({
            ...sub,
            createdAt: sub.createdAt ? sub.createdAt.toISOString() : null,
        }))
    }))
}

export async function createOrganization(name: string) {
    const session = await checkAdmin()
    const validName = organizationNameSchema.parse(name)

    await db.insert(organizations).values({ name: validName })

    auditLog({ action: 'admin.org_create', userId: session.user.id!, resourceType: 'organization', details: { name } })

    revalidatePath('/admin/users')
    revalidatePath('/admin/organizations')
}

export async function deleteOrganization(orgId: string) {
    const session = await checkAdmin()
    uuidSchema.parse(orgId)

    // Unlink users to avoid foreign key constraint issues
    await db.update(users)
        .set({ organizationId: null })
        .where(eq(users.organizationId, orgId))

    await db.delete(organizations)
        .where(eq(organizations.id, orgId))

    auditLog({ action: 'admin.org_delete', userId: session.user.id!, resource: `org:${orgId}`, resourceType: 'organization', severity: 'warning' })

    revalidatePath('/admin/users')
    revalidatePath('/admin/organizations')
}

export async function updateOrganization(id: string, name: string) {
    const session = await checkAdmin()
    uuidSchema.parse(id)
    const validName = organizationNameSchema.parse(name)

    await db.update(organizations)
        .set({ name: validName })
        .where(eq(organizations.id, id))

    auditLog({ action: 'admin.org_update', userId: session.user.id!, resource: `org:${id}`, resourceType: 'organization', details: { name: validName } })

    revalidatePath('/admin/users')
    revalidatePath('/admin/organizations')
}

export async function updateUserEmail(userId: string, newEmail: string) {
    const session = await checkAdmin()
    uuidSchema.parse(userId)
    newEmail = emailSchema.parse(newEmail)
    await assertCanManageUsers(session, [userId], { email: true })

    const target = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { email: true } })
    if (!target) throw new Error('Benutzer nicht gefunden oder keine Berechtigung')
    if (target.email === newEmail) return

    // Check if another user already has this email
    const existing = await db.query.users.findFirst({
        where: eq(users.email, newEmail)
    })
    if (existing && existing.id !== userId) {
        throw new Error('Ein Benutzer mit dieser E-Mail-Adresse existiert bereits')
    }

    await db.transaction(async tx => {
        await tx.update(users).set({ email: newEmail }).where(eq(users.id, userId))
        await endLoginCredentials(tx, userId)
    })
    await recordLoginEmailChange(session.user.id!, userId, target.email, newEmail)

    revalidatePath('/admin/users')
}

export async function deleteUser(userId: string) {
    const session = await checkAdmin()
    await assertCanManageUsers(session, [userId], { remove: true })

    // One atomic statement. Foreign keys remove credentials, sessions, roles,
    // memberships, revocations and drafts, and clear author references in
    // authored data and audit logs (migration 0040). Existing cookies stop
    // working because identity is reloaded from the deleted account.
    // The delete policy repeats the protected-account rules above.
    const deleted = await db.delete(users)
        .where(eq(users.id, userId))
        .returning({ id: users.id })
    if (deleted.length === 0) throw new Error('Benutzer nicht gefunden oder keine Berechtigung')

    auditLog({ action: 'admin.user_delete', userId: session.user.id!, resource: `user:${userId}`, resourceType: 'user', severity: 'critical' })

    revalidatePath('/admin/users')
}

export async function getUserSubOrgMemberships() {
    await checkAdmin()

    const memberships = await db.select({
        userId: subOrganizationMembers.userId,
        subOrganizationId: subOrganizationMembers.subOrganizationId,
    })
    .from(subOrganizationMembers)

    return memberships
}

const membershipChangeSchema = z.object({
    userId: uuidSchema,
    subOrganizationIds: z.array(uuidSchema).max(500),
})

export async function updateUserSubOrganizations(userId: string, subOrgIds: string[]) {
    const session = await checkAdmin()
    const request = membershipChangeSchema.parse({ userId, subOrganizationIds: subOrgIds })
    await assertCanManageUsers(session, [request.userId], {})
    const wanted = [...new Set(request.subOrganizationIds)]

    // Replace the memberships together; the database trigger still rejects
    // kitchens outside the user's organization.
    await db.transaction(async tx => {
        await tx.delete(subOrganizationMembers).where(eq(subOrganizationMembers.userId, request.userId))
        if (wanted.length > 0) {
            await tx.insert(subOrganizationMembers)
                .values(wanted.map(subOrganizationId => ({ userId: request.userId, subOrganizationId })))
        }
    })

    auditLog({ action: 'admin.user_update', userId: session.user.id!, resource: `user:${request.userId}`, resourceType: 'user', details: { subOrganizationIds: wanted } })

    revalidatePath('/admin/users')
}

export async function createUser(email: string, rolesToAssign: AppRole[], organizationId?: string, subOrganizationIds: string[] = []) {
    const session = await checkAdmin()
    email = emailSchema.parse(email)
    rolesArraySchema.parse(rolesToAssign)
    assertCanAssignRoles(session, rolesToAssign)
    if (organizationId) uuidSchema.parse(organizationId)
    subOrganizationIds.forEach(id => uuidSchema.parse(id))
    await ensureRolesExist(rolesToAssign)

    // Check if user exists
    const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email)
    })
    
    if (existingUser) {
        throw new Error('User already exists')
    }

    // Create user directly in DB
    // They will sign in via Magic Link (email), so no password needed.
    const newUser = await db.transaction(async tx => {
        const [created] = await tx.insert(users).values({
            email,
            organizationId: organizationId || null,
            emailVerified: new Date(), // Auto-verify if admin creates them
            status: 'pending',
        }).returning()
        if (rolesToAssign.length > 0) {
            await tx.insert(userRoles).values(rolesToAssign.map(roleId => ({ userId: created.id, roleId })))
        }
        if (subOrganizationIds.length > 0) {
            await tx.insert(subOrganizationMembers).values(
                [...new Set(subOrganizationIds)].map(subOrganizationId => ({ userId: created.id, subOrganizationId }))
            )
        }
        return created
    })

    auditLog({ action: 'admin.user_create', userId: session.user.id!, resource: `user:${newUser.id}`, resourceType: 'user', details: { email, roles: rolesToAssign, organizationId, subOrganizationIds } })

    revalidatePath('/admin/users')

    const safeUser = {
        ...newUser,
        emailVerified: newUser.emailVerified?.toISOString() || null,
        createdAt: newUser.createdAt?.toISOString() || null,
    }

    return { user: safeUser, tempPassword: 'Use Magic Link' }
}

// --- New actions for user table redesign ---

export async function updateUser(userId: string, data: {
    name?: string | null
    email?: string
    roles?: AppRole[]
    organizationId?: string | null
    status?: UserStatus
    subOrganizationIds?: string[]
}) {
    const session = await checkAdmin()

    if (data.roles) rolesArraySchema.parse(data.roles)
    if (data.status !== undefined) userStatusSchema.parse(data.status)
    if (data.organizationId) uuidSchema.parse(data.organizationId)
    if (data.name !== undefined && data.name !== null) data.name = nameSchema.parse(data.name)
    // An empty string is not "no change": validate every submitted address.
    if (data.email !== undefined) data.email = emailSchema.parse(data.email)
    data.subOrganizationIds?.forEach(id => uuidSchema.parse(id))
    assertCanAssignRoles(session, data.roles)
    await assertCanManageUsers(session, [userId], { roles: data.roles, status: data.status, email: data.email !== undefined })
    if (data.roles) await ensureRolesExist(data.roles)

    // If email is being changed, check uniqueness
    let previousEmail: string | undefined
    if (data.email !== undefined) {
        const target = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { email: true } })
        if (!target) throw new Error('Benutzer nicht gefunden oder keine Berechtigung')
        if (target.email === data.email) delete data.email
        else previousEmail = target.email
    }
    if (data.email !== undefined) {
        const existing = await db.query.users.findFirst({
            where: eq(users.email, data.email)
        })
        if (existing && existing.id !== userId) {
            throw new Error('Ein Benutzer mit dieser E-Mail-Adresse existiert bereits')
        }
    }

    const updateData: Record<string, unknown> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.email !== undefined) updateData.email = data.email
    if (data.organizationId !== undefined) updateData.organizationId = data.organizationId
    if (data.status !== undefined) updateData.status = data.status

    await db.transaction(async tx => {
        if (Object.keys(updateData).length > 0) {
            await tx.update(users).set(updateData).where(eq(users.id, userId))
        }
        // Organization changes clear old memberships through the existing database
        // trigger. Apply the chosen replacements in the same transaction.
        if (data.subOrganizationIds !== undefined) {
            await tx.delete(subOrganizationMembers).where(eq(subOrganizationMembers.userId, userId))
            if (data.subOrganizationIds.length > 0) {
                await tx.insert(subOrganizationMembers).values(
                    [...new Set(data.subOrganizationIds)].map(subOrganizationId => ({ userId, subOrganizationId }))
                )
            }
        }
        if (previousEmail !== undefined) {
            await endLoginCredentials(tx, userId)
        } else if (data.roles || data.organizationId !== undefined) {
            await tx.insert(revokedSessions).values({ userId, reason: 'admin_revoked' })
        }
        if (data.roles) {
            await tx.delete(userRoles).where(eq(userRoles.userId, userId))
            if (data.roles.length > 0) {
                await tx.insert(userRoles).values(data.roles.map(roleId => ({ userId, roleId })))
            }
        }
    })

    auditLog({ action: 'admin.user_update', userId: session.user.id!, resource: `user:${userId}`, resourceType: 'user', details: { changes: data } })
    if (previousEmail !== undefined && data.email !== undefined) {
        await recordLoginEmailChange(session.user.id!, userId, previousEmail, data.email)
    }

    revalidatePath('/admin/users')
}

export async function deactivateUser(userId: string) {
    const session = await checkAdmin()
    await assertCanManageUsers(session, [userId], { status: 'deactivated' })

    await db.update(users)
        .set({ status: 'deactivated' })
        .where(eq(users.id, userId))

    // Revoke all active sessions so the deactivated user is immediately logged out
    await db.insert(revokedSessions).values({
        userId,
        reason: 'deactivated',
    })

    auditLog({ action: 'admin.user_deactivate', userId: session.user.id!, resource: `user:${userId}`, resourceType: 'user', severity: 'warning' })

    revalidatePath('/admin/users')
}

export async function activateUser(userId: string) {
    const session = await checkAdmin()
    await assertCanManageUsers(session, [userId], { status: 'active' })

    await db.update(users)
        .set({ status: 'active' })
        .where(eq(users.id, userId))

    auditLog({ action: 'admin.user_reactivate', userId: session.user.id!, resource: `user:${userId}`, resourceType: 'user' })

    revalidatePath('/admin/users')
}

export async function bulkUpdateUsers(userIds: string[], data: {
    roles?: AppRole[]
    organizationId?: string | null
    status?: UserStatus
}) {
    const session = await checkAdmin()

    if (data.roles) rolesArraySchema.parse(data.roles)
    if (data.status !== undefined) userStatusSchema.parse(data.status)
    if (data.organizationId) uuidSchema.parse(data.organizationId)
    assertCanAssignRoles(session, data.roles)
    await assertCanManageUsers(session, userIds, { roles: data.roles, status: data.status })
    if (data.roles) await ensureRolesExist(data.roles)

    userIds = [...new Set(userIds)]
    if (userIds.length === 0) return

    const updateData: Record<string, unknown> = {}
    if (data.organizationId !== undefined) updateData.organizationId = data.organizationId
    if (data.status !== undefined) updateData.status = data.status

    // All accounts change together or not at all: a failure halfway through
    // must not leave some users without roles
    await db.transaction(async tx => {
        if (Object.keys(updateData).length > 0) {
            await tx.update(users)
                .set(updateData)
                .where(inArray(users.id, userIds))
        }

        if (data.roles) {
            await tx.delete(userRoles).where(inArray(userRoles.userId, userIds))
            if (data.roles.length > 0) {
                const rows = userIds.flatMap(uid => data.roles!.map(roleId => ({ userId: uid, roleId })))
                await tx.insert(userRoles).values(rows)
            }
        }

        // Deactivation must log users out immediately; role/org changes live in
        // the JWT until expiry, so those also require revoking sessions
        if (data.status === 'deactivated' || data.roles || data.organizationId !== undefined) {
            const reason = data.status === 'deactivated' ? ('deactivated' as const) : ('admin_revoked' as const)
            await tx.insert(revokedSessions).values(
                userIds.map(uid => ({ userId: uid, reason }))
            )
        }
    })

    auditLog({ action: 'admin.user_update', userId: session.user.id!, resourceType: 'user', details: { userIds, changes: data }, severity: 'warning' })

    revalidatePath('/admin/users')
}
