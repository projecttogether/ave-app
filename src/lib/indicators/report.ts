import { coveredMonths, recordPeriod, type InputPeriod } from '@/lib/operating-data/periods'
import { describeFoodWaste } from './food-waste'
import { INDICATOR_CONFIG } from './config'
import { FORMULA_POLICY, FORMULA_VERSION } from './policy'
import { aggregateIndicator, foodWasteBaseline, foodWasteForRows, selectIndicatorRows, type Granularity, type ReportingRow } from './aggregation'
import { computeIndicatorDecimals, rowHasIndicatorData } from './compute'
import { decimal, roundCalculation } from './decimal'
import { validateIndicatorInput, INPUT_LABELS } from './validation'
import { calculateScoreForIndicator, aggregateQualitativeScores } from '@/lib/qualitative/scoring'
import { QUAL_SLUG_MAP, type QualitativeFormData } from '@/lib/qualitative/constants'
import { INDICATOR_TARGETS_BY_SLUG } from './targets'

export type ReportAnswer = { subOrganizationId: string; indicatorSlug: string; questionKey: string; responseOption: string | null }
export type ReportKitchen = { id: string; organizationId: string; name: string; foodWasteBaseAmount: string | number | null; foodWasteBaseDate?: string | null; baselineRevision?: number }
export type ReportInputs = {
    year: number
    granularity: Granularity | null
    kitchens: ReportKitchen[]
    rows: ReportingRow[]
    reportingModes?: { subOrganizationId: string; mode: 'legacy' | 'quarterly'; revision: number }[]
    answers: ReportAnswer[]
    history: ReportingRow[]
}
export type CalculationLine = {
    id: string; kitchen: string; year: number; month: number | null; period?: InputPeriod
    included: boolean; reason: string; numerator: string | null; denominator: string | null; warnings: string[]
}
export type IndicatorCalculation = {
    slug: string; title: string; unit: string; value: number | null; target: number | null
    formula: string; numerator: string | null; denominator: string | null
    coverage: { kitchen: string; reportedMonths: number; expectedMonths: number; annual: boolean }[]
    rows: CalculationLine[]
    baselineSources: { kitchen: string; source: string; amount: number | null; months: number[] }[]
    questionnaire: { kitchen: string; points: number; maximum: number; answered: number; questions: number; score: number | null }[]
    qualitativeScore: number | null
    warnings: string[]
}
export type CalculationReport = {
    schemaVersion: 1 | 2; formulaVersion: string; inputRevision: string; createdAt: string
    methodology: typeof FORMULA_POLICY; inputs: ReportInputs; indicators: IndicatorCalculation[]
}

function explainIndicator(inputs: ReportInputs, slug: string): IndicatorCalculation {
    const config = INDICATOR_CONFIG[slug]
    const selected = selectIndicatorRows(inputs.rows, slug, inputs.granularity)
    const selectedSet = new Set(selected)
    const context = { baselines: inputs.kitchens, history: inputs.history }
    const foodWaste = slug === 'food_waste' ? foodWasteForRows(selected, context) : null
    const qualitativeOnly = ['regional_score', 'seasonal_score', 'guest_satisfaction'].includes(slug)
    const qualSlug = QUAL_SLUG_MAP[slug]
    const answers = inputs.granularity === 'monthly' || inputs.granularity === 'quarterly' ? [] : inputs.answers
    const qualitativeScore = qualSlug ? aggregateQualitativeScores(answers)[qualSlug] : null
    const questionnaire = qualSlug ? inputs.kitchens.map(kitchen => {
        const questions = FORMULA_POLICY.questions.filter(q => q.indicator === qualSlug)
        const data: QualitativeFormData = Object.fromEntries(answers.filter(a => a.subOrganizationId === kitchen.id && a.indicatorSlug === qualSlug).map(a => [a.questionKey, { option: a.responseOption ?? '' }]))
        const answered = questions.filter(q => data[q.key]?.option && Object.prototype.hasOwnProperty.call(q.points, data[q.key].option!))
        return { kitchen: kitchen.name, points: answered.reduce((sum, q) => sum + ((q.points as Record<string, number | undefined>)[data[q.key].option!] ?? 0), 0),
            maximum: questions.reduce((sum, q) => sum + q.maxPoints, 0), answered: answered.length, questions: questions.length,
            score: calculateScoreForIndicator(data, qualSlug) }
    }) : []
    const rows = qualitativeOnly ? [] : inputs.rows.map((row, index): CalculationLine => {
        const baseline = inputs.kitchens.find(k => k.id === row.subOrganizationId)?.foodWasteBaseAmount
        const missingBaseline = slug === 'food_waste' && (baseline == null || !Number.isFinite(Number(baseline)) || Number(baseline) <= 0)
        const included = selectedSet.has(row) && !missingBaseline
        const hasData = rowHasIndicatorData(row, slug)
        const values = config.computed && hasData ? computeIndicatorDecimals(row, config) : null
        const partial = (config.spendColumns ?? []).some(field => row[field] === null || row[field] === undefined || row[field] === '')
        const warnings = validateIndicatorInput(row).map(issue => issue.message)
        if (hasData && partial) warnings.push('Teilweise leere Kategorien gehen mit 0 in die Rechnung ein.')
        if (included && values?.denominator.lte(0)) warnings.push('Der Nenner ist 0 oder fehlt; für diese Zeile ist kein Anteil berechenbar.')
        return { id: String(row.id ?? index), kitchen: inputs.kitchens.find(k => k.id === row.subOrganizationId)?.name ?? row.subOrganizationId,
            year: row.reportingYear, month: row.reportingMonth, period: recordPeriod(row), included,
            reason: included ? 'Berücksichtigt' : !hasData ? 'Keine Messwerte für diesen Indikator' : selectedSet.has(row) && missingBaseline ? 'Kein gültiger konfigurierter Basiswert' : inputs.granularity ? 'Andere Periodenart ausgewählt' : 'Jahreswert durch Monatswerte ersetzt',
            numerator: hasData ? (values?.spend ?? decimal(row[config.column!])).toFixed() : null,
            denominator: values?.denominator.toFixed() ?? null, warnings }
    })
    const coverage = qualitativeOnly ? [] : inputs.kitchens.map(kitchen => {
        const kitchenRows = selected.filter(row => row.subOrganizationId === kitchen.id)
        const annual = kitchenRows.some(row => row.reportingMonth === 0)
        return { kitchen: kitchen.name, reportedMonths: annual ? 12 : coveredMonths(kitchenRows).length, expectedMonths: 12, annual }
    })
    const baselineSources = slug === 'food_waste' ? inputs.kitchens.map(kitchen => {
        const kitchenRows = selected.filter(row => row.subOrganizationId === kitchen.id)
        const amount = foodWasteBaseline(kitchenRows, context)
        return { kitchen: kitchen.name, source: amount !== null ? 'Manuelle Jahresbasis, nach erfassten Monaten anteilig' : 'Keine gültige konfigurierte Basis vorhanden',
            amount, months: coveredMonths(kitchenRows) }
    }) : []
    let numerator: string | null = null
    let denominator: string | null = null
    if (selected.length && config.computed) {
        const sum = selected.reduce((total, row) => {
            const value = computeIndicatorDecimals(row, config)
            return { numerator: total.numerator.plus(value.spend), denominator: total.denominator.plus(value.denominator) }
        }, { numerator: decimal(0), denominator: decimal(0) })
        numerator = sum.numerator.toFixed(); denominator = sum.denominator.toFixed()
    } else if (!qualitativeOnly) {
        const amount = aggregateIndicator(selected, slug)
        numerator = amount === null ? null : decimal(amount).toFixed()
        if (foodWaste) {
            numerator = foodWaste.reduction === null ? null : decimal(foodWaste.matchedAmount).toFixed()
            denominator = foodWaste.matchedBaseline > 0 ? decimal(foodWaste.matchedBaseline).toFixed() : null
        }
    }
    const value = qualitativeOnly ? qualitativeScore : slug === 'food_waste' ? foodWaste?.reduction ?? null : aggregateIndicator(selected, slug)
    const terms = (columns: string[]) => columns.map(field => `${config.weights?.[field as keyof typeof config.weights] ?? 1} × ${INPUT_LABELS[field as keyof typeof INPUT_LABELS] ?? field}`).join(' + ')
    const numeratorFormula = config.spendColumn ? INPUT_LABELS[config.spendColumn as keyof typeof INPUT_LABELS] : terms(config.spendColumns ?? [])
    const formula = config.computed
        ? `100 × Σ(${config.calculation === 'inverse_sum' ? `max(0, Gesamteinkauf Lebensmittel − (${numeratorFormula}))` : numeratorFormula}) / Σ(${terms(config.denominatorColumns ?? ['totalFoodSpend'])})`
        : slug === 'food_waste' ? '100 × (erfasste kg − passende Basis-kg) / passende Basis-kg'
        : qualitativeOnly ? 'Je Betrieb: Punkte / volle mögliche Punkte × 100, auf ganze Punkte runden. Danach Mittelwert der beantworteten Betriebe, auf ganze Punkte runden.' : 'Summe der berücksichtigten Beträge'
    const warnings = [...new Set(rows.flatMap(row => row.warnings))]
    if (coverage.some(k => k.reportedMonths < k.expectedMonths)) warnings.push('Unvollständige Jahresabdeckung. Der Wert bezieht sich auf die erfassten Perioden.')
    if (foodWaste && describeFoodWaste(foodWaste)) warnings.push(describeFoodWaste(foodWaste)!)
    if ((inputs.granularity === 'monthly' || inputs.granularity === 'quarterly') && qualSlug) warnings.push('Fragebogenergebnisse sind Jahreswerte und werden in der Monats- oder Quartalsansicht nicht verwendet.')
    return { slug, title: config.title, unit: config.unit, value: roundCalculation(value), target: INDICATOR_TARGETS_BY_SLUG[slug] ?? null,
        formula, numerator, denominator, coverage, rows, baselineSources, questionnaire, qualitativeScore, warnings }
}

/** Inputs have already been authorized and read from a single DB snapshot. */
export function buildCalculationReport(inputs: ReportInputs, revision: string, createdAt = new Date().toISOString()): CalculationReport {
    const detached: ReportInputs = JSON.parse(JSON.stringify(inputs))
    return { schemaVersion: 2, formulaVersion: FORMULA_VERSION, inputRevision: revision, createdAt,
        methodology: JSON.parse(JSON.stringify(FORMULA_POLICY)), inputs: detached,
        indicators: Object.keys(INDICATOR_CONFIG).map(slug => explainIndicator(detached, slug)) }
}
