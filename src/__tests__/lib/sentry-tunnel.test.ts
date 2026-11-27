import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { rejectSentryTunnelRequest, sentryTunnelTarget, SENTRY_TUNNEL_MAX_BYTES } from '@/lib/security/sentry-tunnel'
import { sentryOptions } from '@/lib/sentry-options'

vi.mock('next-auth', () => ({
  default: () => ({ auth: (handler: unknown) => handler }),
}))

const regional = { orgId: '4511987937705984', projectId: '4512174513913936', region: 'de' }

function check(query: string, { method = 'POST', contentLength = '512' as string | null, target = regional as ReturnType<typeof sentryTunnelTarget> } = {}) {
  return rejectSentryTunnelRequest(target, { method, searchParams: new URLSearchParams(query), contentLength })
}

describe('sentryTunnelTarget', () => {
  it('reads org, project and region from the configured DSN', () => {
    expect(sentryTunnelTarget(sentryOptions.dsn)).toEqual(regional)
  })

  it('reads DSNs without a region', () => {
    expect(sentryTunnelTarget('https://key@o123.ingest.sentry.io/456')).toEqual({ orgId: '123', projectId: '456' })
  })

  it('takes the last path segment as the project, like the Sentry SDK', () => {
    expect(sentryTunnelTarget('https://key@o123.ingest.us.sentry.io/prefix/789')).toEqual({ orgId: '123', projectId: '789', region: 'us' })
  })

  it.each([
    undefined,
    '',
    'not a url',
    'https://key@sentry.example.com/1',
    'https://key@o123.ingest.sentry.io.evil.test/1',
    'https://key@o123.ingest.sentry.io/',
    'https://key@oabc.ingest.sentry.io/1',
  ])('disables the tunnel for %s', (dsn) => {
    expect(sentryTunnelTarget(dsn)).toBeNull()
  })
})

describe('rejectSentryTunnelRequest', () => {
  it('allows envelopes for the configured project', () => {
    expect(check('o=4511987937705984&p=4512174513913936&r=de')).toBeNull()
  })

  it.each([
    ['another org', 'o=1&p=4512174513913936&r=de'],
    ['another project', 'o=4511987937705984&p=1&r=de'],
    ['another region', 'o=4511987937705984&p=4512174513913936&r=us'],
    ['a missing region', 'o=4511987937705984&p=4512174513913936'],
    ['duplicate parameters', 'o=4511987937705984&o=1&p=4512174513913936&r=de'],
    ['extra parameters', 'o=4511987937705984&p=4512174513913936&r=de&sentry_key=x'],
    ['no parameters', ''],
  ])('rejects %s', (_, query) => {
    expect(check(query)).toBe(403)
  })

  it('requires the region to be absent for DSNs without one', () => {
    const target = { orgId: '123', projectId: '456' }
    expect(check('o=123&p=456', { target })).toBeNull()
    expect(check('o=123&p=456&r=de', { target })).toBe(403)
  })

  it('rejects everything when no DSN is configured', () => {
    expect(check('o=4511987937705984&p=4512174513913936&r=de', { target: null })).toBe(404)
  })

  it('accepts only POST', () => {
    expect(check('o=4511987937705984&p=4512174513913936&r=de', { method: 'GET' })).toBe(405)
  })

  it('bounds the body size', () => {
    const query = 'o=4511987937705984&p=4512174513913936&r=de'
    expect(check(query, { contentLength: String(SENTRY_TUNNEL_MAX_BYTES) })).toBeNull()
    expect(check(query, { contentLength: String(SENTRY_TUNNEL_MAX_BYTES + 1) })).toBe(413)
    expect(check(query, { contentLength: '1e9' })).toBe(413)
    expect(check(query, { contentLength: null })).toBe(411)
  })
})

describe('proxy tunnel handling', () => {
  it('handles the tunnel before authentication and rejects it while Sentry is disabled', async () => {
    const { default: proxy } = await import('@/proxy')
    const request = new NextRequest('https://example.invalid/monitoring?o=4511987937705984&p=4512174513913936&r=de', {
      method: 'POST', body: 'x', headers: { 'content-length': '1' },
    })
    const response = await proxy(request, { params: Promise.resolve({}) })
    // Sentry is disabled under NODE_ENV=test, so the tunnel is closed.
    expect(response?.status).toBe(404)
    expect(response?.headers.get('content-security-policy')).toBeNull()
  })
})
