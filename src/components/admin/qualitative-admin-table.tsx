'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import {
    getQualitativeResponsesAdmin,
    exportQualitativeResponsesCsv,
} from '@/app/actions/qualitative'
import {
    INDICATOR_SLUGS,
    INDICATOR_LABELS,
    SCORING_QUESTIONS_MAP,
    type IndicatorSlug,
    type QualitativeResponseWithRelations,
} from '@/lib/qualitative/constants'
import { Loader2, Download, FileText } from 'lucide-react'

const currentYear = new Date().getFullYear()

// Format a response for display
function formatResponse(row: QualitativeResponseWithRelations): string {
    if (row.responseText && row.responseText.trim()) return row.responseText.trim()
    if (row.responseOption) return row.responseOption
    if (row.responseMultiple && row.responseMultiple.length > 0) return row.responseMultiple.join(', ')
    if (row.responseDate) {
        const d = row.responseDate
        const dd = d.getDate().toString().padStart(2, '0')
        const mm = (d.getMonth() + 1).toString().padStart(2, '0')
        return `${dd}.${mm}.${d.getFullYear()}`
    }
    return '–'
}

export function QualitativeAdminTable({ organizations }: {
    organizations: { id: string; name: string }[]
}) {
    const { toast } = useToast()

    const [rows, setRows] = useState<QualitativeResponseWithRelations[]>([])
    const [loading, setLoading] = useState(false)
    const [exporting, setExporting] = useState(false)

    // Filters
    const [filterOrg, setFilterOrg] = useState<string>('all')
    const [filterYear, setFilterYear] = useState<string>(currentYear.toString())
    const [filterIndicator, setFilterIndicator] = useState<string>('all')

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const filters: {
                organizationId?: string
                year?: number
                indicatorSlug?: string
            } = {}
            if (filterOrg !== 'all') filters.organizationId = filterOrg
            if (filterYear !== 'all') filters.year = parseInt(filterYear)
            if (filterIndicator !== 'all') filters.indicatorSlug = filterIndicator

            const data = await getQualitativeResponsesAdmin(filters)
            setRows(data)
        } catch (err) {
            toast({
                title: 'Fehler',
                description: 'Daten konnten nicht geladen werden.',
                variant: 'destructive',
            })
        } finally {
            setLoading(false)
        }
    }, [filterOrg, filterYear, filterIndicator, toast])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleExport = async () => {
        setExporting(true)
        try {
            const filters: {
                organizationId?: string
                year?: number
                indicatorSlug?: string
            } = {}
            if (filterOrg !== 'all') filters.organizationId = filterOrg
            if (filterYear !== 'all') filters.year = parseInt(filterYear)
            if (filterIndicator !== 'all') filters.indicatorSlug = filterIndicator

            const csv = await exportQualitativeResponsesCsv(filters)
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `qualitative_responses_${filterYear}.csv`
            link.click()
            URL.revokeObjectURL(url)

            toast({
                title: 'Export erfolgreich',
                description: 'CSV-Datei wurde heruntergeladen.',
            })
        } catch (err) {
            toast({
                title: 'Fehler',
                description: 'Export fehlgeschlagen.',
                variant: 'destructive',
            })
        } finally {
            setExporting(false)
        }
    }

    // Filter out rows with no response at all 
    const nonEmptyRows = rows.filter((r) => {
        if (r.responseText && r.responseText.trim().length > 0) return true
        if (r.responseOption) return true
        if (r.responseMultiple && r.responseMultiple.length > 0) return true
        if (r.responseDate) return true
        return false
    })

    return (
        <div className="space-y-6">
            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Organisation</Label>
                            <Select value={filterOrg} onValueChange={setFilterOrg}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Alle" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Alle Organisationen</SelectItem>
                                    {organizations.map((org) => (
                                        <SelectItem key={org.id} value={org.id}>
                                            {org.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Jahr</Label>
                            <Select value={filterYear} onValueChange={setFilterYear}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Alle" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Alle Jahre</SelectItem>
                                    <SelectItem value="2025">2025</SelectItem>
                                    <SelectItem value="2026">2026</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Indikator</Label>
                            <Select value={filterIndicator} onValueChange={setFilterIndicator}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Alle" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Alle Indikatoren</SelectItem>
                                    {INDICATOR_SLUGS.map((slug) => (
                                        <SelectItem key={slug} value={slug}>
                                            {INDICATOR_LABELS[slug]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex justify-end mt-4">
                        <Button
                            variant="outline"
                            onClick={handleExport}
                            disabled={exporting || nonEmptyRows.length === 0}
                        >
                            {exporting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Download className="mr-2 h-4 w-4" />
                            )}
                            CSV exportieren
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Results */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : nonEmptyRows.length === 0 ? (
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-center text-muted-foreground py-8">
                            Keine qualitativen Daten für die gewählten Filter gefunden.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            Qualitative Antworten ({nonEmptyRows.length})
                        </CardTitle>
                        <CardDescription>
                            Alle erfassten qualitativen Angaben der Organisationen
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Organisation</TableHead>
                                        <TableHead>Unterorganisation</TableHead>
                                        <TableHead>Indikator</TableHead>
                                        <TableHead>Frage</TableHead>
                                        <TableHead>Jahr</TableHead>
                                        <TableHead className="min-w-[300px]">Antwort</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {nonEmptyRows.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell className="font-medium">
                                                {row.organizationId || '–'}
                                            </TableCell>
                                            <TableCell>
                                                {row.subOrganization?.name || '–'}
                                            </TableCell>
                                            <TableCell>
                                                {INDICATOR_LABELS[row.indicatorSlug as IndicatorSlug] || row.indicatorSlug}
                                            </TableCell>
                                            <TableCell>
                                                {SCORING_QUESTIONS_MAP[row.questionKey]?.label || row.questionKey}
                                            </TableCell>
                                            <TableCell>{row.reportingYear}</TableCell>
                                            <TableCell className="whitespace-pre-wrap text-sm">
                                                {formatResponse(row)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
