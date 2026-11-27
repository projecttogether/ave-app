import { QualitativeEntryForm } from "@/components/dashboard/qualitative-entry-form"
import { getAppContent } from "@/lib/content/content"
import { Metadata } from "next"
import { EditableText } from "@/components/editable-text"

export const metadata: Metadata = {
    title: "Scoring-Fragen – Datenerfassung",
}

export default async function ScoringQuestionsPage(props: {
    searchParams: Promise<{ year?: string; subOrgId?: string }>
}) {
    const searchParams = await props.searchParams
    const yearParam = searchParams.year ? parseInt(searchParams.year, 10) : undefined
    const defaultYear = Number.isFinite(yearParam) ? yearParam : undefined
    const content = await getAppContent()

    return (
        <div className="space-y-6 mt-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Scoring-Fragen erfassen</h2>
                <p className="text-muted-foreground">
                  <EditableText contentKey="page.forms.scoring.subtitle" initialValue={content['page.forms.scoring.subtitle'] || 'Erfassen Sie hier qualitative Faktoren und Strategien.'} isTextarea>
                    {content['page.forms.scoring.subtitle'] || 'Erfassen Sie hier qualitative Faktoren und Strategien.'}
                  </EditableText>
                </p>
            </div>
            <QualitativeEntryForm defaultYear={defaultYear} defaultSubOrgId={searchParams.subOrgId} />
        </div>
    )
}
