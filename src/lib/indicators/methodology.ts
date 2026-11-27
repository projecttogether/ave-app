/**
 * Methodology descriptions for each AVE indicator.
 *
 * Used by the /data/methodology page to explain how each
 * indicator is calculated.
 */

export interface IndicatorMethodology {
  /** Matches the indicator ID from the master table */
  indicatorId: string
  /** Human-readable calculation formula */
  formula: string
  /** Where the underlying data comes from */
  dataSource: string
  /** Additional notes on methodology, caveats, or operator differences */
  notes: string[]
}

export const INDICATOR_METHODOLOGIES: IndicatorMethodology[] = [
  {
    indicatorId: 'plant_based',
    formula:
      '(Gesamteinkauf − Fleisch − Fisch − Milchprodukte − Eier − (Mischprodukte × 0,5)) ÷ Gesamteinkauf × 100',
    dataSource:
      'Berechnet aus den monatlichen Betriebsdaten (Gesamteinkauf, Fleisch-, Fisch-, Molkerei-, Eier- und Mischprodukt-Ausgaben).',
    notes: [
      'Die Berechnung erfolgt als Umkehrsumme: Der pflanzliche Anteil ergibt sich aus dem Gesamteinkauf abzüglich aller tierischen Kategorien und der Hälfte der Mischprodukte.',
      'Die Ausgaben für Fleisch, Fisch, Milchprodukte und Eier werden zu 100 % abgezogen, Mischprodukte zu 50 %.',
      'Zielwert: 75 % pflanzliche Lebensmittel am Gesamteinkauf.',
    ],
  },
  {
    indicatorId: 'organic',
    formula: 'Bio-zertifizierte Ausgaben ÷ Gesamteinkauf × 100',
    dataSource:
      'Erfassung über das Feld „Ökologische Ausgaben" in den monatlichen Betriebsdaten.',
    notes: [
      'Identifizierung über EU-Bio-Label oder „Bio" im Produktnamen.',
      'Die Datenqualität hängt von der Vollständigkeit der Produktklassifizierung beim Lieferanten ab.',
      'Zielwert: 40 % ökologische Lebensmittel am Gesamteinkauf.',
    ],
  },
  {
    indicatorId: 'food_waste',
    formula: 'Direkte Erfassung in Kilogramm',
    dataSource:
      'Manuelle Eingabe oder Import aus externen Messsystemen (z. B. Orbisk).',
    notes: [
      'Verschiedene Betreiber verwenden unterschiedliche Messmethoden (Tonnage, Euro-Wert, % des Umsatzes).',
      'Es wird die Veränderung gegenüber dem Basisjahr betrachtet.',
      'Zielwert: −30 % Reduktion der Lebensmittelabfälle.',
    ],
  },
  {
    indicatorId: 'seasonal',
    formula: 'Selbsteinschätzung auf Basis eines Scoring-Fragebogens',
    dataSource:
      'Scoring-Fragen, die jährlich von den Organisationen beantwortet werden.',
    notes: [
      'Aktuell als Self-Check-Scoring umgesetzt; eine quantitative Berechnung ist für spätere Phasen geplant.',
      'Eine vollständige Berechnung würde eine Integration mit einem Saisonkalender und Produktverfügbarkeitsdaten erfordern.',
      'Zielwert: 60 Punkte im Scoring-Fragebogen.',
    ],
  },
  {
    indicatorId: 'regional',
    formula: 'Selbsteinschätzung auf Basis eines Scoring-Fragebogens',
    dataSource:
      'Scoring-Fragen, die jährlich von den Organisationen beantwortet werden.',
    notes: [
      'Es gibt keine standardisierte Definition von „regional" – die Daten der Lieferanten sind oft unvollständig.',
      'Aktuell als Self-Check-Scoring umgesetzt; quantitative Berechnung ist für spätere Phasen geplant.',
      'Zielwert: 20 Punkte im Scoring-Fragebogen.',
    ],
  },
  {
    indicatorId: 'fair_trade',
    formula:
      'Fair-Trade-zertifizierte Ausgaben (Bananen + Kakao + Kaffee + Kakao-Mischprodukte × 0,5) ÷ Gesamtausgaben (Bananen + Kakao + Kaffee + Kakao-Mischprodukte × 0,5) × 100',
    dataSource:
      'Berechnet aus den monatlichen Betriebsdaten für die vier Produktkategorien Bananen, Kakao, Kaffee und Kakao-Mischprodukte.',
    notes: [
      'Nur die vier Kategorien Bananen, Kakao, Kaffee und Kakao-Mischprodukte werden herangezogen. Kakao-Mischprodukte werden zur Hälfte (Faktor 0,5) in die Berechnung einbezogen.',
      'Die Identifizierung erfolgt über das Fair-Trade-Label oder „FT"/„Fairtrade" in der Produktbezeichnung.',
      'In einigen Fällen ist eine manuelle Überprüfung notwendig.',
      'Zielwert: 90 % Fair-Trade-Anteil in den relevanten Kategorien.',
    ],
  },
  {
    indicatorId: 'guest_satisfaction',
    formula: 'Selbsteinschätzung auf Basis eines Scoring-Fragebogens',
    dataSource:
      'Scoring-Fragen, die jährlich von den Organisationen beantwortet werden. ' +
      'Alternativ Import aus externen Feedbacksystemen (z. B. App-Bewertungen).',
    notes: [
      'Der Score bewertet die im Fragebogen erfassten Aktivitäten, nicht den Anteil zufriedener Gäste.',
      'Der „Extremwert-Effekt" kann die Ergebnisse verzerren (Feedback wird vor allem bei sehr positiven oder sehr negativen Erfahrungen gegeben).',
      'Zielwert: 75 Punkte im Scoring-Fragebogen.',
    ],
  },
]

/** Look up methodology by indicator ID */
export function getMethodology(
  indicatorId: string,
): IndicatorMethodology | undefined {
  return INDICATOR_METHODOLOGIES.find((m) => m.indicatorId === indicatorId)
}
