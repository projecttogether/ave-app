'use server'

import { checkPreferenceRevision } from '@/lib/operating-data/preference-store'
import { frequencyKind } from '@/lib/operating-data/preferences'
import { operatingResult } from '@/lib/operating-data/result'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { indicatorData, subOrganizations, operatingReportingModes, dataFreezes } from '@/lib/db/schema'
import { parseOperatingCsv, CsvError, type CsvIssue } from '@/lib/operating-data/csv'
import { checkedOperatingPatch, validatePublication, type Publication } from '@/lib/operating-data/publication'
import { periodKey, periodLabel, recordPeriod } from '@/lib/operating-data/periods'
import { publishOperatingTransaction } from '@/lib/operating-data/write'
import { hasOperatingValues } from '@/lib/operating-data/coverage'
import { revalidatePath } from 'next/cache'
import { userFacingError } from '@/lib/errors'

export type CsvImportResult = { success: boolean; imported: number; total: number; skipped?: number; errors: CsvIssue[] }
export type CsvPreview = { token: string; total: number; rows: { kitchen: string; period: string; before: Record<string, unknown>; changes: Record<string, unknown> }[] }
type SignedPreview = { actor: string; expires: number; total: number; requests: Publication[] }
function sign(value: string) {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('Importvorschau ist nicht konfiguriert.')
  return createHmac('sha256', secret).update('operating-csv-v2:' + value).digest('base64url')
}

async function previewIndicatorCsvInternal(formData: FormData): Promise<CsvPreview> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Nicht eingeloggt.')
  const file = formData.get('file')
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv') || file.size > 750_000) throw new Error('CSV-Datei bis 750 KB auswählen.')
  const parsed = parseOperatingCsv(await file.text())
  return db.transaction(async tx => {
    const groups = new Map<string, Publication>()
    const rows: CsvPreview['rows'] = []
    const seen = new Set<string>()
    for (const row of parsed) {
      const candidates = await tx.select().from(subOrganizations).where(row.id ? eq(subOrganizations.id, row.id) : eq(subOrganizations.name, row.name))
      if (candidates.length !== 1) throw new CsvError([{ line: row.line, column: 'sub_organization_id', message: 'Betrieb nicht eindeutig gefunden. Bitte eine zugängliche Betriebs-ID verwenden.' }])
      const kitchen = candidates[0]
      const permission = await tx.execute(sql`SELECT app_private.can_write(${kitchen.organizationId}::uuid, ${kitchen.id}::uuid) AS allowed`)
      if (!permission.rows[0]?.allowed) throw new Error('Keine Schreibberechtigung für mindestens einen Betrieb.')
      if (await tx.query.dataFreezes.findFirst({ where: eq(dataFreezes.year, row.period.year) })) throw new Error('Mindestens ein Berichtsjahr ist gesperrt.')
      const key = `${kitchen.id}:${periodKey(row.period)}`
      if (seen.has(key)) throw new Error('Doppelte Berichtsperiode in der Datei.')
      seen.add(key)
      const yearRows = await tx.query.indicatorData.findMany({ where: and(eq(indicatorData.subOrganizationId, kitchen.id), eq(indicatorData.reportingYear, row.period.year), isNull(indicatorData.supersededAt)) })
      const existing = yearRows.find(item => periodKey(recordPeriod(item)) === periodKey(row.period))
      if (row.revision !== undefined && row.revision !== (existing?.revision ?? 0)) throw new Error('Die exportierte Revision ist veraltet. Aktuelle Daten exportieren und Änderungen erneut prüfen.')
      checkedOperatingPatch(existing, row.values)
      const mode = await tx.query.operatingReportingModes.findFirst({ where: and(eq(operatingReportingModes.subOrganizationId, kitchen.id), eq(operatingReportingModes.reportingYear, row.period.year)) })
      if (row.period.kind === 'quarter' ? mode?.mode !== 'quarterly' && yearRows.some(hasOperatingValues) : mode?.mode === 'quarterly') throw new Error('Die Datei würde Quartalswerte mit Monats- oder Jahreswerten mischen. Die Erfassungsart zuerst mit einer geprüften Jahreskorrektur ändern.')
      const preference = await checkPreferenceRevision(tx, kitchen.id, row.period.year)
      if (preference && frequencyKind(preference.frequency) !== row.period.kind) throw new Error('Die Datei passt nicht zum gewählten Erfassungsrhythmus. Bitte den Rhythmus zuerst ausdrücklich ändern.')
      const groupKey = `${kitchen.id}:${row.period.year}`
      const group = groups.get(groupKey) ?? { subOrganizationId: kitchen.id, year: row.period.year, requestId: randomUUID(), workflow: row.period.kind === 'quarter' ? 'quarter' : 'legacy', expectedModeRevision: mode?.revision ?? 0, expectedPreferenceRevision: preference?.revision ?? 0, entries: [] }
      if ((group.workflow === 'quarter') !== (row.period.kind === 'quarter')) throw new Error('Quartale und Monats-/Jahreswerte desselben Betriebsjahres dürfen nicht gemeinsam importiert werden.')
      group.entries.push({ period: row.period, expectedRevision: existing?.revision ?? 0, coverageConfirmed: row.coverageConfirmed, values: row.values })
      groups.set(groupKey, group)
      rows.push({ kitchen: kitchen.name, period: periodLabel(row.period), before: Object.fromEntries(Object.keys(row.values).map(field => [field, existing?.[field as keyof typeof existing] ?? null])), changes: row.values })
    }
    const requests = [...groups.values()].sort((a, b) => a.year - b.year || a.subOrganizationId.localeCompare(b.subOrganizationId))
    requests.forEach(request => validatePublication(request))
    const signed: SignedPreview = { actor: session.user!.id!, expires: Date.now() + 30 * 60_000, total: rows.length, requests }
    const encoded = Buffer.from(JSON.stringify(signed)).toString('base64url')
    return { token: encoded + '.' + sign(encoded), rows, total: rows.length }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

/** One signed, actor-bound preview commits in one transaction. A retry uses the same receipts. */
export async function importIndicatorCsv(formData: FormData): Promise<CsvImportResult> {
  let total = 0
  try {
    const session = await auth()
    if (!session?.user?.id) throw new Error('Nicht eingeloggt.')
    const token = formData.get('previewToken')
    if (typeof token !== 'string' || token.length > 1_000_000) throw new Error('Bitte zuerst die vollständige Importvorschau prüfen.')
    const [encoded, signature, extra] = token.split('.')
    const expected = Buffer.from(sign(encoded))
    const actual = Buffer.from(signature ?? '')
    if (extra || actual.length !== expected.length || !timingSafeEqual(expected, actual)) throw new Error('Ungültige Importvorschau.')
    const preview: SignedPreview = JSON.parse(Buffer.from(encoded, 'base64url').toString())
    if (preview.actor !== session.user.id || preview.expires < Date.now()) throw new Error('Die Importvorschau ist abgelaufen. Bitte erneut prüfen.')
    total = preview.total
    await db.transaction(async tx => {
      // Acquire all locks in a consistent order before writing any row.
      for (const year of [...new Set(preview.requests.map(r => r.year))].sort()) await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(1936028722, ${year})`)
      for (const id of [...new Set(preview.requests.map(r => r.subOrganizationId))].sort()) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 1936028723))`)
      for (const request of preview.requests) await publishOperatingTransaction(tx, session.user!.id!, request)
    })
    for (const path of ['/dashboard', '/indikatoren', '/datasets', '/vergleich', '/tasks']) revalidatePath(path)
    return { success: true, imported: total, total, errors: [] }
  } catch (error) {
    return { success: false, imported: 0, total, errors: error instanceof CsvError ? error.issues : [{ line: 0, column: '', message: userFacingError(error, 'Der gesamte Import wurde zurückgerollt.') }] }
  }
}

export async function previewIndicatorCsv(formData: FormData) {
  return operatingResult(() => previewIndicatorCsvInternal(formData))
}
