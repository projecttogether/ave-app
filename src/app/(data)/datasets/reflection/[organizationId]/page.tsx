import { getReflectionDataSetDetail } from '@/app/actions/reflection'
import { ReflectionDatasetDetail } from '@/components/dashboard/reflection-dataset-detail'
import { Metadata } from 'next'
import { DatasetBackLink as Link } from '@/components/dashboard/dataset-back-link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { errorSummary } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const metadata: Metadata = {
  title: 'Reflexionsdatensatz – Details',
}

export default async function ReflectionDataSetDetailPage({ params }: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params
  let detail: Awaited<ReturnType<typeof getReflectionDataSetDetail>>

  try {
    detail = await getReflectionDataSetDetail(organizationId)
  } catch (error) {
    logger.error('Failed to load reflection dataset detail', errorSummary(error))
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/datasets?tab=reflection">
            <ArrowLeft className="mr-2 h-4 w-4" />Zurück
          </Link>
        </Button>
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold">Fehler beim Laden</h2>
            <p className="text-sm text-muted-foreground">Der Datensatz konnte nicht geladen werden.</p>
          </div>
        </div>
      </div>
    )
  }

  return <ReflectionDatasetDetail {...detail} organizationId={organizationId} />
}
