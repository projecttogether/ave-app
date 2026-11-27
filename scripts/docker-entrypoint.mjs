import startup from './startup-bundle.cjs'

try {
  if (typeof process.execve !== 'function') throw new Error('Automatic startup requires Node.js 22.15 or later on Linux')
  const environment = await startup.prepareDatabase()
  // Replace the bootstrap process, including its memory and administrator
  // credentials. Next.js stays PID 1 and receives Docker's shutdown signals.
  process.execve(process.execPath, [process.execPath, 'server.js'], environment)
} catch (error) {
  console.error('Database setup failed; application was not started.')
  // Drizzle wraps PostgreSQL errors in the entire SQL query. Print the cause
  // so a long migration cannot hide the database error in Coolify's log tail.
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error
  console.error(cause instanceof Error ? cause.message : 'Unknown startup error')
  process.exitCode = 1
}
