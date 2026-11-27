"use client"

import { periodLabel, periodMonths, recordPeriod } from '@/lib/operating-data/periods'
import { IndicatorDataWithRelations } from "@/app/actions/dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts"
import { formatPercentage } from '@/lib/format-utils'
import { INDICATOR_SHORT_LABELS } from "@/lib/indicators/indicators"
import { computeIndicatorPercentage } from "@/lib/indicators/compute"

interface ChartsSectionProps {
    data: IndicatorDataWithRelations[]
}

export function ChartsSection({ data }: ChartsSectionProps) {
    // Transform data for charts
    // Group by month? Or just show the list if it's single sub-org?
    // If Admin/Manager view, we might have multiple sub-orgs per month.
    // For MVP, let's just chart the specific entries we have.
    // Ideally we want meaningful trend lines.

    // Preparation: Sort by Date
    const sortedData = [...data].sort((a, b) => {
        if (a.reportingYear !== b.reportingYear) return a.reportingYear - b.reportingYear
        return periodMonths(recordPeriod(a))[0] - periodMonths(recordPeriod(b))[0]
    })

    // Map to chart friendly format
    const chartData = sortedData.map(item => {
        const row = item as unknown as Record<string, unknown>
        return {
            name: `${periodLabel(recordPeriod(item))} ${item.subOrganization?.name ?? ''}`,
            PlantBased: computeIndicatorPercentage('plant_based_percentage', row),
            Organic: computeIndicatorPercentage('organic_percentage', row),
            amt: Number(item.totalFoodSpend)
        }
    })

    if (chartData.length === 0) return null

    return (
        <Card className="col-span-4">
            <CardHeader>
                <CardTitle>Aktuelle Trends</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="name"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => formatPercentage(value)}
                            />
                            <Tooltip formatter={(value) => [typeof value === 'number' ? formatPercentage(value) : '-', '']} />
                            <Legend />
                            <Bar dataKey="PlantBased" fill="var(--chart-2)" radius={[4, 4, 0, 0]} name={`${INDICATOR_SHORT_LABELS['plant_based']} %`} />
                            <Bar dataKey="Organic" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name={`${INDICATOR_SHORT_LABELS['organic']} %`} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
