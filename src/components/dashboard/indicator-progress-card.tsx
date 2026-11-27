"use client"

import { describeFoodWaste, type FoodWasteResult } from '@/lib/indicators/food-waste'
import { DashboardOverview, IndicatorTargets } from "@/lib/indicators/types"
import { INDICATORS } from "@/lib/indicators/indicators"
import { computeIndicatorProgress, QualScoringForChart, INDICATOR_KEY_MAP } from "@/lib/indicators/engine"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface IndicatorProgressCardProps {
  overview: DashboardOverview
  targets: IndicatorTargets
  selectedYear: number
  foodWaste?: FoodWasteResult | null
  qualitativeScoringResults?: QualScoringForChart | null
}

/**
 * Returns a color based on the progress percentage:
 * 100% = dark green, ≥70% = light green, ≥20% = yellow, ≥5% = orange, <5% = red
 */
function getProgressColor(progress: number | null): string {
  if (progress === null) return 'rgba(0,0,0,0.15)'
  if (progress >= 100) return "#15803d" // dark green
  if (progress >= 70) return "#4ade80"  // light green
  if (progress >= 20) return "#facc15"  // yellow
  if (progress >= 5) return "#f97316"   // orange
  return "#ef4444"                       // red
}

function formatValue(value: number | null, unit: string): string {
  if (value === null) return 'Nicht berechenbar'
  const formatted = value.toLocaleString("de-DE", { maximumFractionDigits: 1 })
  if (unit === "€") return `${value.toLocaleString("de-DE")} €`
  if (unit === "%") return `${formatted}%`
  if (unit === "kg") return `${formatted} kg`
  if (unit) return `${formatted} ${unit}`
  return formatted
}

function formatTarget(target: number, unit: string, id: string): string {
  if (id === "food_waste") return `${target}%`
  return formatValue(target, unit)
}


export function IndicatorProgressCard({
  overview,
  targets,
  selectedYear: _selectedYear,
  foodWaste,
  qualitativeScoringResults,
}: IndicatorProgressCardProps) {
  const items = INDICATORS.map((ind) => {
    const { value, progress, dataSource } = computeIndicatorProgress(
      ind.id,
      overview,
      targets,
      foodWaste,
      qualitativeScoringResults,
    )

    const noScore = dataSource === 'none'

    return { ...ind, value, progress, noScore }
  })

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Indikator-Fortschritt</CardTitle>
        <CardDescription>
          Zielerreichung pro Indikator im Abgleich mit dem Zielwert bis 2030
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Individual indicator rows */}
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4">
              <div
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: item.noScore ? 'rgba(0,0,0,0.15)' : getProgressColor(item.progress) }}
              />
              <div className="flex flex-1 items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {item.name}
                  </p>
                  {!item.noScore ? (
                    <p className="text-muted-foreground text-xs">
                      {formatValue(item.value, item.unit)}
                      {` · Ziel: ${formatTarget(targets[INDICATOR_KEY_MAP[item.id]], item.unit, item.id)}`}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">{item.id === "food_waste" ? "Nicht berechenbar" : "–"} · Ziel: {formatTarget(item.target, item.unit, item.id)}</p>
                  )}
                  {item.id === "food_waste" && describeFoodWaste(foodWaste) && <p className="text-xs text-muted-foreground">{describeFoodWaste(foodWaste)}</p>}
                </div>
                <div className="flex w-28 items-center gap-2">
                  {/* Mini progress bar */}
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    {!item.noScore && (
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all"
                        style={{
                          width: `${item.progress}%`,
                          backgroundColor: getProgressColor(item.progress),
                        }}
                      />
                    )}
                  </div>
                  <span className="text-muted-foreground w-10 text-right text-xs">
                    {item.noScore ? '–' : `${item.progress}%`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
