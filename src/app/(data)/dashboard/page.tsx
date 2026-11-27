import { readReportingFilters, reportingParams, type ReportingSearchParams } from '@/lib/reporting-filters'
import { getDashboardWithComparison } from '@/app/actions/comparison'
import { isAdmin } from '@/lib/roles'
import { RadarOverviewChart } from '@/components/dashboard/radar-overview-chart'
import { RadarComparisonChart } from '@/components/dashboard/radar-comparison-chart'
import { IndicatorProgressCard } from '@/components/dashboard/indicator-progress-card'
import { DashboardLinks } from '@/components/dashboard/dashboard-links'
import { getDashboardLinks } from '@/app/actions/links'
import { Metadata } from 'next'
import { ReportingLink as Link } from '@/components/reporting-filters-provider'

export const metadata: Metadata = {
    title: "Übersicht - Dashboard",
}
import { ProgressHeader } from '@/components/dashboard/progress-header'
import { EditableText } from '@/components/editable-text'
import { getAppContent } from '@/lib/content/content'

export default async function DashboardPage(props: {
    searchParams: Promise<ReportingSearchParams>
}) {
    const searchParams = await props.searchParams
    const { subOrgId, year: yearParam, granularity, organizationId } = readReportingFilters(reportingParams(searchParams))

    // Pass subOrgId filter to data fetcher
    const [{ data, comparisonData }, links] = await Promise.all([
        getDashboardWithComparison(subOrgId, yearParam, granularity, organizationId),
        getDashboardLinks(),
    ])

    // Check if user has any data at all
    const hasData = data.overview.total_spend !== null ||
        data.overview.plant_based_percentage !== null ||
        data.overview.organic_percentage !== null ||
        data.dataEntryProgress.total_entries > 0

    const content = await getAppContent()

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">{content['page.dashboard.title'] || 'Übersicht'}</h2>
                <p className="text-muted-foreground">
                    <EditableText contentKey="page.dashboard.subtitle" initialValue={content['page.dashboard.subtitle'] || 'Verfolge die Fortschritte beim Lebensmitteleinkauf.'} isTextarea>
                        {content['page.dashboard.subtitle'] || 'Verfolge die Fortschritte beim Lebensmitteleinkauf.'}
                    </EditableText>
                </p>
            </div>

            {/* Progress, Year Selection and Filters */}
            <ProgressHeader progress={data.dataEntryProgress} showProgress={!(isAdmin(data.userRoles as any) && !subOrgId)} />

            {!hasData && (
                <div className="rounded-xl border bg-muted/50 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="text-muted-foreground text-sm flex-1">
                        <EditableText contentKey="page.dashboard.empty-data-tasks" initialValue={content['page.dashboard.empty-data-tasks'] || 'Es sind noch keine Betriebsdaten für dieses Jahr vorhanden. Um die Indikatoren zu berechnen, müssen zunächst die offenen Aufgaben abgeschlossen werden.'} isTextarea>
                            {content['page.dashboard.empty-data-tasks'] || 'Es sind noch keine Betriebsdaten für dieses Jahr vorhanden. Um die Indikatoren zu berechnen, müssen zunächst die offenen Aufgaben abgeschlossen werden.'}
                        </EditableText>
                    </div>
                    <Link
                        href="/tasks"
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm whitespace-nowrap"
                    >
                        Zu den Aufgaben
                    </Link>
                </div>
            )}

            {/* Indicator Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RadarOverviewChart
                    overview={data.overview}
                    targets={data.targets}
                    selectedYear={data.selectedYear}
                    foodWaste={data.foodWaste}
                    qualitativeScoringResults={data.qualitativeScoringResults}
                />
                <IndicatorProgressCard
                    overview={data.overview}
                    targets={data.targets}
                    selectedYear={data.selectedYear}
                    foodWaste={data.foodWaste}
                    qualitativeScoringResults={data.qualitativeScoringResults}
                />
            </div>

            {/* Radar Comparison + Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RadarComparisonChart data={comparisonData} />
                <DashboardLinks 
                    initialLinks={links} 
                    isAdmin={isAdmin(data.userRoles as any)} 
                />
            </div>
        </div>
    )
}
