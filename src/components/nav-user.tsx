"use client"

import { LogOut, EllipsisVertical, UserRound, Settings, Building2 } from "lucide-react"
import { logout } from "@/app/actions/auth"
import Link from "next/link"

import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function NavUser({
    user,
    roles = [],
}: {
    user: {
        email?: string | null
        name?: string | null
    }
    roles?: string[]
}) {
    const isAdmin = roles.includes("admin") || roles.includes("super_admin")
    const isManager = roles.includes("org_manager")

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-medium">
                                {(user.name || user.email || "U").charAt(0).toUpperCase()}
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">{user.name || "Benutzer"}</span>
                                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                            </div>
                            <EllipsisVertical className="ml-auto size-4" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                        side="top"
                        align="end"
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-medium">
                                    {(user.name || user.email || "U").charAt(0).toUpperCase()}
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-medium">{user.name || "Benutzer"}</span>
                                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                                </div>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
                                <UserRound className="size-4" />
                                Benutzer
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {isAdmin && (
                            <>
                                <DropdownMenuItem asChild>
                                    <Link href="/admin/users" className="flex items-center gap-2 cursor-pointer">
                                        <Settings className="size-4" />
                                        Admin
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </>
                        )}
                        {isManager && (
                            <>
                                <DropdownMenuItem asChild>
                                    <Link href="/organization" className="flex items-center gap-2 cursor-pointer">
                                        <Building2 className="size-4" />
                                        Verwaltung
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </>
                        )}
                        <DropdownMenuItem asChild>
                            <form action={logout} className="w-full">
                                <button type="submit" className="flex w-full items-center gap-2">
                                    <LogOut className="size-4" />
                                    Abmelden
                                </button>
                            </form>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
