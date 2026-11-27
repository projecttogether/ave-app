'use client'

import { downloadCsv } from '@/lib/download-csv'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Download, Loader2 } from 'lucide-react'
import {
    exportIndicatorDataCsv,
    exportQualitativeDataCsv,
    exportReflectionDataCsv,
} from '@/app/actions/export'

interface Organization {
    id: string
    name: string
}

interface ExportFormProps {
    organizations: Organization[]
}

const CURRENT_YEAR = new Date().getFullYear()
const AVAILABLE_YEARS = Array.from({ length: CURRENT_YEAR - 2024 }, (_, i) => 2025 + i)

export function ExportForm({ organizations }: ExportFormProps) {
    const [year, setYear] = useState<number>(CURRENT_YEAR)
    const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([])
    const [allSelected, setAllSelected] = useState(true)
    const [isPendingIndicator, startTransitionIndicator] = useTransition()
    const [isPendingQualitative, startTransitionQualitative] = useTransition()

    const [isPendingReflection, startTransitionReflection] = useTransition()
    const [error, setError] = useState<string | null>(null)

    function toggleAll(checked: boolean) {
        setAllSelected(checked)
        if (checked) {
            setSelectedOrgIds([])
        }
    }

    function toggleOrg(orgId: string, checked: boolean) {
        if (checked) {
            const next = [...selectedOrgIds, orgId]
            setSelectedOrgIds(next)
            if (next.length === organizations.length) {
                setAllSelected(true)
                setSelectedOrgIds([])
            }
        } else {
            setAllSelected(false)
            setSelectedOrgIds(
                allSelected
                    ? organizations.map((org) => org.id).filter((id) => id !== orgId)
                    : selectedOrgIds.filter((id) => id !== orgId)
            )
        }
    }

    function getOrgIds(): string[] | undefined {
        if (allSelected) return undefined
        return selectedOrgIds
    }

    async function exportCsv(type: 'operating' | 'scoring' | 'reflection') {
        setError(null)
        try {
            const csv = type === 'operating'
                ? await exportIndicatorDataCsv(year, getOrgIds())
                : type === 'scoring'
                    ? await exportQualitativeDataCsv(year, getOrgIds())
                    : await exportReflectionDataCsv(getOrgIds())
            const orgSuffix = allSelected ? 'alle' : `${selectedOrgIds.length}-orgs`
            const name = { operating: 'betriebsdaten', scoring: 'qualitative_daten', reflection: 'reflexionsdaten' }[type]
            const period = type === 'reflection' ? '' : `_${year}`
            downloadCsv(csv, `${name}${period}_${orgSuffix}.csv`)
        } catch {
            setError('Export fehlgeschlagen. Bitte versuchen Sie es erneut.')
        }
    }

    const isOrgChecked = (orgId: string) =>
        allSelected || selectedOrgIds.includes(orgId)

    return (
        <div className="space-y-6">
            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Filter</CardTitle>
                    <CardDescription>
                        Wählen Sie die Organisationen aus. Das Jahr gilt für Betriebsdaten und Scoring-Antworten. Reflexionsdaten werden unabhängig vom Jahr exportiert.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <FieldGroup>
                        {/* Year */}
                        <Field>
                            <FieldLabel htmlFor="export-year">Jahr</FieldLabel>
                            <Select
                                value={String(year)}
                                onValueChange={(v) => setYear(Number(v))}
                            >
                                <SelectTrigger id="export-year" className="w-[200px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {AVAILABLE_YEARS.map((y) => (
                                        <SelectItem key={y} value={String(y)}>
                                            {y}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>

                        {/* Organizations */}
                        <Field>
                            <FieldLabel>Organisationen</FieldLabel>
                            <FieldGroup className="gap-2">
                                <Field orientation="horizontal">
                                    <Checkbox
                                        id="org-all"
                                        checked={allSelected}
                                        onCheckedChange={(c) => toggleAll(!!c)}
                                    />
                                    <FieldLabel htmlFor="org-all" className="font-semibold cursor-pointer">
                                        Alle
                                    </FieldLabel>
                                </Field>
                                <div className="ml-6 grid gap-2 max-h-64 overflow-y-auto">
                                    {organizations.map((org) => (
                                        <Field key={org.id} orientation="horizontal">
                                            <Checkbox
                                                id={`org-${org.id}`}
                                                checked={isOrgChecked(org.id)}
                                                onCheckedChange={(c) => toggleOrg(org.id, !!c)}
                                            />
                                            <FieldLabel htmlFor={`org-${org.id}`} className="cursor-pointer font-normal">
                                                {org.name}
                                            </FieldLabel>
                                        </Field>
                                    ))}
                                </div>
                            </FieldGroup>
                        </Field>
                    </FieldGroup>
                </CardContent>
            </Card>

            {/* Download buttons */}
            <Card>
                <CardHeader>
                    <CardTitle>Download</CardTitle>
                    <CardDescription>
                        Exportieren Sie die Daten als CSV-Datei.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4">
                    <Button
                        onClick={() => startTransitionIndicator(() => exportCsv('operating'))}
                        disabled={isPendingIndicator || isPendingQualitative || isPendingReflection}
                    >
                        {isPendingIndicator ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="mr-2 h-4 w-4" />
                        )}
                        Betriebsdaten exportieren (CSV)
                    </Button>
                    <Button
                        onClick={() => startTransitionQualitative(() => exportCsv('scoring'))}
                        disabled={isPendingIndicator || isPendingQualitative || isPendingReflection}
                    >
                        {isPendingQualitative ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="mr-2 h-4 w-4" />
                        )}
                        Scoring-Fragen exportieren (CSV)
                    </Button>
                    <Button
                        onClick={() => startTransitionReflection(() => exportCsv('reflection'))}
                        disabled={isPendingIndicator || isPendingQualitative || isPendingReflection}
                    >
                        {isPendingReflection ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Reflexionsdaten exportieren (CSV)
                    </Button>
                    {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
                </CardContent>
            </Card>
        </div>
    )
}
