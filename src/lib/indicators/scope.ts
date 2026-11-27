import { eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

// Callers authenticate and authorize this scope before loading analytics.
export type IndicatorScope = { organizationId: string | null; subOrganizationId?: string; accessibleSubOrgIds?: string[] }

export function indicatorScopeConditions(table: { organizationId: AnyPgColumn; subOrganizationId: AnyPgColumn }, scope: IndicatorScope): SQL[] {
    const conditions: SQL[] = []
    if ('supersededAt' in table) conditions.push(sql`${(table as typeof table & { supersededAt: AnyPgColumn }).supersededAt} IS NULL`)
    if (scope.organizationId) conditions.push(eq(table.organizationId, scope.organizationId))
    else {
        conditions.push(sql`${table.organizationId} not in (select id from organizations where name ilike '%test%')`)
        conditions.push(sql`${table.subOrganizationId} not in (select id from sub_organizations where name ilike '%test%')`)
    }
    if (scope.subOrganizationId) conditions.push(eq(table.subOrganizationId, scope.subOrganizationId))
    if (scope.accessibleSubOrgIds) conditions.push(scope.accessibleSubOrgIds.length ? inArray(table.subOrganizationId, scope.accessibleSubOrgIds) : sql`false`)
    return conditions
}
