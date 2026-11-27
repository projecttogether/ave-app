import { afterEach, describe, expect, it, vi } from 'vitest'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { errorSummary, stripQueryDetails, userFacingError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { sentryOptions } from '@/lib/sentry-options'

const pgError = (code: string, message: string) => Object.assign(new Error(message), { code, severity: 'ERROR' })
const queryError = (code: string, message: string) =>
  new DrizzleQueryError('insert into "qualitative_responses" values ($1, $2)', ['secret answer', 'alice@example.invalid'], pgError(code, message))

afterEach(() => vi.restoreAllMocks())

describe('errors returned from Server Actions', () => {
  it('never passes SQL or parameters through', () => {
    for (const code of ['42501', '22P02', 'XX000']) {
      const message = userFacingError(queryError(code, 'database detail'), 'Fallback')
      expect(message).not.toContain('insert into')
      expect(message).not.toContain('secret answer')
    }
    expect(userFacingError(queryError('42501', 'rls'), 'Fallback')).toBe('Keine Berechtigung für diese Änderung.')
    expect(userFacingError(queryError('22P02', 'invalid input syntax'), 'Fallback')).toBe('Fallback')
    expect(userFacingError(pgError('23505', 'duplicate key'), 'Fallback')).toBe('Diese Daten wurden inzwischen geändert. Bitte neu laden.')
  })
  it('keeps messages written for users', () => {
    expect(userFacingError(queryError('P0001', 'Keine Schreibberechtigung.'), 'Fallback')).toBe('Keine Schreibberechtigung.')
    expect(userFacingError(new Error('Das Berichtsjahr ist für die Bearbeitung gesperrt.'), 'Fallback')).toBe('Das Berichtsjahr ist für die Bearbeitung gesperrt.')
    expect(userFacingError('string', 'Fallback')).toBe('Fallback')
  })
})

describe('logs and Sentry events', () => {
  it('summarizes errors without query parameters or full addresses', () => {
    const summary = JSON.stringify(errorSummary(queryError('42501', 'new row violates row-level security policy')))
    expect(summary).toContain('42501')
    expect(summary).not.toContain('secret answer')
    expect(summary).not.toContain('alice@example.invalid')
    expect(JSON.stringify(errorSummary(new Error('Can\'t send mail - all recipients were rejected: 550 <alice@example.invalid>'))))
      .toContain('a****@example.invalid')
  })
  it('masks emails in logger metadata', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('failed', { email: 'alice@example.invalid', nested: { userEmail: 'bob@example.invalid', password: 'x' } })
    const output = spy.mock.calls[0][0] as string
    expect(output).not.toContain('alice@example.invalid')
    expect(output).not.toContain('bob@example.invalid')
    expect(JSON.parse(output).metadata).toEqual({ email: 'a****@example.invalid', nested: { userEmail: 'b****@example.invalid', password: '[REDACTED]' } })
  })
  it('strips query details from Sentry events', () => {
    const event = { exception: { values: [{ type: 'DrizzleQueryError', value: queryError('42501', 'rls').message }] }, message: 'mail to alice@example.invalid failed' }
    const sent = sentryOptions.beforeSend(event as never) as typeof event
    expect(sent.exception.values[0].value).toBe('Failed query (details removed)')
    expect(sent.message).toBe('mail to a****@example.invalid failed')
    expect(stripQueryDetails('plain message')).toBe('plain message')
  })
})
