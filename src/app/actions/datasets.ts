'use server'

import { getUserScope, getReflectionOrganizationIds } from '@/lib/datasets/scope'
import { uuidSchema } from '@/lib/validation'
import { readOperatingDataset } from '@/lib/datasets/operating'

import { db } from '@/lib/db'
import {
  indicatorData,
  qualitativeResponses,
  subOrganizations,
  organizations,
} from '@/lib/db/schema'
import { eq, and, inArray, sql, desc, asc, count } from 'drizzle-orm'
import { isBasicUser, canViewAllOrgData } from '@/lib/roles'
import { SCORING_QUESTIONS } from '@/lib/qualitative/constants'
import { evaluateQuestionnaire } from '@/lib/questions/completion'

// --- Types ---

export type IndicatorDataSet = {
  subOrganizationId: string
  subOrganizationName: string
  organizationId: string
  organizationName: string
  year: number
  entryCount: number
  completeness: number // percentage
  lastUpdated: string | null
}

export type ScoringDataSet = {
  subOrganizationId: string
  subOrganizationName: string
  organizationId: string
  organizationName: string
  year: number
  responseCount: number
  completeness: number // percentage
  lastUpdated: string | null
}

export type IndicatorDataSetDetail = {
  id: string
  reportingMonth: number | null
  periodKind?: string | null
  periodIndex?: number | null
  totalFoodSpend: string | null
  meatSpend: string | null
  fishSpend: string | null
  dairySpend: string | null
  eggSpend: string | null
  mixedProductSpend: string | null
  organicSpend: string | null
  coffeeSpend: string | null
  cocoaSpend: string | null
  cocoaMixedSpend: string | null
  bananasSpend: string | null
  fairTradeCoffeeSpend: string | null
  fairTradeCocoaSpend: string | null
  fairTradeCocoaMixedSpend: string | null
  fairTradeBananasSpend: string | null
  regionalScore: string | null
  seasonalScore: string | null
  guestSatisfactionScore: string | null
  foodWasteAmount: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

export type ScoringDataSetDetail = {
  id: string
  indicatorSlug: string
  questionKey: string
  responseType: string | null
  responseText: string | null
  responseOption: string | null
  responseMultiple: string[] | null
  responseDate: Date | null
  createdAt: Date | null
  updatedAt: Date | null
}

// --- Indicator Data Sets (grouped by sub-org + year) ---

export async function getIndicatorDataSets(filters?: {
  organizationId?: string
  subOrganizationId?: string
  year?: number
}): Promise<IndicatorDataSet[]> {
  const { roles, organizationId, accessibleSubOrgIds } = await getUserScope({ organizationId: filters?.organizationId })

  return getIndicatorDataSetsForScope({ roles, organizationId, accessibleSubOrgIds }, filters)
}

async function getIndicatorDataSetsForScope(
  scope: {
    roles: string[]
    organizationId: string | null
    accessibleSubOrgIds: string[] | null
  },
  filters?: {
    organizationId?: string
    subOrganizationId?: string
    year?: number
  }
): Promise<IndicatorDataSet[]> {
  const { roles, organizationId, accessibleSubOrgIds } = scope

  const conditions = [sql`${indicatorData.supersededAt} IS NULL AND app_private.has_operating_values(to_jsonb(indicator_data))`]

  // Role-based scoping
  if (accessibleSubOrgIds !== null) {
    if (accessibleSubOrgIds.length === 0) return []
    conditions.push(inArray(indicatorData.subOrganizationId, accessibleSubOrgIds))
  }

  // Always enforce org scoping for non-global-admin users
  if (organizationId && !canViewAllOrgData(roles)) {
    conditions.push(eq(indicatorData.organizationId, organizationId))
  } else if (filters?.organizationId && canViewAllOrgData(roles)) {
    conditions.push(eq(indicatorData.organizationId, filters.organizationId))
  }

  if (filters?.subOrganizationId) {
    conditions.push(eq(indicatorData.subOrganizationId, filters.subOrganizationId))
  }

  if (filters?.year) {
    conditions.push(eq(indicatorData.reportingYear, filters.year))
  }

  const rows = await db
    .select({
      subOrganizationId: indicatorData.subOrganizationId,
      organizationId: indicatorData.organizationId,
      year: indicatorData.reportingYear,
      entryCount: count(indicatorData.id),
      covered: sql<number>`SUM(CASE WHEN ${indicatorData.periodKind}='quarter' THEN 3 ELSE 1 END)`,
      hasYearly: sql<number>`SUM(CASE WHEN ${indicatorData.reportingMonth} = 0 THEN 1 ELSE 0 END)`.as('has_yearly'),
      lastUpdated: sql<string>`MAX(${indicatorData.updatedAt})`.as('last_updated'),
      subOrgName: subOrganizations.name,
      orgName: organizations.name,
    })
    .from(indicatorData)
    .innerJoin(subOrganizations, eq(indicatorData.subOrganizationId, subOrganizations.id))
    .innerJoin(organizations, eq(indicatorData.organizationId, organizations.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(
      indicatorData.subOrganizationId,
      indicatorData.organizationId,
      indicatorData.reportingYear,
      subOrganizations.name,
      organizations.name,
    )
    .orderBy(desc(indicatorData.reportingYear), asc(subOrganizations.name))

  return rows.map(r => ({
    subOrganizationId: r.subOrganizationId,
    subOrganizationName: r.subOrgName,
    organizationId: r.organizationId,
    organizationName: r.orgName,
    year: r.year,
    entryCount: Number(r.entryCount),
    completeness: Number(r.hasYearly) > 0 
      ? 100 
      : Math.min(100, Math.round((Number(r.covered ?? r.entryCount) / 12) * 100)),
    lastUpdated: r.lastUpdated,
  }))
}

// --- Scoring Data Sets (grouped by org + year) ---

export async function getScoringDataSets(filters?: {
  organizationId?: string
  subOrganizationId?: string
  year?: number
}): Promise<ScoringDataSet[]> {
  const { roles, organizationId, accessibleSubOrgIds } = await getUserScope({ organizationId: filters?.organizationId })

  return getScoringDataSetsForScope({ roles, organizationId, accessibleSubOrgIds }, filters)
}

async function getScoringDataSetsForScope(
  scope: {
    roles: string[]
    organizationId: string | null
    accessibleSubOrgIds: string[] | null
  },
  filters?: {
    organizationId?: string
    subOrganizationId?: string
    year?: number
  }
): Promise<ScoringDataSet[]> {
  const { roles, organizationId, accessibleSubOrgIds } = scope

  const conditions = []

  // Role-based scoping
  if (accessibleSubOrgIds !== null) {
    if (accessibleSubOrgIds.length === 0) return []
    conditions.push(inArray(qualitativeResponses.subOrganizationId, accessibleSubOrgIds))
  }

  // Always enforce org scoping for non-global-admin users
  if (organizationId && !canViewAllOrgData(roles)) {
    conditions.push(eq(qualitativeResponses.organizationId, organizationId))
  } else if (filters?.organizationId && canViewAllOrgData(roles)) {
    conditions.push(eq(qualitativeResponses.organizationId, filters.organizationId))
  }

  if (filters?.subOrganizationId) {
    conditions.push(eq(qualitativeResponses.subOrganizationId, filters.subOrganizationId))
  }

  if (filters?.year) {
    conditions.push(eq(qualitativeResponses.reportingYear, filters.year))
  }

  const rows = await db
    .select({
      subOrganizationId: qualitativeResponses.subOrganizationId,
      organizationId: qualitativeResponses.organizationId,
      year: qualitativeResponses.reportingYear,
      questionKey: qualitativeResponses.questionKey,
      responseText: qualitativeResponses.responseText,
      responseOption: qualitativeResponses.responseOption,
      responseMultiple: qualitativeResponses.responseMultiple,
      responseDate: qualitativeResponses.responseDate,
      responseNumber: qualitativeResponses.responseNumber,
      updatedAt: qualitativeResponses.updatedAt,
      subOrgName: subOrganizations.name,
      orgName: organizations.name,
    })
    .from(qualitativeResponses)
    .innerJoin(subOrganizations, eq(qualitativeResponses.subOrganizationId, subOrganizations.id))
    .innerJoin(organizations, eq(qualitativeResponses.organizationId, organizations.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(qualitativeResponses.reportingYear), asc(subOrganizations.name))

  const grouped = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = `${row.organizationId}|${row.subOrganizationId}|${row.year}`
    const responses = grouped.get(key) ?? []
    responses.push(row)
    grouped.set(key, responses)
  }

  return Array.from(grouped.values(), responses => {
    const first = responses[0]
    const completion = evaluateQuestionnaire(SCORING_QUESTIONS, responses)
    const lastUpdated = responses.reduce<Date | null>((latest, response) => {
      if (!response.updatedAt) return latest
      return !latest || response.updatedAt > latest ? response.updatedAt : latest
    }, null)
    return {
      subOrganizationId: first.subOrganizationId,
      subOrganizationName: first.subOrgName,
      organizationId: first.organizationId,
      organizationName: first.orgName,
      year: first.year,
      responseCount: completion.answeredCount,
      completeness: completion.completeness,
      lastUpdated: lastUpdated?.toISOString() ?? null,
    }
  })
}

// --- Detail: Indicator data for a specific sub-org + year ---

/** Global readers may open any site's record; every other role is limited to its accessible sites (RLS hides foreign sites). */
async function authorizeDataSetDetail(subOrgId: string) {
  if (!uuidSchema.safeParse(subOrgId).success) throw new Error('Zugriff verweigert')
  const subOrg = await db.query.subOrganizations.findFirst({
    where: eq(subOrganizations.id, subOrgId),
    columns: { name: true, organizationId: true },
  })
  const { accessibleSubOrgIds } = await getUserScope({ organizationId: subOrg?.organizationId })
  if (!subOrg || (accessibleSubOrgIds !== null && !accessibleSubOrgIds.includes(subOrgId))) {
    throw new Error('Zugriff verweigert')
  }
  return subOrg
}

export async function getIndicatorDataSetDetail(
  subOrgId: string,
  year: number
): Promise<{ rows: IndicatorDataSetDetail[]; subOrgName: string }> {
  const subOrg = await authorizeDataSetDetail(subOrgId)

  const data = await readOperatingDataset({
    where: and(
      eq(indicatorData.subOrganizationId, subOrgId),
      eq(indicatorData.reportingYear, year),
    ),
    orderBy: [asc(indicatorData.reportingMonth)],
  })

  return {
    rows: data.map(d => ({
      id: d.id,
      reportingMonth: d.reportingMonth, periodKind: d.periodKind, periodIndex: d.periodIndex,
      totalFoodSpend: d.totalFoodSpend,
      meatSpend: d.meatSpend,
      fishSpend: d.fishSpend,
      dairySpend: d.dairySpend,
      eggSpend: d.eggSpend,
      mixedProductSpend: d.mixedProductSpend,
      organicSpend: d.organicSpend,
      coffeeSpend: d.coffeeSpend,
      cocoaSpend: d.cocoaSpend,
      cocoaMixedSpend: d.cocoaMixedSpend,
      bananasSpend: d.bananasSpend,
      fairTradeCoffeeSpend: d.fairTradeCoffeeSpend,
      fairTradeCocoaSpend: d.fairTradeCocoaSpend,
      fairTradeCocoaMixedSpend: d.fairTradeCocoaMixedSpend,
      fairTradeBananasSpend: d.fairTradeBananasSpend,
      regionalScore: d.regionalScoringResult,
      seasonalScore: d.seasonalScoringResult,
      guestSatisfactionScore: d.guestSatisfactionScoringResult,
      foodWasteAmount: d.foodWasteAmount,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
    subOrgName: subOrg?.name || 'Unbekannt',
  }
}

// --- Detail: Scoring data for a specific org + year ---

export async function getScoringDataSetDetail(
  subOrgId: string,
  year: number
): Promise<{ rows: ScoringDataSetDetail[]; subOrgName: string }> {
  const subOrg = await authorizeDataSetDetail(subOrgId)

  const data = await db.query.qualitativeResponses.findMany({
    where: and(
      eq(qualitativeResponses.subOrganizationId, subOrgId),
      eq(qualitativeResponses.reportingYear, year),
    ),
    orderBy: [asc(qualitativeResponses.indicatorSlug), asc(qualitativeResponses.questionKey)],
  })

  return {
    rows: data.map(d => ({
      id: d.id,
      indicatorSlug: d.indicatorSlug,
      questionKey: d.questionKey,
      responseType: d.responseType,
      responseText: d.responseText,
      responseOption: d.responseOption,
      responseMultiple: d.responseMultiple,
      responseDate: d.responseDate,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
    subOrgName: subOrg?.name || 'Unbekannt',
  }
}

// --- Helper: Get available organizations for filter dropdowns ---

export async function getDataSetsFilterOptions(): Promise<{
  organizations: { id: string; name: string }[]
  subOrganizations: { id: string; name: string; organizationId: string }[]
  years: number[]
  canViewReflection: boolean
}> {
  const { roles, organizationId, accessibleSubOrgIds } = await getUserScope()

  const options = await getDataSetsFilterOptionsForScope({ roles, organizationId, accessibleSubOrgIds })
  const reflectionIds = getReflectionOrganizationIds({ roles, organizationId })
  return { ...options, canViewReflection: reflectionIds === null || reflectionIds.length > 0 }
}

async function getDataSetsFilterOptionsForScope(scope: {
  roles: string[]
  organizationId: string | null
  accessibleSubOrgIds: string[] | null
}): Promise<{
  organizations: { id: string; name: string }[]
  subOrganizations: { id: string; name: string; organizationId: string }[]
  years: number[]
}> {
  const { roles, organizationId, accessibleSubOrgIds } = scope

  let orgs: { id: string; name: string }[] = []
  let subOrgs: { id: string; name: string; organizationId: string }[] = []

  if (canViewAllOrgData(roles) && !organizationId) {
    // Global read roles: all orgs + sub-orgs
    const allOrgs = await db.query.organizations.findMany({
      columns: { id: true, name: true },
      orderBy: (t, { asc }) => [asc(t.name)],
    })
    orgs = allOrgs
    const allSubs = await db.query.subOrganizations.findMany({
      columns: { id: true, name: true, organizationId: true },
      orderBy: (t, { asc }) => [asc(t.name)],
    })
    subOrgs = allSubs
  } else if (organizationId) {
    // Scoped to one org
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
      columns: { id: true, name: true },
    })
    if (org) orgs = [{ id: org.id, name: org.name }]
    const subs = await db.query.subOrganizations.findMany({
      where: eq(subOrganizations.organizationId, organizationId),
      columns: { id: true, name: true, organizationId: true },
      orderBy: (t, { asc }) => [asc(t.name)],
    })
    subOrgs = subs
  }

  // If org user, further filter sub-orgs to only accessible ones
  if (isBasicUser(roles) && accessibleSubOrgIds !== null) {
    subOrgs = subOrgs.filter(s => accessibleSubOrgIds.includes(s.id))
  }

  // Get distinct years scoped to accessible data
  const currentYear = new Date().getFullYear()

  if (accessibleSubOrgIds !== null && accessibleSubOrgIds.length === 0) {
    return { organizations: orgs, subOrganizations: subOrgs, years: [currentYear] }
  }

  const indicatorYearConditions = []
  const scoringYearConditions = []
  if (accessibleSubOrgIds !== null) {
    indicatorYearConditions.push(inArray(indicatorData.subOrganizationId, accessibleSubOrgIds))
    scoringYearConditions.push(inArray(qualitativeResponses.subOrganizationId, accessibleSubOrgIds))
  }

  const indicatorYearData = await db.selectDistinct({ year: indicatorData.reportingYear })
    .from(indicatorData)
    .where(indicatorYearConditions.length > 0 ? and(...indicatorYearConditions) : undefined)
    .orderBy(desc(indicatorData.reportingYear))

  const scoringYearData = await db.selectDistinct({ year: qualitativeResponses.reportingYear })
    .from(qualitativeResponses)
    .where(scoringYearConditions.length > 0 ? and(...scoringYearConditions) : undefined)
    .orderBy(desc(qualitativeResponses.reportingYear))

  const years = Array.from(new Set([
    currentYear,
    ...indicatorYearData.map(d => d.year),
    ...scoringYearData.map(d => d.year),
  ])).sort((a, b) => b - a)

  return { organizations: orgs, subOrganizations: subOrgs, years }
}
