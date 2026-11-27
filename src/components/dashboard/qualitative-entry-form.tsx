'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useToast } from '@/components/ui/use-toast'
import { getUserSubOrganizations } from '@/app/actions/sub-organizations'

import {
    SCORING_QUESTIONS,
    INDICATOR_SLUGS,
    INDICATOR_LABELS,
    groupQuestionsByIndicator,
} from '@/lib/qualitative/constants'
import type {
    QualitativeFormData,
    IndicatorSlug,
} from '@/lib/qualitative/constants'
import type { QuestionConfig, ResponseValue } from '@/lib/questions/types'
import { Loader2, Save, FileText, Lock, CheckCircle2 } from 'lucide-react'
import { usePeriodAutosave } from '@/hooks/use-period-autosave'
import { qualitativePeriodAdapter } from '@/lib/forms/qualitative-entry'
import { evaluateQuestionnaire } from '@/lib/questions/completion'
import { getAllowedReportingYears, isFutureReportingPeriod } from '@/lib/reporting-period'

const currentYear = new Date().getFullYear()
const AVAILABLE_YEARS = getAllowedReportingYears('yearly')

function getDefaultYear(defaultYear?: number) {
    const fallbackYear = AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1] || currentYear

    if (!defaultYear || AVAILABLE_YEARS.length === 0) return fallbackYear
    if (AVAILABLE_YEARS.includes(defaultYear)) return defaultYear
    if (defaultYear < AVAILABLE_YEARS[0]) return AVAILABLE_YEARS[0]
    return fallbackYear
}

function buildEmptyFormData(): QualitativeFormData {
    const data: QualitativeFormData = {}
    for (const q of SCORING_QUESTIONS) {
        data[q.key] = { text: '', option: '', multiple: [], date: '' }
    }
    return data
}

const initialData = buildEmptyFormData()

interface QualitativeEntryFormProps {
    indicatorSlug?: IndicatorSlug
    defaultYear?: number
    defaultSubOrgId?: string
}

export function QualitativeEntryForm({ indicatorSlug, defaultYear, defaultSubOrgId }: QualitativeEntryFormProps = {}) {
    const { toast } = useToast()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    // Selection state – org and sub-org
    const [subOrganizations, setSubOrganizations] = useState<any[]>([])
    const [selectedSubOrg, setSelectedSubOrg] = useState<string>('')
    const [selectedYear, setSelectedYear] = useState<string>(() => getDefaultYear(defaultYear).toString())

    const [initialLoading, setInitialLoading] = useState(true)
    const futurePeriod = isFutureReportingPeriod(parseInt(selectedYear), 0)

    const updateYearInUrl = useCallback((nextYear: number, method: 'push' | 'replace' = 'replace') => {
        const params = new URLSearchParams(searchParams)
        params.set('year', nextYear.toString())
        const url = `${pathname}?${params.toString()}`
        if (method === 'push') {
            router.push(url)
        } else {
            router.replace(url)
        }
    }, [pathname, router, searchParams])

    const handleYearChange = useCallback((nextYear: string) => {
        const yearNumber = Number(nextYear)
        setSelectedYear(nextYear)
        updateYearInUrl(yearNumber, 'push')
    }, [updateYearInUrl])

    // Keep the URL's site in step with the selector so navigation links reopen the same site.
    const handleSubOrgChange = useCallback((value: string) => {
        setSelectedSubOrg(value)
        const params = new URLSearchParams(searchParams)
        params.set('subOrgId', value)
        router.replace(`${pathname}?${params.toString()}${window.location.hash}`)
    }, [pathname, router, searchParams])

    useEffect(() => {
        if (!searchParams.get('year')) {
            updateYearInUrl(parseInt(selectedYear))
        }
    }, [searchParams, selectedYear, updateYearInUrl])

    useEffect(() => {
        const nextYear = getDefaultYear(defaultYear || parseInt(selectedYear))
        const selectedYearNumber = parseInt(selectedYear)
        if (nextYear !== selectedYearNumber) {
            setSelectedYear(nextYear.toString())
        }
        if (defaultYear && nextYear !== defaultYear) {
            updateYearInUrl(nextYear)
        }
    }, [defaultYear, selectedYear, updateYearInUrl])

    // Pre-compute grouped questions
    const groupedQuestions = useMemo(() => groupQuestionsByIndicator(SCORING_QUESTIONS), [])

    // Load user's sub-organizations on mount
    useEffect(() => {
        async function loadSubOrgs() {
            try {
                const subs = await getUserSubOrganizations()
                setSubOrganizations(subs || [])
                if (subs && subs.length > 0) {
                    setSelectedSubOrg(defaultSubOrgId ? subs.find(sub => sub.id === defaultSubOrgId)?.id ?? '' : subs[0].id)
                }
            } catch (err) {
                console.error('Failed to load sub-organizations', err)
            } finally {
                setInitialLoading(false)
            }
        }
        loadSubOrgs()
    }, [defaultSubOrgId])

    // Record the initial site in the URL so form-to-form links reopen this site, not a remembered one.
    useEffect(() => {
        if (initialLoading || !selectedSubOrg || searchParams.get('subOrgId')) return
        const params = new URLSearchParams(searchParams)
        if (!params.get('year')) params.set('year', selectedYear)
        params.set('subOrgId', selectedSubOrg)
        router.replace(`${pathname}?${params.toString()}${window.location.hash}`)
    }, [initialLoading, selectedSubOrg, searchParams, pathname, router, selectedYear])

    const adapter = useMemo(() => qualitativePeriodAdapter((error, phase) => {
        toast({
            title: phase === 'load' ? 'Daten konnten nicht geladen werden' : 'Fehler beim automatischen Speichern',
            description: error instanceof Error ? error.message : 'Bitte versuchen Sie es erneut.',
            variant: 'destructive',
        })
    }), [toast])
    const selectedOrganization = subOrganizations.find(org => org.id === selectedSubOrg)
    const { formData, setFormData, loading, saving, frozen: yearFrozen, lastSaved,
        hasUnsavedChanges, readOnly, save } = usePeriodAutosave(selectedOrganization ? {
        organizationId: selectedOrganization.organizationId, subOrganizationId: selectedSubOrg,
        year: Number(selectedYear), month: 0,
    } : null, adapter, initialData)
    const questionnaire = useMemo(() => evaluateQuestionnaire(SCORING_QUESTIONS, formData), [formData])

    // Scroll to field if hash is present
    useEffect(() => {
        if (!loading && window.location.hash) {
            const id = window.location.hash.substring(1)
            const element = document.getElementById(id)
            if (element) {
                setTimeout(() => {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    element.classList.add('ring-2', 'ring-primary', 'ring-offset-4')
                    setTimeout(() => element.classList.remove('ring-2', 'ring-primary', 'ring-offset-4'), 3000)
                }, 100)
            }
        }
    }, [loading, selectedSubOrg, selectedYear])

    // --- Change handlers ---

    function updateField(questionKey: string, field: keyof ResponseValue, value: any) {
        setFormData((prev) => ({
            ...prev,
            [questionKey]: {
                ...prev[questionKey],
                [field]: value,
            },
        }))
    }

    function handleMultipleToggle(questionKey: string, option: string, checked: boolean) {
        setFormData((prev) => {
            const current = prev[questionKey]?.multiple || []
            const next = checked
                ? [...current, option]
                : current.filter((o) => o !== option)
            return {
                ...prev,
                [questionKey]: {
                    ...prev[questionKey],
                    multiple: next,
                },
            }
        })
    }

    const handleSubmit = async () => {
        if (!selectedSubOrg) {
            toast({
                title: 'Fehler',
                description: 'Keine Organisation zugewiesen.',
                variant: 'destructive',
            })
            return
        }
        await save()
    }

    // --- Render question input ---
    function renderQuestion(q: QuestionConfig) {
        const state = questionnaire.byKey[q.key]
        if (!state.visible) return null

        const val = formData[q.key] || { text: '', option: '', multiple: [], date: '' }
        const inputId = `scoring-${q.key}`
        
        const missing = state.missing
        const filled = state.answered
        
        const wrapperClass = `transition-all duration-300 rounded-md p-1 -mx-1 ${q.dependsOn ? 'ml-4 pl-4 border-l-2 border-muted' : ''} ${filled ? 'opacity-50 hover:opacity-100 focus-within:opacity-100' : ''} ${missing ? 'border-l-4 border-l-yellow-500 pl-4 py-2 bg-yellow-50 dark:bg-yellow-950/20' : ''}`

        return (
            <div key={q.key} id={`${inputId}-container`} className={wrapperClass}>
            <Field className="w-full">
                <FieldLabel htmlFor={inputId}>
                    {q.numbering && (
                        <span className="mr-2 font-mono text-xs text-muted-foreground tabular-nums shrink-0">
                            {q.numbering}
                        </span>
                    )}
                    {q.label}
                    {missing && <span className="ml-2 text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">Erforderlich</span>}
                </FieldLabel>

                {(q.type === 'long text') && (
                    <Textarea
                        id={inputId}
                        value={val.text || ''}
                        onChange={(e) => updateField(q.key, 'text', e.target.value)}
                        placeholder="Ihre Antwort..."
                        rows={3}
                        disabled={readOnly}
                    />
                )}

                {(q.type === 'short text') && (
                    <Input
                        id={inputId}
                        value={val.text || ''}
                        onChange={(e) => updateField(q.key, 'text', e.target.value)}
                        placeholder="Ihre Antwort..."
                        disabled={readOnly}
                        className="max-w-md"
                    />
                )}

                {q.type === 'date' && (
                    <Input
                        id={inputId}
                        value={val.date || ''}
                        onChange={(e) => updateField(q.key, 'date', e.target.value)}
                        placeholder="TT.MM.JJJJ"
                        disabled={readOnly}
                        className="max-w-xs"
                    />
                )}

                {q.type === 'single-select' && q.options && (
                    <Select
                        value={val.option || ''}
                        onValueChange={(v) => updateField(q.key, 'option', v)}
                        disabled={readOnly}
                    >
                        <SelectTrigger className="max-w-sm">
                            <SelectValue placeholder="Bitte wählen..." />
                        </SelectTrigger>
                        <SelectContent>
                            {q.options.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                    {opt}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {q.type === 'multiple-choice' && q.options && (
                    <FieldGroup className="gap-3">
                        {q.options.map((opt) => (
                            <Field key={opt} orientation="horizontal">
                                <Checkbox
                                    id={`${inputId}-${opt}`}
                                    checked={val.multiple?.includes(opt) || false}
                                    onCheckedChange={(checked) =>
                                        handleMultipleToggle(q.key, opt, checked as boolean)
                                    }
                                    disabled={readOnly}
                                />
                                <FieldLabel
                                    htmlFor={`${inputId}-${opt}`}
                                    className="text-sm font-normal cursor-pointer"
                                >
                                    {opt}
                                </FieldLabel>
                            </Field>
                        ))}
                    </FieldGroup>
                )}
            </Field>
            </div>
        )
    }

    if (initialLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="pt-6">
                    <FieldGroup className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                        {subOrganizations.length > 1 && (
                            <Field>
                                <FieldLabel htmlFor="sub-org">Organisation</FieldLabel>
                                <Select value={selectedSubOrg} onValueChange={handleSubOrgChange}>
                                    <SelectTrigger id="sub-org">
                                        <SelectValue placeholder="Organisation wählen" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {subOrganizations.map(org => (
                                            <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                        <Field>
                            <FieldLabel htmlFor="reporting-year">Berichtsjahr</FieldLabel>
                            <Select value={selectedYear} onValueChange={handleYearChange}>
                                <SelectTrigger id="reporting-year">
                                    <SelectValue placeholder="Jahr wählen..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {AVAILABLE_YEARS.map((y) => (
                                        <SelectItem key={y} value={y.toString()}>
                                            {y}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    </FieldGroup>
                </CardContent>
            </Card>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : !selectedSubOrg ? (
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-center text-muted-foreground py-8">
                            Keine Organisation zugewiesen. Bitte wenden Sie sich an einen Administrator.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {yearFrozen && (
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200">
                            <Lock className="h-5 w-5 shrink-0" />
                            <div>
                                <p className="font-medium">Berichtsjahr {selectedYear} ist gesperrt</p>
                                <p className="text-sm opacity-80">Daten für dieses Jahr können nicht mehr bearbeitet werden.</p>
                            </div>
                        </div>
                    )}
                    {futurePeriod && (
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200">
                            <Lock className="h-5 w-5 shrink-0" />
                            <div>
                                <p className="font-medium">Berichtsjahr liegt in der Zukunft</p>
                                <p className="text-sm opacity-80">Scoring-Daten können nur für abgeschlossene Jahre erfasst werden.</p>
                            </div>
                        </div>
                    )}

                    {/* One card per indicator */}
                    {(indicatorSlug ? [indicatorSlug] : INDICATOR_SLUGS).map((slug) => {
                        const groups = groupedQuestions.get(slug)
                        if (!groups) return null

                        return (
                            <Card key={slug}>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-primary" />
                                        {INDICATOR_LABELS[slug]}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <FieldGroup className="gap-8">
                                        {Array.from(groups.entries()).map(([groupName, questions]) => (
                                            <FieldGroup key={groupName} className="gap-4">
                                                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide border-b pb-2">
                                                    {groupName}
                                                </h4>
                                                {questions.map(renderQuestion)}
                                            </FieldGroup>
                                        ))}
                                    </FieldGroup>
                                </CardContent>
                            </Card>
                        )
                    })}

                    {/* Save status */}
                    <div className="flex items-center justify-end gap-3">
                        {saving && (
                            <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Speichern...
                            </span>
                        )}
                        {!saving && lastSaved && !hasUnsavedChanges && (
                            <span className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                                <CheckCircle2 className="h-4 w-4" />
                                Gespeichert
                            </span>
                        )}
                        <Button onClick={handleSubmit} disabled={saving || readOnly} size="lg">
                            {saving ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            Jetzt speichern
                        </Button>
                    </div>
                </>
            )}
        </div>
    )
}
