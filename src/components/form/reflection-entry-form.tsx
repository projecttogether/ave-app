'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useToast } from '@/components/ui/use-toast'
import {
    getUserOrganization,
    getReflectionResponses,
    saveAllReflectionResponses,
} from '@/app/actions/reflection'
import {
    REFLECTION_QUESTIONS,
    INDICATOR_SLUGS,
    INDICATOR_LABELS,
    groupQuestionsByIndicator,
} from '@/lib/reflection/constants'
import type {
    ReflectionFormData,
    IndicatorSlug,
} from '@/lib/reflection/constants'
import type { QuestionConfig, ResponseValue } from '@/lib/questions/types'
import { evaluateQuestionnaire } from '@/lib/questions/completion'
import { Loader2, Save, FileText, CheckCircle2 } from 'lucide-react'

function buildEmptyFormData(): ReflectionFormData {
    const data: ReflectionFormData = {}
    for (const q of REFLECTION_QUESTIONS) {
        data[q.key] = { text: '', option: '', multiple: [], date: '' }
    }
    return data
}

interface ReflectionEntryFormProps {
    indicatorSlug?: IndicatorSlug
}

export function ReflectionEntryForm({ indicatorSlug }: ReflectionEntryFormProps = {}) {
    const { toast } = useToast()

    // Organization
    const [organization, setOrganization] = useState<{ id: string; name: string } | null>(null)

    // Form state
    const [formData, setFormData] = useState<ReflectionFormData>(buildEmptyFormData)
    const [loading, setLoading] = useState(true)
    const [loadFailed, setLoadFailed] = useState(false)
    const [saving, setSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState<Date | null>(null)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
    // The form data as loaded from the server. Only user edits differ from it,
    // so re-renders (e.g. when the organization arrives) never trigger a save.
    const loadedRef = useRef(formData)
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
    // Edits waiting for the debounce; flushed on unmount so navigation keeps them.
    const pendingRef = useRef<ReflectionFormData | null>(null)

    // Pre-compute grouped questions
    const groupedQuestions = useMemo(() => groupQuestionsByIndicator(REFLECTION_QUESTIONS), [])
    const questionnaire = useMemo(() => evaluateQuestionnaire(REFLECTION_QUESTIONS, formData, { includeOptional: true }), [formData])

    // Load organization and existing data
    useEffect(() => {
        async function init() {
            try {
                const org = await getUserOrganization()
                if (!org) {
                    setLoading(false)
                    return
                }
                setOrganization(org)

                const data = await getReflectionResponses(org.id)
                loadedRef.current = data
                setFormData(data)
            } catch (err) {
                console.error('Failed to load reflection data', err)
                // Blank fields would autosave over the stored answers.
                setLoadFailed(true)
            } finally {
                setLoading(false)
            }
        }
        init()
    }, [toast])

    // --- Debounced auto-save ---
    const doSave = useCallback(async (dataToSave: ReflectionFormData) => {
        if (!organization) return
        setSaving(true)
        try {
            const result = await saveAllReflectionResponses(organization.id, dataToSave)
            if (result?.error) {
                toast({
                    title: 'Fehler beim automatischen Speichern',
                    description: result.error,
                    variant: 'destructive',
                })
            } else {
                setLastSaved(new Date())
                setHasUnsavedChanges(false)
            }
        } catch (err: any) {
            toast({
                title: 'Fehler beim automatischen Speichern',
                description: err?.message || 'Bitte versuchen Sie es erneut.',
                variant: 'destructive',
            })
        } finally {
            setSaving(false)
        }
    }, [organization, toast])

    useEffect(() => {
        // Skip auto-save until the user has edited the loaded data
        if (formData === loadedRef.current) {
            pendingRef.current = null
            return
        }
        setHasUnsavedChanges(true)
        pendingRef.current = formData

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
            pendingRef.current = null
            doSave(formData)
        }, 2000)

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        }
    }, [formData, doSave])

    const doSaveRef = useRef(doSave)
    useEffect(() => { doSaveRef.current = doSave }, [doSave])
    useEffect(() => () => {
        if (pendingRef.current) void doSaveRef.current(pendingRef.current)
    }, [])

    useEffect(() => {
        if (!hasUnsavedChanges) return
        const beforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', beforeUnload)
        return () => window.removeEventListener('beforeunload', beforeUnload)
    }, [hasUnsavedChanges])

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
        if (!organization) return
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        pendingRef.current = null
        await doSave(formData)
    }

    // --- Render question input ---
    function renderQuestion(q: QuestionConfig) {
        if (!questionnaire.byKey[q.key].visible) return null

        const val = formData[q.key] || { text: '', option: '', multiple: [], date: '' }
        const inputId = `reflection-${q.key}`

        return (
            <Field key={q.key} className={q.dependsOn ? 'ml-4 pl-4 border-l-2 border-muted' : ''}>
                <FieldLabel htmlFor={inputId}>
                    {q.label}
                </FieldLabel>

                {(q.type === 'long text') && (
                    <Textarea
                        id={inputId}
                        value={val.text || ''}
                        onChange={(e) => updateField(q.key, 'text', e.target.value)}
                        placeholder="Ihre Antwort..."
                        rows={3}
                    />
                )}

                {(q.type === 'short text') && (
                    <Input
                        id={inputId}
                        value={val.text || ''}
                        onChange={(e) => updateField(q.key, 'text', e.target.value)}
                        placeholder="Ihre Antwort..."
                        className="max-w-md"
                    />
                )}

                {q.type === 'date' && (
                    <Input
                        id={inputId}
                        value={val.date || ''}
                        onChange={(e) => updateField(q.key, 'date', e.target.value)}
                        placeholder="TT.MM.JJJJ"
                        className="max-w-xs"
                    />
                )}

                {q.type === 'single-select' && q.options && (
                    <Select
                        value={val.option || ''}
                        onValueChange={(v) => updateField(q.key, 'option', v)}
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
        )
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (loadFailed) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground py-8">
                        Die Reflexionsfragen konnten nicht geladen werden. Bitte laden Sie die Seite neu.
                    </p>
                </CardContent>
            </Card>
        )
    }

    if (!organization) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground py-8">
                        Keine Organisation zugeordnet. Bitte kontaktieren Sie Ihren Administrator.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
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
                <Button onClick={handleSubmit} disabled={saving} size="lg">
                    {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="mr-2 h-4 w-4" />
                    )}
                    Jetzt speichern
                </Button>
            </div>
        </div>
    )
}
