"use client"

import Link from "next/link"
import { LayoutDashboard, BarChart3, Database, FileText, Activity } from "lucide-react"
import { useContent } from "@/components/providers/content-provider"
import { EditableText } from "@/components/editable-text"

export default function DataIndexPage() {
    const t = useContent()

    const dataPages = [
        {
            title: "Übersicht",
            description: "Zusammenfassung aller Nachhaltigkeitsindikatoren.",
            href: "/dashboard",
            icon: LayoutDashboard,
        },
        {
            title: "Indikatoren",
            description: "Detailansicht der einzelnen Nachhaltigkeitsindikatoren.",
            href: "/indikatoren",
            icon: Activity,
        },
        {
            title: "Vergleich",
            description: "Vergleich mit globalen Benchmarks.",
            href: "/vergleich",
            icon: BarChart3,
        },
        {
            title: "Datensätze",
            description: "Betriebsdaten und Qualitative Daten durchsuchen.",
            href: "/datasets",
            icon: Database,
        },
        {
            title: "Methodik",
            description: "Berechnungsmethodik der AVE-Indikatoren.",
            href: "/methodology",
            icon: FileText,
        },
    ]

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">{t("page.data.title") || "Daten"}</h2>
                <p className="text-muted-foreground">
                    <EditableText contentKey="page.data.subtitle" initialValue={t("page.data.subtitle") || "Wählen Sie einen Bereich."}>
                        {t("page.data.subtitle") || "Wählen Sie einen Bereich."}
                    </EditableText>
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {dataPages.map((page) => (
                    <Link
                        key={page.href}
                        href={page.href}
                        className="group rounded-lg border p-6 hover:border-primary hover:bg-accent transition-colors"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <page.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                            <h3 className="font-semibold group-hover:text-primary transition-colors">
                                {page.title}
                            </h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {page.description}
                        </p>
                    </Link>
                ))}
            </div>
        </div>
    )
}
