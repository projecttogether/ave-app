import { getOrganizations } from '@/app/admin/actions'
import { OrgList } from '@/components/admin/org-list'
import { Metadata } from 'next'

export const metadata: Metadata = {
    title: "Admin - Organisationen",
}

export default async function OrganizationsPage() {
    const organizations = await getOrganizations()

    return (
        <div className="space-y-6">
            <OrgList initialOrganizations={organizations} />
        </div>
    )
}
