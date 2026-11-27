import { and, asc, eq, lte } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { indicatorData, operatingReportingModes, indicatorReportSnapshots, qualitativeResponses, subOrganizations } from '@/lib/db/schema'
import { indicatorScopeConditions, type IndicatorScope } from './scope'
import { buildCalculationReport, type ReportInputs, type CalculationReport } from './report'
import { inputRevision } from './revision'
import { INPUT_FIELDS } from './validation'
import type { Granularity } from './aggregation'

type Reader = Pick<typeof db, 'query'>
type Writer = Pick<typeof db, 'query' | 'insert'>

/** Caller supplies an authorized scope and a repeatable-read transaction. */
export async function loadCalculationReport(reader: Reader, scope: IndicatorScope, year: number, granularity: Granularity | null): Promise<CalculationReport> {
    // The transaction owns one PostgreSQL connection; read sequentially.
    const kitchens = await reader.query.subOrganizations.findMany({
            where: and(...indicatorScopeConditions({ organizationId: subOrganizations.organizationId, subOrganizationId: subOrganizations.id }, scope)),
            columns: { id: true, organizationId: true, name: true, foodWasteBaseAmount: true, foodWasteBaseDate: true, baselineRevision: true },
            orderBy: [asc(subOrganizations.id)],
        })
    const history = await reader.query.indicatorData.findMany({
            where: and(...indicatorScopeConditions(indicatorData, scope), lte(indicatorData.reportingYear, year)),
            orderBy: [asc(indicatorData.subOrganizationId), asc(indicatorData.reportingYear), asc(indicatorData.reportingMonth), asc(indicatorData.id)],
        })
    const answers = await reader.query.qualitativeResponses.findMany({
            where: and(...indicatorScopeConditions(qualitativeResponses, scope), eq(qualitativeResponses.reportingYear, year)),
            columns: { subOrganizationId: true, indicatorSlug: true, questionKey: true, responseOption: true },
            orderBy: [asc(qualitativeResponses.subOrganizationId), asc(qualitativeResponses.indicatorSlug), asc(qualitativeResponses.questionKey)],
        })
    const rows: import('./aggregation').ReportingRow[] = history.map(row => ({ id: row.id, subOrganizationId: row.subOrganizationId, reportingYear: row.reportingYear, reportingMonth: row.reportingMonth, periodKind: row.periodKind, periodIndex: row.periodIndex, revision: row.revision, coverageConfirmed: row.coverageConfirmed,
        ...Object.fromEntries(INPUT_FIELDS.map(field => [field, row[field]])) }))
    const reportingModes = await reader.query.operatingReportingModes.findMany({
        where: and(...indicatorScopeConditions(operatingReportingModes, scope), eq(operatingReportingModes.reportingYear, year)),
        columns: { subOrganizationId: true, mode: true, revision: true }, orderBy: [asc(operatingReportingModes.subOrganizationId)],
    })
    const inputs: ReportInputs = { year, granularity, reportingModes,
        kitchens: kitchens.map(k => ({ ...k, foodWasteBaseDate: k.foodWasteBaseDate?.toISOString() ?? null })),
        rows: rows.filter(row => row.reportingYear === year), answers,
        history: rows.filter(row => row.foodWasteAmount !== null).map(row => ({ id: row.id, subOrganizationId: row.subOrganizationId, reportingYear: row.reportingYear, reportingMonth: row.reportingMonth, periodKind: row.periodKind, periodIndex: row.periodIndex, revision: row.revision, coverageConfirmed: row.coverageConfirmed, foodWasteAmount: row.foodWasteAmount })),
    }
    return buildCalculationReport(inputs, inputRevision(inputs))
}

export async function archiveCalculationReport(writer: Writer, report: CalculationReport, userId: string) {
    if (report.inputs.kitchens.length !== 1) throw new Error('Bitte genau einen Betrieb zum Archivieren wählen.')
    const kitchen = report.inputs.kitchens[0]
    const values = { organizationId: kitchen.organizationId, subOrganizationId: kitchen.id,
        reportingYear: report.inputs.year, granularity: report.inputs.granularity ?? 'auto',
        formulaVersion: report.formulaVersion, inputRevision: report.inputRevision, payload: report, createdBy: userId }
    const inserted = await writer.insert(indicatorReportSnapshots).values(values).onConflictDoNothing().returning({ id: indicatorReportSnapshots.id })
    if (inserted[0]) return inserted[0].id
    const existing = await writer.query.indicatorReportSnapshots.findFirst({
        where: and(eq(indicatorReportSnapshots.subOrganizationId, kitchen.id), eq(indicatorReportSnapshots.reportingYear, report.inputs.year),
            eq(indicatorReportSnapshots.granularity, values.granularity), eq(indicatorReportSnapshots.formulaVersion, report.formulaVersion), eq(indicatorReportSnapshots.inputRevision, report.inputRevision)),
        columns: { id: true },
    })
    if (!existing) throw new Error('Bericht konnte nicht archiviert werden. Bitte erneut versuchen.')
    return existing.id
}
