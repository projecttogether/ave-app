import { getAdminDataSetsFilterOptions } from '@/app/admin/actions/datasets'
import { AdminDatasetsPageClient } from '@/components/admin/admin-datasets-page-client'
import { Metadata } from 'next'
import { errorSummary } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const metadata: Metadata = {
    title: 'Admin - Datensätze',
}

export const dynamic = 'force-dynamic'

export default async function AdminDatasetsPage() {
    let filterOptions: Awaited<ReturnType<typeof getAdminDataSetsFilterOptions>>

    try {
        filterOptions = await getAdminDataSetsFilterOptions()
    } catch (error) {
        logger.error('Failed to load admin datasets page', errorSummary(error))
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center space-y-2">
                    <h2 className="text-lg font-semibold">Fehler beim Laden</h2>
                    <p className="text-sm text-muted-foreground">
                        Die Admin-Datensätze konnten nicht geladen werden. Bitte versuchen Sie es erneut.
                    </p>
                </div>
            </div>
        )
    }

    return <AdminDatasetsPageClient filterOptions={filterOptions} />
}
