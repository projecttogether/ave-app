import { createHash, createHmac } from 'node:crypto'
import path from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { applyMigrations } from './migrate'
import { verifyDatabaseIsolation } from './verify-isolation'

type LoginGroup = 'ave_app' | 'ave_auth'

function generatedLogin(database: string, secret: string, group: LoginGroup) {
  const password = createHmac('sha256', secret).update(JSON.stringify(['ave-runtime-v1', database, group])).digest('hex')
  return { name: `${group}_${createHash('sha256').update(password).digest('hex').slice(0, 24)}`, password }
}

async function provisionLogin(client: PoolClient, database: string, secret: string, group: LoginGroup, connection: string) {
  // Stable across restarts and replicas. Secret rotation creates new logins so
  // a rolling deployment does not change the old container's passwords.
  const { name, password } = generatedLogin(database, secret, group)
  const { rows: [existing] } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [name])
  if (!existing) {
    // PostgreSQL quotes identifiers and passwords; no connection secrets are logged.
    const { rows: [statement] } = await client.query(`SELECT format(
      'CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L IN ROLE %I',
      $1::text, $2::text, $3::text) AS sql`, [name, password, group])
    await client.query(statement.sql)
  }
  const url = new URL(connection)
  url.username = name
  url.password = password
  url.pathname = `/${encodeURIComponent(database)}`
  // URI query parameters take precedence over the authority in node-postgres.
  for (const key of ['user', 'password', 'database', 'options']) url.searchParams.delete(key)
  return url.toString()
}

/**
 * After AUTH_SECRET leaks, rotating it alone leaves the logins derived from the
 * old secret usable. Disable exactly those logins and end their sessions. Roles
 * are cluster-wide, so never guess: only names derived from the given secret.
 */
async function disablePreviousLogins(client: PoolClient, database: string, previousSecret: string) {
  let disabled = 0
  for (const group of ['ave_app', 'ave_auth'] as const) {
    const { name } = generatedLogin(database, previousSecret, group)
    const { rows: [role] } = await client.query('SELECT rolcanlogin FROM pg_roles WHERE rolname = $1', [name])
    if (!role?.rolcanlogin) continue
    const { rows: [statement] } = await client.query("SELECT format('ALTER ROLE %I NOLOGIN', $1::text) AS sql", [name])
    await client.query(statement.sql)
    disabled++
    try {
      await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = $1', [name])
    } catch {
      console.warn('Could not end existing sessions of a disabled database login; restart PostgreSQL connections manually.')
    }
  }
  return disabled
}

/** Prepare the database before handing only restricted credentials to Next.js. */
export async function prepareDatabase(environment: Readonly<Record<string, string | undefined>> = process.env, migrationsFolder = path.join(process.cwd(), 'drizzle')) {
  const connection = environment.MIGRATION_DATABASE_URL || environment.DATABASE_URL
  if (!connection) throw new Error('DATABASE_URL is required for automatic database setup')
  if (!environment.AUTH_SECRET || environment.AUTH_SECRET.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters')
  if (environment.AUTH_DATABASE_URL && !environment.DATABASE_URL) throw new Error('DATABASE_URL is required with AUTH_DATABASE_URL')
  if (environment.AUTH_DATABASE_URL && !environment.MIGRATION_DATABASE_URL) {
    throw new Error('MIGRATION_DATABASE_URL is required for automatic migrations when using separate runtime database credentials')
  }

  const runtime = { ...environment }
  const pool = new Pool({ connectionString: connection, connectionTimeoutMillis: 10000 })
  try {
    const client = await pool.connect()
    try {
      console.log('Applying database migrations...')
      await applyMigrations(client, migrationsFolder)
      if (!environment.AUTH_DATABASE_URL) {
        // Serialize role creation across simultaneous deployments. The migration
        // lock has already been released; use a separate transaction-level lock.
        await client.query('BEGIN')
        try {
          await client.query('SELECT pg_advisory_xact_lock(1936028721, 2)')
          const { rows: [row] } = await client.query('SELECT current_database() AS name')
          runtime.DATABASE_URL = await provisionLogin(client, row.name, environment.AUTH_SECRET, 'ave_app', connection)
          runtime.AUTH_DATABASE_URL = await provisionLogin(client, row.name, environment.AUTH_SECRET, 'ave_auth', connection)
          if (environment.PREVIOUS_AUTH_SECRET) {
            if (environment.PREVIOUS_AUTH_SECRET === environment.AUTH_SECRET) throw new Error('PREVIOUS_AUTH_SECRET must differ from AUTH_SECRET')
            const disabled = await disablePreviousLogins(client, row.name, environment.PREVIOUS_AUTH_SECRET)
            console.log(`Disabled ${disabled} database login(s) derived from PREVIOUS_AUTH_SECRET.`)
          }
          await client.query('COMMIT')
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        }
      }
    } finally { client.release() }
  } finally { await pool.end() }

  delete runtime.MIGRATION_DATABASE_URL
  delete runtime.PREVIOUS_AUTH_SECRET
  for (const key of ['PGUSER', 'PGPASSWORD', 'PGPASSFILE', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS']) delete runtime[key]
  await verifyDatabaseIsolation(runtime)
  console.log('Database setup complete.')
  return Object.fromEntries(Object.entries(runtime).filter((entry): entry is [string, string] => entry[1] !== undefined))
}
