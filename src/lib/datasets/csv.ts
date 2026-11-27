import { periodLabel, recordPeriod } from '@/lib/operating-data/periods'
import type { indicatorData, qualitativeResponses, intakeResponses } from '@/lib/db/schema'
import { SCORING_QUESTIONS_MAP, INDICATOR_LABELS, type IndicatorSlug } from '@/lib/qualitative/constants'
import { REFLECTION_QUESTIONS_MAP } from '@/lib/reflection/constants'
import { csvEscape } from '@/lib/csv'

type Organization = { organization: { name: string } | null }
type IndicatorExportRow = typeof indicatorData.$inferSelect & Organization & {
  subOrganization: { name: string; foodWasteBaseDate: Date | null; foodWasteBaseAmount: string | null } | null
}
type ScoringExportRow = typeof qualitativeResponses.$inferSelect & Organization & {
  subOrganization: { name: string } | null
}
type ReflectionExportRow = typeof intakeResponses.$inferSelect & Organization

export const INDICATOR_HEADERS = [
  'Organisation',
  'Unterorganisation',
  'Jahr',
  'Monat',
  'Gesamteinkauf Lebensmittel',
  'Fleisch',
  'Fisch',
  'Milchprodukte',
  'Eier',
  'Mischprodukte',
  'Bio',
  'Kaffee',
  'Kakao',
  'Kakao-Mischprodukte',
  'Bananen',
  'Fairtrade Kaffee',
  'Fairtrade Kakao',
  'Fairtrade Kakao-Mischprodukte',
  'Fairtrade Bananen',
  'Regional Score',
  'Saisonal Score',
  'Gästezufriedenheit Score',
  'Lebensmittelabfälle (kg)',
  'Lebensmittelabfälle Ersterhebung Datum',
  'Lebensmittelabfälle Ersterhebung Menge (kg/Jahr)',
  'Erstellt am',
  'Aktualisiert am',
]

export const QUALITATIVE_HEADERS = [
  'Organisation',
  'Unterorganisation',
  'Indikator',
  'Jahr',
  'Frage',
  'Antwort (Text)',
  'Antwort (Auswahl)',
  'Antwort (Mehrfach)',
  'Antwort (Datum)',
  'Aktualisiert',
]

export function serializeIndicatorCsv(rows: IndicatorExportRow[]): string {
  const csvRows = rows.map((row) => {
    return [
      csvEscape(row.organization?.name),
      csvEscape(row.subOrganization?.name),
      row.reportingYear,
      row.periodKind === 'quarter' ? periodLabel(recordPeriod(row)) : row.reportingMonth === 0 ? 'Jährlich' : row.reportingMonth,
      csvEscape(row.totalFoodSpend),
      csvEscape(row.meatSpend),
      csvEscape(row.fishSpend),
      csvEscape(row.dairySpend),
      csvEscape(row.eggSpend),
      csvEscape(row.mixedProductSpend),
      csvEscape(row.organicSpend),
      csvEscape(row.coffeeSpend),
      csvEscape(row.cocoaSpend),
      csvEscape(row.cocoaMixedSpend),
      csvEscape(row.bananasSpend),
      csvEscape(row.fairTradeCoffeeSpend),
      csvEscape(row.fairTradeCocoaSpend),
      csvEscape(row.fairTradeCocoaMixedSpend),
      csvEscape(row.fairTradeBananasSpend),
      csvEscape(row.regionalScoringResult),
      csvEscape(row.seasonalScoringResult),
      csvEscape(row.guestSatisfactionScoringResult),
      csvEscape(row.foodWasteAmount),
      row.subOrganization?.foodWasteBaseDate?.toISOString() || '',
      csvEscape(row.subOrganization?.foodWasteBaseAmount),
      row.createdAt?.toISOString() || '',
      row.updatedAt?.toISOString() || '',
    ].join(',')
  })

  return [INDICATOR_HEADERS.join(','), ...csvRows].join('\n')
}

export function serializeScoringCsv(rows: ScoringExportRow[]): string {
  const csvRows = rows.map((row) => {
    const indicator =
      INDICATOR_LABELS[row.indicatorSlug as IndicatorSlug] || row.indicatorSlug
    const config = SCORING_QUESTIONS_MAP[row.questionKey]
    const question = config?.label || row.questionKey
    return [
      csvEscape(row.organization?.name),
      csvEscape(row.subOrganization?.name),
      csvEscape(indicator),
      row.reportingYear,
      csvEscape(question),
      csvEscape(row.responseText),
      csvEscape(row.responseOption),
      row.responseMultiple
        ? csvEscape(row.responseMultiple.join(', '))
        : '',
      row.responseDate ? row.responseDate.toISOString() : '',
      row.updatedAt?.toISOString() || '',
    ].join(',')
  })

  return [QUALITATIVE_HEADERS.join(','), ...csvRows].join('\n')
}

export function serializeReflectionCsv(rows: ReflectionExportRow[]): string {
  const headers = [
    'Organisation', 'Indikator', 'Frageschlüssel', 'Frage',
    'Antwort (Text)', 'Antwort (Auswahl)', 'Antwort (Mehrfach)', 'Antwort (Datum)',
    'Antwort (Zahl)', 'Antwort (Ja/Nein)', 'Erstellt am', 'Aktualisiert am',
  ]
  const csvRows = rows.map(row => [
    row.organization?.name,
    INDICATOR_LABELS[row.indicatorSlug as IndicatorSlug] || row.indicatorSlug,
    row.questionKey,
    REFLECTION_QUESTIONS_MAP[row.questionKey]?.label || row.questionKey,
    row.responseText,
    row.responseOption,
    row.responseMultiple?.join(', '),
    row.responseDate?.toISOString(),
    row.responseNumber,
    row.responseBoolean === null ? '' : row.responseBoolean ? 'Ja' : 'Nein',
    row.createdAt?.toISOString(),
    row.updatedAt?.toISOString(),
  ].map(csvEscape).join(','))
  return [headers.join(','), ...csvRows].join('\n')
}
