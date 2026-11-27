import { ReportingShell } from '@/components/reporting-shell'
import { ReportingFilterBar } from '@/components/reporting-filter-bar'
import { ReportingContent } from '@/components/reporting-filters-provider'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { isAdmin } from '@/lib/roles'
import { ImpersonationBanner } from '@/components/impersonation-banner'
import { DashboardHeader } from '@/components/dashboard-header'
import { SecondaryNav } from '@/components/secondary-nav'

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()

    if (!session?.user?.email) {
        redirect('/login')
    }

    const roles = (session.user as any).roles || []

    if (!isAdmin(roles)) {
        redirect('/dashboard')
    }

    const isImpersonating = (session.user as any).isImpersonating || false
    const realUserEmail = (session.user as any).realUserEmail || null

    return (
        <ReportingShell>
            {isImpersonating && (
                <ImpersonationBanner
                    targetEmail={session.user.email || 'Unbekannt'}
                    realEmail={realUserEmail || 'Unbekannt'}
                />
            )}
            <div className={isImpersonating ? 'pt-9' : ''}>
                <SidebarProvider>
                    <AppSidebar
                        user={{
                            email: session.user.email,
                            name: session.user.name,
                        }}
                        roles={roles}
                    />
                    <SidebarInset>
                        <DashboardHeader />
                        <main className="flex-1 p-6 md:p-8">
                            <ReportingFilterBar />
                            <SecondaryNav roles={roles} />
                            <ReportingContent>{children}</ReportingContent>
                        </main>
                    </SidebarInset>
                </SidebarProvider>
            </div>
        </ReportingShell>
    )
}
