import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import {  isOrgManager } from '@/lib/roles'
import { getManagerOrganization } from '@/app/actions/sub-organizations'
import { SubOrgManager } from '@/components/sub-org-manager'
import { OrganizationTeam } from '@/components/organization-team'
import { getOrganizationTeam } from '@/app/actions/organization-team'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default async function OrganizationPage() {
    const session = await auth()
    if (!session?.user?.email) redirect('/login')

    // @ts-expect-error roles is added in auth.ts
    const roles: string[] = session.user.roles || []

    // Admins manage orgs via /admin/organizations
    // Only org_managers access this page
    if (!isOrgManager(roles)) {
        redirect('/dashboard')
    }

    const [org, team] = await Promise.all([getManagerOrganization(), getOrganizationTeam()])

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Meine Organisation</h1>
                <p className="text-muted-foreground">Team und Unterorganisationen verwalten</p>
            </div>
            <Tabs defaultValue="team">
                <TabsList className="mb-4"><TabsTrigger value="team">Team</TabsTrigger><TabsTrigger value="kitchens">Unterorganisationen</TabsTrigger></TabsList>
                <TabsContent value="team"><OrganizationTeam {...team} kitchens={org.subOrganizations} organizationName={org.name} /></TabsContent>
                <TabsContent value="kitchens"><SubOrgManager organization={org} /></TabsContent>
            </Tabs>
        </div>
    )
}
