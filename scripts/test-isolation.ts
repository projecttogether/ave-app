import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { prepareDatabase } from '../src/lib/db/startup'

// Always use a new disposable database. Never take a production connection URL.
async function main() {
const container = `ave-isolation-${randomUUID().slice(0, 8)}`
const password = randomUUID()
try {
  execFileSync('docker', ['run', '--rm', '-d', '--name', container, '-e', `POSTGRES_PASSWORD=${password}`,
    '-e', 'POSTGRES_DB=ave_isolation_test', '-p', '127.0.0.1::5432', 'postgres:15-alpine'], { stdio: 'pipe' })
  const port = execFileSync('docker', ['port', container, '5432'], { encoding: 'utf8' }).trim().split(':').pop()
  const rootUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/ave_isolation_test`
  const pool = new Pool({ connectionString: rootUrl })
  let ready = false
  for (let i = 0; i < 60; i++) {
    try { await pool.query('select 1'); ready = true; break } catch { await new Promise(r => setTimeout(r, 250)) }
  }
  if (!ready) throw new Error('Test PostgreSQL did not start')
  // Exercise the same automatic setup as Docker using only the legacy URL.
  // A second deployment must reuse the logins and preserve database policies.
  let runtime: Record<string, string> = {}
  for (let pass = 0; pass < 2; pass++) {
    const next = await prepareDatabase({
      DATABASE_URL: rootUrl,
      AUTH_SECRET: 'local-isolation-tests-only-not-a-production-secret',
    })
    if (pass && (next.DATABASE_URL !== runtime.DATABASE_URL || next.AUTH_DATABASE_URL !== runtime.AUTH_DATABASE_URL)) {
      throw new Error('Repeated startup changed the runtime credentials')
    }
    runtime = next
  }
  await pool.end()
  // Like CI: test traffic must not reach Sentry, where it counts as production.
  const env = { ...process.env, NEXT_PUBLIC_SENTRY_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1' }
  const build = spawnSync('npm', ['run', 'build'], { env, stdio: 'inherit' })
  if (build.status !== 0) throw new Error('Production build failed')
  const result = spawnSync('npx', ['vitest', 'run', 'src/__tests__/integration'], {
    env: { ...env, TEST_DATABASE_URL: rootUrl,
      DATABASE_URL: runtime.DATABASE_URL,
      AUTH_DATABASE_URL: runtime.AUTH_DATABASE_URL,
      AUTH_SECRET: 'local-isolation-tests-only-not-a-production-secret',
      EMAIL_SERVER_HOST: 'localhost', EMAIL_SERVER_PORT: '1025', EMAIL_SERVER_USER: 'test',
      EMAIL_SERVER_PASSWORD: 'test', EMAIL_FROM: 'test@example.invalid' },
    stdio: 'inherit',
  })
  process.exitCode = result.status ?? 1
} finally {
  spawnSync('docker', ['rm', '-f', container], { stdio: 'pipe' })
}

}
main().catch(error => { console.error(error); process.exitCode = 1 })
