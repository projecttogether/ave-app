'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { intakeResponses, organizations, users } from '@/lib/db/schema'
import { and, asc, eq, inArray, type SQL } from 'drizzle-orm'
import { getReflectionOrganizationIds } from '@/lib/datasets/scope'
import { canViewAllOrgData, isAdmin, isOrgManager, isOrgViewOnly, isGlobalViewOnly, isViewOnly } from '@/lib/roles'
import {
  REFLECTION_QUESTIONS,
  REFLECTION_QUESTIONS_MAP,
} from '@/lib/reflection/constants'
import type { ReflectionFormData } from '@/lib/reflection/constants'
import type { ResponseValue } from '@/lib/questions/types'
import { evaluateQuestionnaire } from '@/lib/questions/completion'
import { errorSummary, userFacingError } from '@/lib/errors'
import { validateAnswers } from '@/lib/questions/validation'
import { logger } from '@/lib/logger'

export type ReflectionDataSet = {
  organizationId: string
  organizationName: string
  responseCount: number
  completeness: number
  lastUpdated: string | null
}

export type ReflectionDataSetDetail = Pick<typeof intakeResponses.$inferSelect,
  'id' | 'indicatorSlug' | 'questionKey' | 'responseType' | 'responseText' |
  'responseOption' | 'responseMultiple' | 'responseDate' | 'responseNumber' |
  'responseBoolean' | 'updatedAt'
>

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

/**
 * Get the current user's organization (for client-side use)
 */
export async function getUserOrganization(): Promise<{ id: string; name: string } | null> {
  const session = await auth()
  if (!session?.user?.email) return null

  const profile = await db.query.users.findFirst({
    where: eq(users.id, session.user.id!),
    with: { organization: true },
  })

  if (!profile?.organizationId || !profile.organization) return null

  return {
    id: profile.organization.id,
    name: 'Meine Organisation',
  }
}

// --- Helper: check user has manager+ access to this org ---
async function assertManagerAccess(organizationId?: string) {
  const session = await auth()
  if (!session?.user?.email) throw new Error('Nicht eingeloggt (reflection)')
  const userId = session.user.id

  const profile = await db.query.users.findFirst({
    where: eq(users.id, userId!),
    with: { userRoles: { with: { role: true } } }
  })
  if (!profile) throw new Error('Profil nicht gefunden')

  const roles = profile.userRoles.map((ur: any) => ur.roleId)

  if (isAdmin(roles) || isGlobalViewOnly(roles)) return { ...profile, roles }

  if (isOrgManager(roles) || isOrgViewOnly(roles)) {
    if (!profile.organizationId) throw new Error('Keine Organisation zugewiesen (Manager)')
    if (organizationId !== undefined && profile.organizationId !== organizationId) throw new Error('Zugriff verweigert (falsche Org-ID)')
    return { ...profile, roles }
  }

  throw new Error('Zugriff verweigert – nur Manager und Admins haben Zugriff')
}

// The regular datasets page uses the same organization scope as its CSV export.
export async function getReflectionDataSets(filters?: {
  organizationId?: string
}): Promise<ReflectionDataSet[]> {
  const profile = await assertManagerAccess()
  // Global readers may switch to any organization; managers keep their own.
  const selected = canViewAllOrgData(profile.roles) && filters?.organizationId ? filters.organizationId : null
  const organizationIds = getReflectionOrganizationIds({
    roles: profile.roles,
    organizationId: selected ?? (isGlobalViewOnly(profile.roles) ? null : profile.organizationId),
  })
  if (organizationIds !== null && organizationIds.length === 0) return []
  const conditions = []
  if (organizationIds !== null) conditions.push(inArray(intakeResponses.organizationId, organizationIds))
  if (filters?.organizationId) conditions.push(eq(intakeResponses.organizationId, filters.organizationId))
  return listReflectionDataSets(conditions)
}

// Admin datasets are organization-wide, including for admins with a home organization.
export async function getAllReflectionDataSets(filters?: {
  organizationId?: string
}): Promise<ReflectionDataSet[]> {
  const profile = await assertManagerAccess()
  if (!isAdmin(profile.roles)) throw new Error('Zugriff verweigert – nur Admins haben Zugriff')
  return listReflectionDataSets(filters?.organizationId ? [eq(intakeResponses.organizationId, filters.organizationId)] : [])
}

async function listReflectionDataSets(conditions: SQL[]): Promise<ReflectionDataSet[]> {

  const rows = await db.select({
    organizationId: intakeResponses.organizationId,
    organizationName: organizations.name,
    questionKey: intakeResponses.questionKey,
    responseText: intakeResponses.responseText,
    responseOption: intakeResponses.responseOption,
    responseMultiple: intakeResponses.responseMultiple,
    responseDate: intakeResponses.responseDate,
    responseNumber: intakeResponses.responseNumber,
    responseBoolean: intakeResponses.responseBoolean,
    updatedAt: intakeResponses.updatedAt,
  })
    .from(intakeResponses)
    .innerJoin(organizations, eq(intakeResponses.organizationId, organizations.id))
    .where(and(...conditions))
    .orderBy(asc(organizations.name))

  const grouped = new Map<string, typeof rows>()
  for (const row of rows) {
    const responses = grouped.get(row.organizationId) ?? []
    responses.push(row)
    grouped.set(row.organizationId, responses)
  }

  return Array.from(grouped.values(), responses => {
    const completion = evaluateQuestionnaire(REFLECTION_QUESTIONS, responses, { includeOptional: true })
    const lastUpdated = responses.reduce<Date | null>((latest, response) => {
      if (!response.updatedAt) return latest
      return !latest || response.updatedAt > latest ? response.updatedAt : latest
    }, null)

    return {
      organizationId: responses[0].organizationId,
      organizationName: responses[0].organizationName,
      responseCount: completion.answeredCount,
      completeness: completion.completeness,
      lastUpdated: lastUpdated?.toISOString() ?? null,
    }
  })
}

export async function getReflectionDataSetDetail(organizationId: string): Promise<{
  rows: ReflectionDataSetDetail[]
  organizationName: string
}> {
  await assertManagerAccess(organizationId)

  const [organization, rows] = await Promise.all([
    db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
      columns: { name: true },
    }),
    db.query.intakeResponses.findMany({
      where: eq(intakeResponses.organizationId, organizationId),
      columns: {
        id: true, indicatorSlug: true, questionKey: true, responseType: true,
        responseText: true, responseOption: true, responseMultiple: true,
        responseDate: true, responseNumber: true, responseBoolean: true, updatedAt: true,
      },
      orderBy: [asc(intakeResponses.indicatorSlug), asc(intakeResponses.questionKey)],
    }),
  ])

  return { rows, organizationName: organization?.name ?? 'Unbekannt' }
}

/**
 * Fetch all reflection/intake responses for an organization
 */
export async function getReflectionResponses(
  organizationId: string
): Promise<ReflectionFormData> {
  await assertManagerAccess(organizationId)

  const rows = await db.query.intakeResponses.findMany({
    where: eq(intakeResponses.organizationId, organizationId),
  })

  // Build empty form data
  const formData: ReflectionFormData = {}
  for (const q of REFLECTION_QUESTIONS) {
    formData[q.key] = { text: '', option: '', multiple: [], date: '' }
  }

  // Fill in existing responses
  for (const row of rows) {
    const config = REFLECTION_QUESTIONS_MAP[row.questionKey]
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
 * Batch upsert all reflection/intake responses for an organization
 */
export async function saveAllReflectionResponses(
  organizationId: string,
  data: ReflectionFormData
): Promise<{ success?: boolean; error?: string }> {
  try {
    const profile = await assertManagerAccess(organizationId)
    
    if (isViewOnly(profile.roles) && !isOrgManager(profile.roles) && !isAdmin(profile.roles)) {
      return { error: 'Keine Berechtigung zum Bearbeiten (View-Only)' }
    }

  const userId = profile.id
  const now = new Date()

  const validated = validateAnswers(REFLECTION_QUESTIONS, data)
  if ('error' in validated) return { error: validated.error }

  const values: (typeof intakeResponses.$inferInsert)[] = []
  for (const q of REFLECTION_QUESTIONS) {
    const answer = validated.data[q.key]
    if (!answer) continue

    values.push({
      organizationId,
      indicatorSlug: q.indicator,
      questionKey: q.key,
      responseType: q.type === 'long text' || q.type === 'short text' ? 'text' : q.type as any,
      responseText: answer.text || null,
      responseOption: answer.option || null,
      responseMultiple: answer.multiple && answer.multiple.length > 0 ? answer.multiple : null,
      responseDate: answer.date ? parseDateString(answer.date) : null,
      responseNumber: null,
      responseBoolean: null,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    })
  }

  if (values.length === 0) return { success: true }

  // Upsert all responses atomically — a mid-batch failure must not leave a
  // half-saved questionnaire
  await db.transaction(async (tx) => {
    for (const val of values) {
      await tx
        .insert(intakeResponses)
        .values(val)
        .onConflictDoUpdate({
          target: [
            intakeResponses.organizationId,
            intakeResponses.indicatorSlug,
            intakeResponses.questionKey,
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

  return { success: true }
  } catch (err: any) {
    logger.error('saveAllReflectionResponses failed', errorSummary(err))
    return { error: userFacingError(err, 'Ein unerwarteter Fehler ist aufgetreten') }
  }
}
