import { DatasetsPageClient } from '@/components/dashboard/datasets-page-client'
import { getDataSetsFilterOptions } from '@/app/actions/datasets'
import { Metadata } from 'next'
import { errorSummary } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const metadata: Metadata = {
    title: 'Datensätze',
}

export const dynamic = 'force-dynamic'

export default async function DatasetsPage({ searchParams }: {
    searchParams: Promise<{ tab?: string }>
}) {
    const { tab } = await searchParams
    let filterOptions: Awaited<ReturnType<typeof getDataSetsFilterOptions>>

    try {
        filterOptions = await getDataSetsFilterOptions()
    } catch (error) {
        logger.error('Failed to load datasets page', errorSummary(error))
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center space-y-2">
                    <h2 className="text-lg font-semibold">Fehler beim Laden</h2>
                    <p className="text-sm text-muted-foreground">
                        Die Datensätze konnten nicht geladen werden. Bitte versuchen Sie es erneut.
                    </p>
                </div>
            </div>
        )
    }

    return <DatasetsPageClient filterOptions={filterOptions} defaultTab={tab === 'reflection' && filterOptions.canViewReflection ? 'reflection' : 'operating'} />
}
