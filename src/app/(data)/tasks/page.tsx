import { getReportingFilterOptions } from '@/lib/reporting-filter-options'
import { readReportingFilters, reportingParams, type ReportingSearchParams } from '@/lib/reporting-filters'
import { AllReportingYears } from '@/components/reporting-filter-bar'
import { getMissingData } from '@/app/actions/missing-data'
import { REPORTING_START_YEAR } from '@/lib/reporting-period'
import { reportingToday } from '@/lib/operating-data/periods'
import { getFrozenYearNumbers } from '@/app/actions/data-freeze'
import { MissingDataTasks } from '@/components/dashboard/missing-data-tasks'
import { Metadata } from 'next'
import { getAppContent } from '@/lib/content/content'

export const metadata: Metadata = {
    title: "Aufgaben - Dashboard",
}

export default async function AufgabenPage(props: {
    searchParams: Promise<ReportingSearchParams>
}) {
    const searchParams = await props.searchParams
    const currentYear = reportingToday().year
    const filters = readReportingFilters(reportingParams(searchParams), currentYear)
    const { options } = await getReportingFilterOptions()
    const availableYears = searchParams.allYears === '1' ? options.years : [filters.year]

    const frozenYearNumbers = await getFrozenYearNumbers()

    // Only years the entry forms accept can have open tasks: no future and no frozen years.
    const activeYears = availableYears.filter(year => year >= REPORTING_START_YEAR && year <= currentYear && !frozenYearNumbers.includes(year))

    // Fetch missing data for all active years concurrently
    const missingDataPromises = activeYears.map(async (year) => {
        const missingDataForYear = await getMissingData(year, { organizationId: filters.organizationId, subOrganizationId: filters.subOrgId })
        return { year, data: missingDataForYear }
    })

    const [allMissingData, content] = await Promise.all([
        Promise.all(missingDataPromises),
        getAppContent(),
    ])

    const subtitle = content['page.tasks.subtitle'] ?? 'Übersicht der offenen Aufgaben und Dateneingaben.'

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Offene Aufgaben</h2>
                <p className="text-muted-foreground">{subtitle}</p>
            </div>

            <AllReportingYears />
            {activeYears.length === 0
                ? <p className="text-muted-foreground">Für diese Auswahl gibt es keine bearbeitbaren Berichtsjahre. Zukünftige und gesperrte Jahre werden nicht als offene Aufgaben angezeigt.</p>
                : <MissingDataTasks currentYear={currentYear} tasksData={allMissingData} formSubOrgIds={options.formSubOrgIds} />}
        </div>
    )
}
