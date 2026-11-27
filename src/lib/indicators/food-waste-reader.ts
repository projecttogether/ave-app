import 'server-only'

import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { indicatorData, subOrganizations } from '@/lib/db/schema'
import { calculateFoodWaste, calculateFoodWasteTrend } from './food-waste'

import { indicatorScopeConditions, type IndicatorScope } from './scope'

export type FoodWasteScope = IndicatorScope

async function readRecords(scope: FoodWasteScope, firstYear: number, lastYear: number) {
  const conditions = [gte(indicatorData.reportingYear, firstYear), lte(indicatorData.reportingYear, lastYear),
    ...indicatorScopeConditions(indicatorData, scope)]
  const rows = await db.select({
    subOrganizationId: indicatorData.subOrganizationId,
    reportingYear: indicatorData.reportingYear,
    reportingMonth: indicatorData.reportingMonth,
    periodKind: indicatorData.periodKind, periodIndex: indicatorData.periodIndex,
    foodWasteAmount: indicatorData.foodWasteAmount,
    baseline: subOrganizations.foodWasteBaseAmount,
  }).from(indicatorData)
    .innerJoin(subOrganizations, eq(indicatorData.subOrganizationId, subOrganizations.id))
    .where(and(...conditions))
  return rows
}

export async function readFoodWaste(scope: FoodWasteScope, year: number, granularity?: string | null) {
  return calculateFoodWaste(await readRecords(scope, year, year), granularity)
}

export async function readFoodWasteTrend(
  scope: FoodWasteScope,
  start: { year: number; month: number },
  end: { year: number; month: number },
  mode: 'monthly' | 'quarterly' = 'monthly',
) {
  return calculateFoodWasteTrend(await readRecords(scope, start.year, end.year), start, end, mode)
}
