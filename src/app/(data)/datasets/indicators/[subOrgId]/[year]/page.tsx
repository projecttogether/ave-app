import { describeFoodWaste } from '@/lib/indicators/food-waste'
import { getDashboardData } from '@/app/actions/dashboard'
import { db } from '@/lib/db'
import { INDICATOR_LABELS, getIndicator } from '@/lib/indicators/indicators'
import { computeIndicatorProgress } from '@/lib/indicators/engine'
import { Metadata } from 'next'
import { DatasetBackLink as Link } from '@/components/dashboard/dataset-back-link'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { errorSummary } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const metadata: Metadata = {
    title: 'Indikator-Werte – Details',
}

const INDICATOR_KEYS = [
  { id: "plant_based", quantKey: "plant_based_percentage", qualKey: "plant_based_scoring_result", unit: "%", hasQuant: true },
  { id: "organic", quantKey: "organic_percentage", qualKey: "organic_scoring_result", unit: "%", hasQuant: true },
  { id: "food_waste", quantKey: "food_waste", qualKey: "food_waste_scoring_result", unit: "%", hasQuant: true },
  { id: "seasonal", quantKey: null, qualKey: "seasonal_scoring_result", unit: "Pkt.", hasQuant: false },
  { id: "regional", quantKey: null, qualKey: "regional_scoring_result", unit: "Pkt.", hasQuant: false },
  { id: "fair_trade", quantKey: "fair_trade_percentage", qualKey: "fair_trade_scoring_result", unit: "%", hasQuant: true },
  { id: "guest_satisfaction", quantKey: null, qualKey: "guest_satisfaction_scoring_result", unit: "Pkt.", hasQuant: false },
] as const;

function getProgressColor(progress: number): string {
  if (progress >= 100) return "bg-emerald-600 hover:bg-emerald-700"
  if (progress >= 70) return "bg-emerald-400 hover:bg-emerald-500"
  if (progress >= 20) return "bg-amber-400 hover:bg-amber-500"
  if (progress >= 5) return "bg-orange-500 hover:bg-orange-600"
  return "bg-red-500 hover:bg-red-600"
}

function formatValue(value: number | null, unit: string): string {
  if (value === null) return '—'
  const formatted = value.toLocaleString("de-DE", { maximumFractionDigits: 1 })
  if (unit === "%") return `${formatted}%`
  if (unit === "kg") return `${formatted} kg`
  if (unit) return `${formatted} ${unit}`
  return formatted
}

function formatTarget(target: number, unit: string, key: string): string {
  if (key === "food_waste") return `${target}%`
  return formatValue(target, unit)
}

export default async function IndicatorScoresDetailPage({
    params,
}: {
    params: Promise<{ subOrgId: string; year: string }>
}) {
    const { subOrgId, year: yearStr } = await params
    const year = Number(yearStr)

    try {
        const subOrg = await db.query.subOrganizations.findFirst({
            where: (so, { eq }) => eq(so.id, subOrgId),
            columns: { name: true }
        })
        const subOrgName = subOrg?.name || 'Unbekannte Unterorganisation'

        const data = await getDashboardData(subOrgId, year, 'yearly')
        
        if (!data || !data.overview) throw new Error('No data found')

        const items = INDICATOR_KEYS.map((ind) => {
          const result = computeIndicatorProgress(ind.id, data.overview, data.targets, data.foodWaste, data.qualitativeScoringResults)
          const quantValue = ind.hasQuant && result.dataSource !== 'none' ? result.value : null
          const qualValue = data.overview[ind.qualKey]
          const target = getIndicator(ind.id)!.target
          const progress = result.dataSource === 'none' ? null : result.progress
          const label = INDICATOR_LABELS[ind.id]

          return { ...ind, label, quantValue, qualValue, target, progress }
        })

        return (
            <div className="space-y-6">
                {describeFoodWaste(data.foodWaste) && <p className="text-sm text-muted-foreground">Lebensmittelabfälle: {describeFoodWaste(data.foodWaste)}</p>}
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/datasets">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">
                            Indikator-Werte
                        </h2>
                        <p className="text-muted-foreground">
                            {subOrgName} – {year}
                        </p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            7 Berechnete Indikatoren
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Indikator</TableHead>
                                        <TableHead className="text-right">Berechneter Wert</TableHead>
                                        <TableHead className="text-right">Qualitativer Score</TableHead>
                                        <TableHead className="text-right">Zielwert (2030)</TableHead>
                                        <TableHead className="text-right">Zielerreichung (0-100)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {items.map(item => (
                                      <TableRow key={item.id}>
                                          <TableCell className="font-medium">{item.label}</TableCell>
                                          <TableCell className="text-right">{item.hasQuant ? (item.id === 'food_waste' && item.quantValue === null ? 'Nicht berechenbar' : formatValue(item.quantValue, item.unit)) : '—'}</TableCell>
                                          <TableCell className="text-right">{formatValue(item.qualValue, 'Pkt.')}</TableCell>
                                          <TableCell className="text-right">{item.target !== null ? formatTarget(item.target, item.unit, item.id) : '—'}</TableCell>
                                          <TableCell className="text-right">
                                              {item.progress === null ? <span className="text-muted-foreground">{item.id === 'food_waste' ? 'Nicht berechenbar' : '—'}</span> : <Badge className={`text-white ${getProgressColor(item.progress)}`}>
                                                {item.progress}%
                                              </Badge>}
                                          </TableCell>
                                      </TableRow>
                                  ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    } catch (error) {
        logger.error('Failed to load indicator scores', errorSummary(error))
        return (
            <div className="space-y-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/datasets">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Zurück
                    </Link>
                </Button>
                <div className="flex items-center justify-center py-12">
                    <div className="text-center space-y-2">
                        <h2 className="text-lg font-semibold">Fehler beim Laden</h2>
                        <p className="text-sm text-muted-foreground">
                            Es liegen noch nicht genügend Daten zur Berechnung vor.
                        </p>
                    </div>
                </div>
            </div>
        )
    }
}
