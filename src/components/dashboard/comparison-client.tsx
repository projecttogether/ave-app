'use client'

import { AvailableRadarShape } from './available-radar-shape'
import { describeFoodWaste } from '@/lib/indicators/food-waste'
import { ComparisonData } from '@/app/actions/comparison'
import { INDICATORS, INDICATOR_SHORT_LABELS } from '@/lib/indicators/indicators'
import { computeIndicatorProgress } from '@/lib/indicators/engine'
import { useContent } from '@/components/providers/content-provider'
import { EditableText } from '@/components/editable-text'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart'

import {
    Bar,
    BarChart,
    CartesianGrid,
    XAxis,
    YAxis,
    PolarAngleAxis,
    PolarGrid,
    Radar,
    RadarChart,
    Legend,
} from 'recharts'



interface ComparisonClientProps {
    data: ComparisonData
}

export function ComparisonClient({ data }: ComparisonClientProps) {
    const t = useContent()

    const orgName = data.organizationName || 'Organisation'
    const barChartConfig = {
        org: {
            label: orgName,
            color: '#3b82f6', // blue
        },
        global: {
            label: 'AVE gesamt',
            color: '#f97316', // orange
        },
        target: {
            label: 'Zielwert 2030',
            color: '#22c55e', // green
        },
    } satisfies ChartConfig

    const radarOverlayConfig = {
        org: {
            label: orgName,
            color: '#3b82f6', // blue
        },
        global: {
            label: 'AVE gesamt',
            color: '#f97316', // orange
        },
    } satisfies ChartConfig

    // --- Bar Chart Data ---
    const barData = INDICATORS.map((ind) => {
        const orgResult    = computeIndicatorProgress(ind.id, data.orgOverview,    data.targets, data.foodWasteOrg,    data.orgQualScoring)
        const globalResult = computeIndicatorProgress(ind.id, data.globalOverview, data.targets, data.foodWasteGlobal, data.globalQualScoring)

        const formatRaw = (val: number | null) => {
            if (val === null) return "Nicht berechenbar"
            const rounded = Math.round(val * 10) / 10
            return ind.unit ? `${rounded} ${ind.unit}` : `${rounded}`
        }

        return {
            indicator: INDICATOR_SHORT_LABELS[ind.id],
            org:    orgResult.dataSource === 'none' ? null : orgResult.progress,
            global: globalResult.dataSource === 'none' ? null : globalResult.progress,
            target: 100,
            // Original raw strings for the tooltip
            orgRaw:    orgResult.dataSource === 'none' ? 'Keine Daten' : formatRaw(orgResult.value),
            globalRaw: globalResult.dataSource === 'none' ? 'Keine Daten' : formatRaw(globalResult.value),
            targetRaw: formatRaw(ind.target),
        }
    })

    // --- Radar Overlay Data (normalized to target = 100) ---
    const radarOverlayData = INDICATORS.map((ind) => {
        const orgResult    = computeIndicatorProgress(ind.id, data.orgOverview,    data.targets, data.foodWasteOrg,    data.orgQualScoring)
        const globalResult = computeIndicatorProgress(ind.id, data.globalOverview, data.targets, data.foodWasteGlobal, data.globalQualScoring)
        return {
            indicator: INDICATOR_SHORT_LABELS[ind.id],
            org:    orgResult.dataSource === 'none' ? null : orgResult.progress,
            global: globalResult.dataSource === 'none' ? null : globalResult.progress,
        }
    })

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">{t("page.comparison.title") || "Vergleich"}</h2>
                <p className="text-muted-foreground">
                    <EditableText contentKey="page.comparison.subtitle" initialValue={t("page.comparison.subtitle") || "Vergleiche deine Ergebnisse mit Benchmarks."} isTextarea>
                        {t("page.comparison.subtitle") || "Vergleiche deine Ergebnisse mit Benchmarks."}
                    </EditableText>
                </p>
            </div>

            <p className="text-sm text-muted-foreground">{orgName}: {describeFoodWaste(data.foodWasteOrg) || 'Abfalldaten vollständig berücksichtigt.'}</p>
            <p className="text-sm text-muted-foreground">AVE gesamt: {data.foodWasteGlobal ? describeFoodWaste(data.foodWasteGlobal) || 'Abfalldaten vollständig berücksichtigt.' : 'Benchmark nicht verfügbar: Weniger als fünf Organisationen mit gültiger Vergleichsbasis.'}</p>

            {/* Grouped Bar Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Indikator-Vergleich (Zielerreichung)</CardTitle>
                    <CardDescription>
                        {orgName} vs. AVE gesamt vs. Zielwert 2030 (normalisiert, Ziel = 100%)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={barChartConfig} className="h-[400px] w-full">
                        <BarChart
                            data={barData}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                                dataKey="indicator"
                                tick={{ fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => `${val}%`}
                            />
                            <ChartTooltip
                                cursor={{ fill: 'var(--muted)', opacity: 0.2 }}
                                content={
                                    <ChartTooltipContent
                                        indicator="dot"
                                        formatter={(value, name, item) => {
                                            const isOrg = name === orgName
                                            const isGlobal = name === 'AVE gesamt'
                                            const isTarget = name === 'Zielwert 2030'
                                            
                                            const itemPayload = item.payload as any;
                                            let rawStr = ''
                                            if (isOrg) rawStr = itemPayload.orgRaw
                                            if (isGlobal) rawStr = itemPayload.globalRaw
                                            if (isTarget) rawStr = itemPayload.targetRaw

                                            return (
                                                <div className="flex w-full items-center justify-between gap-4">
                                                    <div className="flex items-center gap-2">
                                                        <div 
                                                            className="h-2 w-2 shrink-0 rounded-[2px]" 
                                                            style={{ backgroundColor: item.color }}
                                                        />
                                                        <span className="text-muted-foreground">{name}</span>
                                                    </div>
                                                    <div className="flex items-baseline gap-1.5 text-right">
                                                        <span className="font-mono font-medium">{value == null ? "Nicht berechenbar" : `${value}%`}</span>
                                                        <span className="text-[10px] text-muted-foreground w-[60px] inline-block text-left">
                                                            ({rawStr})
                                                        </span>
                                                    </div>
                                                </div>
                                            )
                                        }}
                                    />
                                }
                            />
                            <Legend
                                wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }}
                            />
                            <Bar
                                dataKey="org"
                                name={orgName}
                                fill="var(--color-org)"
                                radius={[4, 4, 0, 0]}
                            />
                            <Bar
                                dataKey="global"
                                name="AVE gesamt"
                                fill="var(--color-global)"
                                radius={[4, 4, 0, 0]}
                            />
                            <Bar
                                dataKey="target"
                                name="Zielwert 2030"
                                fill="var(--color-target)"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>

            {/* Radar Chart */}
            <div className="grid grid-cols-1 gap-4">
                {/* Radar Overlay — Org vs Global */}
                <Card>
                    <CardHeader className="items-center">
                        <CardTitle>Radar-Vergleich</CardTitle>
                        <CardDescription>
                            {orgName} vs. AVE gesamt (normalisiert, Ziel = 100%)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer
                            config={radarOverlayConfig}
                            className="mx-auto aspect-square max-h-[350px]"
                        >
                            <RadarChart
                                data={radarOverlayData}
                                margin={{ top: 10, bottom: 10, left: 40, right: 40 }}
                            >
                                <ChartTooltip
                                    cursor={false}
                                    content={
                                        <ChartTooltipContent
                                            indicator="line"
                                            formatter={(value, name) => [value == null ? `Nicht berechenbar ${name}` : `${value}% ${name}`, '']}
                                        />
                                    }
                                />
                                <PolarAngleAxis
                                    dataKey="indicator"
                                    tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                                />
                                <PolarGrid />
                                <Radar
                                    shape={AvailableRadarShape}
                                    activeDot={false}
                                    dataKey="org"
                                    name={orgName}
                                    fill="var(--color-org)"
                                    fillOpacity={0.3}
                                    stroke="var(--color-org)"
                                    strokeWidth={2}
                                />
                                <Radar
                                    shape={AvailableRadarShape}
                                    activeDot={false}
                                    dataKey="global"
                                    name="AVE gesamt"
                                    fill="var(--color-global)"
                                    fillOpacity={0.1}
                                    stroke="var(--color-global)"
                                    strokeWidth={2}
                                    strokeDasharray="4 4"
                                />
                                <Legend
                                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                                />
                            </RadarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>


        </div>
    )
}
