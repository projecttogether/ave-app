'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine } from "recharts"
import { formatCurrency, formatPercentage, formatNumber } from '@/lib/format-utils'

interface TrendChartData {
    month: string // e.g. "Jan", "Feb" or "01/2025"
    value: number
    target?: number
}

interface TrendChartProps {
    data: TrendChartData[]
    title?: string
    unit?: string
    color?: string
}

export function TrendChart({ data, title = "Trendanalyse", unit = "", color = "#166534" }: TrendChartProps) {
    if (!data || data.length === 0) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Keine Daten für den gewählten Zeitraum verfügbar
                </CardContent>
            </Card>
        )
    }

    // Calculate max value for headroom
    const dataMax = Math.max(...data.map(d => d.value), 0)
    const targetVal = data.find(d => d.target !== undefined && d.target > 0)?.target ?? 0
    const overallMax = Math.max(dataMax, targetVal)
    const yAxisDomain = [0, Math.ceil(overallMax * 1.2 / 5) * 5] // Add 20% headroom and round to nearest 5

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[400px] w-full">
                    {/* Helper to format based on unit */}
                    {(() => {
                        const fmt = (val: number) => {
                            if (unit.trim() === '€') return formatCurrency(val, 0)
                            if (unit.trim() === '%') return formatPercentage(val)
                            return `${formatNumber(val)}${unit}`
                        }
                        return (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                    <XAxis
                                        dataKey="month"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                        tickFormatter={fmt}
                                        domain={yAxisDomain}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'hsl(var(--background))',
                                            borderRadius: '8px',
                                            border: '1px solid hsl(var(--border))',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                        }}
                                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                                        formatter={(value) => [typeof value === 'number' ? fmt(value) : '-', 'Wert']}
                                    />
                                    <Bar
                                        dataKey="value"
                                        fill={color}
                                        radius={[4, 4, 0, 0]}
                                        barSize={40}
                                    >
                                        {data.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={color} fillOpacity={0.8} />
                                        ))}
                                    </Bar>
                                    {targetVal > 0 && (
                                        <ReferenceLine
                                            y={targetVal}
                                            label={{
                                                value: `Ziel: ${fmt(targetVal)}`,
                                                position: 'insideTopRight', // Moved to ensure it doesn't float weirdly
                                                fill: '#ef4444',
                                                fontSize: 12,
                                                fontWeight: 'bold',
                                                dy: -10
                                            }}
                                            stroke="#ef4444"
                                            strokeDasharray="5 5"
                                            strokeWidth={2}
                                            ifOverflow="extendDomain"
                                        />
                                    )}
                                </BarChart>
                            </ResponsiveContainer>
                        )
                    })()}
                </div>
            </CardContent>
        </Card>
    )
}
