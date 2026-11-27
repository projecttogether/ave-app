"use client"

import { AvailableRadarShape } from './available-radar-shape'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, Tooltip, Legend } from "recharts"
import { describeFoodWaste, type FoodWasteResult } from '@/lib/indicators/food-waste'
import { DashboardOverview, IndicatorTargets } from "@/lib/indicators/types"
import { INDICATORS } from "@/lib/indicators/indicators"
import { computeIndicatorProgress, QualScoringForChart } from "@/lib/indicators/engine"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

interface RadarOverviewChartProps {
  overview: DashboardOverview
  targets: IndicatorTargets
  selectedYear: number
  foodWaste?: FoodWasteResult | null
  qualitativeScoringResults?: QualScoringForChart | null
}

const chartConfig = {
  value: { label: "Zielerreichung", color: "#3b82f6" },
} satisfies ChartConfig

export function RadarOverviewChart({
  overview,
  targets,
  foodWaste,
  qualitativeScoringResults,
}: RadarOverviewChartProps) {
  const chartData = INDICATORS.map((ind) => {
    const { value, progress, dataSource } = computeIndicatorProgress(
      ind.id,
      overview,
      targets,
      foodWaste,
      qualitativeScoringResults,
    )

    return { indicator: ind.name, fullName: ind.name, value, progress: dataSource === 'none' ? null : progress, dataSource }
  })

  return (
    <Card className="col-span-1">
      <CardHeader className="items-center">
        <CardTitle>Indikator-Übersicht</CardTitle>
        <CardDescription>Zielerreichung aller Indikatoren (Zielwert = 100%)</CardDescription>
        {describeFoodWaste(foodWaste) && <CardDescription>{describeFoodWaste(foodWaste)}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[350px]">
          <RadarChart data={chartData} margin={{ top: 20, bottom: 20, left: 80, right: 80 }}>
            <Tooltip
              content={({ payload, label }) => {
                if (!payload?.length) return null
                const pt = payload[0]?.payload
                const sourceLabel =
                  pt?.dataSource === "scoring"
                    ? "Scoring-Fragen"
                    : pt?.dataSource === "operational"
                    ? "Betriebsdaten"
                    : "–"
                return (
                  <div className="rounded-lg border bg-background p-2 shadow-sm text-xs">
                    <p className="font-medium mb-0.5">{pt?.fullName ?? label}</p>
                    <p className="text-muted-foreground">{sourceLabel}</p>
                    <p className="font-semibold mt-0.5">{pt?.progress == null ? "Nicht berechenbar" : `${pt.progress}%`}</p>
                  </div>
                )
              }}
            />
            <PolarAngleAxis dataKey="indicator" tick={{ fontSize: 12, fill: "var(--foreground)" }} />
            <PolarGrid />
            <Radar
              shape={AvailableRadarShape}
              activeDot={false}
              dataKey="progress"
              fill="var(--color-value)"
              fillOpacity={0.4}
              stroke="var(--color-value)"
              strokeWidth={2}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              formatter={() => 'Zielerreichung'}
            />
          </RadarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
