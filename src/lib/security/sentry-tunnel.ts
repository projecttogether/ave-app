export type SentryTunnelTarget = { orgId: string; projectId: string; region?: string }

export const SENTRY_TUNNEL_PATHS = new Set(['/monitoring', '/monitoring/'])

/**
 * Next.js matches rewrites case-insensitively, so `/MONITORING` reaches the tunnel
 * rewrite too. The proxy must check every path the rewrite accepts.
 */
export function isSentryTunnelPath(pathname: string): boolean {
  return SENTRY_TUNNEL_PATHS.has(pathname.toLowerCase())
}

// Browser envelopes are small; Sentry's own ingest limit for a whole envelope is larger,
// but nothing this app sends approaches it.
export const SENTRY_TUNNEL_MAX_BYTES = 1024 * 1024

/**
 * Derives the tunnel query (`o`, `p`, `r`) from the DSN, the way `@sentry/nextjs` 11.4
 * did for `tunnelRoute`. Returns null for anything that is not a Sentry SaaS DSN, which
 * disables the tunnel.
 */
export function sentryTunnelTarget(dsn: string | undefined): SentryTunnelTarget | null {
  if (!dsn) return null
  let url: URL
  try {
    url = new URL(dsn)
  } catch {
    return null
  }
  const host = url.hostname.match(/^o(\d+)\.ingest(?:\.([a-z]{2}))?\.sentry\.io$/)
  const projectId = url.pathname.split('/').filter(Boolean).pop()?.match(/^\d+/)?.[0]
  if (!host || !projectId) return null
  return { orgId: host[1], projectId, ...(host[2] ? { region: host[2] } : {}) }
}

/**
 * The browser SDK's tunnel URL: exactly the query `rejectSentryTunnelRequest` accepts.
 */
export function sentryTunnelUrl(target: SentryTunnelTarget): string {
  const query = new URLSearchParams({ o: target.orgId, p: target.projectId })
  if (target.region) query.set('r', target.region)
  return `/monitoring?${query}`
}

/**
 * The tunnel rewrite (next.config.ts) forwards any numeric org and project to
 * `o<org>.ingest.sentry.io`. Only this app's own project may pass, so the server cannot
 * be used to relay envelopes to other Sentry accounts. Returns the HTTP status for a
 * rejected request, or null when the request may continue to the rewrite.
 */
export function rejectSentryTunnelRequest(
  target: SentryTunnelTarget | null,
  request: { method: string; searchParams: URLSearchParams; contentLength: string | null },
): number | null {
  if (!target) return 404
  if (request.method !== 'POST') return 405

  const { searchParams } = request
  const keys = [...searchParams.keys()]
  const allowed = target.region ? ['o', 'p', 'r'] : ['o', 'p']
  if (keys.length !== allowed.length || !allowed.every(key => searchParams.getAll(key).length === 1)) return 403
  if (searchParams.get('o') !== target.orgId || searchParams.get('p') !== target.projectId) return 403
  if (target.region && searchParams.get('r') !== target.region) return 403

  if (request.contentLength === null) return 411
  const length = Number(request.contentLength)
  if (!/^\d+$/.test(request.contentLength) || length > SENTRY_TUNNEL_MAX_BYTES) return 413
  return null
}
