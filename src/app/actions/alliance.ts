'use server'

import { comparableCoverage } from '@/lib/operating-data/coverage'
import { selectIndicatorRows } from '@/lib/indicators/aggregation'
import { periodMonths, recordPeriod } from '@/lib/operating-data/periods'

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import {  subOrganizations, indicatorData, qualitativeResponses, users, userRoles as userRolesTable } from '@/lib/db/schema'
import { eq, and, sql, desc, count, max, gte, inArray, notInArray } from 'drizzle-orm'
import { transformDashboardStats } from '@/lib/indicators/engine'
import { DashboardOverview } from '@/lib/indicators/types'
import { INDICATOR_TARGETS } from '@/lib/indicators/targets'
import { isAdmin } from '@/lib/roles'

// --- Types ---

export interface AllianceOrgSummary {
    orgId: string
    orgName: string
    orgType: string | null
    indicators: DashboardOverview
    previousIndicators: DashboardOverview
    dataEntryCount: number
    lastUploadDate: string | null
    lastLoginDate: string | null
    userCount: number
    subOrgCount: number
    riskFlags: string[]
}

export interface HeatmapCell {
    orgId: string
    orgName: string
    month: number // 0 = yearly cumulated, 1-12 = monthly
    operationalCount: number
    scoringCount: number // distinct sub-orgs with scoring data; only populated for month=0
}

export interface ActiveUsersBucket {
    days: number
    count: number
}

export interface AllianceHealthData {
    organizations: AllianceOrgSummary[]
    targets: DashboardOverview
    totalOrganizations: number
    totalUsers: number // non-admin users
    activeUsersSeries: ActiveUsersBucket[]
    heatmap: HeatmapCell[]
    availableYears: number[]
    selectedYear: number
}

// --- Main Action ---

export async function getAllianceHealthData(year?: number): Promise<AllianceHealthData> {
    // Auth guard. The admin page renders in parallel with its layout, so
    // redirect like the layout does.
    const session = await auth()
    if (!session?.user?.email) redirect('/login')

    const profile = await db.query.users.findFirst({
        where: eq(users.id, session.user.id!),
        with: { userRoles: { with: { role: true } } }
    })
    
    if (!profile) {
        throw new Error('Unauthorized: Profile not found')
    }
    const userRolesArray = profile.userRoles.map((ur: any) => ur.roleId)
    
    if (!isAdmin(userRolesArray)) {
        throw new Error('Unauthorized: Admin access required')
    }

    // Available years
    const yearData = await db.selectDistinct({ year: indicatorData.reportingYear })
        .from(indicatorData)
        .orderBy(desc(indicatorData.reportingYear))

    const currentYear = new Date().getFullYear()
    const availableYears = Array.from(new Set([
        2025, currentYear,
        ...(yearData.map(d => d.year))
    ])).sort((a, b) => b - a)

    const selectedYear = year ?? (availableYears.length > 0 ? availableYears[0] : currentYear)
    const prevYear = selectedYear - 1

    // Fetch all organizations
    const allOrgsRaw = await db.query.organizations.findMany({
        orderBy: (orgs, { asc }) => [asc(orgs.name)],
    })
    // Exclude orgs whose name contains "test" (case-insensitive) from all alliance-level metrics and displays
    const allOrgs = allOrgsRaw.filter(org => !org.name.toLowerCase().includes('test'))

    // Parallel: per-org stats, engagement, user info
    const orgSummaries: AllianceOrgSummary[] = await Promise.all(
        allOrgs.map(async (org) => {
            // Parallel fetch per org
            const [
                currentStats,
                prevStats,
                entryCountResult,
                lastUploadResult,
                userCountResult,
                subOrgCountResult,
                orgLastLoginResult,
                periodRows,
            ] = await Promise.all([
                fetchOrgStats(org.id, selectedYear),
                fetchOrgStats(org.id, prevYear),
                db.select({ count: count() })
                    .from(indicatorData)
                    .where(and(
                        eq(indicatorData.organizationId, org.id),
                        eq(indicatorData.reportingYear, selectedYear),
                        sql`${indicatorData.supersededAt} IS NULL AND app_private.has_operating_values(to_jsonb(indicator_data))`,
                    )),
                db.select({ maxDate: max(indicatorData.createdAt) })
                    .from(indicatorData)
                    .where(and(eq(indicatorData.organizationId, org.id), sql`${indicatorData.supersededAt} IS NULL`)),
                db.select({ count: count() })
                    .from(users)
                    .where(eq(users.organizationId, org.id)),
                db.select({ count: count() })
                    .from(subOrganizations)
                    .where(eq(subOrganizations.organizationId, org.id)),
                db.select({ maxLogin: max(users.lastLogin) })
                    .from(users)
                    .where(eq(users.organizationId, org.id)),
                db.query.indicatorData.findMany({ where: and(eq(indicatorData.organizationId, org.id), inArray(indicatorData.reportingYear, [selectedYear, prevYear]), sql`${indicatorData.supersededAt} IS NULL`) }),
            ])

            const indicators = transformDashboardStats(currentStats as any)
            const previousIndicators = transformDashboardStats(prevStats as any)
            const dataEntryCount = entryCountResult[0]?.count || 0
            const lastUpload = lastUploadResult[0]?.maxDate
            const lastLogin = orgLastLoginResult[0]?.maxLogin
            const userCount = userCountResult[0]?.count || 0
            const subOrgCount = subOrgCountResult[0]?.count || 0

            // Risk flag computation
            const riskFlags: string[] = []
            const now = new Date()
            const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

            if (!lastUpload || lastUpload < sixtyDaysAgo) {
                riskFlags.push('no_recent_data')
            }

            // Check if any indicator below 30% of target
            const indicatorKeys: (keyof DashboardOverview)[] = [
                'plant_based_percentage', 'organic_percentage', 'fair_trade_percentage',
                'regional_scoring_result', 'seasonal_scoring_result', 'guest_satisfaction_scoring_result',
            ]
            const hasLowIndicator = indicatorKeys.some(key => {
                const target = INDICATOR_TARGETS[key]
                if (target <= 0) return false
                return indicators[key] !== null && indicators[key] < target * 0.3
            })
            if (hasLowIndicator && dataEntryCount > 0) {
                riskFlags.push('below_target')
            }

            // Declining trend: current year average < previous year average.
            // Only compare indicators reported in both years, otherwise a gap in
            // reporting coverage would look like a decline.
            if (dataEntryCount > 0) {
                const comparable = indicatorKeys.filter(k => indicators[k] !== null && previousIndicators[k] !== null &&
                    (k.endsWith('_scoring_result') || comparableCoverage(selectIndicatorRows(periodRows.filter(row => row.reportingYear === selectedYear), k), selectIndicatorRows(periodRows.filter(row => row.reportingYear === prevYear), k))))
                if (comparable.length > 0) {
                    const currentAvg = comparable.reduce((sum, k) => sum + (indicators[k] as number), 0) / comparable.length
                    const prevAvg = comparable.reduce((sum, k) => sum + (previousIndicators[k] as number), 0) / comparable.length
                    if (prevAvg > 0 && currentAvg < prevAvg * 0.9) {
                        riskFlags.push('declining')
                    }
                }
            }

            if (!lastLogin || lastLogin < thirtyDaysAgo) {
                riskFlags.push('inactive_users')
            }

            return {
                orgId: org.id,
                orgName: org.name,
                orgType: org.type,
                indicators,
                previousIndicators,
                dataEntryCount,
                lastUploadDate: lastUpload ? lastUpload.toISOString() : null,
                lastLoginDate: lastLogin ? lastLogin.toISOString() : null,
                userCount,
                subOrgCount,
                riskFlags,
            }
        })
    )

    // Engagement heatmap: operational (indicatorData) + scoring (qualitativeResponses)
    // Reflection data (intakeResponses) is intentionally excluded
    const [operationalHeatmapRaw, scoringHeatmapRaw] = await Promise.all([
        db
            .select({
                orgId: indicatorData.organizationId,
                month: indicatorData.reportingMonth,
                periodKind: indicatorData.periodKind, periodIndex: indicatorData.periodIndex,
                count: sql<number>`COUNT(DISTINCT ${indicatorData.subOrganizationId})`,
            })
            .from(indicatorData)
            .where(and(
                eq(indicatorData.reportingYear, selectedYear),
                // Mirror fetchDataEntryCount logic: exclude yearly (month=0) records for
                // sub-orgs that already have monthly (month>0) data, so a sub-org that
                // used both modes isn't double-counted in the Year column.
                sql`${indicatorData.supersededAt} IS NULL AND app_private.has_operating_values(to_jsonb(indicator_data)) AND (${indicatorData.periodKind} = 'quarter' OR ${indicatorData.reportingMonth} > 0 OR (${indicatorData.reportingMonth} = 0 AND NOT EXISTS (
                    SELECT 1 FROM indicator_data m
                    WHERE m.sub_organization_id = ${indicatorData.subOrganizationId}
                      AND m.reporting_year = ${indicatorData.reportingYear}
                      AND m.superseded_at IS NULL AND (m.reporting_month > 0 OR m.period_kind = 'quarter')
                  AND app_private.has_operating_values(to_jsonb(m))
                )))`,
            ))
            .groupBy(indicatorData.organizationId, indicatorData.reportingMonth, indicatorData.periodKind, indicatorData.periodIndex),
        db
            .select({
                orgId: qualitativeResponses.organizationId,
                scoringCount: sql<string>`COUNT(DISTINCT ${qualitativeResponses.subOrganizationId})`,
            })
            .from(qualitativeResponses)
            .where(eq(qualitativeResponses.reportingYear, selectedYear))
            .groupBy(qualitativeResponses.organizationId),
    ])

    const orgIdSet = new Set(allOrgs.map(o => o.id))

    const scoringByOrg = new Map<string, number>()
    for (const row of scoringHeatmapRaw) {
        if (orgIdSet.has(row.orgId)) {
            scoringByOrg.set(row.orgId, Number(row.scoringCount))
        }
    }

    const heatmapMap = new Map<string, HeatmapCell>()
    // Heatmap cells represent coverage, not invented monthly measurements.
    for (const raw of operationalHeatmapRaw) {
      for (const month of raw.month === 0 ? [0] : periodMonths(recordPeriod({ reportingYear: selectedYear, reportingMonth: raw.month, periodKind: raw.periodKind, periodIndex: raw.periodIndex }))) {
        const row = { ...raw, month }

        if (!orgIdSet.has(row.orgId)) continue
        const existing = heatmapMap.get(`${row.orgId}:${row.month}`)
        heatmapMap.set(`${row.orgId}:${row.month}`, {
            orgId: row.orgId,
            orgName: allOrgs.find(o => o.id === row.orgId)?.name ?? row.orgId,
            month: row.month,
            operationalCount: Number(row.count) + (existing?.operationalCount ?? 0),
            scoringCount: 0,
        })
      }
    }

    // Attach scoring counts to month=0 cells (create the cell if no operational data exists)
    for (const [orgId, scoringCount] of scoringByOrg) {
        const key = `${orgId}:0`
        if (heatmapMap.has(key)) {
            heatmapMap.get(key)!.scoringCount = scoringCount
        } else {
            heatmapMap.set(key, {
                orgId,
                orgName: allOrgs.find(o => o.id === orgId)?.name ?? orgId,
                month: 0,
                operationalCount: 0,
                scoringCount,
            })
        }
    }

    const heatmap: HeatmapCell[] = Array.from(heatmapMap.values())

    // User stats: exclude admins/super_admins
    const adminUserIdsRaw = await db
        .select({ userId: userRolesTable.userId })
        .from(userRolesTable)
        .where(inArray(userRolesTable.roleId, ['admin', 'super_admin']))
    const adminUserIds = adminUserIdsRaw.map(r => r.userId)

    const nonAdminUserFilter = adminUserIds.length > 0
        ? notInArray(users.id, adminUserIds)
        : sql`true`

    const totalUsersResult = await db
        .select({ count: count() })
        .from(users)
        .where(nonAdminUserFilter)
    const totalUsers = totalUsersResult[0]?.count || 0

    const activeBuckets = [30, 60, 90, 120]
    const now = Date.now()
    const activeUsersSeries: ActiveUsersBucket[] = await Promise.all(
        activeBuckets.map(async (days) => {
            const threshold = new Date(now - days * 24 * 60 * 60 * 1000)
            const rows = await db
                .select({ count: count() })
                .from(users)
                .where(and(
                    nonAdminUserFilter,
                    gte(users.lastLogin, threshold),
                ))
            return { days, count: rows[0]?.count || 0 }
        })
    )

    return {
        organizations: orgSummaries,
        targets: INDICATOR_TARGETS,
        totalOrganizations: allOrgs.length,
        totalUsers,
        activeUsersSeries,
        heatmap,
        availableYears,
        selectedYear,
    }
}

// --- Helpers ---

async function fetchOrgStats(orgId: string, year: number) {
    try {
        const result = await db.execute(sql`
            SELECT * FROM get_dashboard_stats(${orgId}, ${null}, ${year}, ${null})
        `)
        return result.rows[0] || null
    } catch {
        return null
    }
}

