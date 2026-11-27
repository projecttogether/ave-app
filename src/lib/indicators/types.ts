import { indicatorData } from '@/lib/db/schema'
import { Database } from '@/types/database.types'

export type IndicatorData = typeof indicatorData.$inferSelect

export type IndicatorTargets = {
    total_spend: number
    plant_based_percentage: number
    organic_percentage: number
    fair_trade_percentage: number
    food_waste: number

    plant_based_scoring_result: number
    organic_scoring_result: number
    fair_trade_scoring_result: number
    food_waste_scoring_result: number
    regional_scoring_result: number
    seasonal_scoring_result: number
    guest_satisfaction_scoring_result: number
}

export type DashboardOverview = { [K in keyof IndicatorTargets]: number | null }

// Stats returned by the RPC function
export type DashboardOverviewStats = Database['public']['Functions']['get_dashboard_stats']['Returns']
