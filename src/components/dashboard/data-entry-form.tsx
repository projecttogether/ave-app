'use client'

import Link from 'next/link'
import { ReportingFrequencySelector } from './reporting-frequency-selector'
import { getReportingPreference } from '@/app/actions/reporting-preferences'
import { unwrapOperatingResult } from '@/lib/operating-data/result'
import { operatingEntryHref } from '@/lib/operating-data/entry-selection'
import { reportingToday } from '@/lib/operating-data/periods'
import type { ReportingFrequency } from '@/lib/operating-data/preferences'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useToast } from '@/components/ui/use-toast'
import { getUserSubOrganizations } from '@/app/actions/sub-organizations'
import { useOperatingDataEditor } from '@/hooks/use-operating-data-editor'
import { OperatingSaveFailures } from './operating-save-failures'
import type { SourceInfo } from 'react-number-format'
import type { OperatingDataFields as IndicatorData } from '@/lib/operating-data/fields'
import { Loader2, CheckCircle2, Lock, Save, HelpCircle } from 'lucide-react'
import { CurrencyInput } from '@/components/ui/currency-input'
import { NumberInput } from '@/components/ui/number-input'
import { AmountEntryHint } from '@/components/dashboard/amount-entry-hint'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useContent } from '@/components/providers/content-provider'
import { getAllowedReportingMonths, getAllowedReportingYears, isFutureReportingPeriod, toDateInputValue } from '@/lib/reporting-period'

interface DataEntryFormProps {
    defaultYear?: number
    defaultSubOrgId?: string
    defaultEntryMode?: 'monthly' | 'yearly'
    defaultMonth?: number
}

function getDefaultReportingYear(defaultYear: number | undefined, entryMode: 'monthly' | 'yearly') {
    const allowedYears = getAllowedReportingYears(entryMode)
    const currentYear = new Date().getFullYear()
    const fallbackYear = allowedYears[allowedYears.length - 1] || currentYear

    if (!defaultYear || allowedYears.length === 0) return fallbackYear
    if (allowedYears.includes(defaultYear)) return defaultYear
    if (defaultYear < allowedYears[0]) return allowedYears[0]
    return fallbackYear
}

function HintBox({ contentKey, fallbackText }: { contentKey: string, fallbackText: string }) {
    const t = useContent()
    const content = t(contentKey) || fallbackText

    if (!content) return null

    return (
        <Popover>
            <PopoverTrigger type="button" className="inline-flex items-center justify-center rounded-full w-4 h-4 hover:bg-muted text-muted-foreground ml-1.5 align-middle">
                <HelpCircle className="w-3.5 h-3.5" />
            </PopoverTrigger>
            <PopoverContent className="w-80 text-sm p-3 font-normal" side="top">
                {content}
            </PopoverContent>
        </Popover>
    )
}


export function DataEntryForm({ defaultYear, defaultSubOrgId, defaultEntryMode, defaultMonth }: DataEntryFormProps) {
    const { toast } = useToast()
    const t = useContent()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    // Selection State
    const [subOrganizations, setSubOrganizations] = useState<any[]>([])
    const [selectedSubOrg, setSelectedSubOrg] = useState<string>('')
    const [entryMode, setEntryMode] = useState<'monthly' | 'yearly'>(defaultEntryMode ?? 'monthly')
    const [year, setYear] = useState<number>(() => getDefaultReportingYear(defaultYear, 'monthly'))
    const [month, setMonth] = useState<number>(defaultMonth ?? reportingToday().month) // Default to current month, 1-indexed
    const [selectionError, setSelectionError] = useState('')
    const [switching, setSwitching] = useState(false)

    const [isLoadingSubs, setIsLoadingSubs] = useState(true)
    const allowedYears = useMemo(() => getAllowedReportingYears(entryMode), [entryMode])
    const allowedMonths = useMemo(() => getAllowedReportingMonths(year), [year])
    const futurePeriod = isFutureReportingPeriod(year, entryMode === 'yearly' ? 0 : month)
    const today = toDateInputValue()

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

    useEffect(() => {
        if (!searchParams.get('year')) {
            updateYearInUrl(year)
        }
    }, [searchParams, updateYearInUrl, year])

    useEffect(() => {
        if (allowedYears.length > 0 && !allowedYears.includes(year)) {
            const nextYear = allowedYears[allowedYears.length - 1]
            setYear(nextYear)
            updateYearInUrl(nextYear)
        }
    }, [allowedYears, updateYearInUrl, year])

    useEffect(() => {
        if (!defaultYear) return
        const nextYear = getDefaultReportingYear(defaultYear, entryMode)
        if (nextYear !== year) setYear(nextYear)
        if (nextYear !== defaultYear) updateYearInUrl(nextYear)
    }, [allowedYears, defaultYear, entryMode, updateYearInUrl, year])

    useEffect(() => {
        if (entryMode === 'monthly' && allowedMonths.length > 0 && !allowedMonths.includes(month)) {
            setMonth(allowedMonths[allowedMonths.length - 1])
        }
    }, [allowedMonths, entryMode, month])

    useEffect(() => {
        if (defaultEntryMode) setEntryMode(defaultEntryMode)
        if (defaultMonth !== undefined) setMonth(defaultMonth)
    }, [defaultEntryMode, defaultMonth])

    // Load User's Sub-Organizations
    useEffect(() => {
        async function loadSubOrgs() {
            try {
                const subs = await getUserSubOrganizations()
                setSubOrganizations(subs || [])
                if (subs && subs.length > 0) {
                    setSelectedSubOrg(defaultSubOrgId ? subs.find(sub => sub.id === defaultSubOrgId)?.id ?? '' : subs[0].id)
                }
            } catch (error) {
                console.error("Failed to load sub-organizations", error)
            } finally {
                setIsLoadingSubs(false)
            }
        }
        loadSubOrgs()
    }, [toast, defaultSubOrgId])

    // Record the initial site in the URL so form-to-form links reopen this site, not a remembered one.
    useEffect(() => {
        if (isLoadingSubs || !selectedSubOrg || searchParams.get('subOrgId')) return
        const params = new URLSearchParams(searchParams)
        if (!params.get('year')) params.set('year', year.toString())
        params.set('subOrgId', selectedSubOrg)
        router.replace(`${pathname}?${params.toString()}${window.location.hash}`)
    }, [isLoadingSubs, selectedSubOrg, searchParams, pathname, router, year])

    const selectedSubOrganization = subOrganizations.find(sub => sub.id === selectedSubOrg)
    const editing = useOperatingDataEditor(selectedSubOrganization ? {
        organizationId: selectedSubOrganization.organizationId,
        subOrganizationId: selectedSubOrg,
        year, month: entryMode === 'yearly' ? 0 : month,
    } : null)
    const formData = editing.data
    const yearFrozen = editing.frozen
    const isLoadingData = editing.loading
    const isSaving = editing.current?.saving ?? false
    const lastSaved = editing.current?.lastSaved
    const hasUnsavedChanges = editing.current?.dirty ?? false
    const readOnly = switching || isLoadingData || yearFrozen || futurePeriod || Boolean(editing.current?.quarterly) || editing.current?.canEditFrequency === false

    async function changeSelection(next: { site?: string; year?: number; month?: number; frequency?: ReportingFrequency }) {
        if (switching) return
        setSwitching(true); setSelectionError('')
        try {
            await editing.saveAndCheck()
            const nextYear = next.year ?? year
            const nextMonth = Math.min(next.month ?? month, getAllowedReportingMonths(nextYear).at(-1) ?? month)
            const nextSite = next.site ?? selectedSubOrg
            // A kitchen/year switch follows the destination's shared choice.
            // Exact task links and month-only switches keep their requested period.
            const nextFrequency = next.frequency ?? (nextSite !== selectedSubOrg || nextYear !== year
                ? unwrapOperatingResult(await getReportingPreference({ subOrganizationId: nextSite, year: nextYear })).frequency ?? entryMode
                : entryMode)
            if (nextFrequency === 'quarterly') {
                router.push(operatingEntryHref(nextSite, { kind: 'quarter', year: nextYear, index: Math.ceil(nextMonth / 3) }))
                return
            }
            setEntryMode(nextFrequency)
            setYear(nextYear); setMonth(nextMonth); setSelectedSubOrg(nextSite)
            router.push(operatingEntryHref(nextSite, nextFrequency === 'yearly'
                ? { kind: 'year', year: nextYear, index: 1 } : { kind: 'month', year: nextYear, index: nextMonth }))
        } catch (e) { setSelectionError(e instanceof Error ? e.message : 'Änderungen konnten nicht gespeichert werden.') }
        finally { setSwitching(false) }
    }

    const handleNumberChange = (field: keyof IndicatorData, value: string | undefined, source: SourceInfo) => {
        if (source.source !== 'event') return
        editing.edit(field, value === undefined ? '' : value)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedSubOrg) {
            toast({ title: "Bitte Organisation wählen", variant: "destructive" })
            return
        }
        await editing.save()
    }

    if (isLoadingSubs) {
        return (
            <div className="flex flex-col items-center justify-center p-8 gap-4">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm text-muted-foreground">Lade Organisationen...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {selectionError && <p role="alert" className="text-destructive">{selectionError}</p>}
            {defaultSubOrgId && !selectedSubOrg && <p role="alert">Der angeforderte Betrieb ist für dieses Formular nicht verfügbar. Bitte einen zugänglichen Betrieb wählen.</p>}
            <ReportingFrequencySelector subOrganizationId={selectedSubOrg} year={year} beforeChange={editing.saveAndCheck} refreshRevision={editing.current?.recordRevision}
                onResolved={frequency => {
                    if (defaultEntryMode || !frequency) return
                    if (frequency === 'quarterly') void changeSelection({ frequency, month: year === reportingToday().year ? reportingToday().month : 1 })
                    else setEntryMode(frequency)
                }}
                onChanged={async (frequency: ReportingFrequency) => {
                    await editing.reload()
                    if (frequency === 'quarterly') {
                        router.push(operatingEntryHref(selectedSubOrg, { kind: 'quarter', year, index: year === reportingToday().year ? Math.ceil(reportingToday().month / 3) : 1 }))
                    } else {
                        setEntryMode(frequency)
                        router.replace(operatingEntryHref(selectedSubOrg, frequency === 'yearly' ? { kind: 'year', year, index: 1 } : { kind: 'month', year, index: month }))
                    }
                }} />
            {entryMode === 'monthly' && <Link className="inline-block text-sm underline" href={operatingEntryHref(selectedSubOrg, { kind: 'month', year, index: month }, 'batch')}>Drei Monate gemeinsam eingeben</Link>}
            {editing.current?.quarterly && <Link className="inline-block text-sm underline" href={operatingEntryHref(selectedSubOrg, { kind: 'quarter', year, index: year === reportingToday().year ? Math.ceil(reportingToday().month / 3) : 1 })}>Quartalserfassung öffnen</Link>}
            <OperatingSaveFailures failures={editing.failures} subOrganizations={subOrganizations} retry={editing.retry} />
            <Card>
                <CardHeader>
                    <CardTitle>Datenerfassung Auswahl</CardTitle>
                    <CardDescription>Wähle Organisation und Zeitraum für die Datenerfassung aus.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FieldGroup>
                        <div className="flex flex-col md:flex-row gap-4">
                            {subOrganizations.length > 1 && (
                                <Field className="w-full max-w-sm">
                                    <FieldLabel htmlFor="sub-org">Organisation</FieldLabel>
                                    <Select value={selectedSubOrg} disabled={switching} onValueChange={value => { void changeSelection({ site: value }) }}>
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

                            <Field className="w-full max-w-[200px]">
                                <FieldLabel htmlFor="year">Jahr</FieldLabel>
                                <Select value={year.toString()} disabled={switching} onValueChange={value => { void changeSelection({ year: Number(value) }) }}>
                                    <SelectTrigger id="year">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allowedYears.map(y => (
                                            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>

                            {entryMode === 'monthly' && (
                                <Field className="w-full max-w-[200px]">
                                    <FieldLabel htmlFor="month">Monat</FieldLabel>
                                    <Select value={month.toString()} disabled={switching} onValueChange={value => { void changeSelection({ month: Number(value) }) }}>
                                        <SelectTrigger id="month">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allowedMonths.map(m => (
                                                <SelectItem key={m} value={m.toString()}>
                                                    {new Date(0, m - 1).toLocaleString('de-DE', { month: 'long' })}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>
                            )}
                        </div>

                        {entryMode === 'yearly' && (
                            <FieldDescription>
                                Gib die kumulierten Werte für das gesamte Jahr {year} ein.
                            </FieldDescription>
                        )}
                    </FieldGroup>
                </CardContent>
            </Card>

            {isLoadingData ? (
                <div className="flex flex-col items-center justify-center p-8 gap-4">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm text-muted-foreground">Lade Daten...</p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
            {yearFrozen && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200">
                    <Lock className="h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-medium">Berichtsjahr {year} ist gesperrt</p>
                        <p className="text-sm opacity-80">Daten für dieses Jahr können nicht mehr bearbeitet werden.</p>
                    </div>
                </div>
            )}
            {futurePeriod && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200">
                    <Lock className="h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-medium">Zeitraum liegt in der Zukunft</p>
                        <p className="text-sm opacity-80">Daten können nur für abgeschlossene Jahre sowie vergangene oder aktuelle Monate erfasst werden.</p>
                    </div>
                </div>
            )}
                    {editing.current?.quarterly && <p className="rounded border p-3 text-sm">Dieses Betriebsjahr wird quartalsweise erfasst. Bitte die Quartalserfassung oben öffnen; Monats- und Jahreswerte können hier nicht zusätzlich gespeichert werden.</p>}
                    <fieldset disabled={readOnly} className="space-y-6">
                    {/* General Financials */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Allgemeine Finanzdaten</CardTitle>
                            <AmountEntryHint id="data-entry-total-spend-hint" />
                        </CardHeader>
                        <CardContent>
                            <FieldGroup className="grid md:grid-cols-2 gap-6">
                                <Field>
                                    <FieldLabel htmlFor="totalFoodSpend">
                                        {t("form.operating.label.totalFoodSpend")}
                                        <HintBox contentKey="form.operating.hint.totalFoodSpend" fallbackText="Gib hier Deine absoluten Gesamtausgaben für Lebensmittel (ohne Getränke und Non-Food-Artikel) im gewählten Zeitraum an." />
                                    </FieldLabel>
                                    <CurrencyInput
                                        id="totalFoodSpend"
                                        value={formData.totalFoodSpend}
                                        onValueChange={(vals, source) => handleNumberChange('totalFoodSpend', vals.value, source)}
                                        aria-describedby="data-entry-total-spend-hint"
                                    />

                                </Field>
                            </FieldGroup>
                        </CardContent>
                    </Card>

                    {/* Indicator 1: Pflanzliche Lebensmittel */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Pflanzliche Lebensmittel</CardTitle>
                            <AmountEntryHint id="data-entry-plant-based-hint" />
                        </CardHeader>
                        <CardContent>
                            <FieldGroup className="grid md:grid-cols-2 gap-4 border p-4 rounded-md">
                                <Field>
                                    <FieldLabel htmlFor="meatSpend">
                                        {t("form.operating.label.meatSpend")}
                                        <HintBox contentKey="form.operating.hint.meatSpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Fleisch ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput
                                        id="meatSpend"
                                        value={formData.meatSpend}
                                        onValueChange={(vals, source) => handleNumberChange('meatSpend', vals.value, source)}
                                        aria-describedby="data-entry-plant-based-hint"
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="fishSpend">
                                        {t("form.operating.label.fishSpend")}
                                        <HintBox contentKey="form.operating.hint.fishSpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Fisch ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput
                                        id="fishSpend"
                                        value={formData.fishSpend}
                                        onValueChange={(vals, source) => handleNumberChange('fishSpend', vals.value, source)}
                                        aria-describedby="data-entry-plant-based-hint"
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="dairySpend">
                                        {t("form.operating.label.dairySpend")}
                                        <HintBox contentKey="form.operating.hint.dairySpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Molkereiprodukte (Milch, Käse etc.) ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput
                                        id="dairySpend"
                                        value={formData.dairySpend}
                                        onValueChange={(vals, source) => handleNumberChange('dairySpend', vals.value, source)}
                                        aria-describedby="data-entry-plant-based-hint"
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="eggSpend">
                                        {t("form.operating.label.eggSpend")}
                                        <HintBox contentKey="form.operating.hint.eggSpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Eier ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput
                                        id="eggSpend"
                                        value={formData.eggSpend}
                                        onValueChange={(vals, source) => handleNumberChange('eggSpend', vals.value, source)}
                                        aria-describedby="data-entry-plant-based-hint"
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="mixedProductSpend">
                                        {t("form.operating.label.mixedProductSpend")}
                                        <HintBox contentKey="form.operating.hint.mixedProductSpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Mischprodukte (z. B. vegetarische Fertiggerichte) ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput
                                        id="mixedProductSpend"
                                        value={formData.mixedProductSpend}
                                        onValueChange={(vals, source) => handleNumberChange('mixedProductSpend', vals.value, source)}
                                        aria-describedby="data-entry-plant-based-hint"
                                    />
                                </Field>
                            </FieldGroup>
                        </CardContent>
                    </Card>

                    {/* Indicator 2: Ökologische Lebensmittel */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Ökologische Lebensmittel</CardTitle>
                            <AmountEntryHint id="data-entry-organic-hint" />
                        </CardHeader>
                        <CardContent>
                            <FieldGroup className="grid md:grid-cols-2 gap-4 border p-4 rounded-md">
                                <Field>
                                    <FieldLabel htmlFor="organicSpend">
                                        {t("form.operating.label.organicSpend")}
                                        <HintBox contentKey="form.operating.hint.organicSpend" fallbackText="Ausgaben für zertifizierte Bio-Produkte im gewählten Zeitraum." />
                                    </FieldLabel>
                                    <CurrencyInput
                                        id="organicSpend"
                                        value={formData.organicSpend}
                                        onValueChange={(vals, source) => handleNumberChange('organicSpend', vals.value, source)}
                                        aria-describedby="data-entry-organic-hint"
                                    />
                                </Field>
                            </FieldGroup>
                        </CardContent>
                    </Card>

                    {/* Indicator 3: Lebensmittelabfälle */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Lebensmittelabfälle</CardTitle>
                            <AmountEntryHint id="data-entry-food-waste-hint" />
                        </CardHeader>
                        <CardContent>
                            <FieldGroup className="grid md:grid-cols-2 gap-4 border p-4 rounded-md">
                                <Field>
                                    <FieldLabel htmlFor="foodWasteBaseDate">
                                        Datum der Ersterhebung
                                        <HintBox contentKey="form.operating.hint.foodWasteBase" fallbackText="Erste Datenerfassung (Basisjahr): Diese Werte gelten für den gesamten Betrieb und müssen nur einmalig eingegeben werden." />
                                    </FieldLabel>
                                    <input
                                        type="date"
                                        id="foodWasteBaseDate"
                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                        value={formData.foodWasteBaseDate as string}
                                        max={today}
                                        onChange={(e) => editing.edit('foodWasteBaseDate', e.target.value)}
                                        disabled={readOnly}
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="foodWasteBaseAmount">Erfasste Abfallmenge im Basisjahr (kg/Jahr)</FieldLabel>
                                    <NumberInput id="foodWasteBaseAmount" value={formData.foodWasteBaseAmount} onValueChange={(vals, source) => handleNumberChange('foodWasteBaseAmount', vals.value, source)} aria-describedby="data-entry-food-waste-hint" suffix=" kg" disabled={readOnly} />
                                </Field>
                                <Field className="col-span-full">
                                    <FieldLabel htmlFor="foodWasteAmount">Erfasste Abfallmenge im aktuellen Berichtsjahr/-monat (kg)</FieldLabel>
                                    <NumberInput id="foodWasteAmount" value={formData.foodWasteAmount} onValueChange={(vals, source) => handleNumberChange('foodWasteAmount', vals.value, source)} aria-describedby="data-entry-food-waste-hint" suffix=" kg" disabled={readOnly} />
                                </Field>
                            </FieldGroup>
                        </CardContent>
                    </Card>

                    {/* Indicator 6: Faire Beziehungen (Fair Trade) */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Faire Beziehungen</CardTitle>
                            <AmountEntryHint id="data-entry-fair-trade-hint" />
                        </CardHeader>
                        <CardContent>
                            <FieldGroup className="grid md:grid-cols-2 gap-4 border p-4 rounded-md">
                                <Field>
                                    <FieldLabel htmlFor="coffeeSpend">
                                        {t("form.operating.label.coffeeSpend")}
                                        <HintBox contentKey="form.operating.hint.coffeeSpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Kaffee insgesamt ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput id="coffeeSpend" value={formData.coffeeSpend} onValueChange={(vals, source) => handleNumberChange('coffeeSpend', vals.value, source)} aria-describedby="data-entry-fair-trade-hint" />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="fairTradeCoffeeSpend">
                                        {t("form.operating.label.fairTradeCoffeeSpend")}
                                        <HintBox contentKey="form.operating.hint.fairTradeCoffeeSpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Fair Trade zertifizierten Kaffee ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput id="fairTradeCoffeeSpend" value={formData.fairTradeCoffeeSpend} onValueChange={(vals, source) => handleNumberChange('fairTradeCoffeeSpend', vals.value, source)} aria-describedby="data-entry-fair-trade-hint" />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="cocoaSpend">
                                        {t("form.operating.label.cocoaSpend")}
                                        <HintBox contentKey="form.operating.hint.cocoaSpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Kakao insgesamt ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput id="cocoaSpend" value={formData.cocoaSpend} onValueChange={(vals, source) => handleNumberChange('cocoaSpend', vals.value, source)} aria-describedby="data-entry-fair-trade-hint" />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="fairTradeCocoaSpend">
                                        {t("form.operating.label.fairTradeCocoaSpend")}
                                        <HintBox contentKey="form.operating.hint.fairTradeCocoaSpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Fair Trade zertifizierten Kakao ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput id="fairTradeCocoaSpend" value={formData.fairTradeCocoaSpend} onValueChange={(vals, source) => handleNumberChange('fairTradeCocoaSpend', vals.value, source)} aria-describedby="data-entry-fair-trade-hint" />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="cocoaMixedSpend">
                                        {t("form.operating.label.cocoaMixedSpend")}
                                        <HintBox contentKey="form.operating.hint.cocoaMixedSpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Kakao-Mischprodukte insgesamt ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput id="cocoaMixedSpend" value={formData.cocoaMixedSpend} onValueChange={(vals, source) => handleNumberChange('cocoaMixedSpend', vals.value, source)} aria-describedby="data-entry-fair-trade-hint" />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="fairTradeCocoaMixedSpend">
                                        {t("form.operating.label.fairTradeCocoaMixedSpend")}
                                        <HintBox contentKey="form.operating.hint.fairTradeCocoaMixedSpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Fair Trade zertifizierte Kakao-Mischprodukte ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput id="fairTradeCocoaMixedSpend" value={formData.fairTradeCocoaMixedSpend} onValueChange={(vals, source) => handleNumberChange('fairTradeCocoaMixedSpend', vals.value, source)} aria-describedby="data-entry-fair-trade-hint" />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="bananasSpend">
                                        {t("form.operating.label.bananasSpend")}
                                        <HintBox contentKey="form.operating.hint.bananasSpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Bananen insgesamt ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput id="bananasSpend" value={formData.bananasSpend} onValueChange={(vals, source) => handleNumberChange('bananasSpend', vals.value, source)} aria-describedby="data-entry-fair-trade-hint" />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="fairTradeBananasSpend">
                                        {t("form.operating.label.fairTradeBananasSpend")}
                                        <HintBox contentKey="form.operating.hint.fairTradeBananasSpend" fallbackText="Wie viel hast Du im gewählten Zeitraum für Fair Trade zertifizierte Bananen ausgegeben?" />
                                    </FieldLabel>
                                    <CurrencyInput id="fairTradeBananasSpend" value={formData.fairTradeBananasSpend} onValueChange={(vals, source) => handleNumberChange('fairTradeBananasSpend', vals.value, source)} aria-describedby="data-entry-fair-trade-hint" />
                                </Field>
                            </FieldGroup>
                        </CardContent>
                    </Card>

                    </fieldset>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <p className="w-full text-sm text-muted-foreground sm:mr-auto sm:w-auto">
                            Auch unvollständige Eingaben werden gespeichert.
                        </p>
                        {isSaving && (
                            <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Speichern...
                            </span>
                        )}
                        {!isSaving && lastSaved && !hasUnsavedChanges && (
                            <span className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                                <CheckCircle2 className="h-4 w-4" />
                                Eingaben gespeichert
                            </span>
                        )}
                        <Button type="submit" disabled={isSaving || readOnly}>
                            {isSaving ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            Jetzt speichern
                        </Button>
                    </div>
                </form>
            )}
        </div>
    )
}
