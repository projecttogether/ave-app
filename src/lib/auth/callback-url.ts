export const DEFAULT_LOGIN_REDIRECT = '/dashboard'

function isPathOrChild(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

export function normalizeCallbackUrl(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || raw.trim() === '') return DEFAULT_LOGIN_REDIRECT

  try {
    const parsed = raw.startsWith('/')
      ? new URL(raw, 'https://app.local')
      : new URL(raw)
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`

    if (!path.startsWith('/') || path.startsWith('//')) return DEFAULT_LOGIN_REDIRECT
    if (isPathOrChild(parsed.pathname, '/api') || isPathOrChild(parsed.pathname, '/_next')) return DEFAULT_LOGIN_REDIRECT
    if (isPathOrChild(parsed.pathname, '/login') || isPathOrChild(parsed.pathname, '/error')) return DEFAULT_LOGIN_REDIRECT

    return path
  } catch {
    return DEFAULT_LOGIN_REDIRECT
  }
}
