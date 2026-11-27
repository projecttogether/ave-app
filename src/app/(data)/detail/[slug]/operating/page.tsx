import { getIndicatorDetails } from '@/app/actions/indicators'
import { IndicatorDataEntryForm } from '@/components/dashboard/indicator-data-entry-form'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getAppContent } from '@/lib/content/content'

interface PageProps {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ subOrgId?: string, year?: string }>
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
    const params = await props.params
    return { title: `Betriebsdaten erfassen: ${params.slug}` }
}

export default async function OperatingDataEntryPage(props: PageProps) {
    const params = await props.params
    const searchParams = await props.searchParams

    const slug = params.slug
    const subOrgId = searchParams.subOrgId || "all"

    const data = await getIndicatorDetails(slug, searchParams.subOrgId, searchParams.year ? parseInt(searchParams.year) : undefined)
    if (!data) return notFound()

    const year = searchParams.year ? parseInt(searchParams.year) : (data.availableYears[0] || new Date().getFullYear())

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
    const descriptionKey = slugMap[slug] ? `${slugMap[slug]}.operating.description` : null
    const description = descriptionKey ? content[descriptionKey] : "Erfassen Sie hier die quantitativen Daten für den ausgewählten Indikator."


    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Betriebsdaten erfassen</h2>
                <p className="text-muted-foreground">
                    {description || "Erfassen Sie hier die quantitativen Daten für den ausgewählten Indikator."}
                </p>
            </div>
            <IndicatorDataEntryForm
                slug={data.slug}
                currentSubOrgId={subOrgId}
                currentYear={year}
            />
        </div>
    )
}
