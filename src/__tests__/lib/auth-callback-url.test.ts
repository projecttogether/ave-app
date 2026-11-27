import { describe, expect, it } from 'vitest'
import { DEFAULT_LOGIN_REDIRECT, normalizeCallbackUrl } from '@/lib/auth/callback-url'

describe('normalizeCallbackUrl', () => {
  it('preserves internal callback paths with query strings', () => {
    expect(normalizeCallbackUrl('/form/reflection?year=2026')).toBe('/form/reflection?year=2026')
  })

  it('normalizes absolute URLs to internal paths', () => {
    expect(normalizeCallbackUrl('https://app.ave-gastro.org/form/reflection')).toBe('/form/reflection')
  })

  it('uses the first value from repeated search params', () => {
    expect(normalizeCallbackUrl(['/form/reflection', '/dashboard'])).toBe('/form/reflection')
  })

  it('rejects unsafe or non-return targets', () => {
    expect(normalizeCallbackUrl('')).toBe(DEFAULT_LOGIN_REDIRECT)
    expect(normalizeCallbackUrl('not a url')).toBe(DEFAULT_LOGIN_REDIRECT)
    expect(normalizeCallbackUrl('/api/auth/signout')).toBe(DEFAULT_LOGIN_REDIRECT)
    expect(normalizeCallbackUrl('/_next/static/file.js')).toBe(DEFAULT_LOGIN_REDIRECT)
    expect(normalizeCallbackUrl('/login?callbackUrl=/form/reflection')).toBe(DEFAULT_LOGIN_REDIRECT)
  })

  it('does not reject unrelated paths that share a reserved prefix', () => {
    expect(normalizeCallbackUrl('/apiary')).toBe('/apiary')
    expect(normalizeCallbackUrl('/login-help')).toBe('/login-help')
  })
})
