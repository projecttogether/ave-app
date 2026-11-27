import { csvEscape } from '@/lib/csv'
import type { CalculationReport } from './report'

/** A flat worksheet for reconciliation. The JSON export retains all inputs and
 * rules; this CSV makes totals, exclusions and questionnaire answers inspectable. */
export function calculationReportCsv(report: CalculationReport): string {
    const rows: (string | number | null)[][] = [[
        'Typ', 'Indikator', 'Betrieb', 'Jahr', 'Monat', 'Status', 'Zähler / Punkte', 'Nenner / Maximum', 'Ergebnis', 'Erläuterung',
        'Formelversion', 'Datenrevision', 'Erstellt',
    ]]
    const add = (row: (string | number | null)[]) => rows.push([...row, report.formulaVersion, report.inputRevision, report.createdAt])
    for (const indicator of report.indicators) {
        add(['Ergebnis', indicator.title, '', report.inputs.year, '', report.inputs.granularity ?? 'auto', indicator.numerator, indicator.denominator, indicator.value, indicator.formula])
        for (const row of indicator.rows) add(['Datensatz', indicator.title, row.kitchen, row.year, row.month, row.included ? 'berücksichtigt' : 'ausgeschlossen', row.numerator, row.denominator, null, [row.reason, ...row.warnings].join(' ')])
        for (const row of indicator.coverage) add(['Abdeckung', indicator.title, row.kitchen, report.inputs.year, '', row.annual ? 'Jahreswert' : 'Monatswerte', row.reportedMonths, row.expectedMonths, null, 'Erfasste Monate / Monate im Jahr'])
        for (const row of indicator.baselineSources) add(['Basis', indicator.title, row.kitchen, report.inputs.year, row.months.join(','), '', row.amount, null, null, row.source])
        for (const row of indicator.questionnaire) add(['Fragebogen', indicator.title, row.kitchen, report.inputs.year, 0, `${row.answered}/${row.questions} beantwortet`, row.points, row.maximum, row.score, 'Volle mögliche Punktzahl einschließlich unbeantworteter Fragen'])
    }
    for (const answer of report.inputs.answers) {
        const question = report.methodology.questions.find(q => q.key === answer.questionKey && q.indicator === answer.indicatorSlug)
        if (!question) continue
        add(['Antwort', question.indicator, report.inputs.kitchens.find(k => k.id === answer.subOrganizationId)?.name ?? answer.subOrganizationId,
            report.inputs.year, 0, answer.responseOption, Object.prototype.hasOwnProperty.call(question.points, answer.responseOption ?? '') ? (question.points as Record<string, number | undefined>)[answer.responseOption!] ?? null : null, question.maxPoints, null, question.label])
    }
    return '\uFEFF' + rows.map(row => row.map(csvEscape).join(',')).join('\r\n')
}
