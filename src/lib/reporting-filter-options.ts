import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { indicatorData, operatingReportingPreferences, qualitativeResponses, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { canViewAllOrgData, isAdmin, isOrgManager, isOrgViewOnly } from '@/lib/roles'
import { getUserSubOrganizations } from '@/app/actions/sub-organizations'
import type { ReportingFilterOptions } from './reporting-filters'
import { getAllowedReportingYears } from './reporting-period'
import { reportingToday } from './operating-data/periods'

export const getReportingFilterOptions = cache(async (): Promise<{ options: ReportingFilterOptions; storageKey: string }> => {
  // Pages render in parallel with their layout, so redirect like the layout does.
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const profile = await db.query.users.findFirst({
    where: eq(users.id, session.user.id), with: { userRoles: true, organization: true },
  })
  if (!profile || profile.status === 'deactivated') throw new Error('Unauthorized')
  const roles = profile.userRoles.map(role => role.roleId)
  // All directory and year queries use the existing tenant-scoped database.
  const [organizations, subOrganizations, operatingYears, scoringYears, preferenceYears, formSites] = await Promise.all([
    canViewAllOrgData(roles) ? db.query.organizations.findMany({
      columns: { id: true, name: true }, orderBy: (table, { asc }) => [asc(table.name)],
    }) : undefined,
    db.query.subOrganizations.findMany({
      columns: { id: true, name: true, organizationId: true }, orderBy: (table, { asc }) => [asc(table.name)],
    }),
    db.selectDistinct({ year: indicatorData.reportingYear }).from(indicatorData),
    db.selectDistinct({ year: qualitativeResponses.reportingYear }).from(qualitativeResponses),
    db.selectDistinct({ year: operatingReportingPreferences.reportingYear }).from(operatingReportingPreferences),
    getUserSubOrganizations(),
  ])
  const now = new Date()
  const defaultYear = reportingToday(now).year
  // Empty years still need frequency-selection tasks in the all-years view.
  const reportingYears = getAllowedReportingYears('monthly', now)
  const identity = session.user as typeof session.user & { authenticatedAt?: number; isImpersonating?: boolean }
  return {
    storageKey: `ave-reporting:${profile.id}:${identity.authenticatedAt ?? ''}:${identity.isImpersonating ? 'impersonated' : 'self'}:${profile.organizationId ?? ''}:${roles.slice().sort().join(',')}`,
    options: {
      defaultYear,
      years: Array.from(new Set([...reportingYears, defaultYear, ...operatingYears.map(row => row.year), ...scoringYears.map(row => row.year), ...preferenceYears.map(row => row.year)])).sort((a, b) => b - a),
      organizations,
      subOrganizations,
      organizationName: canViewAllOrgData(roles) ? 'Alle Organisationen' : profile.organization?.name ?? 'Keine Organisation zugewiesen',
      personalOrganizationName: isAdmin(roles) ? profile.organization?.name : undefined,
      canViewReflection: canViewAllOrgData(roles) || (!!profile.organizationId && (isOrgManager(roles) || isOrgViewOnly(roles))),
      formSubOrgIds: formSites.map(site => site.id),
    },
  }
})
