import { authDb as db } from '@/lib/db/auth'
import { auditLogs } from '@/lib/db/schema'
import { currentImpersonator } from '@/lib/auth/impersonation'
import { maskSensitiveFields } from '@/lib/redact'
import { errorSummary } from '@/lib/errors'

export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.otp_requested'
  | 'auth.otp_failed'
  | 'admin.user_create'
  | 'admin.user_update'
  | 'admin.user_delete'
  | 'admin.user_deactivate'
  | 'admin.user_reactivate'
  | 'admin.role_change'
  | 'admin.impersonate_start'
  | 'admin.impersonate_stop'
  | 'admin.org_create'
  | 'admin.org_delete'
  | 'admin.org_update'
  | 'admin.sub_org_create'
  | 'admin.sub_org_delete'
  | 'admin.sub_org_update'
  | 'admin.invite_sent'
  | 'data.create'
  | 'data.update'
  | 'data.delete'
  | 'data.freeze'
  | 'data.unfreeze'
  | 'data.csv_import'
  | 'data.export'
  | 'authz.denied'

export function getClientIp(headers: Headers): string {
  // X-Forwarded-For: the trusted reverse proxy (Traefik/Coolify) appends the
  // real client IP as the LAST entry; earlier entries arrive from the client
  // and are spoofable. Never use the first entry for rate limiting.
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }
  return headers.get('x-real-ip') || 'unknown'
}

export async function auditLog(params: {
  action: AuditAction
  userId?: string | null
  resource?: string
  resourceType?: string
  details?: Record<string, unknown>
  ipAddress?: string
  organizationId?: string
  severity?: 'info' | 'warning' | 'critical'
}): Promise<void> {
  try {
    // While a super admin views the app as another user, userId names that
    // user. Record who actually acted.
    const impersonator = await currentImpersonator()
    const attributed = impersonator && impersonator !== params.userId
      ? { ...params.details, impersonatedBy: impersonator } : params.details
    const details = attributed ? maskSensitiveFields(attributed) : undefined
    await db.insert(auditLogs).values({
      userId: params.userId ?? null,
      action: params.action,
      resource: params.resource,
      resourceType: params.resourceType,
      details: details ?? null,
      ipAddress: params.ipAddress,
      organizationId: params.organizationId,
      severity: params.severity ?? 'info',
    })
  } catch (err) {
    // Audit logging must never break the calling action
    // Use console.error directly to avoid circular dependency with logger
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: 'Failed to write audit log', service: 'ave-dashboard', metadata: errorSummary(err) }))
  }
}
