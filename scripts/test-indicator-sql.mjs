import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'

// An ephemeral container and loopback-only random port. Tests derive their
// connection from this container; they never use the application DATABASE_URL.
const container = `ave-indicator-tests-${randomUUID()}`
try {
    execFileSync('docker', ['run', '--rm', '-d', '-p', '127.0.0.1::5432', '--name', container, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:15-alpine'], { stdio: 'pipe' })
    let ready = false
    for (let attempt = 0; attempt < 50; attempt++) {
        const check = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { stdio: 'pipe' })
        if (check.status === 0) { ready = true; break }
        await setTimeout(200)
    }
    if (!ready) throw new Error('Test PostgreSQL did not become ready')
    const result = spawnSync('node_modules/.bin/vitest', ['run', '--no-file-parallelism', 'src/__tests__/lib/indicator-sql.test.ts', 'src/__tests__/lib/indicator-migrations.test.ts', 'src/__tests__/lib/quarterly-sql.test.ts'], {
        stdio: 'inherit', env: { ...process.env, INDICATOR_SQL_TEST_CONTAINER: container, INDICATOR_SQL_TEST_SOCKET: '' },
    })
    process.exitCode = result.status ?? 1
} finally {
    spawnSync('docker', ['rm', '-f', container], { stdio: 'pipe' })
}
