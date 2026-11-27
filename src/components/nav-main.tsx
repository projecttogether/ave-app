"use client"

import { ReportingLink as Link } from "@/components/reporting-filters-provider"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"

import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavMain({
    items,
    label,
}: {
    items: {
        title: string
        url: string
        icon: LucideIcon
        isExternal?: boolean
    }[]
    label?: string
}) {
    const pathname = usePathname()

    return (
        <SidebarGroup>
            {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
            <SidebarMenu>
                {items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                            asChild
                            isActive={pathname === item.url}
                            tooltip={item.title}
                        >
                            <Link 
                                href={item.url}
                                {...(item.isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                            >
                                <item.icon />
                                <span>{item.title}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    )
}
