"use client"

import { usePathname } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import React from "react"
import { ReportingLink } from "@/components/reporting-filters-provider"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

import { INDICATOR_CONFIG } from "@/lib/indicators/config"

// Map specific path segments to readable German labels
const pathLabels: Record<string, string> = {
    admin: "Admin",
    users: "Benutzer",
    organizations: "Organisationen",
    "data-freeze": "Datensperren",
    export: "Export",
    alliance: "Allianz",
    content: "Inhalte (Texte)",
    form: "Datenerfassung",
    operating: "Betriebsdaten",
    qualitative: "Qualitative Daten",
    scoring: "Scoring-Fragen",
    reflection: "Reflexionsfragen",
    detail: "Detailansicht",
    dashboard: "Dashboard",
    methodology: "Methodik",
    vergleich: "Vergleich",
    datasets: "Meine Daten",
    indikatoren: "Indikatoren",
    settings: "Einstellungen",
    profile: "Profil"
}

// Generate indicator labels dynamically
Object.entries(INDICATOR_CONFIG).forEach(([key, config]) => {
    pathLabels[key] = config.title
})

// Function to generate breadcrumbs from pathname
function generateBreadcrumbs(pathname: string) {
    if (pathname === "/") return []

    // Remove leading and trailing slashes, split by slash
    const segments = pathname.replace(/^\/|\/$/g, "").split("/")
    
    const breadcrumbs = segments.map((segment, index) => {
        const href = "/" + segments.slice(0, index + 1).join("/")
        
        // Special case: replace 'detail' segment with 'Indikatoren' linking back to /indikatoren
        if (segment === "detail") {
            return {
                href: "/indikatoren",
                label: "Indikatoren",
                isLast: index === segments.length - 1,
                noLink: false,
            }
        }

        // Use mapped label, or capitalize the segment if no label exists (often for dynamic IDs/slugs)
        const label = segment === "datasets" && segments[index - 1] === "admin"
            ? "Datensätze"
            : pathLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1)

        // 'admin' segment should not be a clickable link
        const noLink = segment === "admin"

        return {
            href,
            label,
            isLast: index === segments.length - 1,
            noLink,
        }
    })

    return breadcrumbs
}

export function DashboardHeader() {
    const pathname = usePathname()
    const breadcrumbs = generateBreadcrumbs(pathname)

    return (
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 bg-background">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 !h-4" />
            
            <Breadcrumb>
                <BreadcrumbList>

                    {breadcrumbs.map((crumb, index) => (
                        <React.Fragment key={index}>
                            <BreadcrumbItem>
                                {crumb.isLast || crumb.noLink ? (
                                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink asChild><ReportingLink href={crumb.href}>{crumb.label}</ReportingLink></BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                            
                            {!crumb.isLast && <BreadcrumbSeparator />}
                        </React.Fragment>
                    ))}
                </BreadcrumbList>
            </Breadcrumb>
        </header>
    )
}
