'use server'

import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import {
  qualitativeResponses,
  subOrganizations,
  users,
} from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { isAdmin, isOrgManager, isGlobalViewOnly, isViewOnly } from '@/lib/roles'
import {
  SCORING_QUESTIONS,
  SCORING_QUESTIONS_MAP,
  INDICATOR_LABELS,
} from '@/lib/qualitative/constants'
import type {
  IndicatorSlug,
  QualitativeFormData,
  QualitativeResponseWithRelations,
} from '@/lib/qualitative/constants'
import type { ResponseValue } from '@/lib/questions/types'
import { auditLog } from '@/lib/audit'
import { getFutureReportingPeriodMessage, isFutureReportingPeriod } from '@/lib/reporting-period'
import { yearSchema } from '@/lib/validation'
import { csvEscape } from '@/lib/csv'
import { errorSummary, userFacingError } from '@/lib/errors'
import { validateAnswers } from '@/lib/questions/validation'

// --- Helper: check user can access this org ---
async function assertOrgAccess(orgId: string) {
  const session = await auth()
  if (!session?.user?.email) throw new Error('Nicht eingeloggt (qualitative)')
  const userId = session.user.id

  const profile = await db.query.users.findFirst({
    where: eq(users.id, userId!),
    with: { userRoles: { with: { role: true } } }
  })
  if (!profile) throw new Error('Profile not found')

  const roles = profile.userRoles.map((ur: any) => ur.roleId)

  if (isAdmin(roles) || isGlobalViewOnly(roles)) return { ...profile, roles }

  if (!profile.organizationId) throw new Error('No organization assigned')
  if (profile.organizationId !== orgId) throw new Error('Access denied')

  return { ...profile, roles }
}

// --- Helper: parse DD.MM.YYYY to Date ---
function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null
  const parts = dateStr.split('.')
  if (parts.length !== 3) return null
  const [day, month, year] = parts.map(Number)
  if (!day || !month || !year) return null
  const date = new Date(year, month - 1, day)
  // Reject impossible dates instead of letting JS roll them over
  // (31.02.2026 would otherwise silently become 03.03.2026)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

// --- Helper: format Date to DD.MM.YYYY ---
function formatDateString(date: Date | null): string {
  if (!date) return ''
  const d = date.getDate().toString().padStart(2, '0')
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const y = date.getFullYear()
  return `${d}.${m}.${y}`
}

// --- Actions ---

/**
 * Fetch all qualitative (scoring) responses for an org + year
 */
export async function getQualitativeResponses(
  orgId: string,
  subOrgId: string,
  year: number
): Promise<QualitativeFormData> {
  await assertOrgAccess(orgId)

  const rows = await db.query.qualitativeResponses.findMany({
    where: and(
      eq(qualitativeResponses.organizationId, orgId),
      eq(qualitativeResponses.subOrganizationId, subOrgId),
      eq(qualitativeResponses.reportingYear, year)
    ),
  })

  // Build empty form data
  const formData: QualitativeFormData = {}
  for (const q of SCORING_QUESTIONS) {
    formData[q.key] = { text: '', option: '', multiple: [], date: '' }
  }

  // Fill in existing responses
  for (const row of rows) {
    const config = SCORING_QUESTIONS_MAP[row.questionKey]
    if (!config) continue

    const val: ResponseValue = { text: '', option: '', multiple: [], date: '' }

    if (row.responseText) val.text = row.responseText
    if (row.responseOption) val.option = row.responseOption
    if (row.responseMultiple) val.multiple = row.responseMultiple as string[]
    if (row.responseDate) val.date = formatDateString(row.responseDate)

    formData[row.questionKey] = val
  }

  return formData
}

/**
 * Batch upsert all qualitative (scoring) responses for an org + year
 */
export async function saveAllQualitativeResponses(
  orgId: string,
  subOrgId: string,
  year: number,
  data: QualitativeFormData
): Promise<{ success?: boolean; error?: string }> {
  try {
    yearSchema.parse(year)
    const profile = await assertOrgAccess(orgId)

    if (isViewOnly(profile.roles) && !isOrgManager(profile.roles) && !isAdmin(profile.roles)) {
      return { error: 'Keine Berechtigung zum Bearbeiten (View-Only)' }
    }

    if (isFutureReportingPeriod(year, 0)) {
      return { error: getFutureReportingPeriodMessage(year, 0) }
    }

    // Check if the year is frozen
    const { isYearFrozen } = await import('./data-freeze')
    const frozen = await isYearFrozen(year)
    if (frozen) return { error: 'Das Berichtsjahr ist für die Bearbeitung gesperrt.' }

    // The sub-org must belong to the org the rows are tagged with, otherwise
    // inconsistent rows pollute every per-sub-org aggregation
    const subOrg = await db.query.subOrganizations.findFirst({
      where: eq(subOrganizations.id, subOrgId),
      columns: { organizationId: true },
    })
    if (!subOrg || subOrg.organizationId !== orgId) {
      return { error: 'Unterorganisation gehört nicht zur angegebenen Organisation' }
    }

  const userId = profile.id
  const now = new Date()

  const validated = validateAnswers(SCORING_QUESTIONS, data)
  if ('error' in validated) return { error: validated.error }

  // Build upsert values
  const values: (typeof qualitativeResponses.$inferInsert)[] = []
  for (const q of SCORING_QUESTIONS) {
    const answer = validated.data[q.key]
    if (!answer) continue

    const row: typeof qualitativeResponses.$inferInsert = {
      organizationId: orgId,
      subOrganizationId: subOrgId,
      indicatorSlug: q.indicator,
      reportingYear: year,
      questionKey: q.key,
      responseType: q.type === 'long text' || q.type === 'short text' ? 'text' : q.type as any,
      responseText: answer.text || null,
      responseOption: answer.option || null,
      responseMultiple: answer.multiple && answer.multiple.length > 0 ? answer.multiple : null,
      responseDate: answer.date ? parseDateString(answer.date) : null,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    }
    values.push(row)
  }

  if (values.length === 0) return { success: true }

  // Upsert all responses atomically — a mid-batch failure must not leave a
  // half-saved questionnaire
  await db.transaction(async (tx) => {
    for (const val of values) {
      await tx
        .insert(qualitativeResponses)
        .values(val)
        .onConflictDoUpdate({
          target: [
            qualitativeResponses.organizationId,
            qualitativeResponses.subOrganizationId,
            qualitativeResponses.indicatorSlug,
            qualitativeResponses.reportingYear,
            qualitativeResponses.questionKey,
          ],
          set: {
            responseType: val.responseType,
            responseText: val.responseText,
            responseOption: val.responseOption,
            responseMultiple: val.responseMultiple,
            responseDate: val.responseDate,
            updatedBy: userId,
            updatedAt: now,
          },
        })
    }
  })

  revalidatePath('/', 'layout')
  auditLog({ action: 'data.update', userId, resourceType: 'qualitativeResponse', organizationId: orgId, details: { subOrgId, year, responseCount: values.length } })

  return { success: true }
  } catch (err: any) {
    const { logger } = await import('@/lib/logger')
    logger.error('saveAllQualitativeResponses failed', errorSummary(err))
    return { error: userFacingError(err, 'Ein unerwarteter Fehler ist aufgetreten') }
  }
}

/**
 * Admin: Fetch all qualitative responses with optional filters
 */
export async function getQualitativeResponsesAdmin(filters: {
  organizationId?: string
  year?: number
  indicatorSlug?: string
}, options?: {
  /** Row cap for the admin table; pass null for no cap (CSV export) */
  limit?: number | null
}): Promise<QualitativeResponseWithRelations[]> {
  const session = await auth()
  if (!session?.user?.email) throw new Error('Unauthorized')

  const profile = await db.query.users.findFirst({
    where: eq(users.id, session.user.id!),
    with: { userRoles: { with: { role: true } } }
  })
  if (!profile) throw new Error('Admin access required')

  const roles = profile.userRoles.map((ur: any) => ur.roleId)
  if (!isAdmin(roles)) throw new Error('Admin access required')

  // Org-scoped admins can only view their own org's data
  if (profile.organizationId) {
    if (filters.organizationId && filters.organizationId !== profile.organizationId) {
      throw new Error('Unberechtigt: Kein Zugriff auf Daten anderer Organisationen')
    }
    filters = { ...filters, organizationId: profile.organizationId }
  }

  const conditions = []
  if (filters.organizationId) {
    conditions.push(eq(qualitativeResponses.organizationId, filters.organizationId))
  }
  if (filters.year) {
    conditions.push(eq(qualitativeResponses.reportingYear, filters.year))
  }
  if (filters.indicatorSlug) {
    conditions.push(eq(qualitativeResponses.indicatorSlug, filters.indicatorSlug))
  }

  const rows = await db.query.qualitativeResponses.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      organization: { columns: { name: true } },
      subOrganization: { columns: { name: true } },
    },
    orderBy: [desc(qualitativeResponses.reportingYear), desc(qualitativeResponses.updatedAt)],
    limit: options?.limit === null ? undefined : (options?.limit ?? 500),
  })

  return rows as QualitativeResponseWithRelations[]
}

/**
 * Admin: Export qualitative responses as CSV string
 */
export async function exportQualitativeResponsesCsv(filters: {
  organizationId?: string
  year?: number
  indicatorSlug?: string
}): Promise<string> {
  // No row cap: the export must contain the complete result set
  const rows = await getQualitativeResponsesAdmin(filters, { limit: null })

  const headers = [
    'Organisation',
    'Unterorganisation',
    'Indikator',
    'Jahr',
    'Frage',
    'Antwort (Text)',
    'Antwort (Auswahl)',
    'Antwort (Mehrfach)',
    'Antwort (Datum)',
    'Aktualisiert',
  ]

  const csvRows = rows.map((row) => {
    const indicator = INDICATOR_LABELS[row.indicatorSlug as IndicatorSlug] || row.indicatorSlug
    const config = SCORING_QUESTIONS_MAP[row.questionKey]
    const question = config?.label || row.questionKey
    return [
      csvEscape(row.organization?.name || ''),
      csvEscape(row.subOrganization?.name || ''),
      csvEscape(indicator),
      row.reportingYear.toString(),
      csvEscape(question),
      csvEscape(row.responseText || ''),
      csvEscape(row.responseOption || ''),
      csvEscape(row.responseMultiple ? row.responseMultiple.join(', ') : ''),
      row.responseDate ? formatDateString(row.responseDate) : '',
      row.updatedAt?.toISOString() || '',
    ].join(',')
  })

  return [headers.join(','), ...csvRows].join('\n')
}
