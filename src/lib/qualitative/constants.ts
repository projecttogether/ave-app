// Qualitative data constants — Scoring questions (qualitative_responses table)
// Generated from CSV: 2026-02 AVE Dashboard qualitative data structure.csv

import type { QuestionConfig } from '@/lib/questions/types'
export type { QuestionConfig, FormDataMap as QualitativeFormData } from '@/lib/questions/types'
export { groupQuestionsByIndicator } from '@/lib/questions/types'
export type { ResponseValue } from '@/lib/questions/types'
import { computeQuestionNumberings } from '@/lib/questions/types'

import { INDICATOR_LABELS as ALL_LABELS, INDICATORS } from '@/lib/indicators/indicators'

export const INDICATOR_SLUGS = [
  'plant_based',
  'organic',
  'food_waste',
  'seasonal',
  'regional',
  'fair_trade',
  'guest_satisfaction',
] as const

export type IndicatorSlug = (typeof INDICATOR_SLUGS)[number]

export const INDICATOR_LABELS: Record<IndicatorSlug, string> = {
  plant_based: ALL_LABELS['plant_based'],
  organic: ALL_LABELS['organic'],
  food_waste: ALL_LABELS['food_waste'],
  seasonal: ALL_LABELS['seasonal'],
  regional: ALL_LABELS['regional'],
  fair_trade: ALL_LABELS['fair_trade'],
  guest_satisfaction: ALL_LABELS['guest_satisfaction'],
}

export const QUAL_SLUG_MAP: Record<string, IndicatorSlug | null> = {
  'total_spend': null,
  'plant_based_percentage': 'plant_based',
  'organic_percentage': 'organic',
  'fair_trade_percentage': 'fair_trade',
  'regional_score': 'regional',
  'seasonal_score': 'seasonal',
  'guest_satisfaction': 'guest_satisfaction',
  'food_waste': 'food_waste'
}


// Common option sets
const YES_NO_PLANNED = ['Ja', 'Nein', 'Geplant', 'Unklar']
const PERCENTAGE_RANGES = ['<10%', '11-25%', '26-50%', '51-75%', '76-100%', 'Unklar']

// ─── Generated Questions ─────────────────────────────────────────────

const PLANT_BASED_SCORING: QuestionConfig[] = [
  { key: 'pb_score_dge_certified', label: 'Ist euer Speisenangebot von der DGE zertifiziert?', type: 'single-select', options: YES_NO_PLANNED, group: 'Angebotsstruktur', indicator: 'plant_based', order: 1 },
  { key: 'pb_score_daily_plant_main', label: 'Wird tägliche eine vollwertige pflanzliche Hauptspeise angeboten?', type: 'single-select', options: YES_NO_PLANNED, group: 'Angebotsstruktur', indicator: 'plant_based', order: 2 },
  { key: 'pb_score_plant_all_menu_lines', label: 'Werden in allen Menülinien pflanzliche Optionen angeboten?', type: 'single-select', options: YES_NO_PLANNED, group: 'Angebotsstruktur', indicator: 'plant_based', order: 3 },
  { key: 'pb_score_plant_first_choice', label: 'Ist das Angebot so gestaltet, dass pflanzliche Optionen als „erste Wahl“ wahrgenommen werden können?', type: 'single-select', options: YES_NO_PLANNED, group: 'Angebotsstruktur', indicator: 'plant_based', order: 4 },
  { key: 'pb_score_nudging_strategies', label: 'Setzt ihr bereits Nudging-Strategien ein (z. B. Platzierung, Sprache, Menüstruktur), um pflanzliche Optionen attraktiver zu machen?', type: 'single-select', options: YES_NO_PLANNED, group: 'Angebotsstruktur', indicator: 'plant_based', order: 5 },
  { key: 'pb_score_nudging_strategies_detail', label: 'Wenn ja, welche?', type: 'long text', group: 'Angebotsstruktur', indicator: 'plant_based', order: 6, dependsOn: 'pb_score_nudging_strategies', optional: true },
  { key: 'pb_score_plant_price_attractive', label: 'Im Falle von mehreren Menülinien: Wird das pflanzliche Gericht preislich attraktiver angeboten?', type: 'single-select', options: YES_NO_PLANNED, group: 'Angebotsstruktur', indicator: 'plant_based', order: 7 },
  { key: 'pb_score_training_kitchen', label: 'Werden bei euren Küchen-Mitarbeiter:innen Schulungen zum Thema vegetarische/ pflanzliche Küche durchgeführt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Angebotsstruktur', indicator: 'plant_based', order: 8 },
  { key: 'pb_score_certified_partner_kitchen', label: 'Setzt ihr diese Weiterbildungen mit einem zertifizierten Partner um?', type: 'single-select', options: YES_NO_PLANNED, group: 'Angebotsstruktur', indicator: 'plant_based', order: 9 },
  { key: 'pb_score_certified_partner_kitchen_detail', label: 'Wenn ja, mit Welchem?', type: 'long text', group: 'Angebotsstruktur', indicator: 'plant_based', order: 10, dependsOn: 'pb_score_certified_partner_kitchen', optional: true },
  { key: 'pb_score_training_serving', label: 'Werden bei euren Ausgabe-Mitarbeiter:innen Schulungen zum Thema vegetarische/ pflanzliche Küche durchgeführt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Angebotsstruktur', indicator: 'plant_based', order: 11 },
  { key: 'pb_score_certified_partner_serving', label: 'Setzt ihr diese Weiterbildungen mit einem zertifizierten Partner um?', type: 'single-select', options: YES_NO_PLANNED, group: 'Angebotsstruktur', indicator: 'plant_based', order: 12 },
  { key: 'pb_score_certified_partner_serving_detail', label: 'Wenn ja, mit Welchem?', type: 'long text', group: 'Angebotsstruktur', indicator: 'plant_based', order: 13, dependsOn: 'pb_score_certified_partner_serving', optional: true },
  { key: 'pb_score_animal_welfare_labels', label: 'Werden tierische Produkte mit anerkannten Tierwohl-/Nachhaltigkeitssiegeln bezogen?', type: 'single-select', options: YES_NO_PLANNED, group: 'Kontext tierische Produkte', indicator: 'plant_based', order: 14 },
  { key: 'pb_score_animal_welfare_share', label: 'Wie hoch ist der Anteil der tierischen Produkte mit anerkannten Tierwohl-/Nachhaltigkeitssiegeln am Gesamteinkauf tierischer Produkte? ', type: 'single-select', options: PERCENTAGE_RANGES, group: 'Kontext tierische Produkte', indicator: 'plant_based', order: 15 },
  { key: 'pb_score_animal_organic_share', label: 'Welcher Anteil der tierischen Produkte wird in Bio-Qualität eingekauft? ', type: 'single-select', options: PERCENTAGE_RANGES, group: 'Kontext tierische Produkte', indicator: 'plant_based', order: 16 },
]

const ORGANIC_SCORING: QuestionConfig[] = [
  { key: 'org_score_bio_ahvv_certified', label: 'Ist der Betrieb offiziell Bio zertifiziert nach Bio-AHHV?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance & Prozesse', indicator: 'organic', order: 1 },
  { key: 'org_score_bio_ahvv_level', label: 'Hat Euer Betrieb ein Bio-Siegel nach Bio-AHVV (Bronze, Silber, Gold)', type: 'single-select', options: ['Nein', 'Bronze', 'Silber', 'Gold'], group: 'Governance & Prozesse', indicator: 'organic', order: 2 },
  { key: 'org_score_regenerative_products', label: 'Werden Produkte aus regenerativer Landwirtschaft eingesetzt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance & Prozesse', indicator: 'organic', order: 3 },
  { key: 'org_score_regenerative_products_detail', label: 'Wenn ja, welche?', type: 'long text', group: 'Governance & Prozesse', indicator: 'organic', order: 4, dependsOn: 'org_score_regenerative_products', optional: true },
  { key: 'org_score_uncertified_eco', label: 'Werden Produkte von Betrieben bezogen, die nach ökologischen Standards arbeiten, aber nicht zertifiziert sind?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance & Prozesse', indicator: 'organic', order: 5 },
  { key: 'org_score_uncertified_eco_detail', label: 'Wenn ja, welche?', type: 'long text', group: 'Governance & Prozesse', indicator: 'organic', order: 6, dependsOn: 'org_score_uncertified_eco', optional: true },
  { key: 'org_score_bio_transition', label: 'Bezieht Ihr Produkte aus Betrieben in der Umstellung auf Bio? (Umstellungsware)', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance & Prozesse', indicator: 'organic', order: 7 },
  { key: 'org_score_bio_transition_detail', label: 'Wenn ja, welche?', type: 'long text', group: 'Governance & Prozesse', indicator: 'organic', order: 8, dependsOn: 'org_score_bio_transition', optional: true },
  { key: 'org_score_transition_share', label: 'Wie hoch ist der Anteil an Umstellungsware am Gesamteinkauf?', type: 'single-select', options: PERCENTAGE_RANGES, group: 'Governance & Prozesse', indicator: 'organic', order: 9 },
  { key: 'org_score_association_bio_share', label: 'Wie hoch ist der Anteil am Bio-Anteil an Verbandsware (Demeter, Bioland, Naturland) am Bio-Einkauf?', type: 'single-select', options: PERCENTAGE_RANGES, group: 'Governance & Prozesse', indicator: 'organic', order: 10 },
  { key: 'org_score_training_kitchen', label: 'Werden bei euren Küchen-Mitarbeiter:innen Schulungen zum Thema Bio-Küche durchgeführt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Weitere Maßnahmen', indicator: 'organic', order: 11 },
  { key: 'org_score_certified_partner_kitchen', label: 'Setzt ihr diese Weiterbildungen mit einem zertifizierten Partner um?', type: 'single-select', options: YES_NO_PLANNED, group: 'Weitere Maßnahmen', indicator: 'organic', order: 12 },
  { key: 'org_score_certified_partner_kitchen_detail', label: 'Wenn ja, mit Welchem?', type: 'long text', group: 'Weitere Maßnahmen', indicator: 'organic', order: 13, dependsOn: 'org_score_certified_partner_kitchen', optional: true },
  { key: 'org_score_training_serving', label: 'Werden bei euren Ausgabe-Mitarbeiter:innen Schulungen zum Thema Bio-Küche durchgeführt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Weitere Maßnahmen', indicator: 'organic', order: 14 },
  { key: 'org_score_certified_partner_serving', label: 'Setzt ihr diese Weiterbildungen mit einem zertifizierten Partner um?', type: 'single-select', options: YES_NO_PLANNED, group: 'Weitere Maßnahmen', indicator: 'organic', order: 15 },
  { key: 'org_score_certified_partner_serving_detail', label: 'Wenn ja, mit Welchem?', type: 'long text', group: 'Weitere Maßnahmen', indicator: 'organic', order: 16, dependsOn: 'org_score_certified_partner_serving', optional: true },
  { key: 'org_score_support_bio_associations', label: 'Beratung durch Bio-Anbauverbände (z. B. Bioland, Naturland, Demeter)', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche Unterstützungsangebote zur Steigerung des Bio-Anteils, nutzt ihe bereits?', indicator: 'organic', order: 17 },
  { key: 'org_score_support_ribe', label: 'Förderung durch RIBE AHV (staatlich geförderte Beratung)', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche Unterstützungsangebote zur Steigerung des Bio-Anteils, nutzt ihe bereits?', indicator: 'organic', order: 18 },
  { key: 'org_score_support_peer_learning', label: 'Austausch mit anderen Betrieben / Peer-Learning', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche Unterstützungsangebote zur Steigerung des Bio-Anteils, nutzt ihe bereits?', indicator: 'organic', order: 19 },
  { key: 'org_score_support_eco_regions', label: 'Unterstützung durch Öko-Modellregionen', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche Unterstützungsangebote zur Steigerung des Bio-Anteils, nutzt ihe bereits?', indicator: 'organic', order: 20 },
  { key: 'org_score_support_biobitte', label: 'BioBitte-Materialien / BLE-Angebote', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche Unterstützungsangebote zur Steigerung des Bio-Anteils, nutzt ihe bereits?', indicator: 'organic', order: 21 },
  { key: 'org_score_support_control_bodies', label: 'Kontakt zu Kontrollstellen (z. B. ABCERT, GfRS)', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche Unterstützungsangebote zur Steigerung des Bio-Anteils, nutzt ihe bereits?', indicator: 'organic', order: 22 },
  { key: 'org_score_support_research', label: 'Begleitung durch Wissenschaft / Forschungsprojekte (z. B. NAHGAST, KEEKS)', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche Unterstützungsangebote zur Steigerung des Bio-Anteils, nutzt ihe bereits?', indicator: 'organic', order: 23 },
  { key: 'org_score_support_training', label: 'Teilnahme an Fortbildungen, Schulungen oder Fachtagen', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche Unterstützungsangebote zur Steigerung des Bio-Anteils, nutzt ihe bereits?', indicator: 'organic', order: 24 },
  { key: 'org_score_support_training_detail', label: 'Wenn ja, welche?', type: 'long text', group: 'Welche Unterstützungsangebote zur Steigerung des Bio-Anteils, nutzt ihe bereits?', indicator: 'organic', order: 25, dependsOn: 'org_score_support_training', optional: true },
]

const FOOD_WASTE_SCORING: QuestionConfig[] = [
  { key: 'fw_score_measurement_done', label: 'Wurde im Berichtsjahr eine Abfallerhebung durchgeführt?', type: 'single-select', options: ['Ja', 'Nein', 'Unklar'], group: 'Messpraxis und Abdeckungsgrad', indicator: 'food_waste', order: 3 },
  { key: 'fw_score_measurement_frequency', label: 'Frequenz der Erhebung', type: 'multiple-choice', options: ['nie', 'jährlich', 'halbjährlich', 'quartalsweise', 'monatlich', 'wöchentlich', 'täglich'], group: 'Messpraxis und Abdeckungsgrad', indicator: 'food_waste', order: 5 },
  { key: 'fw_score_waste_types', label: 'Erfasste Abfallarten', type: 'multiple-choice', options: ['Produktionsabfälle', 'Überproduktion', 'Lagerabfälle', 'Tellerreste'], group: 'Messpraxis und Abdeckungsgrad', indicator: 'food_waste', order: 6 },
  { key: 'fw_score_measurement_system', label: 'Arbeitet ihr bei der Abfallmessung mit einem bestimmten System/digitalem Tool?', type: 'single-select', options: YES_NO_PLANNED, group: 'Messpraxis und Abdeckungsgrad', indicator: 'food_waste', order: 7 },
  { key: 'fw_score_measurement_system_detail', label: 'Wenn ja, welches?', type: 'long text', group: 'Messpraxis und Abdeckungsgrad', indicator: 'food_waste', order: 8, dependsOn: 'fw_score_measurement_system', optional: true },
  { key: 'fw_score_external_certification', label: 'Ist eine externe Bestätigung/Zertifizierung vorhanden?', type: 'single-select', options: YES_NO_PLANNED, group: 'Messpraxis und Abdeckungsgrad', indicator: 'food_waste', order: 9 },
  { key: 'fw_score_external_certification_detail', label: 'Wenn ja, welche?', type: 'long text', group: 'Messpraxis und Abdeckungsgrad', indicator: 'food_waste', order: 10, dependsOn: 'fw_score_external_certification', optional: true },
  { key: 'fw_score_internal_feedback', label: 'Gibt es interne Rückmeldeschleifen zum Abfallaufkommen?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance & Prozesse', indicator: 'food_waste', order: 11 },
  { key: 'fw_score_waste_training', label: 'Werden intern Schulungen zur Abfallvermeidung durchgeführt ?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance & Prozesse', indicator: 'food_waste', order: 12 },
  { key: 'fw_score_internal_evaluation', label: 'Gibt es eine interne Evaluation der Maßnahmen?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance & Prozesse', indicator: 'food_waste', order: 13 },
  { key: 'fw_score_control_points', label: 'Wurden Abfallkontrollpunkte eingeführt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance & Prozesse', indicator: 'food_waste', order: 14 },
  { key: 'fw_score_control_points_detail', label: 'Wenn ja, welche?', type: 'long text', group: 'Governance & Prozesse', indicator: 'food_waste', order: 15, dependsOn: 'fw_score_control_points', optional: true },
  { key: 'fw_score_measure_portion_sizes', label: 'Portionsgrößen anpassen', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche der folgenden Maßnahmen werden bereits umgesetzt?', indicator: 'food_waste', order: 16 },
  { key: 'fw_score_measure_free_refill', label: 'Kostenlose Nachschlagoption anbieten', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche der folgenden Maßnahmen werden bereits umgesetzt?', indicator: 'food_waste', order: 17 },
  { key: 'fw_score_measure_variable_sides', label: 'Variable Beilagenauswahl', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche der folgenden Maßnahmen werden bereits umgesetzt?', indicator: 'food_waste', order: 18 },
  { key: 'fw_score_measure_reduce_decoration', label: 'Reduktion essbarer Dekoration', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche der folgenden Maßnahmen werden bereits umgesetzt?', indicator: 'food_waste', order: 19 },
  { key: 'fw_score_measure_front_cooking', label: 'Front‑Cooking zur bedarfsgerechten Ausgabe', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche der folgenden Maßnahmen werden bereits umgesetzt?', indicator: 'food_waste', order: 20 },
  { key: 'fw_score_measure_takeaway_boxes', label: 'Einführung von Mitnahmeboxen', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche der folgenden Maßnahmen werden bereits umgesetzt?', indicator: 'food_waste', order: 21 },
  { key: 'fw_score_measure_buffet_design', label: 'Optimierte Buffetgestaltung (z. B. flachere Behälter)', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche der folgenden Maßnahmen werden bereits umgesetzt?', indicator: 'food_waste', order: 22 },
  { key: 'fw_score_measure_flexible_planning', label: 'Flexible Speiseplanung (Bestands-/Bedarfsdaten)', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche der folgenden Maßnahmen werden bereits umgesetzt?', indicator: 'food_waste', order: 23 },
  { key: 'fw_score_measure_rescued_food', label: 'Einsatz geretteter/überzähliger Lebensmittel ', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche der folgenden Maßnahmen werden bereits umgesetzt?', indicator: 'food_waste', order: 24 },
  { key: 'fw_score_measure_food_donation', label: 'Spende überschüssiger Speisen ', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche der folgenden Maßnahmen werden bereits umgesetzt?', indicator: 'food_waste', order: 25 },
  { key: 'fw_score_measure_reduce_standards', label: 'Reduktion der Standardmengen für Brot/Beilagen ', type: 'single-select', options: YES_NO_PLANNED, group: 'Welche der folgenden Maßnahmen werden bereits umgesetzt?', indicator: 'food_waste', order: 26 },
  { key: 'fw_score_1_weitere_massnahme_n_hinzufuege', label: 'Weitere Maßnahme(n) hinzufügen', type: 'long text', group: '', indicator: 'food_waste', order: 1, optional: true },
  { key: 'fw_score_nudging', label: 'Arbeitet ihr beim Thema Lebensmittelverschwendung mit Nudging-Maßnahmen?', type: 'single-select', options: YES_NO_PLANNED, group: 'Nudging', indicator: 'food_waste', order: 27 },
  { key: 'fw_score_nudging_detail', label: 'Wenn ja, welche?', type: 'long text', group: 'Nudging', indicator: 'food_waste', order: 28, dependsOn: 'fw_score_nudging', optional: true },
]

const SEASONAL_SCORING: QuestionConfig[] = [
  { key: 'sea_score_1_wie_hoch_schaetzt_ihr_euren_ak', label: 'Wie hoch schätzt ihr euren aktuellen Anteil an saisonalen Lebensmitteln? Per Definition: Anteil an frischem Obst und Gemüse Verarbeitungsgrad I und II innerhalb dieser Produktgruppe', type: 'single-select', options: PERCENTAGE_RANGES, group: '', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_wird_ein_saisonkalender_genutz', label: 'Wird ein Saisonkalender genutzt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Einkaufs- und Speiseplanpraxis', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_ist_der_speiseplan_grundsaetzl', label: 'Ist der Speiseplan grundsätzlich saisonal ausgerichtet?', type: 'single-select', options: YES_NO_PLANNED, group: 'Einkaufs- und Speiseplanpraxis', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_arbeitet_ihr_mit_einzelnen_wec', label: 'Arbeitet ihr mit einzelnen wechselnden Zutaten nach Jahreszeit? (Bsp. Erdbeeren, Spargel, Kohl etc.)', type: 'single-select', options: YES_NO_PLANNED, group: 'Einkaufs- und Speiseplanpraxis', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_wird_der_speiseplan_regelmaess', label: 'Wird der Speiseplan regelmäßig angepasst (z.B. mind. 1x/Quartal)', type: 'single-select', options: YES_NO_PLANNED, group: 'Einkaufs- und Speiseplanpraxis', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_werden_im_wochenverlauf_mindes', label: 'Werden im Wochenverlauf mindestens zwei Hauptgerichte angeboten, die klar erkennbare saisonale Komponenten enthalten? (z. B. Spargel im Frühjahr, Kürbis im Herbst)', type: 'single-select', options: YES_NO_PLANNED, group: 'Einkaufs- und Speiseplanpraxis', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_wird_auf_flugware_konsequent_v', label: 'Wird auf Flugware konsequent verzichtet?', type: 'single-select', options: YES_NO_PLANNED, group: 'Einkaufs- und Speiseplanpraxis', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_wird_regelmaessig_auf_lagerwar', label: 'Wird regelmäßig auf Lagerware (z. B. CA-gelagerte Äpfel, Zwiebeln, Kohl) zurückgegriffen?', type: 'single-select', options: YES_NO_PLANNED, group: 'Einkaufs- und Speiseplanpraxis', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_wird_tiefkuehlware_gezielt_ein', label: 'Wird Tiefkühlware gezielt eingesetzt, um saisonale Lücken zu überbrücken?', type: 'single-select', options: YES_NO_PLANNED, group: 'Einkaufs- und Speiseplanpraxis', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_gibt_es_interne_richtlinien_zu', label: 'Gibt es interne Richtlinien zur Saisonalität?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance und Prozesse', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_finden_lieferantendialoge_zur_', label: 'Finden Lieferantendialoge zur saisonalen Verfügbarkeit statt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance und Prozesse', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_wenn_ausgeschrieben_wird_werde', label: 'Wenn ausgeschrieben wird, werden saisonale Kriterien in Ausschreibungen berücksichtigt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance und Prozesse', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_wird_die_saisonale_ausrichtung', label: 'Wird die saisonale Ausrichtung des Speiseplans in der Kommunikation gegenüber Gästen sichtbar gemacht? (z. B. Hinweise in Speiseplan oder Menüausgabe)', type: 'single-select', options: YES_NO_PLANNED, group: 'Weitere Maßnahmen', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_seasonal_cooperation', label: 'Gibt es Kooperationen mit Lieferanten, um saisonale Produkte besser verfügbar zu machen?', type: 'single-select', options: YES_NO_PLANNED, group: 'Weitere Maßnahmen', indicator: 'seasonal', order: 1 },
  { key: 'sea_score_1_wenn_ja_welche', label: 'Wenn ja, welche:', type: 'long text', group: 'Weitere Maßnahmen', indicator: 'seasonal', order: 1, dependsOn: 'sea_score_seasonal_cooperation', optional: true },
]

const REGIONAL_SCORING: QuestionConfig[] = [
  { key: 'reg_score_regional_share_total', label: 'Wie hoch schätzt ihr euren aktuellen Anteil an regionalen Produkten (200km um die Betriebsstätte herum produziert und/oder verarbeitet) am Gesamteinkauf?', type: 'single-select', options: PERCENTAGE_RANGES, group: '', indicator: 'regional', order: 1 },
  { key: 'reg_score_1_gibt_es_regionalitaetskriterie', label: 'Gibt es Regionalitätskriterien in Ausschreibungen oder Einkaufsrichtlinien?', type: 'single-select', options: YES_NO_PLANNED, group: 'Einkaufs- und Lieferpraxis', indicator: 'regional', order: 1 },
  { key: 'reg_score_1_werden_regionale_produkte_auf_', label: 'Werden regionale Produkte auf  Lieferscheinen oder im Warenwirtschaftssystem gekennzeichnet?', type: 'single-select', options: YES_NO_PLANNED, group: 'Einkaufs- und Lieferpraxis', indicator: 'regional', order: 1 },
  { key: 'reg_score_1_bestehen_direkte_partnerschaft', label: 'Bestehen direkte Partnerschaften mit Landwirten oder regionalen Verarbeitern?', type: 'single-select', options: YES_NO_PLANNED, group: 'Einkaufs- und Lieferpraxis', indicator: 'regional', order: 1 },
  { key: 'reg_score_1_existieren_interne_vorgaben_od', label: 'Existieren interne Vorgaben oder Leitlinien zur Förderung regionaler Produkte?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance und Prozesse', indicator: 'regional', order: 1 },
  { key: 'reg_score_1_finden_regelmaessige_lieferant', label: 'Finden regelmäßige Lieferantendialoge zur regionalen Beschaffung statt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance und Prozesse', indicator: 'regional', order: 1 },
  { key: 'reg_score_strat_priority_product_groups', label: 'Gibt es eine Strategie, bestimmte Produktgruppen bevorzugt regional zu beziehen (z. B. Obst/Gemüse, Milchprodukte)?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance und Prozesse', indicator: 'regional', order: 1 },
  { key: 'reg_score_1_wenn_ja_fuer_welche', label: 'Wenn ja, für welche?', type: 'long text', group: 'Governance und Prozesse', indicator: 'regional', order: 1, dependsOn: 'reg_score_strat_priority_product_groups', optional: true },
  { key: 'reg_score_1_werden_regionale_produkte_akti', label: 'Werden regionale Produkte aktiv gegenüber Gästen kommuniziert (z. B. Kennzeichnung, Storytelling, Aktionen)?', type: 'single-select', options: YES_NO_PLANNED, group: 'Weitere Maßnahmen', indicator: 'regional', order: 1 },
  { key: 'reg_score_init_value_chain_cooperation', label: 'Gibt es besondere Initiativen oder Kooperationen zur Stärkung regionaler Wertschöpfungsketten (z. B. Teilnahme an Netzwerken, Pilotprojekte)?', type: 'single-select', options: YES_NO_PLANNED, group: 'Weitere Maßnahmen', indicator: 'regional', order: 1 },
  { key: 'reg_score_1_wenn_ja_welche', label: 'Wenn ja, welche?', type: 'long text', group: 'Weitere Maßnahmen', indicator: 'regional', order: 1, dependsOn: 'reg_score_init_value_chain_cooperation', optional: true },
]

const FAIR_TRADE_SCORING: QuestionConfig[] = [
  { key: 'ft_score_1_werden_nachweise_regelmaessig_', label: 'Werden Nachweise regelmäßig geprüft (z. B. Rechnungen, Zertifikate, Lieferantenerklärungen)?', type: 'single-select', options: YES_NO_PLANNED, group: 'Zertifizierung & Nachweis', indicator: 'fair_trade', order: 1 },
  { key: 'ft_score_1_werden_produkte_mit_sozialen_m', label: 'Werden Produkte mit sozialen Mindeststandards (z. B. Sorgfaltspflichten nach LkSG) berücksichtigt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Zertifizierung & Nachweis', indicator: 'fair_trade', order: 1 },
  { key: 'ft_score_cert_recognized_labels', label: 'Arbeitet ihr hier mit anerkannten Siegeln?', type: 'single-select', options: YES_NO_PLANNED, group: 'Zertifizierung & Nachweis', indicator: 'fair_trade', order: 1 },
  { key: 'ft_score_1_wenn_ja_welche', label: 'Wenn ja, welche:', type: 'long text', group: 'Zertifizierung & Nachweis', indicator: 'fair_trade', order: 1, dependsOn: 'ft_score_cert_recognized_labels', optional: true },
  { key: 'ft_score_1_sind_faire_produkte_in_eurem_w', label: 'Sind faire Produkte in Eurem Warenwirtschaftssystem oder in der Buchhaltung eindeutig gekennzeichnet?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance', indicator: 'fair_trade', order: 1 },
  { key: 'ft_score_1_werden_direkte_handelsbeziehun', label: 'Werden direkte Handelsbeziehungen zu Produzent:innen gepflegt (z. B. Kooperativen im Globalen Süden)?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance', indicator: 'fair_trade', order: 1 },
  { key: 'ft_score_1_steht_ihr_im_austausch_mit_eur', label: 'Steht ihr im Austausch mit euren Lieferanten über faire Alternativprodukte oder Lieferumstellungen?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance', indicator: 'fair_trade', order: 1 },
  { key: 'ft_score_1_arbeitet_ihr_mit_einer_liefera', label: 'Arbeitet ihr mit einer Lieferantenrichtlinie, die Faire Beziehungen definiert?', type: 'single-select', options: YES_NO_PLANNED, group: 'Governance', indicator: 'fair_trade', order: 1 },
]

const GUEST_SATISFACTION_SCORING: QuestionConfig[] = [
  { key: 'gs_score_1_werden_in_euren_betrieben_rege', label: 'Werden in euren Betrieben regelmäßig Maßnahmen zur Erfassung der Gästezufriedenheit durchgeführt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Struktur und Prozesse', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_scrore_standardized_tracking', label: 'Wird diese Erfassung standardisiert regelmäßig durchgeführt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Struktur und Prozesse', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_score_1_wenn_ja_wie', label: 'Wenn ja, wie?', type: 'long text', group: 'Struktur und Prozesse', indicator: 'guest_satisfaction', order: 1, dependsOn: 'gs_scrore_standardized_tracking', optional: true },
  { key: 'gs_scrore_informal_tracking', label: 'Wird diese Erfassung informell regelmäßig durchgeführt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Struktur und Prozesse', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_score_1_wenn_ja_wie_1', label: 'Wenn ja, wie?', type: 'long text', group: 'Struktur und Prozesse', indicator: 'guest_satisfaction', order: 1, dependsOn: 'gs_scrore_informal_tracking', optional: true },
  { key: 'gs_score_1_falls_bei_euch_die_gaestezufri', label: 'Falls bei Euch die Gästezufriedenheit erfasst wird, in welcher Häufigkeit wird sie erfasst?', type: 'single-select', options: ['nie', 'jährlich', 'halbjährlich', 'quartalsweise', 'monatlich', 'wöchentlich', 'täglich'], group: 'Struktur und Prozesse', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_score_1_falls_bei_euch_die_gaestezufri_1', label: 'Falls bei Euch die Gästezufriedenheit erfasst wird, welches Ergebniss wurde bei der letzten Erhebung erfasst?', type: 'long text', group: 'Struktur und Prozesse', indicator: 'guest_satisfaction', order: 1, optional: true },
  { key: 'gs_score_1_wann_wurde_die_letzte_erhebung', label: 'Wann wurde die letzte Erhebung durchgeführt?', type: 'long text', group: 'Struktur und Prozesse', indicator: 'guest_satisfaction', order: 1, optional: true },
  { key: 'gs_score_1_gibt_es_ein_festes_team_oder_d', label: 'Gibt es ein festes Team oder definierte Ansprechpersonen, die sich mit der Auswertung und Umsetzung von Gästefeedback beschäftigen?', type: 'single-select', options: YES_NO_PLANNED, group: 'Struktur und Prozesse', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_scrore_info_guest_sustainability_info', label: 'Informiert ihr die Tischgäste regelmäßig über Nachhaltigkeitsmaßnahmen eurer Einrichtung (z. B. CO₂-Werte, Bio-Anteil, Tierwohl, Saisonalität)?', type: 'single-select', options: YES_NO_PLANNED, group: 'Kommunikation & Transparenz', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_score_1_wenn_ja_welche', label: 'Wenn ja, welche?', type: 'long text', group: 'Kommunikation & Transparenz', indicator: 'guest_satisfaction', order: 1, dependsOn: 'gs_scrore_info_guest_sustainability_info', optional: true },
  { key: 'gs_scrore_info_dish_environmental_impact', label: 'Werden Informationen zu den Umweltwirkungen einzelner Speisen (z. B. CO₂-Ampel, Klimapunkte) bereitgestellt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Kommunikation & Transparenz', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_score_1_wenn_ja_welche_1', label: 'Wenn ja, welche?', type: 'long text', group: 'Kommunikation & Transparenz', indicator: 'guest_satisfaction', order: 1, dependsOn: 'gs_scrore_info_dish_environmental_impact', optional: true },
  { key: 'gs_scrore_info_dish_health_impact', label: 'Werden Informationen zu den Gesundheitswirkungen einzelner Speisen (z. B. Gesundheitsscore) bereitgestellt?', type: 'single-select', options: YES_NO_PLANNED, group: 'Kommunikation & Transparenz', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_score_1_wenn_ja_welche_2', label: 'Wenn ja, welche?', type: 'long text', group: 'Kommunikation & Transparenz', indicator: 'guest_satisfaction', order: 1, dependsOn: 'gs_scrore_info_dish_health_impact', optional: true },
  { key: 'gs_scrore_guest_feedback_menu', label: 'Können Gäste aktiv Vorschläge zur Speisegestaltung oder -bewertung einbringen?', type: 'single-select', options: YES_NO_PLANNED, group: 'Partizipation und Feedbackkultur', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_score_1_welche_formate_werden_genutzt_', label: 'Welche Formate werden genutzt (z. B. Wunschbox, Workshops, Gespräche)?', type: 'long text', group: 'Partizipation und Feedbackkultur', indicator: 'guest_satisfaction', order: 1, optional: true },
  { key: 'gs_scrore_guest_feedback_response', label: 'Gibt es sichtbare Rückmeldungen oder Veränderungen auf Basis des Gäste-Feedbacks?', type: 'single-select', options: YES_NO_PLANNED, group: 'Partizipation und Feedbackkultur', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_score_1_wenn_ja_wie_werden_diese_kommu', label: 'Wenn ja, wie werden diese kommuniziert?', type: 'long text', group: 'Partizipation und Feedbackkultur', indicator: 'guest_satisfaction', order: 1, dependsOn: 'gs_scrore_guest_feedback_response', optional: true },
  { key: 'gs_scrore_dining_atmosphere_design', label: 'Wird bei der Gestaltung des Speiseraums bewusst auf Wohlfühlatmosphäre geachtet? (z. B. Tischgestaltung, Raumgestaltung, Akustik)', type: 'single-select', options: YES_NO_PLANNED, group: 'Erlebnis & Umfeld', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_score_1_wenn_ja_wie_2', label: 'Wenn ja, wie?', type: 'long text', group: 'Erlebnis & Umfeld', indicator: 'guest_satisfaction', order: 1, dependsOn: 'gs_scrore_dining_atmosphere_design', optional: true },
  { key: 'gs_scrore_dining_food_aesthetics', label: 'Wird bei der Präsentation der Speisen bewusst auf  Essästhetik geachtet? (z. B. Speisenanrichtung, Geschirrauswahl).', type: 'single-select', options: YES_NO_PLANNED, group: 'Erlebnis & Umfeld', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_score_1_wenn_ja_wie_3', label: 'Wenn ja, wie?', type: 'long text', group: 'Erlebnis & Umfeld', indicator: 'guest_satisfaction', order: 1, dependsOn: 'gs_scrore_dining_food_aesthetics', optional: true },
]

export const SCORING_QUESTIONS: QuestionConfig[] = computeQuestionNumberings(
  [
    ...PLANT_BASED_SCORING,
    ...ORGANIC_SCORING,
    ...FOOD_WASTE_SCORING,
    ...SEASONAL_SCORING,
    ...REGIONAL_SCORING,
    ...FAIR_TRADE_SCORING,
    ...GUEST_SATISFACTION_SCORING,
  ],
  INDICATORS,
)

export const SCORING_QUESTIONS_MAP: Record<string, QuestionConfig> = Object.fromEntries(
  SCORING_QUESTIONS.map((q) => [q.key, q])
)

import type { qualitativeResponses } from '@/lib/db/schema'

export type QualitativeResponseWithRelations = typeof qualitativeResponses.$inferSelect & {
  organization: { name: string } | null
  subOrganization: { name: string | null } | null
}
