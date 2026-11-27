import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ContentEditClient } from "@/components/admin/content-edit-client"
import { getAppContent } from "@/lib/content/content"
import { INDICATOR_CONFIG } from "@/lib/indicators/config"

// Define the keys that belong to each page
// We fetch the current values and pass them securely to the client

const CONTENT_MAPPINGS: Record<string, { title: string, description: string, fields: { key: string, label: string, isTextarea?: boolean }[] }> = {
  "dashboard": {
    title: "Dashboard",
    description: "Startseite und Übersicht",
    fields: [
      { key: "welcome.title", label: "Willkommen Titel" },
      { key: "welcome.subtitle", label: "Willkommen Untertitel", isTextarea: true },
      { key: "page.dashboard.subtitle", label: "Untertitel (Übersicht)", isTextarea: true },
    ]
  },
  "comparison": {
    title: "Vergleich",
    description: "Benchmarks und Vergleiche",
    fields: [
      { key: "page.comparison.subtitle", label: "Untertitel (Vergleich)", isTextarea: true },
    ]
  },
  "datasets": {
    title: "Datensätze",
    description: "Übersicht alle Datensätze",
    fields: [
      { key: "page.datasets.subtitle", label: "Untertitel", isTextarea: true },
    ]
  },
  "indicators": {
    title: "Indikatoren Übersicht",
    description: "Übersicht alle Indikatoren",
    fields: [
      { key: "page.indicators.subtitle", label: "Untertitel", isTextarea: true },
    ]
  },
  "indicator_plant_based": {
    title: `Indikator: ${INDICATOR_CONFIG.plant_based_percentage.title}`,
    description: "Texte für den pflanzlichen Indikator",
    fields: [
      { key: "indicator.plant_based.description", label: "Seitenbeschreibung (Übersicht)", isTextarea: true },
      { key: "indicator.plant_based.operating.description", label: "Seitenbeschreibung (Betriebsdaten)", isTextarea: true },
      { key: "indicator.plant_based.scoring.description", label: "Seitenbeschreibung (Scoring)", isTextarea: true },
      { key: "indicator.plant_based.reflection.description", label: "Seitenbeschreibung (Reflexion)", isTextarea: true },
    ]
  },
  "indicator_organic": {
    title: `Indikator: ${INDICATOR_CONFIG.organic_percentage.title}`,
    description: "Texte für den ökologischen Indikator",
    fields: [
      { key: "indicator.organic.description", label: "Seitenbeschreibung (Übersicht)", isTextarea: true },
      { key: "indicator.organic.operating.description", label: "Seitenbeschreibung (Betriebsdaten)", isTextarea: true },
      { key: "indicator.organic.scoring.description", label: "Seitenbeschreibung (Scoring)", isTextarea: true },
      { key: "indicator.organic.reflection.description", label: "Seitenbeschreibung (Reflexion)", isTextarea: true },
    ]
  },
  "indicator_food_waste": {
    title: `Indikator: ${INDICATOR_CONFIG.food_waste.title}`,
    description: "Texte für den Lebensmittelabfall Indikator",
    fields: [
      { key: "indicator.food_waste.description", label: "Seitenbeschreibung (Übersicht)", isTextarea: true },
      { key: "indicator.food_waste.operating.description", label: "Seitenbeschreibung (Betriebsdaten)", isTextarea: true },
      { key: "indicator.food_waste.scoring.description", label: "Seitenbeschreibung (Scoring)", isTextarea: true },
      { key: "indicator.food_waste.reflection.description", label: "Seitenbeschreibung (Reflexion)", isTextarea: true },
    ]
  },
  "indicator_seasonal": {
    title: `Indikator: ${INDICATOR_CONFIG.seasonal_score.title}`,
    description: "Texte für den saisonalen Indikator",
    fields: [
      { key: "indicator.seasonal.description", label: "Seitenbeschreibung (Übersicht)", isTextarea: true },
      { key: "indicator.seasonal.operating.description", label: "Seitenbeschreibung (Betriebsdaten)", isTextarea: true },
      { key: "indicator.seasonal.scoring.description", label: "Seitenbeschreibung (Scoring)", isTextarea: true },
      { key: "indicator.seasonal.reflection.description", label: "Seitenbeschreibung (Reflexion)", isTextarea: true },
    ]
  },
  "indicator_regional": {
    title: `Indikator: ${INDICATOR_CONFIG.regional_score.title}`,
    description: "Texte für den regionalen Indikator",
    fields: [
      { key: "indicator.regional.description", label: "Seitenbeschreibung (Übersicht)", isTextarea: true },
      { key: "indicator.regional.operating.description", label: "Seitenbeschreibung (Betriebsdaten)", isTextarea: true },
      { key: "indicator.regional.scoring.description", label: "Seitenbeschreibung (Scoring)", isTextarea: true },
      { key: "indicator.regional.reflection.description", label: "Seitenbeschreibung (Reflexion)", isTextarea: true },
    ]
  },
  "indicator_fair_trade": {
    title: `Indikator: ${INDICATOR_CONFIG.fair_trade_percentage.title}`,
    description: "Texte für den Fair Trade Indikator",
    fields: [
      { key: "indicator.fair_trade.description", label: "Seitenbeschreibung (Übersicht)", isTextarea: true },
      { key: "indicator.fair_trade.operating.description", label: "Seitenbeschreibung (Betriebsdaten)", isTextarea: true },
      { key: "indicator.fair_trade.scoring.description", label: "Seitenbeschreibung (Scoring)", isTextarea: true },
      { key: "indicator.fair_trade.reflection.description", label: "Seitenbeschreibung (Reflexion)", isTextarea: true },
    ]
  },
  "indicator_guest_satisfaction": {
    title: `Indikator: ${INDICATOR_CONFIG.guest_satisfaction.title}`,
    description: "Texte für den Gästezufriedenheits Indikator",
    fields: [
      { key: "indicator.guest_satisfaction.description", label: "Seitenbeschreibung (Übersicht)", isTextarea: true },
      { key: "indicator.guest_satisfaction.operating.description", label: "Seitenbeschreibung (Betriebsdaten)", isTextarea: true },
      { key: "indicator.guest_satisfaction.scoring.description", label: "Seitenbeschreibung (Scoring)", isTextarea: true },
      { key: "indicator.guest_satisfaction.reflection.description", label: "Seitenbeschreibung (Reflexion)", isTextarea: true },
    ]
  },
  "methodology": {
    title: "Methodik",
    description: "Beschreibungen, Formeln, Quellen und Hinweise der Indikatoren",
    fields: [
      { key: "methodology.description", label: "Methodik Beschreibung", isTextarea: true },
      
      { key: "methodology.plant_based.formula", label: `${INDICATOR_CONFIG.plant_based_percentage.title}: Formel`, isTextarea: true },
      { key: "methodology.plant_based.source", label: `${INDICATOR_CONFIG.plant_based_percentage.title}: Quelle`, isTextarea: true },
      { key: "methodology.plant_based.notes", label: `${INDICATOR_CONFIG.plant_based_percentage.title}: Hinweise`, isTextarea: true },
      
      { key: "methodology.organic.formula", label: `${INDICATOR_CONFIG.organic_percentage.title}: Formel`, isTextarea: true },
      { key: "methodology.organic.source", label: `${INDICATOR_CONFIG.organic_percentage.title}: Quelle`, isTextarea: true },
      { key: "methodology.organic.notes", label: `${INDICATOR_CONFIG.organic_percentage.title}: Hinweise`, isTextarea: true },
      
      { key: "methodology.food_waste.formula", label: `${INDICATOR_CONFIG.food_waste.title}: Formel`, isTextarea: true },
      { key: "methodology.food_waste.source", label: `${INDICATOR_CONFIG.food_waste.title}: Quelle`, isTextarea: true },
      { key: "methodology.food_waste.notes", label: `${INDICATOR_CONFIG.food_waste.title}: Hinweise`, isTextarea: true },
      
      { key: "methodology.seasonal.formula", label: `${INDICATOR_CONFIG.seasonal_score.title}: Formel`, isTextarea: true },
      { key: "methodology.seasonal.source", label: `${INDICATOR_CONFIG.seasonal_score.title}: Quelle`, isTextarea: true },
      { key: "methodology.seasonal.notes", label: `${INDICATOR_CONFIG.seasonal_score.title}: Hinweise`, isTextarea: true },
      
      { key: "methodology.regional.formula", label: `${INDICATOR_CONFIG.regional_score.title}: Formel`, isTextarea: true },
      { key: "methodology.regional.source", label: `${INDICATOR_CONFIG.regional_score.title}: Quelle`, isTextarea: true },
      { key: "methodology.regional.notes", label: `${INDICATOR_CONFIG.regional_score.title}: Hinweise`, isTextarea: true },
      
      { key: "methodology.fair_trade.formula", label: `${INDICATOR_CONFIG.fair_trade_percentage.title}: Formel`, isTextarea: true },
      { key: "methodology.fair_trade.source", label: `${INDICATOR_CONFIG.fair_trade_percentage.title}: Quelle`, isTextarea: true },
      { key: "methodology.fair_trade.notes", label: `${INDICATOR_CONFIG.fair_trade_percentage.title}: Hinweise`, isTextarea: true },
      
      { key: "methodology.guest_satisfaction.formula", label: `${INDICATOR_CONFIG.guest_satisfaction.title}: Formel`, isTextarea: true },
      { key: "methodology.guest_satisfaction.source", label: `${INDICATOR_CONFIG.guest_satisfaction.title}: Quelle`, isTextarea: true },
      { key: "methodology.guest_satisfaction.notes", label: `${INDICATOR_CONFIG.guest_satisfaction.title}: Hinweise`, isTextarea: true },
    ]
  },
  "forms_operating": {
    title: "Formular: Betriebsdaten",
    description: "Eingabetexte, Labels und Hinweise im Formular für Betriebsdaten.",
    fields: [
      { key: "page.forms.subtitle", label: "Untertitel", isTextarea: true },

      // Labels
      { key: "form.operating.label.totalFoodSpend", label: "Label: Gesamteinkauf Lebensmittel" },
      { key: "form.operating.label.meatSpend", label: "Label: Fleisch" },
      { key: "form.operating.label.fishSpend", label: "Label: Fisch" },
      { key: "form.operating.label.dairySpend", label: "Label: Molkereiprodukte" },
      { key: "form.operating.label.eggSpend", label: "Label: Eier" },
      { key: "form.operating.label.mixedProductSpend", label: "Label: Mischprodukte" },
      { key: "form.operating.label.organicSpend", label: "Label: Bio-Einkauf" },
      
      { key: "form.operating.label.coffeeSpend", label: "Label: Gesamteinkauf Kaffee" },
      { key: "form.operating.label.fairTradeCoffeeSpend", label: "Label: Fair Trade Kaffee" },
      { key: "form.operating.label.cocoaSpend", label: "Label: Gesamteinkauf Kakao" },
      { key: "form.operating.label.fairTradeCocoaSpend", label: "Label: Fair Trade Kakao" },
      { key: "form.operating.label.cocoaMixedSpend", label: "Label: Gesamteinkauf Kakao-Mischprodukte" },
      { key: "form.operating.label.fairTradeCocoaMixedSpend", label: "Label: Fair Trade Kakao-Mischprodukte" },
      { key: "form.operating.label.bananasSpend", label: "Label: Gesamteinkauf Bananen" },
      { key: "form.operating.label.fairTradeBananasSpend", label: "Label: Fair Trade Bananen" },
      
      { key: "form.operating.label.foodWasteAmount", label: "Label: Abfallmenge" },

      // Hints
      { key: "form.operating.hint.totalFoodSpend", label: "Hinweis: Gesamteinkauf", isTextarea: true },
      { key: "form.operating.hint.meatSpend", label: "Hinweis: Fleisch", isTextarea: true },
      { key: "form.operating.hint.fishSpend", label: "Hinweis: Fisch", isTextarea: true },
      { key: "form.operating.hint.dairySpend", label: "Hinweis: Molkereiprodukte", isTextarea: true },
      { key: "form.operating.hint.eggSpend", label: "Hinweis: Eier", isTextarea: true },
      { key: "form.operating.hint.mixedProductSpend", label: "Hinweis: Mischprodukte", isTextarea: true },
      { key: "form.operating.hint.organicSpend", label: "Hinweis: Bio-Einkauf", isTextarea: true },
      
      { key: "form.operating.hint.coffeeSpend", label: "Hinweis: Gesamt Kaffee", isTextarea: true },
      { key: "form.operating.hint.fairTradeCoffeeSpend", label: "Hinweis: Fair Trade Kaffee", isTextarea: true },
      { key: "form.operating.hint.cocoaSpend", label: "Hinweis: Gesamt Kakao", isTextarea: true },
      { key: "form.operating.hint.fairTradeCocoaSpend", label: "Hinweis: Fair Trade Kakao", isTextarea: true },
      { key: "form.operating.hint.cocoaMixedSpend", label: "Hinweis: Gesamt Kakao-Misch", isTextarea: true },
      { key: "form.operating.hint.fairTradeCocoaMixedSpend", label: "Hinweis: Fair Trade Kakao-Misch", isTextarea: true },
      { key: "form.operating.hint.bananasSpend", label: "Hinweis: Gesamt Bananen", isTextarea: true },
      { key: "form.operating.hint.fairTradeBananasSpend", label: "Hinweis: Fair Trade Bananen", isTextarea: true },
      
      { key: "form.operating.hint.foodWasteAmount", label: "Hinweis: Abfallmenge", isTextarea: true },
    ]
  },
  "forms_scoring": {
    title: "Formular: Scoring",
    description: "Texte für das Scoring Formular",
    fields: [
      { key: "page.forms.scoring.subtitle", label: "Untertitel", isTextarea: true },
    ]
  },
  "forms_reflection": {
    title: "Formular: Reflexion",
    description: "Texte für das Reflexions-Formular",
    fields: [
      { key: "page.forms.reflection.subtitle", label: "Untertitel", isTextarea: true },
    ]
  },
  "tasks": {
    title: "Aufgaben",
    description: "Aufgaben Übersicht Texte",
    fields: [
      { key: "page.tasks.subtitle", label: "Untertitel", isTextarea: true },
    ]
  },
  "settings": {
    title: "Einstellungen",
    description: "Einstellungen Texte",
    fields: [
      { key: "page.settings.subtitle", label: "Untertitel", isTextarea: true },
    ]
  }
}

export default async function ContentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  
  const session = await auth()
  if (!session?.user?.id) return redirect("/login")

  const roles = (session?.user as any)?.roles || []
  const isAdmin = roles.includes("admin") || roles.includes("super_admin")
  if (!isAdmin) return redirect("/dashboard")

  const config = CONTENT_MAPPINGS[slug]
  if (!config) return redirect("/admin/content")

  // Fetch actual current translations
  const allTranslations = await getAppContent()
  
  const mappedItems = config.fields.map(field => ({
    key: field.key,
    label: field.label,
    isTextarea: field.isTextarea,
    value: allTranslations[field.key] || "",
  }))

  return (
    <ContentEditClient 
      pageTitle={config.title}
      description={config.description}
      items={mappedItems}
    />
  )
}
