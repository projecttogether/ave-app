import NextAuth, { type NextAuthRequest } from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"
import { contentSecurityPolicy } from "@/lib/security/csp"
import { sentryOptions } from "@/lib/sentry-options"
import { validRouterState } from "@/lib/security/router-state"
import { rejectSentryTunnelRequest, sentryTunnelTarget, SENTRY_TUNNEL_PATHS } from "@/lib/security/sentry-tunnel"

const sentryTunnel = sentryOptions.enabled ? sentryTunnelTarget(sentryOptions.dsn) : null

// Pages anyone may open. Every other page requires a session.
const PUBLIC_PAGES = ['/login', '/signup', '/verify', '/verify-request', '/error']

function requiresLogin(request: NextAuthRequest): boolean {
  // Server Actions accept any action ID on any path, so each action checks the
  // session itself. Redirecting their POSTs here would protect nothing.
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  if (request.auth?.user?.email) return false
  const { pathname } = request.nextUrl
  return pathname !== '/' && pathname !== '/icon.png'
    // next/image fetches these without the visitor's cookies.
    && !pathname.startsWith('/images/')
    && !PUBLIC_PAGES.some(page => pathname === page || pathname.startsWith(`${page}/`))
}

const authProxy = NextAuth(authConfig).auth((request) => {
  // Auth.js skips its own login redirect when given a handler, so apply it here.
  // The cookie check is optimistic: pages and actions still validate the
  // session against storage, which also catches revoked sessions.
  if (requiresLogin(request)) {
    const login = new URL('/login', request.nextUrl)
    login.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    const response = NextResponse.redirect(login)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development')
  const requestHeaders = new Headers(request.headers)
  // Next.js reads the request CSP when adding nonces to its framework scripts.
  // Always replace client-supplied values.
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', policy)
  // Anonymous root requests have no form to submit. Reject mutations before
  // Next.js tries to decode client-supplied Server Action references.
  const anonymousRootMutation = request.nextUrl.pathname === '/' &&
    request.method !== 'GET' && request.method !== 'HEAD' && !request.auth?.user?.email
  const response = anonymousRootMutation
    ? new NextResponse(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
    : NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', policy)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
})

export default function proxy(...args: Parameters<typeof authProxy>) {
  const [request] = args
  // Proxy runs before the Sentry tunnel rewrite. The tunnel carries no session,
  // so it skips authentication and only forwards this app's own Sentry project.
  if (SENTRY_TUNNEL_PATHS.has(request.nextUrl.pathname)) {
    const status = rejectSentryTunnelRequest(sentryTunnel, {
      method: request.method,
      searchParams: request.nextUrl.searchParams,
      contentLength: request.headers.get('content-length'),
    })
    return status
      ? new NextResponse(null, { status, headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.next()
  }
  if (!validRouterState(request.headers)) {
    return new NextResponse(null, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  return authProxy(...args)
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
