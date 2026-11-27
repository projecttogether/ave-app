import { readReportingFilters, reportingParams, type ReportingSearchParams } from '@/lib/reporting-filters'
import { getComparisonData } from '@/app/actions/comparison'
import { ComparisonClient } from '@/components/dashboard/comparison-client'
import { Metadata } from 'next'

export const metadata: Metadata = {
    title: "Vergleich - Dashboard",
}

export default async function VergleichPage(props: {
    searchParams: Promise<ReportingSearchParams>
}) {
    const searchParams = await props.searchParams
    const { year: yearParam, granularity, organizationId, subOrgId } = readReportingFilters(reportingParams(searchParams))
    const data = await getComparisonData(yearParam, granularity, organizationId, subOrgId)

    return <ComparisonClient data={data} />
}
