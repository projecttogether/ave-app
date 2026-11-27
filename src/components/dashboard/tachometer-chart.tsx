'use client'

import { PieChart, Pie, Cell, Label } from 'recharts'
import { formatCurrency, formatNumber } from '@/lib/format-utils'

interface TachometerChartProps {
    value: number | null | undefined
    target?: number
    max?: number
    unit?: string
}

/** Returns a color based on progress (0–1). No target → neutral teal. */
function getProgressColor(progress: number, hasTarget: boolean): string {
    if (!hasTarget) return '#10b981'   // teal-500 default
    const p = Math.min(Math.max(progress, 0), 1)
    if (p < 0.33) return '#ef4444'    // red-500
    if (p < 0.66) return '#f2733c'    // primary orange
    if (p < 1.0)  return '#84cc16'    // lime-500
    return '#22c55e'                   // green-500
}

function formatDisplayValue(value: number, unit: string): string {
    const u = (unit || '').trim()
    if (u === '€') return formatCurrency(value, 0)
    // All indicator scores: always show as integers (no decimals)
    const rounded = Math.round(value)
    const display = formatNumber(rounded, 0)
    if (u === '%') return `${display}%`
    return u ? `${display}\u00a0${u}` : display
}

const CHART_SIZE = 180
// Background arc color — semi-transparent so it works in light & dark mode
const MUTED_ARC = 'rgba(0,0,0,0.10)'

export function TachometerChart({ value, target, max = 100, unit = '' }: TachometerChartProps) {
    // No-data state: render a muted empty ring with "Keine Daten"
    const hasValue = value !== null && value !== undefined

    if (!hasValue) {
        const noDataRing = [{ name: 'full', value: 1 }]
        return (
            <PieChart width={CHART_SIZE} height={CHART_SIZE}>
                <Pie
                    data={noDataRing}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius="72%"
                    outerRadius="87%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    strokeWidth={0}
                    isAnimationActive={false}
                >
                    <Cell fill={MUTED_ARC} />
                    <Label
                        content={({ viewBox }) => {
                            if (!viewBox || !('cx' in viewBox)) return null
                            const cx = (viewBox.cx ?? 0) as number
                            const cy = (viewBox.cy ?? 0) as number
                            return (
                                <text textAnchor="middle">
                                    <tspan
                                        x={cx}
                                        y={cy}
                                        fontSize={11}
                                        fontWeight={500}
                                        dominantBaseline="middle"
                                        fill="currentColor"
                                        opacity={0.4}
                                    >
                                        Keine Daten
                                    </tspan>
                                </text>
                            )
                        }}
                    />
                </Pie>
            </PieChart>
        )
    }

    const hasTarget = target !== undefined && target !== null && target !== 0
    const progress = hasTarget
        ? value / (target as number)
        : (max !== 0 ? value / max : 0)

    // Clamp visual fill 0–100% (ring can't go backwards or overflow)
    const visualProgress = Math.max(0, Math.min(progress, 1))
    const ringColor = getProgressColor(progress, hasTarget)

    // Full-circle ring: start at top (90°), sweep clockwise all the way around (−270°)
    // The two Cell proportions fill the full 360° naturally.
    const data = [
        { name: 'filled',    value: visualProgress },
        { name: 'remaining', value: Math.max(0, 1 - visualProgress) },
    ]

    const valueText = formatDisplayValue(value, unit)
    const goalText  = hasTarget ? `/ ${formatDisplayValue(target as number, unit)}` : ''

    // Shrink font if the text is long so it never overflows the inner ring area
    // Inner diameter ≈ 72% × 87% × CHART_SIZE ≈ 112px
    const valueFontSize =
        valueText.length > 10 ? 13
        : valueText.length > 8  ? 15
        : valueText.length > 6  ? 17
        : 20

    return (
        <PieChart width={CHART_SIZE} height={CHART_SIZE}>
            <Pie
                data={data}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius="72%"
                outerRadius="87%"
                startAngle={90}
                endAngle={-270}   // full clockwise circle
                stroke="none"
                strokeWidth={0}
                isAnimationActive={false}
            >
                <Cell fill={ringColor} />
                <Cell fill={MUTED_ARC} />
                <Label
                    content={({ viewBox }) => {
                        if (!viewBox || !('cx' in viewBox)) return null
                        const cx = (viewBox.cx ?? 0) as number
                        const cy = (viewBox.cy ?? 0) as number
                        const yValue = goalText ? cy - 9 : cy
                        const yGoal  = cy + valueFontSize - 2

                        return (
                            <text textAnchor="middle">
                                <tspan
                                    x={cx}
                                    y={yValue}
                                    fontSize={valueFontSize}
                                    fontWeight={700}
                                    dominantBaseline="middle"
                                    fill="currentColor"
                                >
                                    {valueText}
                                </tspan>
                                {goalText && (
                                    <tspan
                                        x={cx}
                                        y={yGoal}
                                        fontSize={11}
                                        dominantBaseline="middle"
                                        fill="currentColor"
                                        opacity={0.5}
                                    >
                                        {goalText}
                                    </tspan>
                                )}
                            </text>
                        )
                    }}
                />
            </Pie>
        </PieChart>
    )
}
