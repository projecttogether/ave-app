'use server'

import { comparableCoverage, fullYearCoverage } from '@/lib/operating-data/coverage'
import { selectIndicatorRows } from '@/lib/indicators/aggregation'
import { getDataScope, type DataScope } from '@/lib/access'
import { withDataScope } from '@/lib/db/scope-context'
import { db } from '@/lib/db'
import { indicatorData, subOrganizations } from '@/lib/db/schema'
import { eq, and, inArray, sql, desc, count } from 'drizzle-orm'
import { transformDashboardStats } from '@/lib/indicators/engine'
import { DashboardOverview, IndicatorTargets } from '@/lib/indicators/types'
import { INDICATOR_TARGETS } from '@/lib/indicators/targets'
import { isSubOrganizationScoped, canViewAllOrgData } from '@/lib/roles'
import { calculateFoodWaste, compareFoodWaste, type FoodWasteResult } from '@/lib/indicators/food-waste'
import { readFoodWaste } from '@/lib/indicators/food-waste-reader'
import { indicatorScopeConditions } from '@/lib/indicators/scope'
import { errorSummary } from '@/lib/errors'
import { logger } from '@/lib/logger'

// Infer types from Drizzle
type IndicatorData = typeof indicatorData.$inferSelect
export type IndicatorDataWithRelations = IndicatorData & {
    subOrganization: { name: string } | null
    organization: { name: string } | null // Added organization
}

export type DashboardData = {
    overview: DashboardOverview
    previousOverview?: DashboardOverview
    comparisons: {
        total_spend_pct_change?: number
        plant_based_spend_pct_change?: number
        organic_spend_pct_change?: number
        fair_trade_spend_pct_change?: number
        regional_score_pct_change?: number
        seasonal_score_pct_change?: number
        guest_satisfaction_pct_change?: number
        food_waste_pct_change?: number
    }
    targets: IndicatorTargets
    breakdown: IndicatorDataWithRelations[]
    userRoles: string[]
    userEmail?: string
    organizationName?: string
    availableSubOrgs?: { id: string, name: string }[]
    availableOrganizations?: { id: string, name: string }[]
    selectedOrganizationId?: string
    selectedSubOrganizationId?: string
    availableYears: number[]
    selectedYear: number
    dataEntryProgress: {
        total_entries: number
        expected_entries: number // 12 months * count of sub-orgs
        percentage: number
    }
    benchmarkEligibleIndicators?: string[]
    foodWaste: FoodWasteResult
    /** Scoring-question results (0-100) for the 3 indicators without operational data */
    qualitativeScoringResults: {
        regional: number | null
        seasonal: number | null
        guest_satisfaction: number | null
    }
}

/**
 * Fetch dashboard data with optional filters.
 * @param subOrgId - Filter by specific sub-organization (for managers/admins)
 * @param year - Filter by reporting year
 */
export async function getDashboardData(
    subOrgId?: string,
    year?: number,
    granularity?: 'monthly' | 'yearly' | 'quarterly' | 'auto',
    requestedOrganizationId?: string
): Promise<DashboardData> {
    const scope = await getDataScope({ organizationId: requestedOrganizationId, subOrganizationId: subOrgId })
    return withDataScope(scope, () => loadDashboard(scope, year, granularity))
}

async function loadDashboard(scope: DataScope, year?: number, granularity?: 'monthly' | 'yearly' | 'quarterly' | 'auto'): Promise<DashboardData> {
  try {
    const organizationId = scope.organizationId
    const targetSubOrgId = scope.subOrganizationId || undefined
    const userRolesArray = scope.roles
    const accessibleSubOrgs = scope.availableSubOrgs.map(s => s.id)
    const availableSubOrgsForDropdown = scope.availableSubOrgs

    // ---- 3. Year Selection Logic ----
    // Fetch distinct available years
    const yearData = await db.selectDistinct({ year: indicatorData.reportingYear })
        .from(indicatorData)
        .orderBy(desc(indicatorData.reportingYear))

    const currentYear = new Date().getFullYear()

    // Extract unique years using Set, including defaults
    const availableYears = Array.from(new Set([
        2025, currentYear,
        ...(yearData.map(d => d.year))
    ])).sort((a, b) => b - a)
    
    const selectedYear: number = year ?? (availableYears.length > 0 ? availableYears[0] : currentYear)

    // ---- 4. Parallel Data Fetching ----
    const prevYear = selectedYear - 1

    const indicatorScope = {
        organizationId,
        subOrganizationId: targetSubOrgId,
        accessibleSubOrgIds: isSubOrganizationScoped(userRolesArray) ? accessibleSubOrgs : undefined,
    }
    const [currentStats, previousStats, foodWaste, previousFoodWaste, indicators, entriesCount, previousIndicators] = await Promise.all([
        fetchDashboardStats(organizationId, targetSubOrgId || null, selectedYear, granularity),
        fetchDashboardStats(organizationId, targetSubOrgId || null, prevYear, granularity),
        readFoodWaste(indicatorScope, selectedYear, granularity),
        readFoodWaste(indicatorScope, prevYear, granularity),
        fetchBreakdown(organizationId, targetSubOrgId, accessibleSubOrgs, selectedYear, userRolesArray),
        fetchDataEntryCount(organizationId, targetSubOrgId, accessibleSubOrgs, selectedYear, userRolesArray),
        fetchBreakdown(organizationId, targetSubOrgId, accessibleSubOrgs, prevYear, userRolesArray),
    ])
    if (currentStats.error) throw currentStats.error
    if (previousStats.error) throw previousStats.error
    const overview = transformDashboardStats(currentStats.data as any)
    const previousOverview = transformDashboardStats(previousStats.data as any)

    // Calculate expected entries
    // If specific sub-org selected: 1 sub-org * 12 months = 12
    // If Org level: count(all sub-orgs) * 12
    let subOrgCount = 0
    if (targetSubOrgId) {
        subOrgCount = 1
    } else if (availableSubOrgsForDropdown.length > 0) {
        subOrgCount = availableSubOrgsForDropdown.length
    } else {
        // Fallback for Org Manager with no suborgs yet, or Org User with 1 (already handled above)
        // If Org Manager and no dropdown items fetched? (maybe no suborgs exist)
        // We can fetch count of suborgs for organizationId
        if (organizationId) {
            const result = await db.select({ count: count() })
                .from(subOrganizations)
                .where(eq(subOrganizations.organizationId, organizationId!))
            subOrgCount = result[0]?.count || 0
        } else if (canViewAllOrgData(userRolesArray) && !organizationId) {
             // Global Admin total SubOrg count
             const result = await db.select({ count: count() }).from(subOrganizations)
             subOrgCount = result[0]?.count || 0
        }
    }
    const expected_entries = subOrgCount * 12

    const qualitativeScoringResults = {
        regional: overview.regional_scoring_result,
        seasonal: overview.seasonal_scoring_result,
        guest_satisfaction: overview.guest_satisfaction_scoring_result,
    }

    const comparisons = { ...calculateComparisons(overview, previousOverview), food_waste_pct_change: compareFoodWaste(foodWaste, previousFoodWaste) }
    const quantitative = [['total_spend_pct_change', 'total_spend'], ['plant_based_spend_pct_change', 'plant_based_percentage'], ['organic_spend_pct_change', 'organic_percentage'], ['fair_trade_spend_pct_change', 'fair_trade_percentage'], ['food_waste_pct_change', 'food_waste']] as const
    for (const [key, slug] of quantitative) {
        if (!comparableCoverage(selectIndicatorRows(indicators, slug, granularity), selectIndicatorRows(previousIndicators, slug, granularity))) comparisons[key] = undefined
    }
    const benchmarkEligibleIndicators = quantitative.filter(([, slug]) => fullYearCoverage(selectIndicatorRows(indicators, slug, granularity)))
        .map(([, slug]) => ({ total_spend: 'total_spend', plant_based_percentage: 'plant_based', organic_percentage: 'organic', fair_trade_percentage: 'fair_trade', food_waste: 'food_waste' })[slug])
    if (granularity !== 'monthly' && granularity !== 'quarterly') benchmarkEligibleIndicators.push('regional', 'seasonal', 'guest_satisfaction')

    return {
        overview,
        previousOverview,
        comparisons, benchmarkEligibleIndicators,
        targets: INDICATOR_TARGETS,
        breakdown: indicators as IndicatorDataWithRelations[],
        userRoles: userRolesArray,
        userEmail: scope.email,
        organizationName: scope.organizationName,
        availableOrganizations: scope.availableOrganizations,
        selectedOrganizationId: scope.organizationId || undefined,
        selectedSubOrganizationId: scope.subOrganizationId || undefined,
        availableSubOrgs: availableSubOrgsForDropdown,
        availableYears,
        selectedYear,
        dataEntryProgress: {
            total_entries: entriesCount || 0,
            expected_entries,
            percentage: expected_entries > 0 ? ((entriesCount || 0) / expected_entries) * 100 : 0
        },
        foodWaste,
        qualitativeScoringResults,
    }
  } catch (error) {
    logger.error('getDashboardData failed', errorSummary(error))
    return getEmptyData(['unknown'])
  }
}
async function fetchDashboardStats(orgId: string | null, subOrgId: string | null, year: number, granularity?: string | null) {
    try {
        // Drizzle doesn't support calling functions directly easily, so we use raw SQL
        // We need to handle nulls carefully in SQL string interpolation or parameters
        const result = await db.execute(sql`
            SELECT * FROM get_dashboard_stats(${orgId}, ${subOrgId}, ${year}, ${granularity ?? null})
        `)
        return { data: result.rows[0], error: null }
    } catch (e) {
        return { data: null, error: e }
    }
}

async function fetchBreakdown(organizationId: string | null, targetSubOrgId: string | undefined, accessibleSubOrgs: string[], year: number, roles: string[]): Promise<IndicatorDataWithRelations[]> {
    const conditions = getFilterConditions(organizationId, targetSubOrgId, accessibleSubOrgs, year, roles)

    return await db.query.indicatorData.findMany({
        where: and(...conditions),
        with: {
            subOrganization: {
                columns: { name: true }
            },
            organization: { // Include organization name
                columns: { name: true }
            }
        },
        orderBy: [desc(indicatorData.reportingYear), desc(indicatorData.reportingMonth)],
    }) as unknown as IndicatorDataWithRelations[]
}

async function fetchDataEntryCount(organizationId: string | null, targetSubOrgId: string | undefined, accessibleSubOrgs: string[], year: number, roles: string[]): Promise<number> {
    const conditions = getFilterConditions(organizationId, targetSubOrgId, accessibleSubOrgs, year, roles)

    const result = await db.select({
        count: sql<number>`
            COALESCE(SUM(CASE WHEN ${indicatorData.reportingMonth} = 0 THEN 12 WHEN ${indicatorData.periodKind} = 'quarter' THEN 3 ELSE 1 END), 0)
        `.as('count')
    })
        .from(indicatorData)
        .where(and(
            ...conditions,
            sql`app_private.has_operating_values(to_jsonb(indicator_data))`,
            sql`(${indicatorData.periodKind} = 'quarter' OR ${indicatorData.reportingMonth} > 0 OR (${indicatorData.reportingMonth} = 0 AND NOT EXISTS (
                SELECT 1 FROM indicator_data m
                WHERE m.sub_organization_id = ${indicatorData.subOrganizationId}
                  AND m.reporting_year = ${indicatorData.reportingYear}
                  AND m.superseded_at IS NULL AND (m.reporting_month > 0 OR m.period_kind = 'quarter')
                  AND app_private.has_operating_values(to_jsonb(m))
            )))`
        ))
    
    return Number(result[0]?.count) || 0
}

function getFilterConditions(organizationId: string | null, targetSubOrgId: string | undefined, accessibleSubOrgs: string[], year: number, roles: string[]) {
    const conditions = [eq(indicatorData.reportingYear, year)]

    if (organizationId) {
        conditions.push(eq(indicatorData.organizationId, organizationId!))
    } else if (!canViewAllOrgData(roles)) {
        // Non-admin without org: force empty result as safety net
        conditions.push(sql`1 = 0`)
    }
    conditions.push(...indicatorScopeConditions(indicatorData, { organizationId }))

    if (targetSubOrgId) {
        conditions.push(eq(indicatorData.subOrganizationId, targetSubOrgId))
    } else if (isSubOrganizationScoped(roles)) {
        // If user has no accessible sub-orgs, this query should ideally not run or return empty.
        // The main function handles the empty case, but for safety in SQL:
        if (accessibleSubOrgs.length > 0) {
            conditions.push(inArray(indicatorData.subOrganizationId, accessibleSubOrgs))
        } else {
            // Force empty result if no access
            conditions.push(sql`1 = 0`)
        }
    }

    return conditions
}

function calculateComparisons(current: DashboardOverview, previous: DashboardOverview) {
    const calcPct = (curr: number | null, prev: number | null) => {
        if (curr === null || !prev) return undefined
        return ((curr - prev) / prev) * 100
    }

    return {
        total_spend_pct_change: calcPct(current.total_spend, previous.total_spend),
        // Requirement says "Comparison to previous period (in %)". For a percentage metric (e.g. 50%), 
        // usually we show percentage point difference (e.g. +5% if it went 45->50) OR relative change (+11%).
        // Let's stick to simple relative change for now, OR valid point diff. 
        // For KPI cards, usually diff is better for percentages. 
        // Let's use simple subtraction for percentage based metrics (Points) and relative for absolute values?
        // Let's use relative for everything for consistency unless 0.
        // Actually, for things like "Plant Based %", if it goes 10% -> 12%, that is a +20% improvement or +2pp.
        // Let's implement relative change for all.
        plant_based_spend_pct_change: calcPct(current.plant_based_percentage, previous.plant_based_percentage),
        organic_spend_pct_change: calcPct(current.organic_percentage, previous.organic_percentage),
        fair_trade_spend_pct_change: calcPct(current.fair_trade_percentage, previous.fair_trade_percentage),
        regional_score_pct_change: calcPct(current.regional_scoring_result, previous.regional_scoring_result),
        seasonal_score_pct_change: calcPct(current.seasonal_scoring_result, previous.seasonal_scoring_result),
        guest_satisfaction_pct_change: calcPct(current.guest_satisfaction_scoring_result, previous.guest_satisfaction_scoring_result),
    }
}

function getEmptyData(roles: string[], orgName?: string, email?: string): DashboardData {
    return {
        overview: transformDashboardStats(null),
        comparisons: {
            total_spend_pct_change: 0,
            plant_based_spend_pct_change: 0,
            organic_spend_pct_change: 0,
            fair_trade_spend_pct_change: 0,
            regional_score_pct_change: 0,
            seasonal_score_pct_change: 0,
            guest_satisfaction_pct_change: 0,
            food_waste_pct_change: undefined
        },
        targets: INDICATOR_TARGETS,
        breakdown: [],
        availableYears: [],
        selectedYear: new Date().getFullYear(),
        userRoles: roles,
        userEmail: email,
        organizationName: orgName,
        dataEntryProgress: {
            total_entries: 0,
            expected_entries: 0,
            percentage: 0
        },
        foodWaste: calculateFoodWaste([]),
        qualitativeScoringResults: { regional: null, seasonal: null, guest_satisfaction: null },
    }
}
