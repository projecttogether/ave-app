'use server'

import { db } from '@/lib/db'
import { auditLogs, users } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { isAdmin } from '@/lib/roles'
import { redirect } from 'next/navigation'
import { paginationSchema } from '@/lib/validation'

export type AuditLogEntry = {
  id: string
  timestamp: string
  userId: string | null
  userEmail: string | null
  action: string
  resource: string | null
  resourceType: string | null
  details: unknown
  ipAddress: string | null
  organizationId: string | null
  severity: string
}

export async function getAuditLogs(filters: {
  page?: number
  pageSize?: number
  action?: string
  severity?: string
  userId?: string
  dateFrom?: string
  dateTo?: string
}): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const roles = (session.user as any).roles || []
  if (!isAdmin(roles)) {
    throw new Error('Only Admins can view audit logs')
  }

  const { page = 1, pageSize = 50 } = paginationSchema.parse({ page: filters.page, pageSize: filters.pageSize })
  const offset = (page - 1) * pageSize

  const conditions = []

  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action))
  }
  if (filters.severity) {
    conditions.push(eq(auditLogs.severity, filters.severity as any))
  }
  if (filters.userId) {
    conditions.push(eq(auditLogs.userId, filters.userId))
  }
  if (filters.dateFrom) {
    conditions.push(gte(auditLogs.timestamp, new Date(filters.dateFrom)))
  }
  if (filters.dateTo) {
    conditions.push(lte(auditLogs.timestamp, new Date(filters.dateTo)))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [logsResult, countResult] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        timestamp: auditLogs.timestamp,
        userId: auditLogs.userId,
        userEmail: users.email,
        action: auditLogs.action,
        resource: auditLogs.resource,
        resourceType: auditLogs.resourceType,
        details: auditLogs.details,
        ipAddress: auditLogs.ipAddress,
        organizationId: auditLogs.organizationId,
        severity: auditLogs.severity,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.timestamp))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(where),
  ])

  return {
    logs: logsResult.map((l) => ({
      ...l,
      timestamp: l.timestamp.toISOString(),
      severity: l.severity || 'info',
    })),
    total: Number(countResult[0]?.count || 0),
  }
}
