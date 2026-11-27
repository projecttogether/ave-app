import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

// Exercise the locked Next.js production runtime without app data or Sentry.
// A real render error is the control: cancellations alone must stay silent.
const root = fileURLToPath(new URL('..', import.meta.url))
const directory = mkdtempSync(path.join(root, '.rsc-abort-'))
const dependencies = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies
const errors = []
const controlError = 'rsc-regression-render-error'
let server

function write(name, content) {
  const filename = path.join(directory, name)
  mkdirSync(path.dirname(filename), { recursive: true })
  writeFileSync(filename, content)
}

try {
  write('package.json', JSON.stringify({
    name: 'rsc-abort-regression', private: true,
    dependencies: { next: dependencies.next, react: dependencies.react, 'react-dom': dependencies['react-dom'] },
  }))
  write('next.config.js', `module.exports = { skipProxyUrlNormalize: true, turbopack: { root: ${JSON.stringify(root)} } }`)
  write('instrumentation.js', `export function onRequestError(error) {
    console.log('ave-rsc-regression-error:' + error.message)
  }`)
  write('router-state.ts', readFileSync(path.join(root, 'src/lib/security/router-state.ts'), 'utf8'))
  write('proxy.js', `import { NextResponse } from 'next/server'
    import { validRouterState } from './router-state'
    export function proxy(request) {
      return validRouterState(request.headers) ? NextResponse.next()
        : new NextResponse(null, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }
  `)
  write('app/layout.js', 'export default function Layout({ children }) { return <html><body>{children}</body></html> }')
  write('app/page.js', 'export default function Page() { return <p>Ready</p> }')
  write('app/hang/page.js', `import { connection } from 'next/server'
    import { Suspense } from 'react'
    async function Hang() { await connection(); await new Promise(() => {}); return null }
    export default function Page() { return <Suspense fallback={<p>stream-started</p>}><Hang /></Suspense> }
  `)
  write('app/error-control/page.js', `import { connection } from 'next/server'
    import { Suspense } from 'react'
    async function Boom() { await connection(); throw new Error('${controlError}') }
    export default function Page() { return <Suspense fallback={<p>error-pending</p>}><Boom /></Suspense> }
  `)
  const build = spawnSync(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build', directory], {
    cwd: directory, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
  })
  if (build.status !== 0) console.error(build.stdout, build.stderr)
  assert.equal(build.status, 0, 'RSC regression fixture must build')

  // Use Next's production HTTP server so the real proxy runs before rendering.
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', directory, '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: directory, env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', chunk => {
    output += chunk.toString()
    errors.splice(0, errors.length, ...[...output.matchAll(/ave-rsc-regression-error:([^\r\n]+)/g)].map(match => match[1]))
  })
  server.stderr.on('data', chunk => process.stderr.write(chunk))
  await new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => reject(new Error('Next.js start timed out')), 30000)
    server.stdout.on('data', () => {
      if (output.includes('Ready')) { clearTimeout(timeout); resolve() }
    })
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Next.js exited: ${code}`)) })
  })
  const origin = `http://127.0.0.1:${port}`
  for (const state of ['not-json', '%E0%A4%A', '{}', '["",{"children":false}]']) {
    const invalid = await fetch(`${origin}/register`, {
      method: 'POST', headers: { 'next-router-state-tree': state },
    })
    await invalid.text()
    assert.equal(invalid.status, 400, 'Malformed router state must be a client error')
  }
  const navigation = await fetch(origin, {
    headers: { RSC: '1', 'next-router-state-tree': encodeURIComponent(JSON.stringify(['', {}])) },
  })
  await navigation.text()
  assert.equal(navigation.status, 200, 'Valid router state must reach Next.js')
  assert.deepEqual(errors, [], 'Malformed requests must not reach onRequestError')
  const controller = new AbortController()
  const response = await fetch(`${origin}/hang`, {
    headers: { RSC: '1' }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
  })
  assert.equal(response.status, 200)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let payload = ''
  while (!payload.includes('stream-started')) {
    const { value, done } = await reader.read()
    assert.equal(done, false, 'The fallback must arrive before cancellation')
    payload += decoder.decode(value, { stream: true })
  }
  controller.abort()
  await setTimeout(200)
  const cancellationErrors = [...errors]

  const control = await fetch(`${origin}/error-control`, { signal: AbortSignal.timeout(10000) })
  await control.text()
  assert.ok(errors.includes(controlError), 'Real render errors must reach onRequestError')
  assert.deepEqual(cancellationErrors, [], 'Client-aborted RSC streams must not reach onRequestError')
  assert.ok(errors.every(message => message === controlError), 'Only the deliberate render error should be reported')
  console.log('RSC cancellation passed: aborted response silent, real render error reported.')
} catch (error) {
  // Next.js installs an uncaught-exception handler. Set the CI exit code here.
  console.error(error)
  process.exitCode = 1
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise(resolve => server.once('exit', resolve))
  }
  rmSync(directory, { recursive: true, force: true })
}
