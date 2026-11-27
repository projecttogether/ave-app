"use client"

import {
    LayoutDashboard,
    Activity,
    ClipboardEdit,
    FileText,
    Database,
    type LucideIcon,
} from "lucide-react"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from "@/components/ui/sidebar"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { ReportingLink as Link } from "@/components/reporting-filters-provider"
import Image from "next/image"

const dashboardNavItems = [
    {
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
    },
    {
        title: "Indikatoren",
        url: "/indikatoren",
        icon: Activity,
    },
    {
        title: "Datenerfassung",
        url: "/form/operating",
        icon: ClipboardEdit,
    },
    {
        title: "Meine Daten",
        url: "/datasets",
        icon: Database,
    },
    {
        title: "Methodik",
        url: "/methodology",
        icon: FileText,
    },
]

type SidebarNavItem = {
    title: string
    url: string
    icon: LucideIcon
    managerOnly?: boolean
}

const dataEntryNavItems: SidebarNavItem[] = [
    // {
    //     title: "Scoring-Fragen",
    //     url: "/form/scoring",
    //     icon: ListChecks,
    // },
    // {
    //     title: "Reflexionsfragen",
    //     url: "/form/reflection",
    //     icon: BookOpenText,
    //     managerOnly: true,
    // },
]

export function AppSidebar({
    user,
    roles,
    ...props
}: React.ComponentProps<typeof Sidebar> & {
    user: { email?: string | null; name?: string | null }
    roles?: string[]
}) {
    // Filter data entry items based on role
    const filteredDataEntryItems = dataEntryNavItems.filter(item => {
        if ('managerOnly' in item && item.managerOnly) {
            return roles?.includes('org_manager') || roles?.includes('admin') || roles?.includes('super_admin')
        }
        return true
    })

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href="/dashboard">
                                <Image
                                    src="/images/ave-logo.png"
                                    alt="AVE"
                                    width={87}
                                    height={32}
                                    className="w-auto h-auto object-contain"
                                    priority
                                />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={dashboardNavItems} label="Daten" />
                {filteredDataEntryItems.length > 0 && (
                    <NavMain items={filteredDataEntryItems} label="Datenerfassung" />
                )}
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={user} roles={roles} />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}
