/**
 * Data retention cleanup script.
 * Run via: npx tsx scripts/data-retention-cleanup.ts
 * Or schedule as a cron job in your deployment platform.
 *
 * Environment variables:
 *   MIGRATION_DATABASE_URL (required: administrator connection; the restricted
 *     application account cannot delete audit logs)
 *   AUDIT_LOG_RETENTION_DAYS (default: 730, 2 years)
 *   REVOKED_SESSION_RETENTION_DAYS (default: 30)
 */

import 'dotenv/config'
import { cleanupExpiredData } from '../src/lib/db/retention'

async function main() {
  console.log('Starting data retention cleanup...')
  const results = await cleanupExpiredData()
  console.log('Cleanup results:', results)
  process.exit(0)
}

main().catch((err) => {
  console.error('Cleanup failed:', err)
  process.exit(1)
})
