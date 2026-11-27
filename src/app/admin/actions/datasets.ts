'use server'

import { readOperatingDataset } from '@/lib/datasets/operating'

import { checkAdmin } from '@/app/admin/actions'
import { db } from '@/lib/db'
import {
  indicatorData,
  organizations,
  qualitativeResponses,
  subOrganizations,
} from '@/lib/db/schema'
import { and, asc, count, desc, eq, sql } from 'drizzle-orm'
import { getAllReflectionDataSets, getReflectionDataSetDetail } from '@/app/actions/reflection'
import { uuidSchema } from '@/lib/validation'
import { SCORING_QUESTIONS } from '@/lib/qualitative/constants'
import { evaluateQuestionnaire } from '@/lib/questions/completion'

export async function getAdminReflectionDataSets(organizationId?: string) {
  await checkAdmin()
  if (organizationId) uuidSchema.parse(organizationId)
  return getAllReflectionDataSets(organizationId ? { organizationId } : undefined)
}

export async function getAdminReflectionDataSetDetail(organizationId: string) {
  await checkAdmin()
  uuidSchema.parse(organizationId)
  return getReflectionDataSetDetail(organizationId)
}

export type AdminIndicatorDataSet = {
  subOrganizationId: string
  subOrganizationName: string
  organizationId: string
  organizationName: string
  year: number
  entryCount: number
  completeness: number
  lastUpdated: string | null
}

export type AdminScoringDataSet = {
  subOrganizationId: string
  subOrganizationName: string
  organizationId: string
  organizationName: string
  year: number
  responseCount: number
  completeness: number
  lastUpdated: string | null
}

export type AdminIndicatorDataSetDetail = {
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

export type AdminScoringDataSetDetail = {
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

type DataSetFilters = {
  organizationId?: string
  subOrganizationId?: string
  year?: number
}

export async function getAdminIndicatorDataSets(
  filters?: DataSetFilters,
): Promise<AdminIndicatorDataSet[]> {
  await checkAdmin()

  const conditions = [sql`${indicatorData.supersededAt} IS NULL AND app_private.has_operating_values(to_jsonb(indicator_data))`]
  if (filters?.organizationId) {
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
      organizationName: organizations.name,
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
    .orderBy(desc(indicatorData.reportingYear), asc(organizations.name), asc(subOrganizations.name))

  return rows.map(row => ({
    subOrganizationId: row.subOrganizationId,
    subOrganizationName: row.subOrgName,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    year: row.year,
    entryCount: Number(row.entryCount),
    completeness: Number(row.hasYearly) > 0
      ? 100
      : Math.min(100, Math.round((Number(row.covered ?? row.entryCount) / 12) * 100)),
    lastUpdated: row.lastUpdated,
  }))
}

export async function getAdminScoringDataSets(
  filters?: DataSetFilters,
): Promise<AdminScoringDataSet[]> {
  await checkAdmin()

  const conditions = []
  if (filters?.organizationId) {
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
      organizationName: organizations.name,
    })
    .from(qualitativeResponses)
    .innerJoin(subOrganizations, eq(qualitativeResponses.subOrganizationId, subOrganizations.id))
    .innerJoin(organizations, eq(qualitativeResponses.organizationId, organizations.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(qualitativeResponses.reportingYear), asc(organizations.name), asc(subOrganizations.name))

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
      organizationName: first.organizationName,
      year: first.year,
      responseCount: completion.answeredCount,
      completeness: completion.completeness,
      lastUpdated: lastUpdated?.toISOString() ?? null,
    }
  })
}

export async function getAdminIndicatorDataSetDetail(
  subOrgId: string,
  year: number,
): Promise<{ rows: AdminIndicatorDataSetDetail[]; subOrgName: string; organizationName: string }> {
  await checkAdmin()

  const subOrg = await db
    .select({
      name: subOrganizations.name,
      organizationName: organizations.name,
    })
    .from(subOrganizations)
    .innerJoin(organizations, eq(subOrganizations.organizationId, organizations.id))
    .where(eq(subOrganizations.id, subOrgId))
    .limit(1)

  const data = await readOperatingDataset({
    where: and(
      eq(indicatorData.subOrganizationId, subOrgId),
      eq(indicatorData.reportingYear, year),
    ),
    orderBy: [asc(indicatorData.reportingMonth)],
  })

  return {
    rows: data.map(row => ({
      id: row.id,
      reportingMonth: row.reportingMonth, periodKind: row.periodKind, periodIndex: row.periodIndex,
      totalFoodSpend: row.totalFoodSpend,
      meatSpend: row.meatSpend,
      fishSpend: row.fishSpend,
      dairySpend: row.dairySpend,
      eggSpend: row.eggSpend,
      mixedProductSpend: row.mixedProductSpend,
      organicSpend: row.organicSpend,
      coffeeSpend: row.coffeeSpend,
      cocoaSpend: row.cocoaSpend,
      cocoaMixedSpend: row.cocoaMixedSpend,
      bananasSpend: row.bananasSpend,
      fairTradeCoffeeSpend: row.fairTradeCoffeeSpend,
      fairTradeCocoaSpend: row.fairTradeCocoaSpend,
      fairTradeCocoaMixedSpend: row.fairTradeCocoaMixedSpend,
      fairTradeBananasSpend: row.fairTradeBananasSpend,
      regionalScore: row.regionalScoringResult,
      seasonalScore: row.seasonalScoringResult,
      guestSatisfactionScore: row.guestSatisfactionScoringResult,
      foodWasteAmount: row.foodWasteAmount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    subOrgName: subOrg[0]?.name || 'Unbekannt',
    organizationName: subOrg[0]?.organizationName || 'Unbekannt',
  }
}

export async function getAdminScoringDataSetDetail(
  subOrgId: string,
  year: number,
): Promise<{ rows: AdminScoringDataSetDetail[]; subOrgName: string; organizationName: string }> {
  await checkAdmin()

  const subOrg = await db
    .select({
      name: subOrganizations.name,
      organizationName: organizations.name,
    })
    .from(subOrganizations)
    .innerJoin(organizations, eq(subOrganizations.organizationId, organizations.id))
    .where(eq(subOrganizations.id, subOrgId))
    .limit(1)

  const data = await db.query.qualitativeResponses.findMany({
    where: and(
      eq(qualitativeResponses.subOrganizationId, subOrgId),
      eq(qualitativeResponses.reportingYear, year),
    ),
    orderBy: [asc(qualitativeResponses.indicatorSlug), asc(qualitativeResponses.questionKey)],
  })

  return {
    rows: data.map(row => ({
      id: row.id,
      indicatorSlug: row.indicatorSlug,
      questionKey: row.questionKey,
      responseType: row.responseType,
      responseText: row.responseText,
      responseOption: row.responseOption,
      responseMultiple: row.responseMultiple,
      responseDate: row.responseDate,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    subOrgName: subOrg[0]?.name || 'Unbekannt',
    organizationName: subOrg[0]?.organizationName || 'Unbekannt',
  }
}

export async function getAdminDataSetsFilterOptions(): Promise<{
  organizations: { id: string; name: string }[]
  subOrganizations: { id: string; name: string; organizationId: string }[]
  years: number[]
}> {
  await checkAdmin()

  const [allOrgs, allSubs, indicatorYears, scoringYears] = await Promise.all([
    db.query.organizations.findMany({
      columns: { id: true, name: true },
      orderBy: (table, { asc }) => [asc(table.name)],
    }),
    db.query.subOrganizations.findMany({
      columns: { id: true, name: true, organizationId: true },
      orderBy: (table, { asc }) => [asc(table.name)],
    }),
    db.selectDistinct({ year: indicatorData.reportingYear })
      .from(indicatorData)
      .orderBy(desc(indicatorData.reportingYear)),
    db.selectDistinct({ year: qualitativeResponses.reportingYear })
      .from(qualitativeResponses)
      .orderBy(desc(qualitativeResponses.reportingYear)),
  ])

  const currentYear = new Date().getFullYear()
  const years = Array.from(new Set([
    currentYear,
    ...indicatorYears.map(row => row.year),
    ...scoringYears.map(row => row.year),
  ])).sort((a, b) => b - a)

  return {
    organizations: allOrgs,
    subOrganizations: allSubs,
    years,
  }
}
