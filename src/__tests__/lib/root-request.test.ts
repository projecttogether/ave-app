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

function request(method: string, pathname = '/', authenticated = false) {
  return handleRequest(Object.assign(new NextRequest(`https://example.invalid${pathname}`, { method }), {
    auth: authenticated ? { user: { email: 'test@example.invalid' } } : null,
  }))
}

describe('anonymous root requests', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('rejects %s before rendering', (method) => {
    const response = request(method)
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(response.headers.get('x-middleware-next')).toBeNull()
  })

  it.each(['GET', 'HEAD'])('passes %s through to the login redirect', (method) => {
    expect(request(method).headers.get('x-middleware-next')).toBe('1')
  })

  it('passes authenticated root actions through', () => {
    expect(request('POST', '/', true).headers.get('x-middleware-next')).toBe('1')
  })

  it('passes anonymous login submissions through', () => {
    expect(request('POST', '/login').headers.get('x-middleware-next')).toBe('1')
  })
})
