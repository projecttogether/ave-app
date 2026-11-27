import { readReportingFilters, reportingParams, type ReportingSearchParams } from '@/lib/reporting-filters'
import { describeFoodWaste } from '@/lib/indicators/food-waste'
import { computeIndicatorProgress } from '@/lib/indicators/engine'
import { getDashboardData } from '@/app/actions/dashboard'
import { INDICATOR_CONFIG } from '@/lib/indicators/config'
import { Metadata } from 'next'
import { KPICard } from '@/components/dashboard/kpi-card'
import { getAppContent } from '@/lib/content/content'
import { EditableText } from '@/components/editable-text'

export const metadata: Metadata = {
    title: "Indikatoren",
}

export default async function IndikatorenPage(props: {
    searchParams: Promise<ReportingSearchParams>
}) {
    const searchParams = await props.searchParams
    const { subOrgId, year: yearParam, granularity, organizationId } = readReportingFilters(reportingParams(searchParams))

    const data = await getDashboardData(subOrgId, yearParam, granularity, organizationId)

    const foodWaste = computeIndicatorProgress('food_waste', data.overview, data.targets, data.foodWaste)
    const content = await getAppContent()

    // Build query string to pass filters to detail pages
    const filterParams = new URLSearchParams()
    if (yearParam) filterParams.set('year', yearParam.toString())
    filterParams.set('granularity', granularity)
    if (subOrgId) filterParams.set('subOrgId', subOrgId)
    if (data.selectedOrganizationId && data.availableOrganizations) filterParams.set('organizationId', data.selectedOrganizationId)
    const qs = filterParams.toString() ? `?${filterParams.toString()}` : ''

    return (
        <div className="space-y-6">
                {describeFoodWaste(data.foodWaste) && <p className="text-sm text-muted-foreground">Lebensmittelabfälle: {describeFoodWaste(data.foodWaste)}</p>}
            <div>
                <h2 className="text-2xl font-bold tracking-tight">{content['page.indicators.title'] || "Einzelne Indikatoren"}</h2>
                <p className="text-muted-foreground">
                    <EditableText contentKey="page.indicators.subtitle" initialValue={content['page.indicators.subtitle'] || "Detailansicht der einzelnen Nachhaltigkeitsindikatoren."} isTextarea>
                        {content['page.indicators.subtitle'] || "Detailansicht der einzelnen Nachhaltigkeitsindikatoren."}
                    </EditableText>
                </p>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title={content['indicator.plant_based'] || INDICATOR_CONFIG.plant_based_percentage.title}
                    value={data.overview.plant_based_percentage}
                    unit="%"
                    target={data.targets.plant_based_percentage}
                    prevPeriodChange={data.comparisons.plant_based_spend_pct_change}
                    href={`/detail/plant_based_percentage${qs}`}
                />
                <KPICard
                    title={content['indicator.organic'] || INDICATOR_CONFIG.organic_percentage.title}
                    value={data.overview.organic_percentage}
                    unit="%"
                    target={data.targets.organic_percentage}
                    prevPeriodChange={data.comparisons.organic_spend_pct_change}
                    href={`/detail/organic_percentage${qs}`}
                />
                <KPICard
                    title={content['indicator.food_waste'] || INDICATOR_CONFIG.food_waste.title}
                    value={foodWaste.dataSource === 'none' ? null : foodWaste.value}
                    unit="%"
                    target={data.targets.food_waste}
                    max={0}
                    prevPeriodChange={data.comparisons.food_waste_pct_change}
                    href={`/detail/food_waste${qs}`}
                />
                <KPICard
                    title={content['indicator.seasonal'] || INDICATOR_CONFIG.seasonal_score.title}
                    value={data.overview.seasonal_scoring_result}
                    unit="Pkt."
                    target={data.targets.seasonal_scoring_result}
                    prevPeriodChange={data.comparisons.seasonal_score_pct_change}
                    href={`/detail/seasonal_score${qs}`}
                />
                <KPICard
                    title={content['indicator.regional'] || INDICATOR_CONFIG.regional_score.title}
                    value={data.overview.regional_scoring_result}
                    unit="Pkt."
                    target={data.targets.regional_scoring_result}
                    prevPeriodChange={data.comparisons.regional_score_pct_change}
                    href={`/detail/regional_score${qs}`}
                />
                <KPICard
                    title={content['indicator.fair_trade'] || INDICATOR_CONFIG.fair_trade_percentage.title}
                    value={data.overview.fair_trade_percentage}
                    unit="%"
                    target={data.targets.fair_trade_percentage}
                    prevPeriodChange={data.comparisons.fair_trade_spend_pct_change}
                    href={`/detail/fair_trade_percentage${qs}`}
                />
                <KPICard
                    title={content['indicator.guest_satisfaction'] || INDICATOR_CONFIG.guest_satisfaction.title}
                    value={data.overview.guest_satisfaction_scoring_result}
                    unit="Pkt."
                    target={100}
                    prevPeriodChange={data.comparisons.guest_satisfaction_pct_change}
                    href={`/detail/guest_satisfaction${qs}`}
                />
            </div>
        </div>
    )
}
