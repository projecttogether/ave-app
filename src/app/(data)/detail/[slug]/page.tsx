import { readReportingFilters, reportingParams, type ReportingSearchParams } from '@/lib/reporting-filters'
import { getIndicatorDetails } from '@/app/actions/indicators'
import { IndicatorDetailClient } from '@/components/dashboard/indicator-detail-client'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getAppContent } from '@/lib/content/content'
import { ReportingLink as Link } from '@/components/reporting-filters-provider'
import { ArrowLeft } from 'lucide-react'

interface PageProps {
    params: Promise<{ slug: string }>
    searchParams: Promise<ReportingSearchParams>
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
    const params = await props.params
    return { title: `Indikator: ${params.slug}` }
}

export default async function IndicatorDetailPage(props: PageProps) {
    const params = await props.params
    const searchParams = await props.searchParams
    
    const slug = params.slug
    const { subOrgId, year, granularity, organizationId } = readReportingFilters(reportingParams(searchParams))

    // Build back link to /indikatoren preserving current filters
    const backParams = new URLSearchParams()
    if (year) backParams.set('year', year.toString())
    backParams.set('granularity', granularity)
    if (subOrgId) backParams.set('subOrgId', subOrgId)
    if (organizationId) backParams.set('organizationId', organizationId)
    const backQs = backParams.toString() ? `?${backParams.toString()}` : ''
    const backHref = `/indikatoren${backQs}`
    let data: NonNullable<Awaited<ReturnType<typeof getIndicatorDetails>>>
    let description: string

    try {
        const result = await getIndicatorDetails(slug, subOrgId, year, granularity, organizationId)
        if (!result) return notFound()
        data = result

        const content = await getAppContent()

        const slugMap: Record<string, string> = {
            plant_based_percentage: 'indicator.plant_based',
            organic_percentage: 'indicator.organic',
            food_waste: 'indicator.food_waste',
            seasonal_score: 'indicator.seasonal',
            regional_score: 'indicator.regional',
            fair_trade_percentage: 'indicator.fair_trade',
            guest_satisfaction: 'indicator.guest_satisfaction',
        }
        
        const descriptionKey = slugMap[slug] ? `${slugMap[slug]}.description` : null
        description = descriptionKey ? content[descriptionKey] : "Detaillierte Analyse für den ausgewählten Indikator."
    } catch {
        notFound()
    }

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href={backHref}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Zurück
                </Link>
                <h2 className="text-2xl font-bold tracking-tight">Detailansicht</h2>
                <p className="text-muted-foreground">
                    {description}
                </p>
            </div>

            <IndicatorDetailClient data={data} />
        </div>
    )
}
