import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { prepareDatabase } from '@/lib/db/startup'
import { verifyDatabaseIsolation } from '@/lib/db/verify-isolation'
import { cleanupExpiredData } from '@/lib/db/retention'
import { applyMigrations } from '@/lib/db/migrate'

describe.skipIf(!process.env.TEST_DATABASE_URL)('automatic deployment setup', () => {
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  const database = `ave_startup_${randomUUID().replaceAll('-', '')}`
  let connection: string
  const secret = 'startup-tests-only-secret-at-least-32-characters'
  beforeAll(async () => {
    // The test launcher supplies only a newly created disposable PostgreSQL.
    await admin.query(`CREATE DATABASE ${database}`)
    const url = new URL(process.env.TEST_DATABASE_URL!)
    url.pathname = `/${database}`
    connection = url.toString()
  })
  afterAll(async () => { await admin.query(`DROP DATABASE ${database} WITH (FORCE)`); await admin.end() })

  it('handles concurrent deployments and reuses passwords across restarts', async () => {
    const input = { DATABASE_URL: connection, AUTH_SECRET: secret }
    const [first, second] = await Promise.all([prepareDatabase(input), prepareDatabase(input)])
    expect(first).toEqual(second)
    expect(first.DATABASE_URL).not.toBe(connection)
    expect(first.AUTH_DATABASE_URL).not.toBe(first.DATABASE_URL)
    expect(input.DATABASE_URL).toBe(connection)
    await expect(verifyDatabaseIsolation(first)).resolves.toBeUndefined()
  }, 30000)

  it('removes expired security records with the administrator connection only', async () => {
    const runtime = await prepareDatabase({ DATABASE_URL: connection, AUTH_SECRET: secret })
    const target = new Pool({ connectionString: connection })
    try {
      await target.query(`insert into audit_logs(action, "timestamp") values ('retention.expired', now() - interval '800 days'), ('retention.recent', now())`)
      await expect(cleanupExpiredData(undefined)).rejects.toThrow('MIGRATION_DATABASE_URL')
      // The restricted web account must not purge the audit trail, and must fail loudly instead of deleting nothing
      await expect(cleanupExpiredData(runtime.DATABASE_URL)).rejects.toThrow(/Failed query: delete from "audit_logs"/)
      const cleaned = await cleanupExpiredData(connection)
      expect(cleaned.auditLogs).toBe(1)
      const { rows } = await target.query("select action from audit_logs where action like 'retention.%'")
      expect(rows).toEqual([{ action: 'retention.recent' }])
    } finally { await target.end() }
  }, 30000)

  it('disables only the logins derived from PREVIOUS_AUTH_SECRET after a leak', async () => {
    const leaked = `${secret}-leaked`, replacement = `${secret}-replacement`
    const old = await prepareDatabase({ DATABASE_URL: connection, AUTH_SECRET: leaked })
    const unrelated = await prepareDatabase({ DATABASE_URL: connection, AUTH_SECRET: `${secret}-other-deployment` })
    const held = new Pool({ connectionString: old.DATABASE_URL })
    held.on('error', () => {}) // The terminated idle connection reports here.
    await held.query('select 1')
    await expect(prepareDatabase({ DATABASE_URL: connection, AUTH_SECRET: leaked, PREVIOUS_AUTH_SECRET: leaked })).rejects.toThrow('must differ')
    const next = await prepareDatabase({ DATABASE_URL: connection, AUTH_SECRET: replacement, PREVIOUS_AUTH_SECRET: leaked })
    expect(next).not.toHaveProperty('PREVIOUS_AUTH_SECRET')
    await expect(verifyDatabaseIsolation(old)).rejects.toThrow()
    await expect(held.query('select 1')).rejects.toThrow()
    await held.end().catch(() => {})
    await expect(verifyDatabaseIsolation(next)).resolves.toBeUndefined()
    await expect(verifyDatabaseIsolation(unrelated)).resolves.toBeUndefined()
  }, 30000)

  it('keeps old containers working when AUTH_SECRET is rotated', async () => {
    const first = await prepareDatabase({ DATABASE_URL: connection, AUTH_SECRET: secret })
    const next = await prepareDatabase({ DATABASE_URL: connection, AUTH_SECRET: `${secret}-rotated` })
    expect(next.DATABASE_URL).not.toBe(first.DATABASE_URL)
    await expect(verifyDatabaseIsolation(first)).resolves.toBeUndefined()
    await expect(verifyDatabaseIsolation(next)).resolves.toBeUndefined()
  }, 30000)

  it('supports explicit runtime accounts and removes migration credentials from the web environment', async () => {
    const generated = await prepareDatabase({ DATABASE_URL: connection, AUTH_SECRET: secret })
    const next = await prepareDatabase({ ...generated, MIGRATION_DATABASE_URL: connection, PGPASSWORD: 'admin-password', PGUSER: 'postgres' })
    expect(next).toEqual(generated)
    await expect(prepareDatabase(generated)).rejects.toThrow('MIGRATION_DATABASE_URL is required')
  }, 30000)

  it('does not let connection query parameters override the generated login', async () => {
    const url = new URL(connection)
    url.searchParams.set('user', 'postgres')
    url.searchParams.set('password', decodeURIComponent(url.password))
    const runtime = await prepareDatabase({ DATABASE_URL: url.toString(), AUTH_SECRET: secret })
    expect(new URL(runtime.DATABASE_URL).searchParams.has('user')).toBe(false)
    expect(new URL(runtime.AUTH_DATABASE_URL).searchParams.has('password')).toBe(false)
    await expect(verifyDatabaseIsolation(runtime)).resolves.toBeUndefined()
  }, 30000)

  it('fails deployment on a migration error and preserves the previous working database', async () => {
    const runtime = await prepareDatabase({ DATABASE_URL: connection, AUTH_SECRET: secret })
    const directory = mkdtempSync(path.join(tmpdir(), 'ave-startup-failure-'))
    try {
      cpSync('drizzle', directory, { recursive: true })
      writeFileSync(path.join(directory, '0034_generated_indicator_formulas.sql'), 'SELECT * FROM nonexistent_startup_test_table;')
      await expect(prepareDatabase({ DATABASE_URL: connection, AUTH_SECRET: secret }, directory)).rejects.toThrow()
      await expect(verifyDatabaseIsolation(runtime)).resolves.toBeUndefined()
    } finally { rmSync(directory, { recursive: true, force: true }) }
  }, 30000)

  it('refuses legacy email collisions without merging, renaming or moving accounts', async () => {
    const legacyDatabase = `ave_email_collision_${randomUUID().replaceAll('-', '')}`
    const directory = mkdtempSync(path.join(tmpdir(), 'ave-email-collision-'))
    await admin.query(`CREATE DATABASE ${legacyDatabase}`)
    const url = new URL(process.env.TEST_DATABASE_URL!)
    url.pathname = `/${legacyDatabase}`
    const pool = new Pool({ connectionString: url.toString() })
    const client = await pool.connect()
    try {
      cpSync('drizzle', directory, { recursive: true })
      const journalPath = path.join(directory, 'meta/_journal.json')
      const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
      // Recreate the earlier schema as a contiguous migration prefix. Keeping
      // newer entries would make Drizzle skip the team migration on upgrade.
      journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag < '0036')
      writeFileSync(journalPath, JSON.stringify(journal))
      for (const file of ['0001_add_stats_function.sql', '0007_add_percentile_function.sql']) {
        const typeSql = readFileSync(path.join(directory, file), 'utf8').match(/DO \$\$ BEGIN[\s\S]*?END \$\$;/)![0]
        await client.query(typeSql)
      }
      // Current post-migration formulas require the current schema. Install
      // only the historical journal before seeding legacy accounts.
      await migrate(drizzle(client), { migrationsFolder: directory })
      await client.query(`insert into "user"(id,email) values ('legacy-one','legacy@example.invalid'), ('legacy-two',' LEGACY@example.invalid ')`)
      await expect(applyMigrations(client, path.join(process.cwd(), 'drizzle'))).rejects.toThrow('Duplicate normalized user emails')
      expect((await client.query('select id,email,organization_id from "user" order by id')).rows).toEqual([
        { id: 'legacy-one', email: 'legacy@example.invalid', organization_id: null },
        { id: 'legacy-two', email: ' LEGACY@example.invalid ', organization_id: null },
      ])
    } finally {
      client.release(); await pool.end()
      await admin.query(`DROP DATABASE ${legacyDatabase}`)
      rmSync(directory, { recursive: true, force: true })
    }
  }, 30000)
})
