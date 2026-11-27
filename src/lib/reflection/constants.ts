// Reflection / Intake question constants — Reflexion questions (intake_responses table)
// Generated from CSV: 2026-02 AVE Dashboard qualitative data structure.csv

import type { QuestionConfig } from '@/lib/questions/types'
export type { QuestionConfig, FormDataMap as ReflectionFormData } from '@/lib/questions/types'
export { groupQuestionsByIndicator } from '@/lib/questions/types'
export type { ResponseValue } from '@/lib/questions/types'

import { INDICATOR_LABELS as ALL_LABELS } from '@/lib/indicators/indicators'

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

// ─── Generated Questions ─────────────────────────────────────────────

const PLANT_BASED_REFLEXION: QuestionConfig[] = [
  { key: 'pb_refl_personal_evaluation', label: 'Reflexion – Bewertung der Ergebnisse, die erreicht wurden', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'plant_based', order: 1 },
  { key: 'pb_refl_ambition_next', label: 'Ziel – Wie lautet die Ambition bis zur nächsten Messung?', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'plant_based', order: 2 },
  { key: 'pb_refl_next_steps', label: 'Nächste Schritte/Maßnahmen, die im Betrieb zur Zielerreichung umgesetzt werden sollen', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'plant_based', order: 3 },
  { key: 'pb_refl_support_needs', label: 'Unterstützungsbedarf (z.B. Beratung, AVE-Wissen, Rezepte, Komms-Materialien)', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'plant_based', order: 4 },
  { key: 'pb_refl_nutritional_quality', label: 'Wie bewertet Ihr die ernährungsphysiologische Qualität eures Gesamtangebots (Ausgewogenheit, Nährstoffvielfalt, Ballaststoffe)? (1= überhaupt nicht zufrieden, 5=sehr zufrieden) ', type: 'single-select', options: ['1', '2', '3', '4', '5'], group: 'Ernährungsphysiologische Qualität', indicator: 'plant_based', order: 5 },
  { key: 'pb_refl_6_beschreibe_kurz_wie_du_zu_dies', label: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:', type: 'long text', group: 'Ernährungsphysiologische Qualität', indicator: 'plant_based', order: 6 },
  { key: 'pb_refl_nutritional_elements', label: 'Welche Elemente setzt Ihr regelmäßig um? (Vollkorn in allen Menülinien, pflanzliche Eiweißquellen, reduzierte Fleischportionen etc.)', type: 'long text', group: 'Ernährungsphysiologische Qualität', indicator: 'plant_based', order: 7 },
  { key: 'pb_refl_attractiveness_guests', label: 'Wie attraktiv sind Eure pflanzlichen Angebote aus Sicht der Gäste?', type: 'long text', group: 'Kulinarische Attraktivität und Akzeptanz', indicator: 'plant_based', order: 8 },
  { key: 'pb_refl_popular_dishes', label: 'Welche pflanzlichen Gerichte kommen bei Gästen besonders gut an?', type: 'long text', group: 'Kulinarische Attraktivität und Akzeptanz', indicator: 'plant_based', order: 9 },
  { key: 'pb_refl_acceptance_challenges', label: 'Welche Herausforderungen gibt es bei der Akzeptanz (z. B. Portionsgröße, Geschmack, Vorbehalte)?', type: 'long text', group: 'Herausforderungen', indicator: 'plant_based', order: 10 },
  { key: 'pb_refl_obstacles', label: 'Welche zentralen Hindernisse seht Ihr aktuell für eine stärkere pflanzenbasierte Ernährung in Eurem Betrieb?', type: 'long text', group: 'Herausforderungen', indicator: 'plant_based', order: 27 },
  { key: 'pb_refl_nudge_no_restrictive_terms', label: 'Auf restriktive Begriffe wie „vegan“, „vegetarisch“ oder „gesund“ wird in der Speisenbezeichnung verzichtet.“', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 10 },
  { key: 'pb_refl_nudge_descriptive_language', label: 'Pflanzenbasierte Gerichte werden mit genussvoller, beschreibender Sprache beworben (z. B. „knusprig“, „cremig“, „würzig“)', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 11 },
  { key: 'pb_refl_nudge_eco_labels', label: 'Nachhaltige Gerichte sind durch Umweltkennzeichnungen, CO₂-Label oder Zertifikate gekennzeichnet.', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 12 },
  { key: 'pb_refl_nudge_expanded_offer', label: 'Das Angebot an pflanzenreichen, nachhaltigen Gerichten wurde gezielt erweitert.', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 13 },
  { key: 'pb_refl_nudge_all_menu_sections', label: 'Pflanzenbasierte Gerichte sind in allen Menüabschnitten (z. B. Vorspeise, Hauptgericht, Dessert) vertreten', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 14 },
  { key: 'pb_refl_nudge_prominent_placement', label: 'Pflanzliche Gerichte werden auf der Speisekarte oder im Buffet so platziert, dass sie besonders auffallen.', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 15 },
  { key: 'pb_refl_nudge_visual_highlight', label: 'Nachhaltige Speisen werden zusätzlich visuell hervorgehoben (z. B. auf Tafeln, digitalen Screens, Displays). ', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 16 },
  { key: 'pb_refl_nudge_design_elements', label: 'Design-Elemente (Farben, Icons, Layout) werden gezielt eingesetzt, um pflanzliche Gerichte hervorzuheben.', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 17 },
  { key: 'pb_refl_nudge_visible_presentation', label: 'Zutaten oder Gerichte werden sichtbar präsentiert (z. B. offene Theke, Fotos, Frontcooking).', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 18 },
  { key: 'pb_refl_nudge_sustainability_logos', label: 'Nachhaltigkeitslogos oder Bio-/Klimasiegel werden zur Kennzeichnung pflanzlicher Angebote verwendet.', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 19 },
  { key: 'pb_refl_nudge_staff_recommendations', label: 'Empfehlungen durch Mitarbeitende, Köch:innen oder Testimonials werden genutzt, um pflanzenreiche Gerichte zu stärken.', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 20 },
  { key: 'pb_refl_nudge_popularity_hints', label: 'Hinweise auf die Beliebtheit pflanzlicher Gerichte („meistgewählt“, „Top 3“) werden eingesetzt.', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 21 },
  { key: 'pb_refl_nudge_guest_info', label: 'Gäste werden aktiv über Vorteile pflanzenreicher Gerichte informiert (z. B. Gesundheit, Klima, Tierwohl)', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 22 },
  { key: 'pb_refl_nudge_tastings', label: 'Es werden regelmäßig Kostproben oder Degustationen von pflanzlichen Gerichten angeboten.', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 23 },
  { key: 'pb_refl_nudge_storytelling', label: 'Hintergrundgeschichten (Storytelling) zur Herkunft oder Wirkung pflanzlicher Speisen werden genutzt.', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 24 },
  { key: 'pb_refl_nudge_enviro_info', label: 'Zusatzinformationen zu Umweltwirkungen (z. B. CO₂, Wasserverbrauch) oder sozialen Aspekten (z. B. Fairtrade) sind verfügbar.', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 25 },
  { key: 'pb_refl_nudge_positive_comms', label: 'Die Gesamtkommunikation fördert positive Assoziationen mit pflanzlichen Gerichten (z. B. Genuss, Alltagstauglichkeit, Vielfalt)', type: 'single-select', options: ['Ja', 'Nein', 'Geplant'], group: 'Welche der folgenden bewährten Nudges nutzt Ihr schon? (Quelle Coolfood Playbook WRI 2024)', indicator: 'plant_based', order: 26 },
]

const ORGANIC_REFLEXION: QuestionConfig[] = [
  { key: 'org_refl_personal_evaluation', label: 'Reflexion – Bewertung der Ergebnisse, die erreicht wurden', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'organic', order: 1 },
  { key: 'org_refl_ambition_next', label: 'Ziel – Wie lautet die Ambition bis zur nächsten Messung?', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'organic', order: 2 },
  { key: 'org_refl_next_steps', label: 'Nächste Schritte/Maßnahmen, die im Betrieb zur Zielerreichung umgesetzt werden sollen', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'organic', order: 3 },
  { key: 'org_refl_support_needs', label: 'Unterstützungsbedarf (z.B. Beratung, AVE-Wissen, Rezepte, Komms-Materialien)', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'organic', order: 4 },
  { key: 'org_refl_bio_satisfaction', label: 'Wie zufrieden seid Ihr mit Eurem aktuellen Bio-Anteil? (1=sehr unzufrieden, 5=sehr zufrieden)', type: 'single-select', options: ['1', '2', '3', '4', '5'], group: 'Weitere Reflexionsfragen', indicator: 'organic', order: 5 },
  { key: 'org_refl_bio_satisfaction_detail', label: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'organic', order: 6, dependsOn: 'org_refl_bio_satisfaction' },
  { key: 'org_refl_bio_potential_groups', label: 'In welchen Produktgruppen seht Ihr das größte Potential für höhere Bio-Anteil?', type: 'multiple-choice', options: ['Kartoffeln', 'Gemüse & Obst', 'Getreideprodukte', 'Fleisch', 'Eier', 'Molkereiprodukte'], group: 'Weitere Reflexionsfragen', indicator: 'organic', order: 7 },
  { key: 'org_refl_bio_potential_detail', label: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'organic', order: 8, dependsOn: 'org_refl_bio_potential_groups' },
  { key: 'org_refl_bio_obstacles', label: 'Welche Hindernisse erschweren aktuell eine Steigerung?', type: 'multiple-choice', options: ['Preis', 'Verfügbarkeit', 'Ausschreibungsbedingungen', 'Logistik', 'Akzeptanz', 'Andere'], group: 'Weitere Reflexionsfragen', indicator: 'organic', order: 9 },
  { key: 'org_refl_bio_obstacles_detail', label: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'organic', order: 10, dependsOn: 'org_refl_bio_obstacles' },
  { key: 'org_refl_bio_strategy', label: 'Gibt es ein definiertes Ziel oder eine Strategie zur Erhöhung des Bio-Anteils?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'organic', order: 11 },
  { key: 'org_refl_bio_priority', label: 'Wie priorisiert Ihr Bio im Verhältnis zu Regionalität und Saisonalität?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'organic', order: 12 },
]

const FOOD_WASTE_REFLEXION: QuestionConfig[] = [
  { key: 'fw_refl_personal_evaluation', label: 'Reflexion – Bewertung der Ergebnisse, die erreicht wurden', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'food_waste', order: 1 },
  { key: 'fw_refl_ambition_next', label: 'Ziel – Wie lautet die Ambition bis zur nächsten Messung?', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'food_waste', order: 2 },
  { key: 'fw_refl_next_steps', label: 'Nächste Schritte/Maßnahmen, die im Betrieb zur Zielerreichung umgesetzt werden sollen', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'food_waste', order: 3 },
  { key: 'fw_refl_support_needs', label: 'Unterstützungsbedarf (z.B. Beratung, AVE-Wissen, Rezepte, Komms-Materialien)', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'food_waste', order: 4 },
  { key: 'fw_refl_satisfaction', label: 'Wie zufrieden seid Ihr mit eurem aktuellem Food‑Waste‑Stand? (1=überhaupt nicht zufrieden, 5=sehr zufrieden)', type: 'single-select', options: ['1', '2', '3', '4', '5'], group: 'Weitere Reflexionsfragen', indicator: 'food_waste', order: 5 },
  { key: 'fw_refl_satisfaction_detail', label: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'food_waste', order: 6, dependsOn: 'fw_refl_satisfaction' },
  { key: 'fw_refl_main_causes', label: 'Was sind die Hauptursachen für eure Lebensmittelabfälle (z.B. Tellerreste/ Überproduktion/ Lager/ Produktion/ Kommunikation/ Portionswahl/ Speiseplan)', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'food_waste', order: 7 },
  { key: 'fw_refl_effective_measures', label: 'Welche Maßnahme hat bei Euch gut funktioniert, um Lebensmittelabfälle zu reduzieren?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'food_waste', order: 8 },
  { key: 'fw_refl_ineffective_measures', label: 'Welche Maßnahme hat bei Euch eher nicht so gut funktioniert, um Lebensmittelabfälle zu reduzieren?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'food_waste', order: 9 },
  { key: 'fw_refl_challenges', label: 'Welche Herausforderungen habt ihr aktuell bei der Reduktion von Lebensmittelabfällen?', type: 'long text', group: 'Herausforderungen', indicator: 'food_waste', order: 10 },
]

const SEASONAL_REFLEXION: QuestionConfig[] = [
  { key: 'sea_refl_1_reflexion_bewertung_der_ergebn', label: 'Reflexion – Bewertung der Ergebnisse, die erreicht wurden', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'seasonal', order: 1 },
  { key: 'sea_refl_1_ziel_wie_lautet_die_ambition_b', label: 'Ziel – Wie lautet die Ambition bis zur nächsten Messung?', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'seasonal', order: 1 },
  { key: 'sea_refl_1_naechste_schritte_massnahmen_d', label: 'Nächste Schritte/Maßnahmen, die im Betrieb zur Zielerreichung umgesetzt werden sollen', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'seasonal', order: 1 },
  { key: 'sea_refl_1_unterstuetzungsbedarf_z_b_bera', label: 'Unterstützungsbedarf (z.B. Beratung, AVE-Wissen, Rezepte, Komms-Materialien)', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'seasonal', order: 1 },
  { key: 'sea_refl_1_wie_zufrieden_seid_ihr_mit_dem', label: 'Wie zufrieden seid Ihr mit dem aktuellen saisonalen Anteil? (1= überhaupt nicht zufrieden, 5=sehr zufrieden)', type: 'single-select', options: ['1', '2', '3', '4', '5'], group: 'Weitere Reflexionsfragen', indicator: 'seasonal', order: 1 },
  { key: 'sea_refl_1_beschreibe_kurz_wie_du_zu_dies', label: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'seasonal', order: 1 },
  { key: 'sea_refl_1_welche_produkte_sind_in_euren_', label: 'Welche Produkte sind in euren Betrieben am einfachsten saisonal einzusetzen?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'seasonal', order: 1 },
  { key: 'sea_refl_1_welche_produkte_sind_in_euren__1', label: 'Welche Produkte sind in euren Betrieben am schwierigsten saisonal einzusetzen?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'seasonal', order: 1 },
  { key: 'sea_refl_1_welche_hindernisse_erlebt_ihr_', label: 'Welche Hindernisse erlebt ihr bei der Erhöhung des Anteils saisonaler Produkte?  (z. B. Preis, Verfügbarkeit, Logistik, Akzeptanz)?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'seasonal', order: 1 },
  { key: 'sea_refl_1_welche_massnahmen_haben_bisher', label: 'Welche Maßnahmen haben bisher gut funktioniert, um mehr saisonale Lebensmittel einzusetzen?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'seasonal', order: 1 },
]

const REGIONAL_REFLEXION: QuestionConfig[] = [
  { key: 'reg_refl_1_reflexion_bewertung_der_ergebn', label: 'Reflexion – Bewertung der Ergebnisse, die erreicht wurden', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'regional', order: 1 },
  { key: 'reg_ref_', label: 'Ziel – Wie lautet die Ambition bis zur nächsten Messung?', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'regional', order: 1 },
  { key: 'reg_refl_1_naechste_schritte_massnahmen_d', label: 'Nächste Schritte/Maßnahmen, die im Betrieb zur Zielerreichung umgesetzt werden sollen', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'regional', order: 1 },
  { key: 'reg_refl_1_unterstuetzungsbedarf_z_b_bera', label: 'Unterstützungsbedarf (z.B. Beratung, AVE-Wissen, Rezepte, Komms-Materialien)', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'regional', order: 1 },
  { key: 'reg_refl_1_wie_zufrieden_seid_ihr_mit_eur', label: 'Wie zufrieden seid Ihr mit eurem aktuellen Anteil an regionalen Lebensmitteln? (1=überhaupt nicht zufrieden, 5=sehr zufrieden)', type: 'single-select', options: ['1', '2', '3', '4', '5'], group: 'Weitere Reflexionsfragen', indicator: 'regional', order: 1 },
  { key: 'reg_refl_1_beschreibe_kurz_wie_du_zu_dies', label: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'regional', order: 1 },
  { key: 'reg_refl_1_welche_produkte_sind_am_einfac', label: 'Welche Produkte sind am einfachsten regional einzusetzen?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'regional', order: 1 },
  { key: 'reg_refl_1_welche_produkte_sind_am_schwie', label: 'Welche Produkte sind am schwierigsten regional einzusetzen?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'regional', order: 1 },
  { key: 'reg_refl_1_welche_hindernisse_erlebt_ihr_', label: 'Welche Hindernisse erlebt ihr bei der Erhöhung des Anteils regionaler Produkte?  (z. B. Preis, Verfügbarkeit, Logistik, fehlende Kennzeichnung etc. )?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'regional', order: 1 },
  { key: 'reg_refl_1_welche_massnahmen_haben_bisher', label: 'Welche Maßnahmen haben bisher gut funktioniert, um mehr regionale Lebensmittel einzusetzen?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'regional', order: 1 },
]

const FAIR_TRADE_REFLEXION: QuestionConfig[] = [
  { key: 'ft_ref_', label: 'Reflexion – Bewertung der Ergebnisse, die erreicht wurden', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'fair_trade', order: 1 },
  { key: 'ft_refl_1_ziel_wie_lautet_die_ambition_b', label: 'Ziel – Wie lautet die Ambition bis zur nächsten Messung?', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'fair_trade', order: 1 },
  { key: 'ft_refl_1_naechste_schritte_massnahmen_d', label: 'Nächste Schritte/Maßnahmen, die im Betrieb zur Zielerreichung umgesetzt werden sollen', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'fair_trade', order: 1 },
  { key: 'ft_refl_1_unterstuetzungsbedarf_z_b_bera', label: 'Unterstützungsbedarf (z.B. Beratung, AVE-Wissen, Rezepte, Komms-Materialien)', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'fair_trade', order: 1 },
  { key: 'ft_refl_1_wie_zufrieden_seid_ihr_mit_eur', label: 'Wie zufrieden seid Ihr mit Eurem aktuellen Fairtrade-Anteil? (1=überhaupt nicht zufrieden, 5=sehr zufrieden)', type: 'single-select', options: ['1', '2', '3', '4', '5'], group: 'Weitere Reflexionsfragen', indicator: 'fair_trade', order: 1 },
  { key: 'ft_refl_1_beschreibe_kurz_wie_du_zu_dies', label: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'fair_trade', order: 1 },
  { key: 'ft_refl_1_in_welchen_produktgruppen_seht', label: 'In welchen Produktgruppen seht Ihr das größte Potential den Anteil an fair gehandelten Produkten zu erhöhen?', type: 'single-select', options: ['Tee', 'Tropische Früchte', 'Gewürze', 'Reis', 'Kaffee', 'Schokolade'], group: 'Weitere Reflexionsfragen', indicator: 'fair_trade', order: 1 },
  { key: 'ft_refl_1_beschreibe_kurz_wie_du_zu_dies_1', label: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'fair_trade', order: 1 },
  { key: 'ft_refl_1_welche_hindernisse_erschweren_', label: 'Welche Hindernisse erschweren aktuell eine Steigerung?', type: 'single-select', options: ['Preis', 'Verfügbarkeit', 'Ausschreibungsbedingungen', 'Logistik', 'Akzeptanz'], group: 'Weitere Reflexionsfragen', indicator: 'fair_trade', order: 1 },
  { key: 'ft_refl_1_beschreibe_kurz_wie_du_zu_dies_2', label: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'fair_trade', order: 1 },
  { key: 'ft_refl_1_was_hat_bisher_gut_funktionier', label: 'Was hat bisher gut funktioniert, um den Anteil fair produzierter Produkte zu erhöhen?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'fair_trade', order: 1 },
  { key: 'ft_refl_1_was_hat_bisher_nicht_gut_funkt', label: 'Was hat bisher nicht gut funktioniert, um den Anteil fair produzierter Produkte zu erhöhen?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'fair_trade', order: 1 },
]

const GUEST_SATISFACTION_REFLEXION: QuestionConfig[] = [
  { key: 'gs_ref_', label: 'Reflexion – Bewertung der Ergebnisse, die erreicht wurden', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_refl_1_ziel_wie_lautet_die_ambition_b', label: 'Ziel – Wie lautet die Ambition bis zur nächsten Messung?', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_refl_1_naechste_schritte_massnahmen_d', label: 'Nächste Schritte/Maßnahmen, die im Betrieb zur Zielerreichung umgesetzt werden sollen', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_refl_1_unterstuetzungsbedarf_z_b_bera', label: 'Unterstützungsbedarf (z.B. Beratung, AVE-Wissen, Rezepte, Komms-Materialien)', type: 'long text', group: 'Allgemeine Reflexion', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_refl_1_wie_bewertet_ihr_selbst_die_ak', label: 'Wie bewertet Ihr selbst die Akzeptanz Eurer nachhaltigen Speisenangebote? (1=überhaupt nicht zufrieden, 5=sehr zufrieden)', type: 'single-select', options: ['1', '2', '3', '4', '5'], group: 'Weitere Reflexionsfragen', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_refl_1_beschreibe_kurz_wie_du_zu_dies', label: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_refl_1_wie_hoch_schaetzt_ihr_die_zufr', label: 'Wie hoch schätzt ihr die Zufridenheit eurer Gäste ein? (1=überhaupt nicht zufrieden, 5=sehr zufrieden)', type: 'single-select', options: ['1', '2', '3', '4', '5'], group: 'Weitere Reflexionsfragen', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_refl_1_beschreibe_kurz_wie_du_zu_dies_1', label: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_refl_1_welche_rueckmeldemethoden_funk', label: 'Welche Rückmeldemethoden funktionieren in Eurem Setting besonders gut (z. B. digitale Tools, Feedbackboxen, Elternvertretungen, Gespräche)?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_refl_1_welche_rueckmeldemethoden_funk_1', label: 'Welche Rückmeldemethoden funktionieren in Eurem Setting NICHT gut (z. B. digitale Tools, Feedbackboxen, Elternvertretungen, Gespräche)?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_refl_1_welche_veraenderungen_habt_ihr', label: 'Welche Veränderungen habt Ihr bereits auf Basis von Gästefeedback umgesetzt?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'guest_satisfaction', order: 1 },
  { key: 'gs_refl_1_welche_hindernisse_erlebt_ihr_', label: 'Welche Hindernisse erlebt Ihr bei der Erfassung von Gästefeedback (z. B. Rücklauf, Zielgruppe, Zeitaufwand)?', type: 'long text', group: 'Weitere Reflexionsfragen', indicator: 'guest_satisfaction', order: 1 },
]

export const REFLECTION_QUESTIONS: QuestionConfig[] = [
  ...PLANT_BASED_REFLEXION,
  ...ORGANIC_REFLEXION,
  ...FOOD_WASTE_REFLEXION,
  ...SEASONAL_REFLEXION,
  ...REGIONAL_REFLEXION,
  ...FAIR_TRADE_REFLEXION,
  ...GUEST_SATISFACTION_REFLEXION,
]

export const REFLECTION_QUESTIONS_MAP: Record<string, QuestionConfig> = Object.fromEntries(
  REFLECTION_QUESTIONS.map((q) => [q.key, q])
)
