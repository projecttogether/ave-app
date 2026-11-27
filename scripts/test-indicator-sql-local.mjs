import { spawnSync } from 'node:child_process'
import { startLocalTestPostgres } from './local-test-postgres.mjs'

// Used in the Docker build, where nested Docker is unavailable. PostgreSQL
// listens only on an ephemeral Unix socket and cannot reach production data.
const database = startLocalTestPostgres()
try {
    const result = spawnSync('node_modules/.bin/vitest', ['run', '--no-file-parallelism', 'src/__tests__/lib/indicator-sql.test.ts', 'src/__tests__/lib/indicator-migrations.test.ts', 'src/__tests__/lib/quarterly-sql.test.ts'], {
        stdio: 'inherit', env: { ...process.env, INDICATOR_SQL_TEST_CONTAINER: '', INDICATOR_SQL_TEST_SOCKET: database.socket },
    })
    process.exitCode = result.status ?? 1
} finally {
    database.stop()
}
