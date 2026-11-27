import { describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import proxy from '@/proxy'

// Exercise the request policy after Auth.js has attached the session.
vi.mock('next-auth', () => ({
  default: () => ({ auth: (handler: unknown) => handler }),
}))

const handleRequest = proxy as unknown as (
  request: NextRequest & { auth: { user: { email: string } } | null },
) => NextResponse

function request(pathname: string, { method = 'GET', authenticated = false, headers = {} } = {}) {
  return handleRequest(Object.assign(new NextRequest(`https://example.invalid${pathname}`, { method, headers }), {
    auth: authenticated ? { user: { email: 'test@example.invalid' } } : null,
  }))
}

function loginRedirect(response: NextResponse) {
  expect(response.status).toBe(307)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  const location = new URL(response.headers.get('location')!)
  expect(location.origin).toBe('https://example.invalid')
  expect(location.pathname).toBe('/login')
  return location.searchParams.get('callbackUrl')
}

describe('proxy login gate', () => {
  it.each(['POST', 'GET'])('rejects malformed router state on %s before rendering', (method) => {
    for (const state of ['not-json', '%E0%A4%A', '{}', '["",{"children":false}]', 'x'.repeat(40001)]) {
      const response = request('/register', { method, headers: { 'next-router-state-tree': state } })
      expect(response.status).toBe(400)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('accepts valid router state for actions and navigation', () => {
    const headers = { 'next-router-state-tree': encodeURIComponent(JSON.stringify(['', { children: ['login', {}] }])) }
    expect(request('/login', { method: 'POST', headers }).headers.get('x-middleware-next')).toBe('1')
    expect(request('/login', { headers }).headers.get('x-middleware-next')).toBe('1')
  })

  // Pages that rendered for anonymous scanners (Sentry AVE-APP-8 and AVE-APP-9).
  it.each([
    '/tasks', '/admin/alliance', '/admin', '/dashboard', '/datasets/operating/sub/2026', '/detail/energy',
    '/indikatoren', '/vergleich', '/methodology', '/operating-periods', '/organization', '/settings',
    '/form/operating', '/backup.sql',
  ])('redirects anonymous GET %s to login', (pathname) => {
    expect(loginRedirect(request(pathname))).toBe(pathname)
  })

  it('keeps the query in the callback URL', () => {
    expect(loginRedirect(request('/tasks?allYears=1'))).toBe('/tasks?allYears=1')
  })

  it('redirects anonymous HEAD and client navigation requests', () => {
    loginRedirect(request('/admin/alliance', { method: 'HEAD' }))
    loginRedirect(request('/admin/alliance', { headers: { rsc: '1', 'next-router-prefetch': '1' } }))
  })

  it.each([
    '/', '/login', '/login?callbackUrl=%2Ftasks', '/signup', '/verify', '/verify-request', '/error',
    '/images/ave-logo.png', '/icon.png',
  ])('passes anonymous GET %s through', (pathname) => {
    expect(request(pathname).headers.get('x-middleware-next')).toBe('1')
  })

  it('does not treat path prefixes as public pages', () => {
    loginRedirect(request('/login-history'))
    loginRedirect(request('/errors'))
  })

  it('passes signed cookies through, including to login', () => {
    // Pages validate the session against storage and send revoked ones to login.
    expect(request('/tasks', { authenticated: true }).headers.get('x-middleware-next')).toBe('1')
    expect(request('/login', { authenticated: true }).headers.get('x-middleware-next')).toBe('1')
  })

  it('leaves Server Actions to their own session checks', () => {
    // Action IDs work on any path, so a redirect here would protect nothing.
    expect(request('/tasks', { method: 'POST' }).headers.get('x-middleware-next')).toBe('1')
  })
})
