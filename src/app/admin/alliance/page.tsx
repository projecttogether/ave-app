import { getAllianceHealthData } from '@/app/actions/alliance'
import { AllianceHealthClient } from '@/components/admin/alliance-health-client'
import { Metadata } from 'next'

export const metadata: Metadata = {
    title: "Allianz-Übersicht",
}

export default async function AllianceHealthPage(props: {
    searchParams: Promise<{ year?: string }>
}) {
    const searchParams = await props.searchParams
    const yearParam = searchParams.year ? parseInt(searchParams.year) : undefined

    const data = await getAllianceHealthData(yearParam)

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Allianz-Übersicht</h2>
                <p className="text-muted-foreground">
                    Aggregierte Übersicht aller Mitgliedsorganisationen.
                </p>
            </div>
            <AllianceHealthClient data={data} />
        </div>
    )
}
