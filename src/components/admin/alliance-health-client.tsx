"use client"

import { useMemo } from "react"
import { AllianceHealthData, AllianceOrgSummary } from "@/app/actions/alliance"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip as RechartsTooltip,
    CartesianGrid,
    ReferenceLine,
    LabelList,
} from "recharts"
import { Users, Building2 } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

// --- Constants ---

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
const HEATMAP_COLUMNS: { key: number; label: string }[] = [
    ...MONTH_LABELS.map((label, i) => ({ key: i + 1, label })),
    { key: 0, label: "Jahr" },
]

// --- Main Component ---

export function AllianceHealthClient({ data }: { data: AllianceHealthData }) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const handleYearChange = (year: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("year", year.toString())
        router.push(`/admin/alliance?${params.toString()}`)
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SummaryCard
                    title="Organisationen gesamt"
                    value={data.totalOrganizations}
                    icon={<Building2 className="h-4 w-4" />}
                    description="Registrierte Organisationen"
                />
                <SummaryCard
                    title="User gesamt"
                    value={data.totalUsers}
                    icon={<Users className="h-4 w-4" />}
                    description="Alle Nutzer ohne Admins"
                />
            </div>

            {/* Active Users Chart */}
            <ActiveUsersChart
                series={data.activeUsersSeries}
                totalUsers={data.totalUsers}
            />

            {/* Engagement Heatmap */}
            <EngagementHeatmap
                organizations={data.organizations}
                heatmap={data.heatmap}
                selectedYear={data.selectedYear}
                availableYears={data.availableYears}
                onYearChange={handleYearChange}
            />
        </div>
    )
}

// --- Sub-Components ---

function SummaryCard({
    title,
    value,
    icon,
    description,
    accent,
}: {
    title: string
    value: string | number
    icon: React.ReactNode
    description: string
    accent?: string
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <span className="text-muted-foreground">{icon}</span>
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${accent || ""}`}>{value}</div>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </CardContent>
        </Card>
    )
}

function EngagementHeatmap({
    organizations,
    heatmap,
    selectedYear,
    availableYears,
    onYearChange,
}: {
    organizations: AllianceOrgSummary[]
    heatmap: AllianceHealthData["heatmap"]
    selectedYear: number
    availableYears: number[]
    onYearChange: (year: number) => void
}) {
    // Build lookup: orgId -> month -> { operationalCount, scoringCount }
    const lookup = useMemo(() => {
        const map = new Map<string, Map<number, { operationalCount: number; scoringCount: number }>>()
        for (const cell of heatmap) {
            if (!map.has(cell.orgId)) map.set(cell.orgId, new Map())
            map.get(cell.orgId)!.set(cell.month, {
                operationalCount: cell.operationalCount,
                scoringCount: cell.scoringCount,
            })
        }
        return map
    }, [heatmap])

    const getColor = (pct: number) => {
        if (pct <= 0) return "bg-muted text-muted-foreground"
        if (pct < 34) return "bg-green-200 text-green-950"
        if (pct < 67) return "bg-green-400 text-green-950"
        if (pct < 100) return "bg-green-500 text-white"
        return "bg-green-600 text-white"
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                    <CardTitle>Engagement-Heatmap</CardTitle>
                    <CardDescription>
                        Dateneingaben pro Organisation, Monat und Jahrescumulation ({selectedYear})
                    </CardDescription>
                </div>
                <select
                    value={selectedYear}
                    onChange={e => onYearChange(Number(e.target.value))}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label="Jahr auswählen"
                >
                    {availableYears.map(y => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <TooltipProvider>
                    <div className="min-w-[680px]">
                        {/* Header row: 12 months + Jahr column */}
                        <div className="grid gap-1" style={{ gridTemplateColumns: "180px repeat(12, 1fr) 1.3fr" }}>
                            <div className="text-xs font-medium text-muted-foreground" />
                            {HEATMAP_COLUMNS.map(c => (
                                <div
                                    key={c.key}
                                    className={`text-xs text-center text-muted-foreground font-medium ${c.key === 0 ? "border-l pl-1" : ""}`}
                                >
                                    {c.label}
                                </div>
                            ))}
                        </div>

                        {/* Data rows */}
                        {organizations.map(org => (
                            <div
                                key={org.orgId}
                                className="grid gap-1 mt-1"
                                style={{ gridTemplateColumns: "180px repeat(12, 1fr) 1.3fr" }}
                            >
                                <div className="text-xs truncate flex items-center pr-2" title={org.orgName}>
                                    {org.orgName}
                                </div>
                                {HEATMAP_COLUMNS.map(c => {
                                    const cell = lookup.get(org.orgId)?.get(c.key) ?? { operationalCount: 0, scoringCount: 0 }
                                    const denom = org.subOrgCount || 0
                                    const operationalPct = denom > 0 ? Math.round((cell.operationalCount / denom) * 100) : 0
                                    const scoringPct = denom > 0 ? Math.round((cell.scoringCount / denom) * 100) : 0
                                    const combinedPct = c.key === 0
                                        ? Math.round((operationalPct + scoringPct) / 2)
                                        : operationalPct
                                    const titleLabel = c.key === 0 ? "Jahresdaten" : c.label
                                    return (
                                        <Tooltip key={c.key}>
                                            <TooltipTrigger asChild>
                                                <div
                                                    className={`h-6 rounded-sm flex items-center justify-center text-[10px] font-medium cursor-default ${getColor(combinedPct)} transition-colors ${c.key === 0 ? "ml-1 ring-1 ring-border" : ""}`}
                                                >
                                                    {denom > 0 ? `${combinedPct}%` : "–"}
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent className="text-xs space-y-0.5">
                                                <p className="font-semibold">{org.orgName} – {titleLabel}</p>
                                                <p>Betriebs.: {operationalPct}%</p>
                                                {c.key === 0 && (
                                                    <p>Scoring: {scoringPct}%</p>
                                                )}
                                            </TooltipContent>
                                        </Tooltip>
                                    )
                                })}
                            </div>
                        ))}

                        {/* Legend */}
                        <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
                            <span>Weniger</span>
                            <div className="flex gap-1">
                                <div className="h-4 w-4 rounded-sm bg-muted" />
                                <div className="h-4 w-4 rounded-sm bg-green-200" />
                                <div className="h-4 w-4 rounded-sm bg-green-400" />
                                <div className="h-4 w-4 rounded-sm bg-green-600" />
                            </div>
                            <span>Mehr</span>
                        </div>
                    </div>
                    </TooltipProvider>
                </div>
            </CardContent>
        </Card>
    )
}

function ActiveUsersChart({
    series,
    totalUsers,
}: {
    series: { days: number; count: number }[]
    totalUsers: number
}) {
    const chartData = series.map(b => ({
        name: `${b.days} Tage`,
        "Aktive User": b.count,
    }))

    const maxValue = Math.max(totalUsers, ...series.map(s => s.count), 1)

    return (
        <Card>
            <CardHeader>
                <CardTitle>Aktive User</CardTitle>
                <CardDescription>
                    Eingeloggte Nutzer innerhalb der letzten 30 / 60 / 90 / 120 Tage — Gesamtzahl aller Nutzer: <span className="font-semibold text-foreground">{totalUsers}</span>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            margin={{ top: 20, right: 20, bottom: 5, left: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis
                                allowDecimals={false}
                                domain={[0, Math.ceil(maxValue * 1.1)]}
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <RechartsTooltip
                                formatter={(value) => [`${value ?? 0} User`, ""]}
                                labelStyle={{ fontWeight: 600 }}
                            />
                            <ReferenceLine
                                y={totalUsers}
                                stroke="var(--chart-4)"
                                strokeDasharray="4 4"
                                label={{
                                    value: `Gesamt: ${totalUsers}`,
                                    position: "insideTopRight",
                                    fill: "var(--chart-4)",
                                    fontSize: 11,
                                }}
                            />
                            <Bar dataKey="Aktive User" fill="var(--chart-2)" radius={[4, 4, 0, 0]} barSize={48}>
                                <LabelList dataKey="Aktive User" position="top" fontSize={12} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
