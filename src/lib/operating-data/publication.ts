import { z } from 'zod'
import { INPUT_FIELDS, validateIndicatorInput, validateAmount } from '@/lib/indicators/validation'
import { inputPeriodSchema, periodKey, periodState, reportingToday, type InputPeriod } from './periods'
import { reportingFrequencySchema, frequencyKind } from './preferences'

export const operatingValuesSchema = z.object(Object.fromEntries(INPUT_FIELDS.map(field => [field,
  z.union([z.string().max(64), z.number(), z.null()]).optional()])))
  .strict().superRefine((values, ctx) => {
    for (const [field, value] of Object.entries(values)) {
      const issue = validateAmount(value, field, field)
      if (issue) ctx.addIssue({ code: 'custom', path: [field], message: issue.message })
    }
  })
export type OperatingPatch = Partial<Record<typeof INPUT_FIELDS[number], string | number | null>>
export const publicationSchema = z.object({
  subOrganizationId: z.uuid(), year: z.number().int().min(2000).max(2100), requestId: z.uuid(),
  entries: z.array(z.object({ period: inputPeriodSchema, expectedRevision: z.number().int().nonnegative(),
    values: operatingValuesSchema, coverageConfirmed: z.boolean().default(false) }).strict()).max(13),
  expectedModeRevision: z.number().int().nonnegative().optional(),
  expectedPreferenceRevision: z.number().int().nonnegative().optional(),
  baseline: z.object({ amount: z.union([z.string().max(64), z.null()]), date: z.string().nullable(), expectedRevision: z.number().int().nonnegative() }).strict().optional(),
  workflow: z.enum(['legacy', 'quarter', 'batch', 'conversion']),
  conversion: z.object({ mode: z.enum(['legacy', 'quarterly']), frequency: reportingFrequencySchema.optional(), expectedSourceRevision: z.string(), reason: z.string().trim().min(10).max(2000), confirmed: z.literal(true) }).strict().optional(),
}).strict()
export type Publication = z.input<typeof publicationSchema>
export type PublicationResult = { revisions: Record<string, number>; baselineRevision: number; modeRevision: number; preferenceRevision?: number }
export type EntryDraft = { entries: { period: InputPeriod; expectedRevision: number; values: OperatingPatch; coverageConfirmed: boolean }[];
  baseline?: Publication['baseline']; expectedModeRevision: number; expectedPreferenceRevision?: number }

export function validatePublication(input: Publication, now = new Date()) {
  const parsed = publicationSchema.parse(input)
  if (!parsed.entries.length && !parsed.baseline && !parsed.conversion) throw new Error('Keine Änderungen vorhanden.')
  const keys = new Set<string>()
  for (const entry of parsed.entries) {
    if (entry.period.year !== parsed.year) throw new Error('Alle Perioden müssen zum ausgewählten Jahr gehören.')
    const key = periodKey(entry.period)
    if (keys.has(key)) throw new Error('Eine Berichtsperiode kommt mehrfach vor.')
    keys.add(key)
    if (periodState(entry.period, now) === 'future') throw new Error('Zukünftige Perioden können nicht gespeichert werden.')
    if (entry.period.kind === 'quarter' && (!entry.coverageConfirmed || periodState(entry.period, now) !== 'closed')) {
      throw new Error('Nur abgeschlossene Quartale mit bestätigter vollständiger Abdeckung veröffentlichen.')
    }
    if (parsed.workflow === 'quarter' && entry.period.kind !== 'quarter') throw new Error('Quartalswerte erwartet.')
    if (parsed.workflow === 'batch' && (entry.period.kind !== 'month' || periodState(entry.period, now) !== 'closed')) throw new Error('Nur abgeschlossene Monate gemeinsam veröffentlichen.')
    if (parsed.workflow === 'legacy' && entry.period.kind === 'quarter') throw new Error('Quartalswerte benötigen die Quartalserfassung.')
  }
  if (parsed.workflow === 'batch' && new Set(parsed.entries.map(e => Math.ceil(e.period.index / 3))).size > 1) throw new Error('Monate aus genau einem Quartal auswählen.')
  if (Boolean(parsed.conversion) !== (parsed.workflow === 'conversion')) throw new Error('Ungültige Periodenkorrektur.')
  if (parsed.conversion?.frequency && (parsed.expectedPreferenceRevision === undefined
    || (parsed.conversion.frequency === 'quarterly') !== (parsed.conversion.mode === 'quarterly')
    || parsed.entries.some(entry => entry.period.kind !== frequencyKind(parsed.conversion!.frequency!)))) {
    throw new Error('Die Korrektur muss zum gewählten Erfassungsrhythmus passen.')
  }
  if (parsed.baseline) {
    const issue = validateAmount(parsed.baseline.amount, 'baseline', 'Jährliche Basis-Abfallmenge')
    if (issue) throw new Error(issue.message)
    if (parsed.baseline.amount !== null && Number(parsed.baseline.amount) <= 0) throw new Error('Die jährliche Basis-Abfallmenge muss größer als 0 sein.')
    const today = reportingToday(now)
    const todayDate = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`
    const date = parsed.baseline.date
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > todayDate)) throw new Error('Ungültiges Basisdatum.')
  }
  return parsed
}

export function checkedOperatingPatch(existing: Record<string, unknown> | undefined, patch: OperatingPatch) {
  const issues = validateIndicatorInput({ ...existing, ...patch })
  if (issues.length) throw new Error(issues.map(issue => issue.message).join(' '))
}
