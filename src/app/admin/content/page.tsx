import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ContentListClient } from "@/components/admin/content-list-client"
import { INDICATOR_CONFIG } from "@/lib/indicators/config"

export const metadata = {
  title: "Inhalte verwalten | Admin",
  description: "Verwaltung der Textinhalte der Applikation",
}

const CONTENT_PAGES = [
  { slug: "dashboard", title: "Dashboard", description: "Übersicht und Willkommenstext" },
  { slug: "datasets", title: "Datensätze", description: "Übersicht der Datensätze" },
  { slug: "indicators", title: "Indikatoren", description: "Übersicht der Indikatoren" },
  { slug: "indicator_plant_based", title: `Indikator: ${INDICATOR_CONFIG.plant_based_percentage.title}`, description: "Details zum pflanzlichen Indikator" },
  { slug: "indicator_organic", title: `Indikator: ${INDICATOR_CONFIG.organic_percentage.title}`, description: "Details zum ökologischen Indikator" },
  { slug: "indicator_food_waste", title: `Indikator: ${INDICATOR_CONFIG.food_waste.title}`, description: "Details zum Abfall Indikator" },
  { slug: "indicator_seasonal", title: `Indikator: ${INDICATOR_CONFIG.seasonal_score.title}`, description: "Details zum saisonalen Indikator" },
  { slug: "indicator_regional", title: `Indikator: ${INDICATOR_CONFIG.regional_score.title}`, description: "Details zum regionalen Indikator" },
  { slug: "indicator_fair_trade", title: `Indikator: ${INDICATOR_CONFIG.fair_trade_percentage.title}`, description: "Details zum Fair Trade Indikator" },
  { slug: "indicator_guest_satisfaction", title: `Indikator: ${INDICATOR_CONFIG.guest_satisfaction.title}`, description: "Details zum Gästezufriedenheits Indikator" },
  { slug: "comparison", title: "Vergleich", description: "Seite für Benchmark-Vergleiche" },
  { slug: "methodology", title: "Methodik", description: "Erklärungen, Formeln, und Hinweise zu Indikatoren" },
  { slug: "forms_operating", title: "Formular: Betriebsdaten", description: "Eingabetexte und Feldhinweise für Betriebsdaten" },
  { slug: "forms_scoring", title: "Formular: Scoring", description: "Eingabetexte und Feldhinweise für qualitative Daten" },
  { slug: "forms_reflection", title: "Formular: Reflexion", description: "Reflexionsfragen und Texte" },
  { slug: "tasks", title: "Aufgaben", description: "Übersicht der Aufgaben" },
  { slug: "settings", title: "Einstellungen", description: "Profil und Sicherheitseinstellungen" },
]

export default async function AdminContentPage() {
  const session = await auth()
  if (!session?.user?.id) return redirect("/login")

  const roles = (session?.user as any)?.roles || []
  const isAdmin = roles.includes("admin") || roles.includes("super_admin")
  if (!isAdmin) return redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Inhalte verwalten</h2>
        <p className="text-muted-foreground mt-2">
          Bearbeiten Sie Texte, Hinweise und Erklärungen der verschiedenen Seiten. (Seitentitel und Navigation sind hiervon ausgeschlossen)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Verfügbare Seiten</CardTitle>
          <CardDescription>Wählen Sie eine Seite aus, um deren Inhalte zu bearbeiten.</CardDescription>
        </CardHeader>
        <CardContent>
          <ContentListClient pages={CONTENT_PAGES} />
        </CardContent>
      </Card>
    </div>
  )
}
