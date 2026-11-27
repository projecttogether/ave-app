'use client'

import { AvailableRadarShape } from './available-radar-shape'
import { describeFoodWaste } from '@/lib/indicators/food-waste'
import { ComparisonData } from '@/app/actions/comparison'
import { INDICATORS } from '@/lib/indicators/indicators'
import { computeIndicatorProgress } from '@/lib/indicators/engine'
import {
    Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, Tooltip, Legend } from 'recharts'

const ORG_COLOR    = '#3b82f6'
const GLOBAL_COLOR = '#f97316'

const chartConfig = {
    org:    { label: 'Organisation', color: ORG_COLOR },
    global: { label: 'AVE gesamt',   color: GLOBAL_COLOR },
} satisfies ChartConfig

interface RadarComparisonChartProps { data: ComparisonData }

export function RadarComparisonChart({ data }: RadarComparisonChartProps) {
    const orgName = data.organizationName || 'Organisation'

    const chartData = INDICATORS.map((ind) => {
        const orgResult = computeIndicatorProgress(
            ind.id,
            data.orgOverview,
            data.targets,
            data.foodWasteOrg,
            data.orgQualScoring,
        )
        const globalResult = computeIndicatorProgress(
            ind.id,
            data.globalOverview,
            data.targets,
            data.foodWasteGlobal,
            data.globalQualScoring,
        )

        return {
            indicator: ind.name,
            fullName: ind.name,
                org: orgResult.dataSource === 'none' ? null : orgResult.progress,
                global: data.benchmarkAvailableIndicators.includes(ind.id) && globalResult.dataSource !== 'none' ? globalResult.progress : null,
            orgSource: orgResult.dataSource,
            glSource: globalResult.dataSource,
        }
    })

    const sourceLabel = (s: string) =>
        s === 'scoring' ? 'Scoring-Fragen' : s === 'operational' ? 'Betriebsdaten' : '–'

    return (
        <Card>
            <CardHeader className="items-center">
                <CardTitle>Vergleich AVE gesamt</CardTitle>
                <CardDescription>
                    Zielerreichung im Vergleich mit AVE gesamt (Zielwert = 100%)
                    {data.benchmarkAvailableIndicators.length < INDICATORS.length && (
                        <span className="block">Vergleichswerte werden erst ab fünf beitragenden Organisationen angezeigt.</span>
                    )}
                </CardDescription>
                <CardDescription>{orgName}: {describeFoodWaste(data.foodWasteOrg) || 'Abfalldaten vollständig berücksichtigt.'}</CardDescription>
                <CardDescription>AVE gesamt: {data.foodWasteGlobal ? describeFoodWaste(data.foodWasteGlobal) || 'Abfalldaten vollständig berücksichtigt.' : 'Benchmark nicht verfügbar: Weniger als fünf Organisationen mit gültiger Vergleichsbasis.'}</CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[350px]">
                    <RadarChart data={chartData} margin={{ top: 20, bottom: 20, left: 80, right: 80 }}>
                        <Tooltip
                            content={({ payload, label }) => {
                                if (!payload?.length) return null
                                const pt = payload[0]?.payload
                                return (
                                    <div className="rounded-lg border bg-background p-2 shadow-sm text-xs space-y-1">
                                        <p className="font-medium">{pt?.fullName ?? label}</p>
                                        {payload.map((p, i) => (
                                            <div key={i} className="flex items-center gap-1.5">
                                                <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.stroke }} />
                                                <span>
                                                    {p.dataKey === 'org' ? orgName : 'AVE gesamt'}
                                                    {' · '}
                                                    {sourceLabel(p.dataKey === 'org' ? pt?.orgSource : pt?.glSource)}
                                                    {': '}
                                                    <strong>{p.value == null ? "Nicht berechenbar" : `${p.value}%`}</strong>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )
                            }}
                        />
                        <PolarAngleAxis dataKey="indicator" tick={{ fontSize: 12, fill: 'var(--foreground)' }} />
                        <PolarGrid />

                        <Radar
                            shape={AvailableRadarShape}
                            activeDot={false}
                            dataKey="org"
                            name={orgName}
                            fill={ORG_COLOR}
                            fillOpacity={0.25}
                            stroke={ORG_COLOR}
                            strokeWidth={2}
                        />
                        <Radar
                            shape={AvailableRadarShape}
                            activeDot={false}
                            dataKey="global"
                            name="AVE gesamt"
                            fill={GLOBAL_COLOR}
                            fillOpacity={0.1}
                            stroke={GLOBAL_COLOR}
                            strokeWidth={2}
                        />

                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                    </RadarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    )
}
