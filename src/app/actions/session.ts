'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { revokedSessions } from '@/lib/db/schema'
import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/roles'
import { auditLog } from '@/lib/audit'
import { assertCanManageUsers } from '@/lib/admin/account-guards'
import { IMPERSONATION_BLOCKED, isImpersonating } from '@/lib/auth/impersonation'

/**
 * Revoke all sessions for the current user ("log out everywhere").
 */
export async function revokeAllMySessions() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  // Ending the account owner's sessions is theirs to decide, not a viewing super admin's.
  if (isImpersonating(session)) throw new Error(IMPERSONATION_BLOCKED)

  await db.insert(revokedSessions).values({
    userId: session.user.id,
    reason: 'logout_all',
  })

  auditLog({ action: 'auth.logout', userId: session.user.id, details: { reason: 'revoke_all_sessions' } })

  redirect('/login')
}

/**
 * Admin: revoke all sessions for a specific user.
 */
export async function revokeUserSessions(targetUserId: string) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const roles = (session.user as any).roles || []
  if (!isAdmin(roles)) throw new Error('Unauthorized')
  // Same protected-account rules as every other admin change to an account.
  await assertCanManageUsers({ user: session.user! }, [targetUserId], {})

  await db.insert(revokedSessions).values({
    userId: targetUserId,
    reason: 'admin_revoked',
  })

  auditLog({ action: 'admin.user_update', userId: session.user.id!, resource: `user:${targetUserId}`, resourceType: 'user', details: { action: 'revoke_sessions' }, severity: 'warning' })
}
