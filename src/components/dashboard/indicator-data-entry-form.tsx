'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ReportingFrequencySelector } from './reporting-frequency-selector'
import { operatingEntryHref } from '@/lib/operating-data/entry-selection'
import { reportingToday } from '@/lib/operating-data/periods'
import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { useToast } from '@/components/ui/use-toast'
import { useOperatingDataEditor } from '@/hooks/use-operating-data-editor'
import { OperatingSaveFailures } from './operating-save-failures'
import type { SourceInfo } from 'react-number-format'
import type { OperatingDataFields as IndicatorDataFields } from '@/lib/operating-data/fields'
import { Loader2, CheckCircle2, Lock, Save, HelpCircle } from 'lucide-react'
import { CurrencyInput } from '@/components/ui/currency-input'
import { NumberInput } from '@/components/ui/number-input'
import { AmountEntryHint } from '@/components/dashboard/amount-entry-hint'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { INDICATOR_CONFIG } from '@/lib/indicators/config'
import { getUserSubOrganizations } from '@/app/actions/sub-organizations'
import { getAllowedReportingMonths, getAllowedReportingYears, isFutureReportingPeriod, toDateInputValue } from '@/lib/reporting-period'

function HintBox({ text }: { text: React.ReactNode }) {
    if (!text) return null
    return (
        <Popover>
            <PopoverTrigger type="button" className="inline-flex items-center justify-center rounded-full w-4 h-4 hover:bg-muted text-muted-foreground ml-1.5 align-middle">
                <HelpCircle className="w-3.5 h-3.5" />
            </PopoverTrigger>
            <PopoverContent className="w-80 text-sm p-3 font-normal" side="top">
                {text}
            </PopoverContent>
        </Popover>
    )
}


interface IndicatorDataEntryFormProps {
    slug: string
    currentSubOrgId: string
    currentYear: number
}

export function IndicatorDataEntryForm({ slug, currentSubOrgId, currentYear }: IndicatorDataEntryFormProps) {
    const router = useRouter()
    const { toast } = useToast()
    const config = INDICATOR_CONFIG[slug]

    // Form selection state
    const [subOrganizations, setSubOrganizations] = useState<any[]>([])
    const [selectedSubOrg, setSelectedSubOrg] = useState<string>('')
    const [isLoadingSubs, setIsLoadingSubs] = useState(true)
    const [entryMode, setEntryMode] = useState<'monthly' | 'yearly'>('monthly')
    const [year, setYear] = useState<number>(currentYear)
    const [month, setMonth] = useState<number>(reportingToday().month)
    const [selectionError, setSelectionError] = useState('')
    const [switching, setSwitching] = useState(false)

    // Sync external props (initial load / navigation)
    useEffect(() => {
        if (currentYear) setYear(currentYear)
    }, [currentYear])

    // Load User's Sub-Organizations
    useEffect(() => {
        async function loadSubOrgs() {
            try {
                const subs = await getUserSubOrganizations()
                setSubOrganizations(subs || [])
                
                // Determine initial selection
                if (currentSubOrgId && currentSubOrgId !== 'all') {
                    // Check if currentSubOrgId is valid for this user
                    const isValid = subs?.some(s => s.id === currentSubOrgId)
                    if (isValid) setSelectedSubOrg(currentSubOrgId)
                    else setSelectedSubOrg('')
                } else if (subs && subs.length > 0) {
                    setSelectedSubOrg(subs[0].id)
                }
            } catch (error) {
                console.error("Failed to load sub-organizations", error)
            } finally {
                setIsLoadingSubs(false)
            }
        }
        loadSubOrgs()
    }, [currentSubOrgId])

    const targetFields = useMemo(() => {
        const fields = new Set<string>()
        if (config?.column) fields.add(config.column)
        if (config?.spendColumn) fields.add(config.spendColumn)
        if (config?.spendColumns) config.spendColumns.forEach((c: any) => fields.add(c))
        if (slug === 'total_spend' || slug === 'plant_based_percentage' || slug === 'organic_percentage' || slug === 'fair_trade_percentage') {
            fields.add('totalFoodSpend')
        }
        return fields
    }, [config, slug])
    const allowedYears = getAllowedReportingYears(entryMode)
    const allowedMonths = getAllowedReportingMonths(year)
    const futurePeriod = isFutureReportingPeriod(year, entryMode === 'yearly' ? 0 : month)
    const today = toDateInputValue()

    useEffect(() => {
        if (allowedYears.length > 0 && !allowedYears.includes(year)) {
            setYear(allowedYears[allowedYears.length - 1])
        }
    }, [allowedYears, year])

    useEffect(() => {
        if (entryMode === 'monthly' && allowedMonths.length > 0 && !allowedMonths.includes(month)) {
            setMonth(allowedMonths[allowedMonths.length - 1])
        }
    }, [allowedMonths, entryMode, month])

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

    async function changeSelection(change: () => void) {
        if (switching) return
        setSwitching(true); setSelectionError('')
        try { await editing.saveAndCheck(); change() }
        catch (e) { setSelectionError(e instanceof Error ? e.message : 'Änderungen konnten nicht gespeichert werden.') }
        finally { setSwitching(false) }
    }

    const handleNumberChange = (field: keyof IndicatorDataFields, value: string | undefined, source: SourceInfo) => {
        if (source.source !== 'event') return
        editing.edit(field, value === undefined ? '' : value)
    }

    const handleTextChange = (field: keyof IndicatorDataFields, value: string) => {
        editing.edit(field, value)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedSubOrg) {
            toast({ title: "Bitte Organisation wählen", variant: "destructive" })
            return
        }
        await editing.save()
    }

    const needsPlantBased = targetFields.has('meatSpend') || targetFields.has('fishSpend') || targetFields.has('dairySpend') || targetFields.has('eggSpend')
    const needsOrganic = targetFields.has('organicSpend')
    const needsFairTrade = targetFields.has('fairTradeCoffeeSpend') || targetFields.has('fairTradeCocoaSpend') || targetFields.has('fairTradeBananasSpend') || targetFields.has('fairTradeCocoaMixedSpend') || targetFields.has('coffeeSpend') || targetFields.has('cocoaSpend') || targetFields.has('bananasSpend') || targetFields.has('cocoaMixedSpend')
    const needsFoodWaste = targetFields.has('foodWasteAmount') || slug === 'food_waste'

    if (!config) return null

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
            {currentSubOrgId && currentSubOrgId !== 'all' && !selectedSubOrg && <p role="alert">Der angeforderte Betrieb ist für dieses Formular nicht verfügbar.</p>}
            <ReportingFrequencySelector subOrganizationId={selectedSubOrg} year={year} beforeChange={editing.saveAndCheck} refreshRevision={editing.current?.recordRevision}
                onResolved={frequency => {
                    if (frequency === 'quarterly') {
                        void changeSelection(() => router.replace(operatingEntryHref(selectedSubOrg, { kind: 'quarter', year, index: year === reportingToday().year ? Math.ceil(reportingToday().month / 3) : 1 })))
                    } else if (frequency) setEntryMode(frequency)
                }}
                onChanged={async frequency => {
                    await editing.reload()
                    if (frequency === 'quarterly') router.push(operatingEntryHref(selectedSubOrg, { kind: 'quarter', year, index: year === reportingToday().year ? Math.ceil(reportingToday().month / 3) : 1 }))
                    else setEntryMode(frequency)
                }} />
            {editing.current?.quarterly && <Link className="text-sm underline" href={operatingEntryHref(selectedSubOrg, { kind: 'quarter', year, index: year === reportingToday().year ? Math.ceil(reportingToday().month / 3) : 1 })}>Quartalserfassung öffnen</Link>}
            <OperatingSaveFailures failures={editing.failures} subOrganizations={subOrganizations} retry={editing.retry} />
            <Card>
                <CardHeader>
                    <CardTitle>Datenerfassung: {config.title}</CardTitle>
                    <CardDescription>Erfasse die spezifischen Datenbeträge für diesen Indikator.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FieldGroup>
                        <div className="flex flex-col md:flex-row gap-4">
                            {subOrganizations.length > 1 && (
                                <Field className="w-full max-w-sm">
                                    <FieldLabel htmlFor="sub-org">Organisation</FieldLabel>
                                    <Select value={selectedSubOrg} disabled={switching} onValueChange={v => { void changeSelection(() => setSelectedSubOrg(v)) }}>
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
                                <Select value={year.toString()} disabled={switching} onValueChange={v => { void changeSelection(() => setYear(Number(v))) }}>
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
                                    <Select value={month.toString()} disabled={switching} onValueChange={v => { void changeSelection(() => setMonth(Number(v))) }}>
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
                        
                        {targetFields.has('totalFoodSpend') && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Basis-Datenbank</CardTitle>
                                    <AmountEntryHint id="indicator-entry-total-spend-hint" />
                                </CardHeader>
                                <CardContent>
                                    <Field>
                                        <FieldLabel htmlFor="totalFoodSpend">
                                            Gesamteinkauf Lebensmittel (€)
                                            <HintBox text="Gib hier Deine absoluten Gesamtausgaben für Lebensmittel (ohne Getränke und Non-Food-Artikel) im gewählten Zeitraum an." />
                                        </FieldLabel>
                                        <CurrencyInput
                                            id="totalFoodSpend"
                                            value={formData.totalFoodSpend}
                                            onValueChange={(vals, source) => handleNumberChange('totalFoodSpend', vals.value, source)}
                                            aria-describedby="indicator-entry-total-spend-hint indicator-entry-total-spend-description"
                                        />
                                        <FieldDescription id="indicator-entry-total-spend-description">Wird für alle %-Berechnungen benötigt.</FieldDescription>
                                    </Field>
                                </CardContent>
                            </Card>
                        )}

                        {(needsPlantBased || needsOrganic || needsFairTrade || needsFoodWaste) && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Indikator-Daten</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-8">
                                    
                                    {needsPlantBased && (
                                        <FieldSet>
                                            <FieldLegend>Tierische Produkte</FieldLegend>
                                            <AmountEntryHint id="indicator-entry-plant-based-hint" />
                                            <FieldGroup className="grid md:grid-cols-2 gap-4">
                                                <Field>
                                                    <FieldLabel htmlFor="meatSpend">Fleisch (€)</FieldLabel>
                                                    <CurrencyInput id="meatSpend" value={formData.meatSpend} onValueChange={(vals, source) => handleNumberChange('meatSpend', vals.value, source)} aria-describedby="indicator-entry-plant-based-hint" />
                                                </Field>
                                                <Field>
                                                    <FieldLabel htmlFor="fishSpend">Fisch (€)</FieldLabel>
                                                    <CurrencyInput id="fishSpend" value={formData.fishSpend} onValueChange={(vals, source) => handleNumberChange('fishSpend', vals.value, source)} aria-describedby="indicator-entry-plant-based-hint" />
                                                </Field>
                                                <Field>
                                                    <FieldLabel htmlFor="dairySpend">Molkereiprodukte (€)</FieldLabel>
                                                    <CurrencyInput id="dairySpend" value={formData.dairySpend} onValueChange={(vals, source) => handleNumberChange('dairySpend', vals.value, source)} aria-describedby="indicator-entry-plant-based-hint" />
                                                </Field>
                                                <Field>
                                                    <FieldLabel htmlFor="eggSpend">Eier (€)</FieldLabel>
                                                    <CurrencyInput id="eggSpend" value={formData.eggSpend} onValueChange={(vals, source) => handleNumberChange('eggSpend', vals.value, source)} aria-describedby="indicator-entry-plant-based-hint" />
                                                </Field>
                                                <Field>
                                                    <FieldLabel htmlFor="mixedProductSpend">Mischprodukte (€)</FieldLabel>
                                                    <CurrencyInput id="mixedProductSpend" value={formData.mixedProductSpend} onValueChange={(vals, source) => handleNumberChange('mixedProductSpend', vals.value, source)} aria-describedby="indicator-entry-plant-based-hint" />
                                                </Field>
                                            </FieldGroup>
                                        </FieldSet>
                                    )}

                                    {needsOrganic && (
                                        <FieldSet>
                                            <FieldLegend>Ökologische Lebensmittel</FieldLegend>
                                            <AmountEntryHint id="indicator-entry-organic-hint" />
                                            <FieldGroup>
                                                <Field>
                                                    <FieldLabel htmlFor="organicSpend">Bio-Einkauf (€)</FieldLabel>
                                                    <CurrencyInput id="organicSpend" value={formData.organicSpend} onValueChange={(vals, source) => handleNumberChange('organicSpend', vals.value, source)} aria-describedby="indicator-entry-organic-hint" />
                                                </Field>
                                            </FieldGroup>
                                        </FieldSet>
                                    )}

                                     {needsFairTrade && (
                                        <FieldSet>
                                            <FieldLegend>Fair Trade</FieldLegend>
                                            <AmountEntryHint id="indicator-entry-fair-trade-hint" />
                                            <FieldGroup className="grid md:grid-cols-2 gap-4 border p-4 rounded-md">
                                                <Field>
                                                    <FieldLabel htmlFor="coffeeSpend">Gesamteinkauf Kaffee (€)</FieldLabel>
                                                    <CurrencyInput id="coffeeSpend" value={formData.coffeeSpend} onValueChange={(vals, source) => handleNumberChange('coffeeSpend', vals.value, source)} aria-describedby="indicator-entry-fair-trade-hint" />
                                                </Field>
                                                <Field>
                                                    <FieldLabel htmlFor="fairTradeCoffeeSpend">Fair Trade Kaffee (€)</FieldLabel>
                                                    <CurrencyInput id="fairTradeCoffeeSpend" value={formData.fairTradeCoffeeSpend} onValueChange={(vals, source) => handleNumberChange('fairTradeCoffeeSpend', vals.value, source)} aria-describedby="indicator-entry-fair-trade-hint" />
                                                </Field>
                                                <Field>
                                                    <FieldLabel htmlFor="cocoaSpend">Gesamteinkauf Kakao (€)</FieldLabel>
                                                    <CurrencyInput id="cocoaSpend" value={formData.cocoaSpend} onValueChange={(vals, source) => handleNumberChange('cocoaSpend', vals.value, source)} aria-describedby="indicator-entry-fair-trade-hint" />
                                                </Field>
                                                <Field>
                                                    <FieldLabel htmlFor="fairTradeCocoaSpend">Fair Trade Kakao (€)</FieldLabel>
                                                    <CurrencyInput id="fairTradeCocoaSpend" value={formData.fairTradeCocoaSpend} onValueChange={(vals, source) => handleNumberChange('fairTradeCocoaSpend', vals.value, source)} aria-describedby="indicator-entry-fair-trade-hint" />
                                                </Field>
                                                <Field>
                                                    <FieldLabel htmlFor="cocoaMixedSpend">Gesamteinkauf Kakao-Mischprodukte (€)</FieldLabel>
                                                    <CurrencyInput id="cocoaMixedSpend" value={formData.cocoaMixedSpend} onValueChange={(vals, source) => handleNumberChange('cocoaMixedSpend', vals.value, source)} aria-describedby="indicator-entry-fair-trade-hint" />
                                                </Field>
                                                <Field>
                                                    <FieldLabel htmlFor="fairTradeCocoaMixedSpend">Fair Trade Kakao-Mischprodukte (€)</FieldLabel>
                                                    <CurrencyInput id="fairTradeCocoaMixedSpend" value={formData.fairTradeCocoaMixedSpend} onValueChange={(vals, source) => handleNumberChange('fairTradeCocoaMixedSpend', vals.value, source)} aria-describedby="indicator-entry-fair-trade-hint" />
                                                </Field>
                                                <Field>
                                                    <FieldLabel htmlFor="bananasSpend">Gesamteinkauf Bananen (€)</FieldLabel>
                                                    <CurrencyInput id="bananasSpend" value={formData.bananasSpend} onValueChange={(vals, source) => handleNumberChange('bananasSpend', vals.value, source)} aria-describedby="indicator-entry-fair-trade-hint" />
                                                </Field>
                                                <Field>
                                                    <FieldLabel htmlFor="fairTradeBananasSpend">Fair Trade Bananen (€)</FieldLabel>
                                                    <CurrencyInput id="fairTradeBananasSpend" value={formData.fairTradeBananasSpend} onValueChange={(vals, source) => handleNumberChange('fairTradeBananasSpend', vals.value, source)} aria-describedby="indicator-entry-fair-trade-hint" />
                                                </Field>
                                            </FieldGroup>
                                        </FieldSet>
                                    )}

                                    {needsFoodWaste && (
                                        <FieldSet>
                                            <FieldLegend>Lebensmittelabfälle</FieldLegend>
                                            <AmountEntryHint id="indicator-entry-food-waste-hint" />
                                            <div className="space-y-6">
                                                <FieldGroup className="grid md:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-md border">
                                                    <div className="col-span-full mb-2">
                                                        <h4 className="font-semibold text-sm">Erste Datenerfassung (Basisjahr)</h4>
                                                        <p className="text-xs text-muted-foreground">Diese Werte gelten für den gesamten Betrieb und müssen nur einmalig eingegeben werden.</p>
                                                    </div>
                                                    <Field>
                                                        <FieldLabel htmlFor="foodWasteBaseDate">Datum der Ersterhebung</FieldLabel>
                                                        <input 
                                                            type="date" 
                                                            id="foodWasteBaseDate" 
                                                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                            value={formData.foodWasteBaseDate as string} 
                                                            max={today}
                                                            onChange={(e) => handleTextChange('foodWasteBaseDate', e.target.value)} 
                                                        />
                                                    </Field>
                                                    <Field>
                                                        <FieldLabel htmlFor="foodWasteBaseAmount">Erfasste Abfallmenge (kg/Jahr)</FieldLabel>
                                                        <NumberInput id="foodWasteBaseAmount" value={formData.foodWasteBaseAmount} onValueChange={(vals, source) => handleNumberChange('foodWasteBaseAmount', vals.value, source)} aria-describedby="indicator-entry-food-waste-hint" suffix=" kg" />
                                                    </Field>
                                                </FieldGroup>

                                                <FieldGroup className="grid md:grid-cols-1 gap-4">
                                                    <Field>
                                                        <FieldLabel htmlFor="foodWasteAmount">Erfasste Abfallmenge im aktuellen Berichtsjahr/-monat (kg)</FieldLabel>
                                                        <NumberInput id="foodWasteAmount" value={formData.foodWasteAmount} onValueChange={(vals, source) => handleNumberChange('foodWasteAmount', vals.value, source)} aria-describedby="indicator-entry-food-waste-hint" suffix=" kg" />
                                                    </Field>
                                                </FieldGroup>
                                            </div>
                                        </FieldSet>
                                    )}

                                </CardContent>
                            </Card>
                        )}
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
