import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { auditLogs, revokedSessions } from '@/lib/db/schema'
import { lt } from 'drizzle-orm'
import { logger } from '@/lib/logger'
import { errorSummary } from '@/lib/errors'

// Retention periods (configurable via environment variables)
const AUDIT_LOG_RETENTION_DAYS = retentionDays(process.env.AUDIT_LOG_RETENTION_DAYS, 730) // 2 years
const REVOKED_SESSION_RETENTION_DAYS = retentionDays(process.env.REVOKED_SESSION_RETENTION_DAYS, 30)

// Zero or negative values would move the cutoff to now or the future and delete everything.
function retentionDays(value: string | undefined, fallback: number): number {
  const days = Number(value)
  return Number.isFinite(days) && days >= 1 ? days : fallback
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

/**
 * Deletes security records beyond their retention period.
 *
 * This is a maintenance job without a signed-in user. The restricted
 * application account can only delete these rows as a super admin, so the
 * job needs the administrator connection that also runs migrations.
 * Failures propagate so a scheduled run exits non-zero instead of silently
 * keeping expired records. Both tables force row-level security, so the
 * session disables it: PostgreSQL then raises an error for an account that
 * would otherwise see no rows and delete nothing.
 */
export async function cleanupExpiredData(connectionString = process.env.MIGRATION_DATABASE_URL) {
  if (!connectionString) {
    throw new Error('MIGRATION_DATABASE_URL is required: the retention job needs the administrator database connection')
  }
  const results = { auditLogs: 0, revokedSessions: 0 }
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10000, options: '-c row_security=off' })
  try {
    const db = drizzle(pool)

    const auditCutoff = daysAgo(AUDIT_LOG_RETENTION_DAYS)
    const auditResult = await db.delete(auditLogs).where(lt(auditLogs.timestamp, auditCutoff))
    results.auditLogs = auditResult.rowCount ?? 0

    const sessionCutoff = daysAgo(REVOKED_SESSION_RETENTION_DAYS)
    const sessionResult = await db.delete(revokedSessions).where(lt(revokedSessions.revokedAt, sessionCutoff))
    results.revokedSessions = sessionResult.rowCount ?? 0

    logger.info('Data retention cleanup completed', results)
  } catch (err) {
    logger.error('Data retention cleanup failed', errorSummary(err))
    throw err
  } finally {
    await pool.end()
  }

  return results
}
