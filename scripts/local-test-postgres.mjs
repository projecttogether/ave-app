import { execFileSync } from 'node:child_process'
import { chownSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Docker builds cannot start nested Docker. Give each suite its own PostgreSQL
// cluster, reachable only through a temporary Unix socket.
export function startLocalTestPostgres() {
  // The SQL suites require this prefix before allowing destructive test setup.
  const socket = mkdtempSync(path.join(tmpdir(), 'ave-indicator-tests-'))
  const asRoot = process.getuid?.() === 0
  let started = false
  function postgres(command, args) {
    if (!asRoot) return execFileSync(command, args, { stdio: 'pipe' })
    const quote = value => `'${value.replaceAll("'", "'\\''")}'`
    return execFileSync('su', ['postgres', '-s', '/bin/sh', '-c', [command, ...args].map(quote).join(' ')], { stdio: 'pipe' })
  }
  function stop() {
    try {
      if (started) postgres('pg_ctl', ['-D', `${socket}/data`, '-m', 'immediate', '-w', 'stop'])
    } finally {
      rmSync(socket, { recursive: true, force: true })
    }
  }
  try {
    if (asRoot) chownSync(socket, Number(execFileSync('id', ['-u', 'postgres'])), Number(execFileSync('id', ['-g', 'postgres'])))
    postgres('initdb', ['-D', `${socket}/data`, '-A', 'trust', '-U', 'postgres'])
    postgres('pg_ctl', ['-D', `${socket}/data`, '-l', `${socket}/postgres.log`, '-w', '-o', `-F -k ${socket} -h ''`, 'start'])
    started = true
    return { socket, stop }
  } catch (error) {
    stop()
    throw error
  }
}
