import { ExportForm } from '@/components/admin/export-form'
import { checkAdmin, getOrganizations } from '@/app/admin/actions'
import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Admin - Export',
}

export default async function AdminExportPage() {
    await checkAdmin()
    const organizations = await getOrganizations()
    const exportableOrganizations = organizations.filter((org) => !/test/i.test(org.name))

    return (
        <div className="space-y-6">
            <ExportForm
                organizations={exportableOrganizations.map((o) => ({ id: o.id, name: o.name }))}
            />
        </div>
    )
}
