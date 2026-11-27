'use client'

import { periodLabel, recordPeriod } from '@/lib/operating-data/periods'
import { describeFoodWaste } from '@/lib/indicators/food-waste'
import { useState, useEffect, useTransition } from 'react'
import { IndicatorDetailData, TrendDataPoint, getIndicatorTrendData } from '@/app/actions/indicators'
import { useSearchParams } from 'next/navigation'
import { CalculationBreakdown } from './calculation-breakdown'
import { TrendLineChart } from './trend-line-chart'
import { KPICard } from '@/components/dashboard/kpi-card'
import { ScoringPieChart } from './scoring-pie-chart'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency, formatNumber } from '@/lib/format-utils'
import { aggregateIndicator } from '@/lib/indicators/aggregation'
import { computeIndicatorValues } from '@/lib/indicators/compute'

type TrendPeriod = '3' | '6' | '12' | 'quarterly'

interface IndicatorDetailClientProps {
    data: IndicatorDetailData
}

export function IndicatorDetailClient({ data }: IndicatorDetailClientProps) {
    const searchParams = useSearchParams()
    const [, startTransition] = useTransition()

    // Get current selections from URL or Data
    const currentSubOrgId = searchParams.get('subOrgId') || "all"

    const currentOrganizationId = searchParams.get('organizationId') || undefined

    // Trend line chart state
    const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('12')
    const [trendData, setTrendData] = useState<TrendDataPoint[]>([])
    const [isTrendLoading, setIsTrendLoading] = useState(true)

    const isFixedPeriod = ['yearly', 'auto', 'quarterly'].includes(data.dataGranularity)
    const qualitativeOnly = ['regional_score', 'seasonal_score', 'guest_satisfaction'].includes(data.slug)

    // Fetch trend data on mount and when period/filters change
    useEffect(() => {
        // For yearly granularity, use server-provided trendData directly
        if (isFixedPeriod) {
            setTrendData(data.trendData.map(d => ({ period: d.month, value: d.value, target: d.target, foodWaste: d.foodWaste })))
            setIsTrendLoading(false)
            return
        }

        setIsTrendLoading(true)
        const months = trendPeriod === 'quarterly' ? 12 : parseInt(trendPeriod)
        const mode = trendPeriod === 'quarterly' ? 'quarterly' : 'monthly'
        const subOrg = currentSubOrgId === 'all' ? undefined : currentSubOrgId

        startTransition(async () => {
            try {
                const result = await getIndicatorTrendData(data.slug, months, subOrg, mode, currentOrganizationId)
                setTrendData(result)
            } catch (error) {
                console.error('Failed to load trend data:', error)
                setTrendData([])
            } finally {
                setIsTrendLoading(false)
            }
        })
    }, [data.slug, data.dataGranularity, data.trendData, trendPeriod, currentSubOrgId, currentOrganizationId, isFixedPeriod])

    return (
        <div className="space-y-6">
            {data.foodWaste && describeFoodWaste(data.foodWaste) && <p className="text-sm text-muted-foreground">{describeFoodWaste(data.foodWaste)}</p>}
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {!qualitativeOnly && <KPICard
                    title={data.title}
                    value={data.hasOperationalData ? data.summary.currentValue : null}
                    unit={data.summary.unit}
                    target={data.summary.target}
                    prevPeriodChange={data.summary.prevPeriodChange}
                />}
                {data.qualitativeScore !== null && data.qualitativeScore !== undefined && (
                    <ScoringPieChart score={data.qualitativeScore} target={qualitativeOnly ? data.summary.target : 100} />
                )}
            </div>

            <CalculationBreakdown organizationId={currentOrganizationId} key={`${data.reportingYear}:${data.requestedGranularity}:${currentSubOrgId}`} slug={data.slug} year={data.reportingYear} granularity={data.requestedGranularity} subOrgId={currentSubOrgId === 'all' ? undefined : currentSubOrgId} />

            {/* Multi-Period Trend Line Chart */}
            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold">Verlauf</h2>
                    {!isFixedPeriod && (
                        <Tabs value={trendPeriod} onValueChange={(v) => setTrendPeriod(v as TrendPeriod)}>
                            <TabsList>
                                <TabsTrigger value="3">3 Mon.</TabsTrigger>
                                <TabsTrigger value="6">6 Mon.</TabsTrigger>
                                <TabsTrigger value="12">12 Mon.</TabsTrigger>
                                <TabsTrigger value="quarterly">Quartale</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    )}
                </div>
                <TrendLineChart
                    data={trendData}
                    title={`${data.title} – ${isFixedPeriod ? `${data.dataGranularity === 'quarterly' ? 'Quartale' : 'Gesamt'} ${searchParams.get('year') || new Date().getFullYear()}` : trendPeriod === 'quarterly' ? 'Quartalsverlauf' : `Letzte ${trendPeriod} Monate`}`}
                    unit={data.summary.unit}
                    isLoading={isTrendLoading}
                />
            </div>

            {/* Detailed Data Table */}
            {!qualitativeOnly && <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Detaillierte Daten</h2>
                    {/* Placeholder for export */}
                    {/* <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4"/> Exportieren</Button> */}
                </div>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Monat</TableHead>
                                <TableHead>Unterorganisation</TableHead>
                                <TableHead className="text-right">{data.slug === 'food_waste' ? 'Abfallmenge (kg)' : 'Status Quo'}</TableHead>
                                <TableHead className="text-right">{data.slug === 'fair_trade_percentage' ? 'Einkauf relevante Kategorien' : 'Gesamteinkauf Lebensmittel'}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.breakdown.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                        Keine Daten für diese Auswahl gefunden.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                data.breakdown.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>
                                            {periodLabel(recordPeriod(row))}
                                        </TableCell>
                                        <TableCell>
                                            {row.subOrganization?.name || 'Unbekannt'}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            <DisplayValue row={row} slug={data.slug} unit={data.summary.unit} />
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {formatCurrency(data.slug === 'fair_trade_percentage' ? computeIndicatorValues(row, data.slug).denominator : row.totalFoodSpend === null ? null : Number(row.totalFoodSpend), 2)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>}
        </div>
    )
}

function DisplayValue({ row, slug, unit }: { row: any, slug: string, unit: string }) {
    const val = aggregateIndicator([row], slug)
    if (slug === 'food_waste') return <span>{val === null ? '-' : `${formatNumber(val, 1)} kg`}</span>

    if (val === null || val === undefined || isNaN(val)) return <span>-</span>

    if (slug === 'total_spend') return <span>{formatCurrency(val, 2)}</span>

    if (slug.includes('percentage')) {
        return <span>{formatNumber(val, 0)}%</span>
    }

    return <span>{formatNumber(val, 0)}{unit}</span>
}
