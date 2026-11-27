import { getScoringDataSetDetail } from '@/app/actions/datasets'
import { SCORING_QUESTIONS, SCORING_QUESTIONS_MAP, INDICATOR_LABELS, type IndicatorSlug } from '@/lib/qualitative/constants'
import { evaluateQuestionnaire } from '@/lib/questions/completion'
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
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import { errorSummary } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const metadata: Metadata = {
    title: 'Scoring-Datensatz – Details',
}

function formatResponse(row: {
    responseType: string | null
    responseText: string | null
    responseOption: string | null
    responseMultiple: string[] | null
    responseDate: Date | null
}): string {
    if (row.responseOption) return row.responseOption
    if (row.responseText) return row.responseText.length > 100 ? row.responseText.slice(0, 100) + '…' : row.responseText
    if (row.responseMultiple && row.responseMultiple.length > 0) return row.responseMultiple.join(', ')
    if (row.responseDate) {
        const d = new Date(row.responseDate)
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }
    return '–'
}

function formatDate(date: Date | null): string {
    if (!date) return '–'
    const d = new Date(date)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function ScoringDataSetDetailPage({
    params,
}: {
    params: Promise<{ subOrgId: string; year: string }>
}) {
    const { subOrgId, year: yearStr } = await params
    const year = Number(yearStr)
    let detail: Awaited<ReturnType<typeof getScoringDataSetDetail>>

    try {
        detail = await getScoringDataSetDetail(subOrgId, year)
    } catch (error) {
        logger.error('Failed to load scoring dataset detail', errorSummary(error))
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
    const questionnaire = evaluateQuestionnaire(SCORING_QUESTIONS, rows)

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
                        Scoring-Datensatz
                    </h2>
                    <p className="text-muted-foreground">
                        {subOrgName} – {year}
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        {questionnaire.totalAnsweredCount} Antworten
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Indikator</TableHead>
                                <TableHead>Frage</TableHead>
                                <TableHead>Typ</TableHead>
                                <TableHead>Antwort</TableHead>
                                <TableHead>Aktualisiert</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        Keine Daten vorhanden.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map(row => {
                                    const q = SCORING_QUESTIONS_MAP[row.questionKey]
                                    const indicatorLabel = INDICATOR_LABELS[row.indicatorSlug as IndicatorSlug] || row.indicatorSlug

                                    return (
                                        <TableRow key={row.id}>
                                            <TableCell>
                                                <Badge variant="outline">{indicatorLabel}</Badge>
                                            </TableCell>
                                            <TableCell className="max-w-[300px]">
                                                <span className="line-clamp-2">{q?.label || row.questionKey}</span>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-xs">
                                                {row.responseType || '–'}
                                            </TableCell>
                                            <TableCell className="max-w-[250px]">
                                                <span className="line-clamp-2">{formatResponse(row)}</span>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {formatDate(row.updatedAt)}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
