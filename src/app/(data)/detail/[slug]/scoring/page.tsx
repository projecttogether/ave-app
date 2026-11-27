import { QUAL_SLUG_MAP, type IndicatorSlug } from '@/lib/qualitative/constants'
import { QualitativeEntryForm } from '@/components/dashboard/qualitative-entry-form'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getAppContent } from '@/lib/content/content'

interface PageProps {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ year?: string; subOrgId?: string }>
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
    const params = await props.params
    return { title: `Scoring-Fragen erfassen: ${params.slug}` }
}

export default async function ScoringDataEntryPage(props: PageProps) {
    const params = await props.params
    const searchParams = await props.searchParams
    const slug = params.slug
    const yearParam = searchParams.year ? parseInt(searchParams.year, 10) : undefined
    const defaultYear = Number.isFinite(yearParam) ? yearParam : undefined

    const qualSlug = QUAL_SLUG_MAP[slug]
    if (!qualSlug) {
        return notFound()
    }

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
    const descriptionKey = slugMap[slug] ? `${slugMap[slug]}.scoring.description` : null
    const description = descriptionKey ? content[descriptionKey] : "Erfassen Sie hier die Scoring-Daten für den ausgewählten Indikator."

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Scoring-Fragen erfassen</h2>
                <p className="text-muted-foreground">
                    {description || "Erfassen Sie hier die Scoring-Daten für den ausgewählten Indikator."}
                </p>
            </div>
            <QualitativeEntryForm indicatorSlug={qualSlug as IndicatorSlug} defaultYear={defaultYear} defaultSubOrgId={searchParams.subOrgId} />
        </div>
    )
}
