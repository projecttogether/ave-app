import { indicatorData } from '@/lib/db/schema'
import { FORMULA_POLICY } from './policy'

type IndicatorData = typeof indicatorData.$inferSelect

export type IndicatorConfig = Record<string, {
    title: string,
    description: string,
    unit: string,
    column?: keyof IndicatorData,
    computed?: boolean,
    calculation?: 'inverse_sum',
    spendColumn?: keyof IndicatorData,
    spendColumns?: (keyof IndicatorData)[],
    denominatorColumns?: (keyof IndicatorData)[],
    weights?: Partial<Record<keyof IndicatorData, number>>
}>

export const INDICATOR_CONFIG = FORMULA_POLICY.formulas as IndicatorConfig
