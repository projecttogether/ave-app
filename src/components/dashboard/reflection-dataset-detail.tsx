import type { ReflectionDataSetDetail } from '@/app/actions/reflection'
import { INDICATOR_LABELS, REFLECTION_QUESTIONS, REFLECTION_QUESTIONS_MAP, type IndicatorSlug } from '@/lib/reflection/constants'
import { evaluateQuestionnaire } from '@/lib/questions/completion'
import { DatasetBackLink as Link } from '@/components/dashboard/dataset-back-link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'

import { DatasetExportButton } from '@/components/dashboard/dataset-export-button'

function formatDate(date: Date | null): string {
  return date
    ? new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-'
}

function formatResponse(row: ReflectionDataSetDetail): string {
  if (row.responseOption) return row.responseOption
  if (row.responseText) return row.responseText
  if (row.responseMultiple?.length) return row.responseMultiple.join(', ')
  if (row.responseDate) return formatDate(row.responseDate)
  if (row.responseNumber !== null) return row.responseNumber
  if (row.responseBoolean !== null) return row.responseBoolean ? 'Ja' : 'Nein'
  return '-'
}

export function ReflectionDatasetDetail({ rows, organizationName, organizationId, admin = false }: {
  rows: ReflectionDataSetDetail[]
  organizationName: string
  organizationId: string
  admin?: boolean
}) {
  const questionnaire = evaluateQuestionnaire(REFLECTION_QUESTIONS, rows, { includeOptional: true })
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={admin ? '/admin/datasets?tab=reflection' : '/datasets?tab=reflection'} aria-label="Zurück zu den Reflexionsdatensätzen">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reflexionsdatensatz</h2>
          <p className="text-muted-foreground">{organizationName}</p>
        </div>
      </div>

      {admin ? (
        <Button variant="outline" asChild><Link href="/admin/export">Zum Datenexport</Link></Button>
      ) : (
        <DatasetExportButton type="reflection" filters={{ organizationId }} />
      )}

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
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Keine Daten vorhanden.
                  </TableCell>
                </TableRow>
              ) : rows.map(row => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant="outline">{INDICATOR_LABELS[row.indicatorSlug as IndicatorSlug] || row.indicatorSlug}</Badge>
                  </TableCell>
                  <TableCell className="min-w-[200px] max-w-[350px] whitespace-normal">
                    {REFLECTION_QUESTIONS_MAP[row.questionKey]?.label || row.questionKey}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{row.responseType || '-'}</TableCell>
                  <TableCell className="min-w-[250px] max-w-[600px] whitespace-pre-wrap break-words">
                    {formatResponse(row)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatDate(row.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
