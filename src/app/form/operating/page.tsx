import { DataEntryForm } from "@/components/dashboard/data-entry-form"
// import { CsvImportTab } from "@/components/dashboard/csv-import-tab"
import { getAppContent } from "@/lib/content/content"
import { readEntrySelection } from '@/lib/operating-data/entry-selection'
import { Metadata } from "next"
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EditableText } from "@/components/editable-text"

export const metadata: Metadata = {
    title: "Betriebsdaten – Datenerfassung",
}

export default async function OperatingDataPage(props: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const searchParams = await props.searchParams
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
        for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item)
    }
    let selection: ReturnType<typeof readEntrySelection>
    try { selection = readEntrySelection(params) }
    catch { return <p role="alert">Ungültige Berichtsperiode. Bitte die Aufgabe erneut öffnen oder einen gültigen Zeitraum wählen.</p> }
    const content = await getAppContent()

    return (
        <div className="space-y-6 mt-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Betriebsdaten erfassen</h2>
                <div className="text-muted-foreground">
                  <EditableText contentKey="page.forms.subtitle" initialValue={content['page.forms.subtitle'] || 'Erfassen Sie hier die allgemeinen Betriebsdaten für den ausgewählten Zeitraum.'} isTextarea>
                    {content['page.forms.subtitle'] || 'Erfassen Sie hier die allgemeinen Betriebsdaten für den ausgewählten Zeitraum.'}
                  </EditableText>
                </div>
            </div>
            {/* CSV Import tab hidden for now – will be re-enabled later */}
            <DataEntryForm defaultYear={selection.period.year} defaultSubOrgId={selection.subOrgId} defaultEntryMode={params.has('entryMode') ? selection.entryMode : undefined} defaultMonth={selection.period.kind === 'month' ? selection.period.index : undefined} />
        </div>
    )
}
