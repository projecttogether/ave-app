'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    ResponsiveContainer,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ReferenceLine,
    Area,
    AreaChart,
} from "recharts"
import { formatCurrency, formatPercentage, formatNumber } from '@/lib/format-utils'
import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from 'lucide-react'
import { TrendDataPoint } from '@/app/actions/indicators'
import { indicatorChartDomain } from '@/lib/indicators/chart-domain'
import { describeFoodWaste } from '@/lib/indicators/food-waste'

interface TrendLineChartProps {
    data: TrendDataPoint[]
    title?: string
    unit?: string
    isLoading?: boolean
}

export function TrendLineChart({
    data,
    title = "Verlauf",
    unit = "",
    isLoading = false,
}: TrendLineChartProps) {
    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-[350px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Daten werden geladen…
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (!data || !data.some(point => point.value !== null)) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-[350px] text-muted-foreground">
                    Keine Verlaufsdaten verfügbar
                </CardContent>
            </Card>
        )
    }

    // Get latest change for the header badge
    const latestPoint = data[data.length - 1]
    const latestChange = latestPoint?.change

    const targetVal = data.find(d => d.target !== undefined && d.target !== 0)?.target
    const { min: yMin, max: yMax } = indicatorChartDomain(data.map(d => d.value), targetVal)
    const lowerIsBetter = targetVal !== undefined && targetVal < 0
    const improving = (change: number) => lowerIsBetter ? change < 0 : change > 0

    // Formatter – 1 decimal for progress chart display
    const fmt = (val: number | null) => {
        if (val === null) return "Nicht berechenbar"
        if (unit.trim() === '€') return formatCurrency(val, 0)
        if (unit.trim() === '%') return `${formatNumber(val, 1)}%`
        return `${formatNumber(val, 1)}${unit}`
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>{title}</CardTitle>
                {latestChange !== undefined && latestChange !== null && (
                    <ChangeBadge change={latestChange} lowerIsBetter={lowerIsBetter} />
                )}
            </CardHeader>
            <CardContent>
                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis
                                dataKey="period"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                                dy={10}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                domain={[yMin, yMax]}
                                width={targetVal !== undefined ? 80 : 50}
                                ticks={targetVal !== undefined ? [...Array.from({ length: 5 }, (_, i) => Math.round(yMin + (i * (yMax - yMin)) / 4)), targetVal] : undefined}
                                tick={(props: any) => {
                                    const { x, y, payload } = props
                                    const isGoal = targetVal !== undefined && payload.value === targetVal
                                    const label = isGoal ? `Ziel: ${fmt(payload.value)}` : fmt(payload.value)
                                    return (
                                        <text
                                            x={x}
                                            y={y}
                                            dy={4}
                                            textAnchor="end"
                                            fontSize={isGoal ? 11 : 12}
                                            fontWeight={isGoal ? 'bold' : 'normal'}
                                            fill={isGoal ? '#ef4444' : 'hsl(var(--muted-foreground))'}
                                        >
                                            {label}
                                        </text>
                                    )
                                }}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--background))',
                                    borderRadius: '8px',
                                    border: '1px solid hsl(var(--border))',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    padding: '12px'
                                }}
                                content={({ active, payload }) => {
                                    if (!active || !payload || payload.length === 0) return null
                                    const point = payload[0]?.payload as TrendDataPoint
                                    return (
                                        <div style={{
                                            backgroundColor: 'hsl(var(--background))',
                                            borderRadius: '8px',
                                            border: '1px solid hsl(var(--border))',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                            padding: '12px',
                                            minWidth: '140px'
                                        }}>
                                            <p className="text-sm font-semibold mb-1">{point.period}</p>
                                            <p className="text-sm">
                                                <span className="text-muted-foreground">Wert: </span>
                                                <span className="font-medium">{fmt(point.value)}</span>
                                            </p>
                                            {point.change !== undefined && (
                                                <p className="text-xs mt-1">
                                                    <span className="text-muted-foreground">Veränderung: </span>
                                                    <span className={point.change === 0 ? 'text-muted-foreground' : improving(point.change) ? 'text-green-600' : 'text-red-600'}>
                                                        {point.change > 0 ? '↑' : point.change < 0 ? '↓' : '–'} {formatPercentage(Math.abs(point.change))}
                                                    </span>
                                                </p>
                                            )}
                                            {describeFoodWaste(point.foodWaste) && <p className="text-xs mt-1">{describeFoodWaste(point.foodWaste)}</p>}
                                        </div>
                                    )
                                }}
                            />
                            <Area
                                connectNulls={false}
                                type="monotone"
                                dataKey="value"
                                stroke="hsl(142, 76%, 36%)"
                                strokeWidth={2.5}
                                fill="url(#trendGradient)"
                                dot={(props: any) => {
                                    const { cx, cy, payload } = props
                                    if (payload?.value == null) return <g key={props.index} />
                                    const change = payload?.change
                                    let fillColor = 'hsl(142, 76%, 36%)'
                                    if (change !== undefined && change !== 0) fillColor = improving(change) ? '#16a34a' : '#ef4444'
                                    return (
                                        <circle
                                            key={props.index}
                                            cx={cx}
                                            cy={cy}
                                            r={4}
                                            fill={fillColor}
                                            stroke="#fff"
                                            strokeWidth={2}
                                        />
                                    )
                                }}
                                activeDot={{
                                    r: 6,
                                    stroke: 'hsl(142, 76%, 36%)',
                                    strokeWidth: 2,
                                    fill: '#fff'
                                }}
                            />
                            {targetVal !== undefined && (
                                <ReferenceLine
                                    y={targetVal}
                                    stroke="#ef4444"
                                    strokeDasharray="5 5"
                                    strokeWidth={2}
                                    ifOverflow="extendDomain"
                                />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}

function ChangeBadge({ change, lowerIsBetter }: { change: number; lowerIsBetter: boolean }) {
    if (change === 0) {
        return (
            <div className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <MinusIcon className="h-3 w-3" />
                Unverändert
            </div>
        )
    }

    const isPositive = change > 0
    const isImprovement = lowerIsBetter ? !isPositive : isPositive
    const Icon = isPositive ? ArrowUpIcon : ArrowDownIcon

    return (
        <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${isImprovement
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>
            <Icon className="h-3 w-3" />
            {formatPercentage(Math.abs(change))} vs. Vorperiode
        </div>
    )
}
