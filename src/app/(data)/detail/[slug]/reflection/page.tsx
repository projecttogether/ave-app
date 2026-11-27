import { QUAL_SLUG_MAP, type IndicatorSlug } from '@/lib/qualitative/constants'
import { ReflectionEntryForm } from '@/components/form/reflection-entry-form'
import { notFound, redirect } from 'next/navigation'
import { Metadata } from 'next'
import { auth } from '@/auth'
import { canEnterReflection } from '@/lib/roles'
import { getAppContent } from '@/lib/content/content'

interface PageProps {
    params: Promise<{ slug: string }>
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
    const params = await props.params
    return { title: `Reflexionsfragen erfassen: ${params.slug}` }
}

export default async function ReflectionDataEntryPage(props: PageProps) {
    const params = await props.params
    const slug = params.slug

    const qualSlug = QUAL_SLUG_MAP[slug]
    if (!qualSlug) {
        return notFound()
    }

    // Reflection answers are organization-wide; only managers and admins enter them.
    const session = await auth()
    if (!canEnterReflection((session?.user as any)?.roles)) {
        redirect(`/detail/${slug}`)
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
    const descriptionKey = slugMap[slug] ? `${slugMap[slug]}.reflection.description` : null
    const description = descriptionKey ? content[descriptionKey] : "Erfassen Sie hier die Reflexionsdaten für den ausgewählten Indikator."


    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Reflexionsfragen erfassen</h2>
                <p className="text-muted-foreground">
                    {description || "Erfassen Sie hier die Reflexionsdaten für den ausgewählten Indikator."}
                </p>
            </div>
            <ReflectionEntryForm indicatorSlug={qualSlug as IndicatorSlug} />
        </div>
    )
}
