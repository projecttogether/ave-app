"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { ReportingLink as Link } from "@/components/reporting-filters-provider"
import { cn } from "@/lib/utils"
import { QUAL_SLUG_MAP } from "@/lib/qualitative/constants"
import { canEnterReflection } from "@/lib/roles"

type SecondaryNavItem = {
    label: string
    href: string
    managerOnly?: boolean
}

// Dictionary mapping base routes to their secondary navigation menus
const secondaryNavs = {
    "/admin": [
        { label: "Benutzer", href: "/admin/users" },
        { label: "Organisationen", href: "/admin/organizations" },
        { label: "Datensätze", href: "/admin/datasets" },
        { label: "Datensperren", href: "/admin/data-freeze" },
        { label: "Export", href: "/admin/export" },
        { label: "Inhalte", href: "/admin/content" },
        { label: "Allianz-Übersicht", href: "/admin/alliance" },
        { label: "Audit Log", href: "/admin/audit" },
    ],
    "/form": [
        { label: "Betriebsdaten", href: "/form/operating" },
        { label: "Scoring-Fragen", href: "/form/scoring" },
        { label: "Reflexionsfragen", href: "/form/reflection", managerOnly: true },
    ],
    "/dashboard": [
        { label: "Übersicht", href: "/dashboard" },
        { label: "Aufgaben", href: "/tasks" },
    ]
}

// Helper to determine the correct secondary navigation menu for the current route
function getSecondaryNavItems(pathname: string, roles?: string[]): SecondaryNavItem[] | null {
    if (pathname.startsWith("/admin")) {
        return secondaryNavs["/admin"]
    } else if (pathname.startsWith("/form")) {
        return secondaryNavs["/form"].filter((item) => !item.managerOnly || canEnterReflection(roles))
    } else if (pathname === "/dashboard" || pathname.startsWith("/tasks")) {
        return secondaryNavs["/dashboard"]
    } else if (pathname.startsWith("/detail/")) {
        const slugMatch = pathname.match(/^\/detail\/([^/]+)/)
        if (slugMatch) {
            const slug = slugMatch[1]
            const items = [
                { label: "Übersicht", href: `/detail/${slug}` },
                { label: "Betriebsdaten", href: `/detail/${slug}/operating` }
            ]
            if (QUAL_SLUG_MAP[slug]) {
                items.push({ label: "Scoring-Fragen", href: `/detail/${slug}/scoring` })
                if (canEnterReflection(roles)) {
                    items.push({ label: "Reflexionsfragen", href: `/detail/${slug}/reflection` })
                }
            }
            return items
        }
    }
    return null
}

export function SecondaryNav({ roles }: { roles?: string[] }) {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const navItems = getSecondaryNavItems(pathname, roles)

    if (!navItems) {
        return null
    }

    const year = searchParams.get("year")

    function getHrefWithContext(href: string) {
        if (!pathname.startsWith("/form") || !year) return href
        if (!href.startsWith("/form/")) return href

        const params = new URLSearchParams()
        params.set("year", year)
        const subOrgId = searchParams.get("subOrgId")
        if (subOrgId) params.set("subOrgId", subOrgId)
        return `${href}?${params.toString()}`
    }

    return (
        <div className="mb-6 border-b pb-2">
            <nav className="flex items-center space-x-1 lg:space-x-3 overflow-x-auto no-scrollbar">
                {navItems.map((item) => {
                    const href = getHrefWithContext(item.href)
                    let isActive = false
                    if (item.href === "/form/operating") {
                        isActive = pathname === "/form/operating"
                    } else if (item.href === "/admin") {
                        isActive = pathname === "/admin"
                    } else if (item.href === "/dashboard") {
                        isActive = pathname === "/dashboard"
                    } else if (pathname.startsWith("/detail/")) {
                        isActive = pathname === item.href
                    } else {
                        isActive = pathname.startsWith(item.href)
                    }

                    return (
                        <Link
                            key={item.href}
                            href={href}
                            className={cn(
                                "flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors rounded-md",
                                isActive 
                                    ? "bg-primary/10 text-primary" 
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            {item.label}
                        </Link>
                    )
                })}
            </nav>
        </div>
    )
}
