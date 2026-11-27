'use server'

import { getDataScope } from '@/lib/access'
import { withDataScope } from '@/lib/db/scope-context'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { dataFreezes, indicatorReportSnapshots, subOrganizationMembers, subOrganizations, users } from '@/lib/db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'
import { canViewAllOrgData, isSubOrganizationScoped, isViewOnly, isAdmin, isOrgManager, isOrgViewOnly } from '@/lib/roles'
import { uuidSchema, yearSchema } from '@/lib/validation'
import { z } from 'zod'
import { loadCalculationReport, archiveCalculationReport } from '@/lib/indicators/report-data'
import type { IndicatorScope } from '@/lib/indicators/scope'
import type { Granularity } from '@/lib/indicators/aggregation'

const granularitySchema = z.enum(['monthly', 'yearly', 'quarterly', 'auto']).nullable()

async function access(subOrgId?: string, write = false, requestedOrganizationId?: string) {
    const session = await auth()
    if (!session?.user?.id) throw new Error('Nicht eingeloggt')
    if (subOrgId) uuidSchema.parse(subOrgId)
    const profile = await db.query.users.findFirst({ where: eq(users.id, session.user.id), with: { userRoles: true } })
    if (!profile) throw new Error('Unberechtigt')
    const roles = profile.userRoles.map(r => r.roleId)
    if (!canViewAllOrgData(roles) && !isSubOrganizationScoped(roles) && !isOrgManager(roles) && !isOrgViewOnly(roles)) throw new Error('Unberechtigt')
    if (write && isViewOnly(roles) && !isAdmin(roles) && !isOrgManager(roles)) throw new Error('Keine Berechtigung zum Archivieren')
    const dataScope = await getDataScope({ organizationId: requestedOrganizationId, subOrganizationId: subOrgId })
    const organizationId = dataScope.organizationId
    if (!canViewAllOrgData(roles) && !organizationId) throw new Error('Unberechtigt')
    const scope: IndicatorScope = { organizationId, subOrganizationId: subOrgId }
    if (isSubOrganizationScoped(roles)) {
        const memberships = await db.query.subOrganizationMembers.findMany({ where: eq(subOrganizationMembers.userId, profile.id) })
        scope.accessibleSubOrgIds = memberships.map(m => m.subOrganizationId)
        if (subOrgId && !scope.accessibleSubOrgIds.includes(subOrgId)) throw new Error('Unberechtigt')
    }
    let canArchive = false
    if (subOrgId) {
        const kitchen = await db.query.subOrganizations.findFirst({ where: eq(subOrganizations.id, subOrgId) })
        if (!kitchen || (organizationId && kitchen.organizationId !== organizationId)) throw new Error('Unberechtigt')
        if (write && kitchen.organizationId !== profile.organizationId) throw new Error('Nur Berichte der eigenen Organisation dürfen archiviert werden.')
        canArchive = kitchen.organizationId === profile.organizationId && (!isViewOnly(roles) || isAdmin(roles) || isOrgManager(roles))
    }
    return { scope, userId: profile.id, canArchive, dataScope }
}

export async function getCalculationReport(year: number, granularity: Granularity | null, subOrgId?: string, organizationId?: string) {
    yearSchema.parse(year); granularitySchema.parse(granularity)
    const authorized = await access(subOrgId, false, organizationId)
    const report = await withDataScope(authorized.dataScope, () => db.transaction(tx => loadCalculationReport(tx, authorized.scope, year, granularity), { isolationLevel: 'repeatable read', accessMode: 'read only' }))
    const frozen = await frozenAt(year)
    // A frozen year's authoritative report is the one archived when it was frozen.
    return { report, canArchive: authorized.canArchive && !frozen, frozenAt: frozen?.toISOString() ?? null }
}

async function frozenAt(year: number) {
    const freeze = await db.query.dataFreezes.findFirst({ where: eq(dataFreezes.year, year), columns: { frozenAt: true } })
    return freeze ? freeze.frozenAt ?? new Date(0) : null
}

const FROZEN_ARCHIVE = 'Das Berichtsjahr ist gesperrt. Maßgeblich ist der beim Sperren archivierte Bericht.'

export async function saveCalculationReport(year: number, granularity: Granularity | null, subOrgId: string, expectedRevision: string, expectedFormulaVersion: string) {
    yearSchema.parse(year); granularitySchema.parse(granularity); uuidSchema.parse(subOrgId)
    const authorized = await access(subOrgId, true)
    // The database trigger enforces the same rule; this gives the user-facing reason first.
    if (await frozenAt(year)) throw new Error(FROZEN_ARCHIVE)
    return withDataScope(authorized.dataScope, () => db.transaction(async tx => {
        const report = await loadCalculationReport(tx, authorized.scope, year, granularity)
        if (report.inputRevision !== expectedRevision || report.formulaVersion !== expectedFormulaVersion) throw new Error('Die Daten wurden inzwischen geändert. Bitte die Berechnung neu laden und prüfen.')
        return archiveCalculationReport(tx, report, authorized.userId)
    }, { isolationLevel: 'repeatable read' }))
}

export async function listCalculationReports(subOrgId: string, year: number) {
    uuidSchema.parse(subOrgId); yearSchema.parse(year)
    const authorized = await access(subOrgId)
    return db.query.indicatorReportSnapshots.findMany({
        where: and(eq(indicatorReportSnapshots.subOrganizationId, subOrgId), eq(indicatorReportSnapshots.reportingYear, year), authorized.scope.organizationId ? eq(indicatorReportSnapshots.organizationId, authorized.scope.organizationId) : undefined),
        columns: { id: true, formulaVersion: true, createdAt: true, granularity: true, inputRevision: true },
        // freezeYear archives in the transaction that records the freeze, so both share now().
        // Relational queries alias the table; reference columns through the callback.
        extras: (snapshot) => ({ atFreeze: sql<boolean>`exists(select 1 from data_freezes f where f.year = ${snapshot.reportingYear} and f.frozen_at = ${snapshot.createdAt})`.as('at_freeze') }),
        orderBy: [desc(indicatorReportSnapshots.createdAt)],
    })
}

export async function getArchivedCalculationReport(id: string) {
    uuidSchema.parse(id)
    const session = await auth()
    if (!session?.user?.id) throw new Error('Nicht eingeloggt')
    const snapshot = await db.query.indicatorReportSnapshots.findFirst({ where: eq(indicatorReportSnapshots.id, id), columns: { subOrganizationId: true, organizationId: true } })
    if (!snapshot) throw new Error('Bericht nicht gefunden')
    const authorized = await access(snapshot.subOrganizationId)
    if (authorized.scope.organizationId && authorized.scope.organizationId !== snapshot.organizationId) throw new Error('Unberechtigt')
    const full = await db.query.indicatorReportSnapshots.findFirst({ where: eq(indicatorReportSnapshots.id, id), columns: { payload: true } })
    if (!full) throw new Error('Bericht nicht gefunden')
    return full.payload
}
