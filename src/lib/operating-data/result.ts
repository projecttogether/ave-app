/** Expected validation/conflict errors cross the server-action boundary as data. */
export type OperatingResult<T> = { data: T; error?: never } | { error: string; data?: never }
export function unwrapOperatingResult<T>(result: OperatingResult<T>): T {
  if (result.error !== undefined) throw new Error(result.error)
  return result.data as T
}

export async function operatingResult<T>(operation: () => Promise<T>): Promise<OperatingResult<T>> {
  try { return { data: await operation() } }
  catch (error) {
    if (error && typeof error === 'object' && 'cause' in error) {
      const cause = error.cause as { code?: string; message?: string } | undefined
      const message = cause?.code === '42501' ? 'Keine Berechtigung für diese Änderung.'
        : cause?.code === '23505' ? 'Diese Periode wurde inzwischen gespeichert. Bitte neu laden.'
        : cause?.code === '23514' ? 'Die Werte oder Perioden widersprechen den Datenregeln. Bitte prüfen.'
        : cause?.code === '40001' || cause?.code === '40P01' ? 'Gleichzeitige Änderung erkannt. Bitte denselben Speichervorgang erneut versuchen.'
        : cause?.code === 'P0001' ? cause.message
        : undefined
      return { error: message ?? 'Speichern fehlgeschlagen. Bitte den Entwurf behalten und erneut versuchen.' }
    }
    if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
      return { error: error.issues.map((issue: { message: string; line?: number; column?: string }) => `${issue.line ? `Zeile ${issue.line}${issue.column ? ` (${issue.column})` : ''}: ` : ''}${issue.message}`).join(' ') }
    }
    return { error: error instanceof Error ? error.message : 'Die Anfrage konnte nicht verarbeitet werden.' }
  }
}
