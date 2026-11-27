'use server'

import { checkAdmin } from '@/app/admin/actions'
import { isAdmin, isOrgManager } from '@/lib/roles'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { organizations, subOrganizations, subOrganizationMembers, users } from '@/lib/db/schema'
import { organizationNameSchema } from '@/lib/validation'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

/**
 * Checks that the user is either an admin or an org_manager.
 * For org_managers, returns their organizationId so operations can be scoped.
 */
async function checkAdminOrOrgManager() {
    const session = await auth()
    if (!session?.user?.email) throw new Error('Unauthorized')

    // @ts-expect-error roles is added in auth.ts
    const roles: string[] = session.user.roles || []

    // Admins and super admins are always global — they can manage sub-orgs across any organization.
    if (isAdmin(roles)) {
        return { session, role: 'admin' as const, organizationId: null }
    }

    if (isOrgManager(roles)) {
        const profile = await db.query.users.findFirst({
            where: eq(users.id, session.user.id!),
        })
        if (!profile?.organizationId) throw new Error('Unauthorized: no organization assigned')
        return { session, role: 'org_manager' as const, organizationId: profile.organizationId }
    }

    throw new Error('Unauthorized')
}

/** Verify the target organizationId matches the caller's org. Global admins (null orgId) pass through. */
function assertOrgAccess(
    check: Awaited<ReturnType<typeof checkAdminOrOrgManager>>,
    organizationId: string,
) {
    if (!check.organizationId) return // global admin
    if (check.organizationId !== organizationId) {
        throw new Error('Unauthorized: cannot manage sub-organizations of another organization')
    }
}

export async function createSubOrganization(organizationId: string, name: string) {
    const check = await checkAdminOrOrgManager()
    assertOrgAccess(check, organizationId)
    const validName = organizationNameSchema.parse(name)

    const [newSubOrg] = await db.insert(subOrganizations)
        .values({
            organizationId: organizationId,
            name: validName,
        })
        .returning()

    revalidatePath('/admin/organizations')
    revalidatePath('/organization')
    return newSubOrg
}

export async function updateSubOrganization(subOrgId: string, name: string) {
    const check = await checkAdminOrOrgManager()
    const validName = organizationNameSchema.parse(name)

    // For org_managers, verify the sub-org belongs to their org
    if (check.role === 'org_manager') {
        const subOrg = await db.query.subOrganizations.findFirst({
            where: eq(subOrganizations.id, subOrgId),
        })
        if (!subOrg || subOrg.organizationId !== check.organizationId) {
            throw new Error('Unauthorized')
        }
    }

    const [updated] = await db.update(subOrganizations)
        .set({ name: validName })
        .where(eq(subOrganizations.id, subOrgId))
        .returning()

    revalidatePath('/admin/organizations')
    revalidatePath('/organization')
    return updated
}

export async function deleteSubOrganization(subOrgId: string) {
    await checkAdmin()

    await db.delete(subOrganizations)
        .where(eq(subOrganizations.id, subOrgId))

    revalidatePath('/admin/organizations')
    revalidatePath('/organization')
}

export async function addSubOrganizationMember(subOrgId: string, userId: string, _role: 'organization_manager' | 'organization_user') {
    const check = await checkAdminOrOrgManager()
    const subOrg = await db.query.subOrganizations.findFirst({
        where: eq(subOrganizations.id, subOrgId),
        columns: { organizationId: true },
    })
    if (!subOrg) throw new Error('Sub-organization not found')
    assertOrgAccess(check, subOrg.organizationId)

    // The target user must belong to the sub-org's organization; otherwise an
    // org_manager could grant any account in the system access to their data
    const targetUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { organizationId: true },
    })
    if (!targetUser) throw new Error('Benutzer nicht gefunden')
    if (targetUser.organizationId !== subOrg.organizationId) {
        throw new Error('Benutzer gehört nicht zur Organisation dieser Unterorganisation')
    }

    const [member] = await db.insert(subOrganizationMembers)
        .values({
            subOrganizationId: subOrgId,
            userId: userId,
        })
        .returning()

    revalidatePath('/admin/organizations')
    return member
}

export async function removeSubOrganizationMember(subOrgId: string, userId: string) {
    const check = await checkAdminOrOrgManager()
    const subOrg = await db.query.subOrganizations.findFirst({
        where: eq(subOrganizations.id, subOrgId),
        columns: { organizationId: true },
    })
    if (!subOrg) throw new Error('Sub-organization not found')
    assertOrgAccess(check, subOrg.organizationId)

    await db.delete(subOrganizationMembers)
        .where(and(
            eq(subOrganizationMembers.subOrganizationId, subOrgId),
            eq(subOrganizationMembers.userId, userId)
        ))

    revalidatePath('/admin/organizations')
}

export async function getSubOrganizationMembers(subOrgId: string) {
    const check = await checkAdminOrOrgManager()
    const subOrg = await db.query.subOrganizations.findFirst({
        where: eq(subOrganizations.id, subOrgId),
        columns: { organizationId: true },
    })
    if (!subOrg) throw new Error('Sub-organization not found')
    assertOrgAccess(check, subOrg.organizationId)

    const members = await db.select({
        userId: subOrganizationMembers.userId,
        subOrganizationId: subOrganizationMembers.subOrganizationId,
        email: users.email,
        id: users.id
    })
    .from(subOrganizationMembers)
    .innerJoin(users, eq(subOrganizationMembers.userId, users.id))
    .where(eq(subOrganizationMembers.subOrganizationId, subOrgId))

    return members.map(m => ({
        ...m,
        profiles: { email: m.email, id: m.id }
    }))
}

/** Get the current org_manager's organization with its sub-orgs. */
export async function getManagerOrganization() {
    const check = await checkAdminOrOrgManager()

    if (check.role === 'admin') {
        throw new Error('Use getOrganizations() for admins')
    }

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, check.organizationId!),
        with: { subOrganizations: true },
    })

    if (!org) throw new Error('Organization not found')

    return {
        ...org,
        createdAt: org.createdAt ? org.createdAt.toISOString() : null,
        subOrganizations: org.subOrganizations.map(sub => ({
            ...sub,
            createdAt: sub.createdAt ? sub.createdAt.toISOString() : null,
        })),
    }
}

export async function getUserSubOrganizations() {
    const session = await auth()
    if (!session?.user?.email) throw new Error('Unauthorized')
    const userId = session.user.id

    // Get user profile to check role and org
    const profile = await db.query.users.findFirst({
        where: eq(users.id, userId!),
        with: { userRoles: { with: { role: true } } }
    })
    if (!profile) throw new Error('Profile not found')

    const userRolesArray = profile.userRoles.map((ur: any) => ur.roleId)

    if (isAdmin(userRolesArray)) {
        if (profile.organizationId) {
            return await db.query.subOrganizations.findMany({
                where: eq(subOrganizations.organizationId, profile.organizationId)
            })
        }
        return []
    }

    if (userRolesArray.includes('org_manager') || userRolesArray.includes('org_view_only')) {
        if (!profile.organizationId) return []
        return await db.query.subOrganizations.findMany({
            where: eq(subOrganizations.organizationId, profile.organizationId)
        })
    }

    if (userRolesArray.includes('basic_user')) {
        const memberships = await db.query.subOrganizationMembers.findMany({
            where: eq(subOrganizationMembers.userId, userId!),
            with: {
                subOrganization: true
            }
        })

        const subOrgs = memberships.map(m => m.subOrganization).filter(Boolean)
        return subOrgs
    }

    return []
}
