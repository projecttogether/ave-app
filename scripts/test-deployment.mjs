import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'

// Always create an isolated database/network. Never accept database credentials.
const prefix = `ave-deployment-${randomUUID().slice(0, 8)}`
const image = process.env.DEPLOYMENT_TEST_IMAGE || `${prefix}:test`
const database = `${prefix}-db`
const application = `${prefix}-app`
const failure = `${prefix}-failure`
const journalFailure = `${prefix}-journal-failure`
const directory = mkdtempSync(path.join(tmpdir(), `${prefix}-`))
const password = randomUUID()
const env = {
  DATABASE_URL: `postgresql://postgres:${password}@database:5432/ave_deployment_test`,
  AUTH_SECRET: 'disposable-deployment-test-secret-at-least-32-characters',
  AUTH_URL: 'http://localhost:3000', AUTH_TRUST_HOST: 'true',
  EMAIL_SERVER_HOST: 'localhost', EMAIL_SERVER_PORT: '1025', EMAIL_SERVER_USER: 'test',
  EMAIL_SERVER_PASSWORD: 'test', EMAIL_FROM: 'test@example.invalid',
}
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const webArguments = ['--network', prefix, ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`])]
async function waitFor(check, label) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (check()) return
    await setTimeout(500)
  }
  throw new Error(`Timed out waiting for ${label}`)
}
// Run the image's own HEALTHCHECK command, so the test covers what Docker runs.
let healthCommand
const healthy = () => spawnSync('docker', ['exec', application, ...healthCommand], { stdio: 'pipe' }).status === 0
const readWebEnvironment = () => JSON.parse(docker(['exec', application, 'node', '-e',
  "const fs=require('fs'); const vars=Object.fromEntries(fs.readFileSync('/proc/1/environ','utf8').split('\\0').filter(Boolean).map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)])); console.log(JSON.stringify(vars));"]))

function testAnonymousRootMethods() {
  const result = JSON.parse(docker(['exec', application, 'node', '--input-type=module', '-e', `
    const origin = 'http://127.0.0.1:3000';
    const responses = [];
    for (const method of ['GET', 'HEAD', 'POST']) {
      const body = method === 'POST' ? new FormData() : undefined;
      body?.set('$ACTION_ID_' + '0'.repeat(40), '');
      const response = await fetch(origin, { method, body, redirect: 'manual' });
      responses.push({ method, status: response.status, location: response.headers.get('location'), allow: response.headers.get('allow') });
      await response.arrayBuffer();
    }
    console.log(JSON.stringify(responses));
  `]))
  for (const response of result.slice(0, 2)) {
    assert.equal(response.status, 307, `${response.method} / must redirect to login`)
    assert.equal(new URL(response.location, env.AUTH_URL).pathname, '/login')
  }
  assert.equal(result[2].status, 405, 'An unknown multipart Server Action POST to / must return 405')
  assert.equal(result[2].allow, 'GET, HEAD')
  const logs = spawnSync('docker', ['logs', application], { encoding: 'utf8' })
  assert.equal(logs.status, 0, 'Application logs must be available')
  assert.doesNotMatch(logs.stdout + logs.stderr, /Failed to find Server Action/,
    'Anonymous root requests must not decode Server Actions')
}

// Anonymous scanners rendered protected pages until the proxy redirected them
// (Sentry AVE-APP-8, AVE-APP-9). A layout redirect has no callbackUrl.
function testAnonymousPages() {
  const protectedPaths = ['/tasks', '/admin/alliance', '/dashboard', '/indikatoren', '/form/operating', '/settings']
  const publicPaths = ['/login', '/icon.png', '/images/ave-logo.png', '/_next/image?url=%2Fimages%2Fave-logo.png&w=64&q=75']
  const result = JSON.parse(docker(['exec', application, 'node', '--input-type=module', '-e', `
    const [protectedPaths, publicPaths] = JSON.parse(process.argv[1]);
    const request = async (path, headers = {}) => {
      const response = await fetch('http://127.0.0.1:3000' + path, { redirect: 'manual', headers });
      await response.arrayBuffer();
      return { path, status: response.status, location: response.headers.get('location') };
    };
    console.log(JSON.stringify({
      protected: await Promise.all(protectedPaths.map(path => request(path))),
      navigation: await request('/admin/alliance', { rsc: '1' }),
      public: await Promise.all(publicPaths.map(path => request(path))),
    }));
  `, JSON.stringify([protectedPaths, publicPaths])]))
  for (const response of [...result.protected, result.navigation]) {
    assert.equal(response.status, 307, `Anonymous ${response.path} must redirect to login`)
    const location = new URL(response.location, env.AUTH_URL)
    assert.equal(location.pathname, '/login')
    assert.equal(location.searchParams.get('callbackUrl'), response.path, `The proxy, not the layout, must redirect ${response.path}`)
  }
  for (const response of result.public) assert.equal(response.status, 200, `Anonymous ${response.path} must stay reachable`)
  const logs = spawnSync('docker', ['logs', application], { encoding: 'utf8' })
  assert.doesNotMatch(logs.stdout + logs.stderr, /Error: Unauthorized/, 'Anonymous requests must not render protected pages')
}

function testRuntimeFilesystem() {
  // The server process may write only its cache, never its own code or migrations.
  const check = spawnSync('docker', ['exec', application, 'sh', '-c', `
    test "$(id -un)" = nextjs &&
    for path in /app/server.js /app/.next /app/.next/server /app/node_modules /app/drizzle /app/docker-entrypoint.mjs /app/startup-bundle.cjs; do
      if test -w "$path"; then echo "writable: $path"; exit 1; fi
    done &&
    test -w /app/.next/cache`], { encoding: 'utf8' })
  assert.equal(check.status, 0, `The runtime user must not be able to modify application files ${check.stdout}`)
  // Coolify replaces the image HEALTHCHECK with this shell command. It probes
  // localhost, which BusyBox wget resolves only to ::1, so curl must be present.
  const coolify = 'curl -s -X GET -f http://localhost:3000/api/health > /dev/null || wget -q -O- http://localhost:3000/api/health > /dev/null || exit 1'
  assert.equal(spawnSync('docker', ['exec', application, 'sh', '-c', coolify], { stdio: 'pipe' }).status, 0,
    'Coolify health checks must pass')
}

async function testRevokedSessionLogin() {
  const userId = randomUUID()
  const organizationId = randomUUID()
  const otp = '123456'
  const hashedOtp = createHash('sha256').update(`${otp}${env.AUTH_SECRET}`).digest('hex')
  // Codes belong to the browser flow that requested them (src/lib/otp.ts).
  const flow = randomBytes(32).toString('base64url')
  const identifier = `otp:${createHash('sha256').update(flow).digest('hex')}:redirect-test@example.invalid`
  const sql = statement => docker(['exec', database, 'psql', '-U', 'postgres', '-d', 'ave_deployment_test', '-v', 'ON_ERROR_STOP=1', '-c', statement])
  sql(`INSERT INTO "user" (id, email, status) VALUES ('${userId}', 'redirect-test@example.invalid', 'active');
    INSERT INTO user_roles (user_id, role_id) VALUES ('${userId}', 'super_admin');
    INSERT INTO organizations (id, name) VALUES ('${organizationId}', 'Redirect test');
    INSERT INTO "verificationToken" (identifier, token, expires)
      VALUES ('${identifier}', '${hashedOtp}', now() + interval '10 minutes');`)
  // Sign in through the production Auth.js endpoint with a disposable OTP.
  const cookie = docker(['exec', application, 'node', '--input-type=module', '-e', `
    const origin = 'http://127.0.0.1:3000';
    const csrf = await fetch(origin + '/api/auth/csrf');
    const { csrfToken } = await csrf.json();
    const cookies = [...csrf.headers.getSetCookie().map(cookie => cookie.split(';')[0]), 'ave-otp-flow=${flow}'].join('; ');
    const signedIn = await fetch(origin + '/api/auth/callback/otp', {
      method: 'POST', redirect: 'manual', headers: { cookie: cookies },
      body: new URLSearchParams({ csrfToken, email: 'redirect-test@example.invalid', code: '${otp}', callbackUrl: '/admin/users' })
    });
    const sessionCookies = signedIn.headers.getSetCookie()
      .map(cookie => cookie.split(';')[0]).filter(cookie => cookie.startsWith('authjs.session-token'));
    if (!sessionCookies.length) throw new Error('Test sign-in failed: ' + signedIn.headers.get('location'));
    console.log(sessionCookies.join('; '));
  `])
  const request = path => JSON.parse(docker(['exec', application, 'node', '--input-type=module', '-e', `
    const response = await fetch('http://127.0.0.1:3000' + process.argv[1], {
      redirect: 'manual', headers: { cookie: process.argv[2] }
    });
    console.log(JSON.stringify({ status: response.status, location: response.headers.get('location'), body: await response.text() }));
  `, path, cookie]))
  const loginPath = '/login?callbackUrl=%2Fadmin%2Fusers'
  const valid = request(loginPath)
  assert.equal(valid.status, 307, 'A valid session must redirect away from login')
  assert.equal(new URL(valid.location, env.AUTH_URL).pathname, '/admin/users')

  // Match the organization assignment action, including its session revocation.
  sql(`BEGIN;
    UPDATE "user" SET organization_id = '${organizationId}' WHERE id = '${userId}';
    INSERT INTO revoked_sessions (user_id, reason) VALUES ('${userId}', 'admin_revoked');
    COMMIT;`)
  const protectedPage = request('/admin/users')
  assert.ok(protectedPage.location?.includes('/login') || protectedPage.body.includes('url=/login'),
    'The protected page must send a revoked session to login')
  // Send the original cookie again, as happens when a Server Component cannot
  // clear it. A cookie-only login redirect would send it back to /admin/users.
  const revoked = request(loginPath)
  assert.equal(revoked.status, 200, 'A revoked session must stop at login without another redirect')
  assert.equal(revoked.location, null)
  assert.match(revoked.body, /Anmeldung/)
}

try {
  if (!process.env.DEPLOYMENT_TEST_IMAGE) {
    const build = spawnSync('docker', ['build', '--build-arg', 'NEXT_PUBLIC_SENTRY_ENABLED=false', '-t', image, '.'], { stdio: 'inherit' })
    assert.equal(build.status, 0, 'Docker build must pass')
  }
  const healthTest = JSON.parse(docker(['image', 'inspect', image, '--format', '{{json .Config.Healthcheck.Test}}']))
  assert.equal(healthTest[0], 'CMD', 'The image health check must run without a shell')
  healthCommand = healthTest.slice(1)
  // Prebuilt images may have Sentry enabled. Keep all test containers off the
  // internet while allowing the app to reach its disposable database.
  docker(['network', 'create', '--internal', prefix])
  docker(['run', '-d', '--name', database, '--network', prefix, '--network-alias', 'database',
    '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=ave_deployment_test', 'postgres:15-alpine'])
  await waitFor(() => spawnSync('docker', ['exec', database, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { stdio: 'pipe' }).status === 0, 'PostgreSQL')

  // Deliberately use only the old DATABASE_URL configuration and the image CMD.
  docker(['run', '-d', '--name', application, ...webArguments, image])
  await waitFor(healthy, 'automatic migration and HTTP health check')
  const first = readWebEnvironment()
  assert.notEqual(first.DATABASE_URL, env.DATABASE_URL)
  assert.match(new URL(first.DATABASE_URL).username, /^ave_app_/)
  assert.match(new URL(first.AUTH_DATABASE_URL).username, /^ave_auth_/)
  assert.equal(first.MIGRATION_DATABASE_URL, undefined)
  assert.ok(!Object.values(first).some(value => value.includes(password)), 'Administrator password must not reach the web process')
  // Next.js changes process.title after loading server.js.
  assert.match(docker(['exec', application, 'cat', '/proc/1/cmdline']), /^next-server/, 'The web server must replace the setup process')

  testRuntimeFilesystem()
  testAnonymousRootMethods()
  testAnonymousPages()
  await testRevokedSessionLogin()

  docker(['restart', application])
  await waitFor(healthy, 'restart')
  const second = readWebEnvironment()
  assert.equal(second.DATABASE_URL, first.DATABASE_URL)
  assert.equal(second.AUTH_DATABASE_URL, first.AUTH_DATABASE_URL)

  const brokenMigration = path.join(directory, 'broken.sql')
  writeFileSync(brokenMigration, 'SELECT * FROM nonexistent_deployment_test_table;')
  const failed = spawnSync('docker', ['run', '--name', failure, ...webArguments,
    '--mount', `type=bind,source=${brokenMigration},target=/app/drizzle/0034_generated_indicator_formulas.sql,readonly`, image], { encoding: 'utf8', timeout: 60000 })
  assert.equal(failed.status, 1, 'A failed migration must stop startup')
  assert.match(failed.stderr, /Database setup failed; application was not started/)
  assert.ok(!failed.stdout.includes('Ready in'), 'A failed migration must not start Next.js')
  assert.ok(healthy(), 'A failed formula migration must leave the previous container healthy')

  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'))
  const last = journal.entries.at(-1)
  journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1, tag: '0039_deployment_failure' })
  const journalPath = path.join(directory, 'journal.json')
  writeFileSync(journalPath, JSON.stringify(journal))
  const failedJournal = spawnSync('docker', ['run', '--name', journalFailure, ...webArguments,
    '--mount', `type=bind,source=${journalPath},target=/app/drizzle/meta/_journal.json,readonly`,
    '--mount', `type=bind,source=${brokenMigration},target=/app/drizzle/0039_deployment_failure.sql,readonly`, image], { encoding: 'utf8', timeout: 60000 })
  assert.equal(failedJournal.status, 1, 'A failed journal migration must stop startup')
  assert.match(failedJournal.stderr, /relation "nonexistent_deployment_test_table" does not exist/)
  assert.ok(!failedJournal.stderr.includes('Failed query:'), 'The database cause must replace the SQL query dump')
  assert.ok(!failedJournal.stdout.includes('Ready in'), 'A failed journal migration must not start Next.js')
  assert.ok(healthy(), 'A failed journal migration must leave the previous container healthy')
  console.log('Docker deployment passed: automatic setup, restricted credentials, read-only application files, root HTTP methods, anonymous page redirects, revoked-session login, restart, and formula/journal migration failures.')
} catch (error) {
  const logs = spawnSync('docker', ['logs', application], { encoding: 'utf8' })
  console.error(logs.stdout, logs.stderr)
  throw error
} finally {
  for (const container of [journalFailure, failure, application, database]) spawnSync('docker', ['rm', '-f', container], { stdio: 'pipe' })
  spawnSync('docker', ['network', 'rm', prefix], { stdio: 'pipe' })
  if (!process.env.DEPLOYMENT_TEST_IMAGE) spawnSync('docker', ['image', 'rm', image], { stdio: 'pipe' })
  rmSync(directory, { recursive: true, force: true })
}
