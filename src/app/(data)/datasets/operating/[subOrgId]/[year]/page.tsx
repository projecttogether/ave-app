import { getIndicatorDataSetDetail } from '@/app/actions/datasets'
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
import { errorSummary } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const metadata: Metadata = {
    title: 'Betriebsdaten-Datensatz – Details',
}

const MONTH_LABELS: Record<number, string> = {
    0: 'Jährlich (kumuliert)',
    1: 'Januar', 2: 'Februar', 3: 'März', 4: 'April',
    5: 'Mai', 6: 'Juni', 7: 'Juli', 8: 'August',
    9: 'September', 10: 'Oktober', 11: 'November', 12: 'Dezember',
}

function formatNum(val: string | null): string {
    if (val === null || val === '') return '–'
    const n = Number(val)
    if (isNaN(n)) return val
    return n.toLocaleString('de-DE', { maximumFractionDigits: 2 })
}

export default async function IndicatorDataSetDetailPage({
    params,
}: {
    params: Promise<{ subOrgId: string; year: string }>
}) {
    const { subOrgId, year: yearStr } = await params
    const year = Number(yearStr)
    let detail: Awaited<ReturnType<typeof getIndicatorDataSetDetail>>

    try {
        detail = await getIndicatorDataSetDetail(subOrgId, year)
    } catch (error) {
        logger.error('Failed to load indicator dataset detail', errorSummary(error))
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
                            Der Datensatz konnte nicht geladen werden.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    const { rows, subOrgName } = detail

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/datasets">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">
                        Betriebsdatensatz
                    </h2>
                    <p className="text-muted-foreground">
                        {subOrgName} – {year}
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        {rows.length} Einträge
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="sticky left-0 bg-background z-10">Zeitraum</TableHead>
                                    <TableHead className="text-right">Gesamtausgaben</TableHead>
                                    <TableHead className="text-right">Fleisch</TableHead>
                                    <TableHead className="text-right">Fisch</TableHead>
                                    <TableHead className="text-right">Milch</TableHead>
                                    <TableHead className="text-right">Eier</TableHead>
                                    <TableHead className="text-right">Mischprodukte</TableHead>
                                    <TableHead className="text-right">Bio</TableHead>
                                    <TableHead className="text-right">Kaffee</TableHead>
                                    <TableHead className="text-right">Kakao</TableHead>
                                    <TableHead className="text-right">Kakao-Misch.</TableHead>
                                    <TableHead className="text-right">Bananen</TableHead>
                                    <TableHead className="text-right">FT-Kaffee</TableHead>
                                    <TableHead className="text-right">FT-Kakao</TableHead>
                                    <TableHead className="text-right">FT-Kakao-M.</TableHead>
                                    <TableHead className="text-right">FT-Bananen</TableHead>
                                    <TableHead className="text-right">Food Waste (kg)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={17} className="text-center py-8 text-muted-foreground">
                                            Keine Daten vorhanden.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map(row => (
                                        <TableRow key={row.id}>
                                            <TableCell className="sticky left-0 bg-background z-10 font-medium">
                                                {row.periodKind === 'quarter' ? `Q${row.periodIndex}` : MONTH_LABELS[row.reportingMonth ?? 0] || `Monat ${row.reportingMonth}`}
                                            </TableCell>
                                            <TableCell className="text-right">{formatNum(row.totalFoodSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.meatSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.fishSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.dairySpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.eggSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.mixedProductSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.organicSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.coffeeSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.cocoaSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.cocoaMixedSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.bananasSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.fairTradeCoffeeSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.fairTradeCocoaSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.fairTradeCocoaMixedSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.fairTradeBananasSpend)}</TableCell>
                                            <TableCell className="text-right">{formatNum(row.foodWasteAmount)}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
