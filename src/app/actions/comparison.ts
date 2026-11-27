'use server'

import type { FoodWasteResult, FoodWasteSummary } from '@/lib/indicators/food-waste'
import { getDashboardData } from './dashboard'
import { getBenchmark } from '@/lib/indicators/benchmark'
import { DashboardOverview, IndicatorTargets } from '@/lib/indicators/types'
import { INDICATOR_TARGETS } from '@/lib/indicators/targets'
import { resolveGranularity } from '@/lib/indicators/granularity'

export type QualScoringResults = {
    regional: number | null
    seasonal: number | null
    guest_satisfaction: number | null
}


export type ComparisonData = {
    orgOverview: DashboardOverview
    globalOverview: DashboardOverview
    targets: IndicatorTargets
    availableYears: number[]
    selectedYear: number
    organizationName?: string
    userRoles: string[]
    orgQualScoring: QualScoringResults
    globalQualScoring: QualScoringResults
    benchmarkAvailableIndicators: string[]
    /** Matched food-waste result for the selected scope */
    foodWasteOrg: FoodWasteResult
    /** Global matched result, subject to the benchmark contributor threshold */
    foodWasteGlobal: FoodWasteSummary | null
}

/**
 * Fetch comparison data: org-level stats vs global stats.
 */
export async function getComparisonData(year?: number, granularity?: string | null, organizationId?: string, subOrgId?: string): Promise<ComparisonData> {
    return (await getDashboardWithComparison(subOrgId, year, granularity, organizationId)).comparisonData
}

export async function getDashboardWithComparison(subOrgId?: string, year?: number, granularity?: string | null, organizationId?: string) {
    const mode = resolveGranularity(granularity)
    const data = await getDashboardData(subOrgId, year, mode, organizationId)
    const benchmark = await getBenchmark(data.selectedYear, mode)
    const comparisonData: ComparisonData = {
        orgOverview: data.overview,
        globalOverview: benchmark.overview,
        targets: INDICATOR_TARGETS,
        availableYears: data.availableYears,
        selectedYear: data.selectedYear,
        organizationName: data.organizationName,
        userRoles: data.userRoles,
        orgQualScoring: data.qualitativeScoringResults,
        globalQualScoring: benchmark.qualitative,
        benchmarkAvailableIndicators: benchmark.availableIndicators.filter(id => data.benchmarkEligibleIndicators?.includes(id)),
        foodWasteOrg: data.foodWaste,
        foodWasteGlobal: data.benchmarkEligibleIndicators?.includes('food_waste') ? benchmark.foodWaste : null,
    }
    return { data, comparisonData }
}
