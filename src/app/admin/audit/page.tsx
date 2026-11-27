import { Metadata } from 'next'
import { AuditLogViewer } from './audit-log-viewer'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/roles'

export const metadata: Metadata = {
  title: 'Admin - Audit Log',
}

export default async function AuditPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const roles = (session.user as any).roles || []
  if (!isAdmin(roles)) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground text-sm">
          Alle sicherheitsrelevanten Aktionen im System.
        </p>
      </div>
      <AuditLogViewer />
    </div>
  )
}
