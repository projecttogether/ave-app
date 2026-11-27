import type { FoodWasteSummary } from './food-waste'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { transformDashboardStats } from './engine'
import type { DashboardOverview } from './types'

export async function getBenchmark(year: number, granularity: string = 'yearly') {
  const { rows } = await db.execute(sql`select get_benchmark_stats(${year}, ${granularity}) as benchmark`)
  const result = rows[0].benchmark as {
    stats: Partial<Record<keyof DashboardOverview, number | null>>
    qualitative: Partial<Record<'regional' | 'seasonal' | 'guest_satisfaction', number | null>>
    foodWaste?: FoodWasteSummary | null
  }
  const availableIndicators = Object.entries(result.stats).filter(([, value]) => value !== null)
    .map(([key]) => ({ plant_based_percentage: 'plant_based', organic_percentage: 'organic', fair_trade_percentage: 'fair_trade' }[key]))
    .filter((id): id is string => !!id)
  // The raw global food-waste total is never released; the matched reduction carries the comparison.
  if (result.foodWaste != null) availableIndicators.push('food_waste')
  for (const [key, value] of Object.entries(result.qualitative)) if (value !== null) availableIndicators.push(key)
  const stats = { ...result.stats, regional_scoring_result: result.qualitative.regional,
    seasonal_scoring_result: result.qualitative.seasonal, guest_satisfaction_scoring_result: result.qualitative.guest_satisfaction }
  return { foodWaste: result.foodWaste ?? null, overview: transformDashboardStats(stats as any), availableIndicators,
    qualitative: { regional: result.qualitative.regional ?? null, seasonal: result.qualitative.seasonal ?? null,
      guest_satisfaction: result.qualitative.guest_satisfaction ?? null } }
}
