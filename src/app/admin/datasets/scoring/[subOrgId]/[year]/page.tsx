import { getAdminScoringDataSetDetail } from '@/app/admin/actions/datasets'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { INDICATOR_LABELS, SCORING_QUESTIONS, SCORING_QUESTIONS_MAP, type IndicatorSlug } from '@/lib/qualitative/constants'
import { evaluateQuestionnaire } from '@/lib/questions/completion'
import { ArrowLeft } from 'lucide-react'
import { Metadata } from 'next'
import { DatasetBackLink as Link } from '@/components/dashboard/dataset-back-link'
import { errorSummary } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const metadata: Metadata = {
  title: 'Admin - Scoring-Datensatz',
}

function formatResponse(row: {
  responseText: string | null
  responseOption: string | null
  responseMultiple: string[] | null
  responseDate: Date | null
}): string {
  if (row.responseOption) return row.responseOption
  if (row.responseText) return row.responseText.length > 100 ? `${row.responseText.slice(0, 100)}...` : row.responseText
  if (row.responseMultiple && row.responseMultiple.length > 0) return row.responseMultiple.join(', ')
  if (row.responseDate) {
    return new Date(row.responseDate).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }
  return '-'
}

function formatDate(date: Date | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default async function AdminScoringDataSetDetailPage({
  params,
}: {
  params: Promise<{ subOrgId: string; year: string }>
}) {
  const { subOrgId, year: yearStr } = await params
  const year = Number(yearStr)

  let data: Awaited<ReturnType<typeof getAdminScoringDataSetDetail>>
  try {
    data = await getAdminScoringDataSetDetail(subOrgId, year)
  } catch (error) {
    logger.error('Failed to load admin scoring dataset detail', errorSummary(error))
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/datasets">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Link>
        </Button>
        <div className="flex items-center justify-center py-12">
          <div className="space-y-2 text-center">
            <h2 className="text-lg font-semibold">Fehler beim Laden</h2>
            <p className="text-sm text-muted-foreground">
              Der Admin-Datensatz konnte nicht geladen werden.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { rows, subOrgName, organizationName } = data
  const questionnaire = evaluateQuestionnaire(SCORING_QUESTIONS, rows)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/datasets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Admin-Scoring-Datensatz</h2>
          <p className="text-muted-foreground">
            {organizationName} / {subOrgName} - {year}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{questionnaire.totalAnsweredCount} Antworten</CardTitle>
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
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Keine Daten vorhanden.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(row => {
                  const question = SCORING_QUESTIONS_MAP[row.questionKey]
                  const indicatorLabel = INDICATOR_LABELS[row.indicatorSlug as IndicatorSlug] || row.indicatorSlug

                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Badge variant="outline">{indicatorLabel}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <span className="line-clamp-2">{question?.label || row.questionKey}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.responseType || '-'}</TableCell>
                      <TableCell className="max-w-[250px]">
                        <span className="line-clamp-2">{formatResponse(row)}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(row.updatedAt)}</TableCell>
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
