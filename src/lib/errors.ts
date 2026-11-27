import { maskEmailsInText } from '@/lib/redact'

type DatabaseError = { code: string; message?: string }

/**
 * The PostgreSQL error behind a failure, also when Drizzle wraps it. Drizzle's
 * own message embeds the full SQL text and its bound parameters.
 */
export function databaseError(error: unknown): DatabaseError | undefined {
  const isSqlState = (value: unknown) => typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value)
  if (!error || typeof error !== 'object') return undefined
  const cause = (error as { cause?: { code?: unknown; message?: unknown } }).cause
  if (cause && isSqlState(cause.code)) return { code: cause.code as string, message: typeof cause.message === 'string' ? cause.message : undefined }
  const direct = error as { code?: unknown; message?: unknown; severity?: unknown }
  if (isSqlState(direct.code) && 'severity' in direct) return { code: direct.code as string, message: typeof direct.message === 'string' ? direct.message : undefined }
  if ((error as { name?: unknown }).name === 'DrizzleQueryError') return { code: 'unknown' }
  return undefined
}

const DATABASE_MESSAGES: Record<string, string> = {
  '42501': 'Keine Berechtigung für diese Änderung.',
  '23505': 'Diese Daten wurden inzwischen geändert. Bitte neu laden.',
  '23514': 'Die Werte widersprechen den Datenregeln. Bitte prüfen.',
  '40001': 'Gleichzeitige Änderung erkannt. Bitte erneut versuchen.',
  '40P01': 'Gleichzeitige Änderung erkannt. Bitte erneut versuchen.',
}

/**
 * Message safe to return from a Server Action. Our own errors keep their
 * German text; database errors map to fixed messages, except RAISE EXCEPTION
 * (P0001) texts written for users in our SQL functions.
 */
export function userFacingError(error: unknown, fallback: string): string {
  const database = databaseError(error)
  if (database) return database.code === 'P0001' && database.message ? database.message : DATABASE_MESSAGES[database.code] ?? fallback
  if (error && typeof error === 'object' && 'cause' in error) return fallback
  return error instanceof Error && error.message ? error.message : fallback
}

/** Log-safe description of an error: never SQL parameters or full email addresses. */
export function errorSummary(error: unknown): { error: Record<string, unknown> } {
  const database = databaseError(error)
  if (database) return { error: { name: 'DatabaseError', code: database.code, ...(database.message && { message: maskEmailsInText(database.message) }) } }
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return { error: { name: error.name, message: maskEmailsInText(error.message), ...(typeof code === 'string' && { code }) } }
  }
  return { error: { name: typeof error } }
}

/** Remove the SQL and parameters Drizzle appends to query error messages. */
export function stripQueryDetails(message: string): string {
  return message.startsWith('Failed query:') ? 'Failed query (details removed)' : maskEmailsInText(message)
}
