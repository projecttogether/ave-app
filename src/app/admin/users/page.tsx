import { getUsers, getOrganizations, getUserSubOrgMemberships } from '../actions'
import { UsersPageClient } from '@/components/admin/users-page-client'
import { Metadata } from 'next'
import { auth } from '@/auth'
import { errorSummary } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const metadata: Metadata = {
    title: "Admin - Benutzer",
}

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
    try {
        const [users, organizations, session, subOrgMemberships] = await Promise.all([
            getUsers(),
            getOrganizations(),
            auth(),
            getUserSubOrgMemberships(),
        ])

        const currentUserRoles = (session?.user as any)?.roles || ['admin']

        // Flatten all sub-orgs from orgs
        const allSubOrgs = organizations.flatMap(org =>
            (org.subOrganizations || []).map(sub => ({
                ...sub,
                organizationId: org.id,
                organizationName: org.name,
            }))
        )

        return (
            <UsersPageClient
                initialUsers={users}
                organizations={organizations}
                currentUserRoles={currentUserRoles}
                subOrganizations={allSubOrgs}
                userSubOrgMemberships={subOrgMemberships}
            />
        )
    } catch (error) {
        logger.error('Failed to load admin users page', errorSummary(error))
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center space-y-2">
                    <h2 className="text-lg font-semibold">Fehler beim Laden</h2>
                    <p className="text-sm text-muted-foreground">
                        Die Benutzerdaten konnten nicht geladen werden. Bitte versuchen Sie es erneut.
                    </p>
                </div>
            </div>
        )
    }
}
