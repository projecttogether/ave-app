import { parse } from 'csv-parse/sync'
import { z } from 'zod'
import { INPUT_FIELDS, validateAmount, normalizeIndicatorInput } from '@/lib/indicators/validation'
import { inputPeriodSchema, periodKey, periodState, recordPeriod, type PeriodRecord } from './periods'
import type { OperatingPatch } from './publication'
import { csvEscape } from '@/lib/csv'

export const csvField = (field: string) => field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
export const CSV_VALUE_FIELDS = INPUT_FIELDS.map(csvField)
export const CSV_V2_HEADERS = ['format_version', 'sub_organization_id', 'sub_organization_name', 'reporting_year', 'period_kind', 'period_index', 'revision', 'coverage_confirmed', ...CSV_VALUE_FIELDS]
export type CsvRow = { line: number; id: string; name: string; period: z.infer<typeof inputPeriodSchema>; revision?: number; coverageConfirmed: boolean; values: OperatingPatch }
export type CsvIssue = { line: number; column: string; message: string }
export class CsvError extends Error {
  constructor(public issues: CsvIssue[]) { super(issues.map(e => `Zeile ${e.line}: ${e.message}`).join(' ')) }
}

/** Explicit contract: blank preserves a stored value, __CLEAR__ clears it, 0 is a measurement. */
export function parseOperatingCsv(input: string, now = new Date()): CsvRow[] {
  const text = input.replace(/^\uFEFF/, '')
  const directive = text.match(/^sep=([,;])\r?\n/i)
  const content = directive ? text.slice(directive[0].length) : text
  const firstLine = content.split(/\r?\n/)[0]
  const delimiter = directive?.[1] ?? ((firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',')
  let headers: string[] = []
  const issues: CsvIssue[] = []
  const fail = (line: number, column: string, message: string) => { issues.push({ line, column, message }) }
  let records: { record: Record<string, string>; info: { lines: number } }[]
  try {
    records = parse(content, { bom: true, delimiter, trim: true, skip_empty_lines: true, max_record_size: 16384, info: true,
      columns: (names: string[]) => { headers = names.map(name => name.trim().toLowerCase()); return headers } })
  } catch { throw new CsvError([{ line: 0, column: '', message: 'Ungültiges CSV: Bitte Anführungszeichen und Spaltenanzahl prüfen.' }]) }
  const v2 = headers.includes('format_version')
  const allowed = new Set(v2 ? CSV_V2_HEADERS : ['sub_organization_id', 'sub_organization_name', 'reporting_year', 'reporting_month', ...CSV_VALUE_FIELDS])
  const required = v2 ? ['format_version', 'sub_organization_id', 'reporting_year', 'period_kind', 'period_index'] : ['reporting_year', 'reporting_month']
  if (!v2 && !headers.includes('sub_organization_id') && !headers.includes('sub_organization_name')) required.push('sub_organization_id')
  for (const header of headers) if (!allowed.has(header)) fail(1, header, `Unbekannte oder schreibgeschützte Spalte: ${header}`)
  if (new Set(headers).size !== headers.length) fail(1, '', 'Doppelte Spaltenüberschriften sind nicht zulässig.')
  for (const header of required) if (!headers.includes(header)) fail(1, header, `Fehlende Spalte: ${header}`)
  if (records.length > 1000) fail(0, '', 'Maximal 1.000 Zeilen pro atomarem Import.')
  if (issues.length) throw new CsvError(issues)
  const rows: CsvRow[] = []
  const keys = new Set<string>()
  for (const { record: row, info } of records) {
    const line = info.lines + (directive ? 1 : 0)
    // Recognize only exact, old template placeholders; do not match real names by substring.
    if (!v2 && (row.sub_organization_id === 'ID (bitte nicht ändern)' || (!row.sub_organization_id && row.sub_organization_name === 'Beispiel Organisation (bitte überschreiben oder löschen)'))) continue
    try {
      const values: OperatingPatch = {}
      for (const field of INPUT_FIELDS) {
        const value = row[csvField(field)]
        if (value === undefined || value === '') continue
        if (value === '__CLEAR__') { values[field] = null; continue }
        const issue = validateAmount(value, field, field)
        if (issue) fail(line, csvField(field), issue.message)
        else values[field] = normalizeIndicatorInput({ [field]: value })[field]
      }
      if (!Object.keys(values).length) continue
      if (v2 && row.format_version !== '2') throw new Error('Nur format_version 2 wird unterstützt.')
      if (!/^\d{4}$/.test(row.reporting_year)) throw new Error('Ungültiges Berichtsjahr.')
      const indexText = v2 ? row.period_index : row.reporting_month
      if (!/^\d{1,2}$/.test(indexText ?? '')) throw new Error('Ungültige Berichtsperiode.')
      const index = Number(indexText)
      const period = inputPeriodSchema.parse({ year: Number(row.reporting_year), kind: v2 ? row.period_kind : index === 0 ? 'year' : 'month', index: !v2 && index === 0 ? 1 : index })
      if (periodState(period, now) === 'future') throw new Error('Zukünftige Perioden können nicht importiert werden.')
      const confirmed = row.coverage_confirmed === 'true'
      if (row.coverage_confirmed && !['true', 'false'].includes(row.coverage_confirmed)) throw new Error('coverage_confirmed muss true oder false sein.')
      if (period.kind === 'quarter' && (periodState(period, now) !== 'closed' || !confirmed)) throw new Error('Nur abgeschlossene, vollständige Quartale mit coverage_confirmed=true importieren. Keine kumulierten Jahreswerte.')
      const id = row.sub_organization_id ?? ''
      const name = row.sub_organization_name ?? ''
      if (id) z.uuid().parse(id)
      if ((!id && !name) || (v2 && !id)) throw new Error('Die Betriebs-ID fehlt.')
      const key = `${id || name}:${periodKey(period)}`
      if (keys.has(key)) throw new Error('Doppelte Berichtsperiode in der Datei.')
      keys.add(key)
      let revision: number | undefined
      if (row.revision) {
        if (!/^\d+$/.test(row.revision) || !Number.isSafeInteger(Number(row.revision))) throw new Error('Ungültige Revision.')
        revision = Number(row.revision)
      }
      rows.push({ line, id, name, period, revision, coverageConfirmed: confirmed, values })
    } catch (error) { fail(line, '', error instanceof z.ZodError ? 'Ungültige Betriebs-ID oder Berichtsperiode.' : (error as Error).message) }
  }
  if (!rows.length && !issues.length) fail(0, '', 'Keine ausgefüllten Betriebsdaten vorhanden.')
  if (issues.length) throw new CsvError(issues)
  return rows
}

export function serializeOperatingV2(rows: (PeriodRecord & { subOrganizationId: string; revision: number; coverageConfirmed: boolean; subOrganization?: { name: string } | null } & Record<string, unknown>)[]) {
  return [CSV_V2_HEADERS.join(','), ...rows.map(row => {
    const period = recordPeriod(row)
    const values = { format_version: '2', sub_organization_id: row.subOrganizationId, sub_organization_name: row.subOrganization?.name ?? '',
      reporting_year: period.year, period_kind: period.kind, period_index: period.index, revision: row.revision, coverage_confirmed: String(row.coverageConfirmed),
      ...Object.fromEntries(INPUT_FIELDS.map(field => [csvField(field), row[field] ?? ''])) }
    return CSV_V2_HEADERS.map(header => csvEscape(values[header as keyof typeof values] as string | number)).join(',')
  })].join('\n')
}
