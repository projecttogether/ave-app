'use server'

import { db } from '@/lib/db'
import { indicatorData, operatingReportingPreferences, qualitativeResponses, subOrganizations } from '@/lib/db/schema'
import { getOperatingTasks, type OperatingTask } from '@/lib/operating-data/preferences'
import { eq, and, inArray, isNull, sql } from 'drizzle-orm'
import { getUserScope } from '@/lib/datasets/scope'
import { uuidSchema } from '@/lib/validation'
import { SCORING_QUESTIONS } from '@/lib/qualitative/constants'
import { evaluateQuestionnaire } from '@/lib/questions/completion'

export type MissingDataEntry = {
    subOrganizationId: string
    subOrganizationName: string
    organizationName?: string
    operatingTasks: OperatingTask[]
    needsFrequency: boolean
    canWriteOperating: boolean
    missingScoring: number // unanswered required, visible scoring questions
    firstMissingScoringKey?: string | null
}

// Tasks use the same resolved scope as the dataset lists, including an admin's organization selection.
export async function getMissingData(year: number, requested: { organizationId?: string; subOrganizationId?: string } = {}): Promise<MissingDataEntry[]> {
    if (requested.subOrganizationId && !uuidSchema.safeParse(requested.subOrganizationId).success) return []
    const scope = await getUserScope({ organizationId: requested.organizationId })
    if (scope.accessibleSubOrgIds !== null && scope.accessibleSubOrgIds.length === 0) return []

    const conditions = []
    if (scope.accessibleSubOrgIds !== null) conditions.push(inArray(subOrganizations.id, scope.accessibleSubOrgIds))
    if (scope.organizationId) conditions.push(eq(subOrganizations.organizationId, scope.organizationId))
    if (requested.subOrganizationId) conditions.push(eq(subOrganizations.id, requested.subOrganizationId))
    const accessibleSubOrgs = await db.query.subOrganizations.findMany({
        where: conditions.length ? and(...conditions) : undefined,
        columns: { id: true, name: true },
        extras: { canWrite: sql<boolean>`app_private.can_write(${subOrganizations.organizationId}, ${subOrganizations.id})`.as('can_write') },
        orderBy: (table, { asc }) => [asc(table.name)],
    })

    if (accessibleSubOrgs.length === 0) return []
    const subOrgIds = accessibleSubOrgs.map(s => s.id)

    // Parallel fetch for operations and scoring for the specific year
    const [opsData, scoringData, preferences] = await Promise.all([
        db.query.indicatorData.findMany({
            where: and(
                inArray(indicatorData.subOrganizationId, subOrgIds),
                eq(indicatorData.reportingYear, year), isNull(indicatorData.supersededAt)
            )
        }),
        db.query.qualitativeResponses.findMany({
            where: and(
                inArray(qualitativeResponses.subOrganizationId, subOrgIds),
                eq(qualitativeResponses.reportingYear, year)
            )
        }),
        db.query.operatingReportingPreferences.findMany({ where: and(inArray(operatingReportingPreferences.subOrganizationId, subOrgIds), eq(operatingReportingPreferences.reportingYear, year)) })
    ])

    return accessibleSubOrgs.map((subOrg) => {
        const preference = preferences.find(p => p.subOrganizationId === subOrg.id)
        const operatingTasks = getOperatingTasks(year, preference?.frequency ?? null,
            opsData.filter(row => row.subOrganizationId === subOrg.id), preference)

        const scoringForSubOrg = scoringData.filter(d => d.subOrganizationId === subOrg.id)
        
        const completion = evaluateQuestionnaire(SCORING_QUESTIONS, scoringForSubOrg)

        return {
            subOrganizationId: subOrg.id,
            subOrganizationName: subOrg.name,
            organizationName: undefined,
            operatingTasks,
            needsFrequency: !preference,
            canWriteOperating: Boolean(subOrg.canWrite),
            missingScoring: completion.missingKeys.length,
            firstMissingScoringKey: completion.missingKeys[0] ?? null,
        }
    })
}
