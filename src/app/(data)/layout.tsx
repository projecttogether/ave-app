import { ReportingShell } from '@/components/reporting-shell'
import { ReportingFilterBar } from '@/components/reporting-filter-bar'
import { ReportingContent } from '@/components/reporting-filters-provider'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ImpersonationBanner } from '@/components/impersonation-banner'
import { DashboardHeader } from '@/components/dashboard-header'
import { OnboardingProvider } from '@/components/onboarding/onboarding-provider'
import { getOnboardingStatus } from '@/app/actions/onboarding'
import { ContentProvider } from '@/components/providers/content-provider'
import { getAppContent } from '@/lib/content/content'
import { SecondaryNav } from '@/components/secondary-nav'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()

    if (!session?.user?.email) {
        redirect('/login')
    }

    const roles = (session.user as any).roles || []
    const isImpersonating = (session.user as any).isImpersonating || false
    const realUserEmail = (session.user as any).realUserEmail || null

    const onboardingCompletedAt = await getOnboardingStatus()
    const onboardingCompleted = onboardingCompletedAt !== null

    const appContent = await getAppContent()

    return (
        <ReportingShell>
            {isImpersonating && (
                <ImpersonationBanner
                    targetEmail={session.user.email || 'Unbekannt'}
                    realEmail={realUserEmail || 'Unbekannt'}
                />
            )}
            <div className={isImpersonating ? 'pt-9' : ''}>
                <ContentProvider content={appContent}>
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
                            <OnboardingProvider onboardingCompleted={onboardingCompleted}>
                                <main className="flex-1 p-6 md:p-8">
                                    <ReportingFilterBar />
                                    <SecondaryNav roles={roles} />
                                    <ReportingContent>{children}</ReportingContent>
                                </main>
                            </OnboardingProvider>
                        </SidebarInset>
                    </SidebarProvider>
                </ContentProvider>
            </div>
        </ReportingShell>
    )
}
