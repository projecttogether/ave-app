'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { appContent, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { isAdmin } from '@/lib/roles'
import { revalidatePath } from 'next/cache'
import { dashboardLinksSchema } from '@/lib/validation'
import { errorSummary } from '@/lib/errors'
import { logger } from '@/lib/logger'

export type DashboardLink = {
    id: string
    name: string
    url: string
}

export async function getDashboardLinks(): Promise<DashboardLink[]> {
    try {
        const result = await db.query.appContent.findFirst({
            where: eq(appContent.key, 'dashboard_links')
        })

        if (!result || !result.value) {
            return []
        }

        // The stored value is rendered as links for every user; apply the same
        // URL rules as on save, whatever wrote it.
        const parsed = dashboardLinksSchema.safeParse(JSON.parse(result.value))
        return parsed.success ? parsed.data : []
    } catch (e) {
        logger.error('Failed to parse dashboard links', errorSummary(e))
        return []
    }
}

export async function saveDashboardLinks(links: DashboardLink[]) {
    const session = await auth()
    if (!session?.user?.email) {
        throw new Error("Unauthorized")
    }

    // Verify user is admin
    const profile = await db.query.users.findFirst({
        where: eq(users.id, session.user.id!),
        with: { userRoles: true }
    })

    if (!profile) {
        throw new Error("Profile not found")
    }

    const userRolesArray = profile.userRoles.map((ur: any) => ur.roleId)
    if (!isAdmin(userRolesArray)) {
        throw new Error("Unauthorized: Only admins can manage links")
    }

    // Validate shape and reject non-http(s)/mailto URL schemes (stored XSS
    // via javascript: hrefs rendered to all dashboard users)
    const validLinks = dashboardLinksSchema.parse(links)

    const jsonValue = JSON.stringify(validLinks)

    // Upsert the appContent key
    await db.insert(appContent)
        .values({
            key: 'dashboard_links',
            value: jsonValue,
            updatedBy: session.user.id
        })
        .onConflictDoUpdate({
            target: appContent.key,
            set: {
                value: jsonValue,
                updatedBy: session.user.id,
                updatedAt: new Date()
            }
        })

    revalidatePath('/dashboard')
    revalidatePath('/tasks')
}
