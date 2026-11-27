'use server'

import { publishOperatingTransaction } from '@/lib/operating-data/write'
import { recordPeriod, periodMonths, reportingToday } from '@/lib/operating-data/periods'
import { type FoodWasteResult, MAX_TREND_MONTHS } from '@/lib/indicators/food-waste'
import { readFoodWaste, readFoodWasteTrend } from '@/lib/indicators/food-waste-reader'
import { getDataScope } from '@/lib/access'
import { scopeContext, withDataScope } from '@/lib/db/scope-context'
import { getBenchmark } from '@/lib/indicators/benchmark'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { indicatorData, operatingReportingModes, subOrganizations, subOrganizationMembers, users } from '@/lib/db/schema'
import { eq, and, inArray, desc, asc, gte, lte, isNull } from 'drizzle-orm'
import { INDICATOR_TARGETS_BY_SLUG } from '@/lib/indicators/targets'
import { revalidatePath } from 'next/cache'
import { OVERVIEW_KEY_BY_CONFIG_SLUG } from '@/lib/indicators/engine'
import { isAdmin, isOrgManager, isOrgViewOnly, isSubOrganizationScoped, canViewAllOrgData, isViewOnly, isGlobalViewOnly } from '@/lib/roles'
import { isYearFrozen } from './data-freeze'
import { QUAL_SLUG_MAP } from '@/lib/qualitative/constants'
import { logger } from '@/lib/logger'
import { INPUT_FIELDS, normalizeIndicatorInput, validateAmount } from '@/lib/indicators/validation'
import { roundCalculation, decimal } from '@/lib/indicators/decimal'
import { z } from 'zod'
import { userFacingError } from '@/lib/errors'

// Types
// We should infer these from Drizzle schema, but for now we map manually to keep frontend compatible
type IndicatorData = typeof indicatorData.$inferSelect
type IndicatorDataHorizontal = typeof indicatorData.$inferInsert

import { comparableCoverage, fullYearCoverage } from '@/lib/operating-data/coverage'
import { aggregateIndicator, aggregateTrend, selectIndicatorRows } from '@/lib/indicators/aggregation'
import { loadQualitativeScores } from '@/lib/indicators/data'
import { indicatorScopeConditions, type IndicatorScope } from '@/lib/indicators/scope'

export type IndicatorDetailData = {
    reportingYear: number
    requestedGranularity: 'monthly' | 'yearly' | 'quarterly' | 'auto' | null
    slug: string
    title: string
    description: string
    dataGranularity: 'monthly' | 'yearly' | 'quarterly' | 'auto'
    trendData: {
        month: string
        value: number | null
        target?: number
        foodWaste?: FoodWasteResult
    }[]
    breakdown: (IndicatorData & { subOrganization: { name: string } | null })[]
    summary: {
        currentValue: number | null
        target: number
        unit: string
        prevPeriodChange?: number
        benchmarkValue?: number | null
        benchmarkLabel?: string
    }
    foodWaste?: FoodWasteResult
    qualitativeScore: number | null
    /** True if this indicator has actual rows with non-null operational values */
    hasOperationalData: boolean
    userRoles: string[]
    availableSubOrgs: { id: string, name: string }[]
    availableYears: number[]
}

export type TrendDataPoint = {
    period: string       // "Jan 2026", "Q1 2026"
    value: number | null
    change?: number      // period-over-period % change
    target?: number
    foodWaste?: FoodWasteResult
}

import { INDICATOR_CONFIG } from '@/lib/indicators/config'

// Existing Functions (Restored)

/**
 * Retrieves indicator data for a specific sub-organization and month.
 */
export async function getIndicatorAndBaseData(
    subOrganizationId: string,
    year: number,
    month: number
) {
    const session = await auth()
    if (!session?.user?.email) throw new Error('Nicht eingeloggt (getIndicatorAndBaseData)')
    await assertSubOrganizationAccess(session.user.id!, subOrganizationId, false)

    const [data, subOrg, reportingMode] = await Promise.all([
        db.query.indicatorData.findFirst({
            where: and(
                eq(indicatorData.subOrganizationId, subOrganizationId),
                eq(indicatorData.reportingYear, year),
                eq(indicatorData.reportingMonth, month), isNull(indicatorData.supersededAt)
            )
        }),
        db.query.subOrganizations.findFirst({
            where: eq(subOrganizations.id, subOrganizationId),
            columns: { foodWasteBaseDate: true, foodWasteBaseAmount: true, baselineRevision: true }
        }),
        db.query.operatingReportingModes.findFirst({ where: and(eq(operatingReportingModes.subOrganizationId, subOrganizationId), eq(operatingReportingModes.reportingYear, year)) })
    ]);

    return { indicatorData: data || null, baseData: subOrg || null, reportingMode: reportingMode?.mode ?? 'legacy', modeRevision: reportingMode?.revision ?? 0 }
}

/**
 * Saves (Insert or Update) indicator data.
 * Checks for existence to preserve created_by/created_at on updates.
 */
export async function saveIndicatorData(data: IndicatorDataHorizontal) {
    try {
        const session = await auth()
        if (!session?.user?.id) return { error: 'Nicht eingeloggt' }
        const access = await assertSubOrganizationAccess(session.user.id, data.subOrganizationId, true)
        if (access.error) return { error: access.error }
        if (access.subOrg?.organizationId !== data.organizationId) return { error: 'Organisations-ID stimmt nicht mit Sub-Organisation überein' }
        if (data.periodKind === 'quarter' || data.reportingMonth === null) return { error: 'Quartalswerte benötigen die Quartalserfassung.' }
        const period = recordPeriod({ reportingYear: data.reportingYear, reportingMonth: data.reportingMonth ?? 0 })
        if (await isYearFrozen(data.reportingYear)) return { error: 'Das Berichtsjahr ist gesperrt.' }
        for (const field of INPUT_FIELDS) {
            const issue = validateAmount(data[field], field, field)
            if (issue) return { error: issue.message }
        }
        const result = await db.transaction(tx => publishOperatingTransaction(tx, session.user!.id!, {
            requestId: crypto.randomUUID(), subOrganizationId: data.subOrganizationId, year: data.reportingYear, workflow: 'legacy',
            entries: [{ period, expectedRevision: data.revision ?? 0, values: normalizeIndicatorInput(data as Record<string, unknown>) }],
        }))
        revalidatePath('/dashboard')
        revalidatePath('/tasks')
        return { success: true, ...result }
    } catch (error) { return { error: userFacingError(error, 'Speichern fehlgeschlagen.') } }
}

export async function saveFoodWasteBaseData(subOrganizationId: string, baseDate: string | null, baseAmount: number | string | null, expectedRevision?: number, year?: number, requestId?: string) {
    try {
        const session = await auth()
        if (!session?.user?.id) return { error: 'Nicht eingeloggt.' }
        if (expectedRevision === undefined || year === undefined) return { error: 'Basiswert bitte neu laden und mit seiner Revision und dem Berichtsjahr speichern.' }
        const result = await db.transaction(tx => publishOperatingTransaction(tx, session.user!.id!, {
            subOrganizationId, year, requestId: requestId ?? crypto.randomUUID(), workflow: 'legacy', entries: [],
            baseline: { amount: baseAmount === null ? null : String(baseAmount), date: baseDate, expectedRevision },
        }))
        revalidatePath('/dashboard')
        revalidatePath('/tasks')
        return { success: true, ...result }
    } catch (error) { return { error: userFacingError(error, 'Speichern fehlgeschlagen.') } }
}

// New Functions

export async function getIndicatorDetails(slug: string, subOrgId?: string, year?: number, granularity?: 'monthly' | 'yearly' | 'quarterly' | 'auto', organizationId?: string): Promise<IndicatorDetailData | null> {
    const scope = await getDataScope({ organizationId, subOrganizationId: subOrgId })
    return withDataScope(scope, () => loadIndicatorDetails(slug, scope.subOrganizationId || undefined, year, granularity))
}

async function loadIndicatorDetails(
    slug: string,
    subOrgId?: string,
    year?: number,
    granularity?: 'monthly' | 'yearly' | 'quarterly' | 'auto'
): Promise<IndicatorDetailData | null> {
    const config = INDICATOR_CONFIG[slug]
    if (!config) return null

    const session = await auth()
    if (!session?.user?.email) throw new Error('Nicht eingeloggt (getIndicatorDetails)')
    const userId = session.user.id

    // Get user profile
    const profile = await db.query.users.findFirst({
        where: eq(users.id, userId!),
        with: { organization: true, userRoles: { with: { role: true } } }
    })

    if (!profile) throw new Error('Profile not found')
    const userRoles = profile.userRoles.map((ur: any) => ur.roleId)
    const effectiveOrganizationId = scopeContext.getStore()?.organizationId ?? (canViewAllOrgData(userRoles) ? null : profile.organizationId)

    logger.info('[getIndicatorDetails] access', { userId, orgId: effectiveOrganizationId, roles: userRoles, slug, subOrgId })

    if (!canViewAllOrgData(userRoles) && (isOrgManager(userRoles) || isOrgViewOnly(userRoles)) && !effectiveOrganizationId) {
        return null
    }

    // Safety net: non-admin users MUST have an organizationId
    if (!canViewAllOrgData(userRoles) && !effectiveOrganizationId) {
        logger.warn('[getIndicatorDetails] Non-admin without organizationId', { userId, roles: userRoles })
        return null
    }

    // 1. Fetch available years for selector
    const yearData = await db.select({ year: indicatorData.reportingYear })
        .from(indicatorData)
        .orderBy(desc(indicatorData.reportingYear))
    
    const availableYears = Array.from(new Set(yearData?.map(d => d.year) || []))
    const selectedYear = year || (availableYears[0] ?? new Date().getFullYear())

    // 2. Fetch available SubOrgs for selector (Manager/Admin/ViewOnly)
    let availableSubOrgs: { id: string, name: string }[] = []
    if ((isOrgManager(userRoles) || isOrgViewOnly(userRoles)) && effectiveOrganizationId) {
        const subOrgs = await db.query.subOrganizations.findMany({
            where: eq(subOrganizations.organizationId, effectiveOrganizationId),
            columns: { id: true, name: true }
        })
        availableSubOrgs = subOrgs || []
    }

    // Role based filtering logic
    let userSubOrgIds: string[] = []
    if (isSubOrganizationScoped(userRoles)) {
        const memberships = await db.query.subOrganizationMembers.findMany({
            where: eq(subOrganizationMembers.userId, userId!)
        })
        userSubOrgIds = memberships.map(m => m.subOrganizationId)
        if (userSubOrgIds.length === 0) return null // User has no sub-orgs
    }

    if (subOrgId) {
        if (isSubOrganizationScoped(userRoles) && !userSubOrgIds.includes(subOrgId)) {
            throw new Error('Unberechtigt: Nicht Mitglied dieser Sub-Organisation')
        }
        if ((canViewAllOrgData(userRoles) || isOrgManager(userRoles) || isOrgViewOnly(userRoles)) && effectiveOrganizationId) {
            const subOrg = await db.query.subOrganizations.findFirst({
                where: eq(subOrganizations.id, subOrgId),
                columns: { organizationId: true }
            })
            if (!subOrg || subOrg.organizationId !== effectiveOrganizationId) {
                throw new Error('Unberechtigt: Org-scoped User hat keinen Zugriff')
            }
        }
    }

    const scope: IndicatorScope = {
        organizationId: effectiveOrganizationId || null,
        subOrganizationId: subOrgId,
        accessibleSubOrgIds: isSubOrganizationScoped(userRoles) ? userSubOrgIds : undefined,
    }
    const scopeConditions = indicatorScopeConditions(indicatorData, scope)
    const [currentRows, previousRows, scores, globalStatsResult, foodWaste, previousFoodWaste] = await Promise.all([
        db.query.indicatorData.findMany({
            where: and(...scopeConditions, eq(indicatorData.reportingYear, selectedYear)),
            with: { subOrganization: true },
            orderBy: [asc(indicatorData.reportingMonth)],
        }),
        db.query.indicatorData.findMany({
            where: and(...scopeConditions, eq(indicatorData.reportingYear, selectedYear - 1)),
        }),
        granularity === 'monthly' || granularity === 'quarterly' ? Promise.resolve(null) : loadQualitativeScores(scope, selectedYear),
        getBenchmark(selectedYear, granularity ?? 'auto'),
        slug === 'food_waste' ? readFoodWaste(scope, selectedYear, granularity) : Promise.resolve(null),
        slug === 'food_waste' ? readFoodWaste(scope, selectedYear - 1, granularity) : Promise.resolve(null),
    ])
    const rows = selectIndicatorRows(currentRows, slug, granularity)
    const prevRows = selectIndicatorRows(previousRows, slug, granularity)
    const qualitativeOnly = ['regional_score', 'seasonal_score', 'guest_satisfaction'].includes(slug)
    const qualSlug = QUAL_SLUG_MAP[slug]
    const qualitativeScore = qualSlug ? scores?.[qualSlug] ?? null : null
    const valueFor = (data: typeof prevRows) => aggregateIndicator(data, slug)
    const summaryVal = qualitativeOnly ? qualitativeScore : slug === 'food_waste' ? foodWaste?.reduction ?? null : valueFor(rows)
    let prevVal = slug === 'food_waste' ? previousFoodWaste?.reduction ?? null : valueFor(prevRows)
    if (qualitativeOnly) {
        const previousScores = granularity === 'monthly' || granularity === 'quarterly' ? null : await loadQualitativeScores(scope, selectedYear - 1)
        prevVal = qualSlug ? previousScores?.[qualSlug] ?? null : null
    }
    const target = INDICATOR_TARGETS_BY_SLUG[slug] ?? 0
    const dataGranularity = granularity ?? (rows.some(row => row.periodKind === 'quarter') ? 'quarterly' : rows.some(row => row.reportingMonth === 0) || qualitativeOnly ? 'yearly' : 'monthly')
    const trendMode = dataGranularity === 'quarterly' || rows.some(row => row.periodKind === 'quarter') ? 'quarterly' : 'monthly'
    const trendData = dataGranularity === 'yearly' || dataGranularity === 'auto'
        ? [{ month: `Gesamt ${selectedYear}`, value: summaryVal, target, foodWaste: foodWaste ?? undefined }]
        : slug === 'food_waste'
            ? (await readFoodWasteTrend(scope, { year: selectedYear, month: 1 }, { year: selectedYear, month: 12 }, trendMode)).map(point => ({ month: point.period, value: roundCalculation(point.value), target, foodWaste: point.foodWaste }))
            : aggregateTrend(rows, slug, trendMode, target).map(point => ({ month: point.period, value: point.value, target }))
    const benchmarkOverview = globalStatsResult.overview
    const overviewKey = OVERVIEW_KEY_BY_CONFIG_SLUG[slug]
    const round = roundCalculation
    return {
        reportingYear: selectedYear,
        requestedGranularity: granularity ?? null,
        slug,
        title: config.title,
        description: config.description,
        dataGranularity,
        trendData,
        breakdown: qualitativeOnly ? [] : rows,
        summary: {
            currentValue: round(summaryVal),
            target,
            unit: config.unit,
            prevPeriodChange: (qualitativeOnly || comparableCoverage(rows, prevRows)) && summaryVal !== null && prevVal !== null && prevVal !== 0
                ? roundCalculation(decimal(summaryVal).minus(prevVal).times(100).div(decimal(prevVal).abs()).toNumber())! : undefined,
            benchmarkValue: slug === 'food_waste' || (!qualitativeOnly && !fullYearCoverage(rows)) ? null : round(benchmarkOverview[overviewKey] ?? null),
            benchmarkLabel: 'Globaler Durchschnitt',
        },
        foodWaste: foodWaste ?? undefined,
        qualitativeScore,
        hasOperationalData: !qualitativeOnly && summaryVal !== null,
        userRoles,
        availableSubOrgs,
        availableYears,
    }
}

/**
 * Fetches multi-month trend data across year boundaries for the trend line chart.
 * Returns an array of TrendDataPoint sorted chronologically.
 */
// Server Action arguments are untrusted. Each requested month becomes a trend
// bucket, so an unbounded range lets any user block the event loop.
const trendRequestSchema = z.object({
    slug: z.string().max(64).refine(slug => Object.hasOwn(INDICATOR_CONFIG, slug)),
    months: z.number().int().min(1).max(MAX_TREND_MONTHS),
    mode: z.enum(['monthly', 'quarterly']),
})

export async function getIndicatorTrendData(slug: string, months: number = 12, subOrgId?: string, mode: 'monthly' | 'quarterly' = 'monthly', organizationId?: string): Promise<TrendDataPoint[]> {
    const request = trendRequestSchema.parse({ slug, months, mode })
    const scope = await getDataScope({ organizationId, subOrganizationId: subOrgId })
    return withDataScope(scope, () => loadIndicatorTrendData(request.slug, request.months, scope.subOrganizationId || undefined, request.mode))
}

async function loadIndicatorTrendData(
    slug: string,
    months: number = 12,
    subOrgId?: string,
    mode: 'monthly' | 'quarterly' = 'monthly'
): Promise<TrendDataPoint[]> {
    const config = INDICATOR_CONFIG[slug]
    if (!config || ['regional_score', 'seasonal_score', 'guest_satisfaction'].includes(slug)) return []

    const session = await auth()
    if (!session?.user?.email) throw new Error('Nicht eingeloggt (getIndicatorTrendData)')
    const userId = session.user.id

    const profile = await db.query.users.findFirst({
        where: eq(users.id, userId!),
        with: { organization: true, userRoles: { with: { role: true } } }
    })
    if (!profile) throw new Error('Profile not found')
    const userRoles = profile.userRoles.map((ur: any) => ur.roleId)
    const effectiveOrganizationId = scopeContext.getStore()?.organizationId ?? (canViewAllOrgData(userRoles) ? null : profile.organizationId)

    if (!canViewAllOrgData(userRoles) && (isOrgManager(userRoles) || isOrgViewOnly(userRoles)) && !effectiveOrganizationId) {
        return []
    }

    // Safety net: non-admin users MUST have an organizationId
    if (!canViewAllOrgData(userRoles) && !effectiveOrganizationId) {
        logger.warn('[getIndicatorTrendData] Non-admin without organizationId', { userId, roles: userRoles })
        return []
    }

    // Calculate date range: last N months from today
    const now = reportingToday()
    const endYear = now.year
    const endMonth = now.month // 1-indexed

    // Go back `months` months; the range below is inclusive on both ends, so
    // the window starts months-1 before the current month (12 → 12 points)
    const startDate = new Date(endYear, endMonth - months, 1)
    const startYear = startDate.getFullYear()
    const startMonth = startDate.getMonth() + 1

    // Select complete native periods below; a quarter is never trimmed into months.
    const conditions = [gte(indicatorData.reportingYear, startYear), lte(indicatorData.reportingYear, endYear)]

    // Org scoping
    if (effectiveOrganizationId) {
        conditions.push(eq(indicatorData.organizationId, effectiveOrganizationId))
    } else if (!canViewAllOrgData(userRoles)) {
        return [] // non-admin without org: no data
    }

    // Role-based filtering
    if (isSubOrganizationScoped(userRoles)) {
        const memberships = await db.query.subOrganizationMembers.findMany({
            where: eq(subOrganizationMembers.userId, userId!)
        })
        const userSubOrgIds = memberships.map(m => m.subOrganizationId)
        if (userSubOrgIds.length === 0) return []
        if (subOrgId) {
            if (!userSubOrgIds.includes(subOrgId)) throw new Error('Unberechtigt: Trend-Daten (kein Mitglied)')
            conditions.push(eq(indicatorData.subOrganizationId, subOrgId))
        } else {
            conditions.push(inArray(indicatorData.subOrganizationId, userSubOrgIds))
        }
    } else if (subOrgId) {
        // Validate subOrgId belongs to the user's organization (mirrors getIndicatorDetails lines 360-368)
        if ((canViewAllOrgData(userRoles) || isOrgManager(userRoles) || isOrgViewOnly(userRoles)) && effectiveOrganizationId) {
            const subOrg = await db.query.subOrganizations.findFirst({
                where: eq(subOrganizations.id, subOrgId),
                columns: { organizationId: true }
            })
            if (!subOrg || subOrg.organizationId !== effectiveOrganizationId) {
                throw new Error('Unberechtigt: Org-scoped User hat keinen Zugriff auf Trend-Daten')
            }
        }
        conditions.push(eq(indicatorData.subOrganizationId, subOrgId))
    }

    conditions.push(...indicatorScopeConditions(indicatorData, { organizationId: effectiveOrganizationId || null }))

    const rows = await db.query.indicatorData.findMany({
        where: and(...conditions),
        orderBy: [asc(indicatorData.reportingYear), asc(indicatorData.reportingMonth)]
    })

    if (slug === 'food_waste') {
        return readFoodWasteTrend({ organizationId: effectiveOrganizationId || null,
            subOrganizationId: subOrgId, accessibleSubOrgIds: [...new Set(rows.map(row => row.subOrganizationId))] },
            { year: startYear, month: startMonth }, { year: endYear, month: endMonth }, mode)
    }
    return aggregateTrend(rows.filter(row => periodMonths(recordPeriod(row)).every(month => {
        const index = row.reportingYear * 12 + month
        return index >= startYear * 12 + startMonth && index <= endYear * 12 + endMonth
    })), slug, mode, INDICATOR_TARGETS_BY_SLUG[slug])
}

async function assertSubOrganizationAccess(userId: string, subOrganizationId: string, isWrite: boolean = false): Promise<{ subOrg?: typeof subOrganizations.$inferSelect, error?: string }> {
    const profile = await db.query.users.findFirst({
        where: eq(users.id, userId!),
        with: { userRoles: { with: { role: true } } }
    })
    if (!profile) throw new Error('Profile not found')
    const roles = profile.userRoles.map((ur: any) => ur.roleId)

    if (isWrite && isViewOnly(roles) && !isOrgManager(roles) && !isAdmin(roles)) {
        return { error: 'Keine Berechtigung zum Bearbeiten (View-Only)' }
    }

    const subOrg = await db.query.subOrganizations.findFirst({
        where: eq(subOrganizations.id, subOrganizationId),
    })
    if (!subOrg) throw new Error('Sub-organization not found')

    if (isSubOrganizationScoped(roles) && !isOrgManager(roles)) {
        const membership = await db.query.subOrganizationMembers.findFirst({
            where: and(
                eq(subOrganizationMembers.userId, userId!),
                eq(subOrganizationMembers.subOrganizationId, subOrganizationId)
            ),
            columns: { userId: true }
        })
        if (!membership) throw new Error('Unberechtigt: User ist kein Mitglied')
    } else if (canViewAllOrgData(roles)) {
        if (isWrite) {
            if (!profile.organizationId || profile.organizationId !== subOrg.organizationId) {
                throw new Error('Unberechtigt: Admin darf nur Daten der eigenen Organisation bearbeiten')
            }
        } else {
            if (!isGlobalViewOnly(roles) && profile.organizationId && profile.organizationId !== subOrg.organizationId) {
                throw new Error('Unberechtigt: Org-scoped Admin darf diese Sub-Organisation nicht lesen')
            }
        }
    } else if (isOrgManager(roles) || isOrgViewOnly(roles)) {
        if (!profile.organizationId || profile.organizationId !== subOrg.organizationId) {
            throw new Error('Unberechtigt: Manager darf diese Sub-Organisation nicht bearbeiten')
        }
    } else {
        throw new Error('Unberechtigt: Unbekannte Rolle(n) - ' + roles.join(','))
    }

    return { subOrg }
}
