import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), profile: vi.fn(), subOrganizations: vi.fn(), memberships: vi.fn(),
  operating: vi.fn(), scoring: vi.fn(), reflection: vi.fn(),
  organizations: vi.fn(), organization: vi.fn(), audit: vi.fn(),
}))

vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }))
vi.mock('@/lib/db', () => ({ db: { query: {
  users: { findFirst: mocks.profile },
  subOrganizations: { findMany: mocks.subOrganizations },
  subOrganizationMembers: { findMany: mocks.memberships },
  indicatorData: { findMany: mocks.operating },
  qualitativeResponses: { findMany: mocks.scoring },
  intakeResponses: { findMany: mocks.reflection },
  organizations: { findMany: mocks.organizations, findFirst: mocks.organization },
} } }))

import { exportDataSetsCsv } from '@/app/actions/dataset-export'

const orgId = '11111111-1111-4111-8111-111111111111'
const otherOrgId = '22222222-2222-4222-8222-222222222222'
const siteId = '33333333-3333-4333-8333-333333333333'
const otherSiteId = '44444444-4444-4444-8444-444444444444'
const dialect = new PgDialect()

function query(where: SQL) { return dialect.sqlToQuery(where) }
function profile(roles: string[], organizationId: string | null = orgId) {
  mocks.profile.mockResolvedValue({ id: 'user', organizationId, userRoles: roles.map(roleId => ({ roleId })) })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'user', email: 'user@example.com' } })
  profile(['basic_user'])
  mocks.memberships.mockResolvedValue([{ subOrganizationId: siteId }])
  mocks.subOrganizations.mockResolvedValue([{ id: siteId }])
  mocks.operating.mockResolvedValue([])
  mocks.scoring.mockResolvedValue([])
  mocks.reflection.mockResolvedValue([])
  mocks.organizations.mockResolvedValue([])
  mocks.organization.mockResolvedValue({ id: orgId, name: 'Organisation' })
})

describe('dataset exports', () => {
  it('rejects unauthenticated callers before reading data', async () => {
    mocks.auth.mockResolvedValue(null)
    await expect(exportDataSetsCsv('operating')).rejects.toThrow('Unauthorized')
    expect(mocks.operating).not.toHaveBeenCalled()
  })

  it.each(['operating', 'scoring'] as const)('keeps the assigned site and organization restrictions when a %s filter requests another site', async type => {
    await exportDataSetsCsv(type, { organizationId: otherOrgId, subOrganizationId: otherSiteId, year: 2025 })
    const result = query(mocks[type].mock.calls[0][0].where)
    expect(result.params).toEqual([siteId, orgId, otherOrgId, otherSiteId, 2025])
    expect(result.sql).toContain('"sub_organization_id" in')
    expect(result.sql).not.toContain(' or ')
  })

  it('does not read any site data when the user has no assignments', async () => {
    mocks.memberships.mockResolvedValue([])
    const csv = await exportDataSetsCsv('operating')
    expect(csv).toContain('Gesamteinkauf Lebensmittel')
    expect(mocks.operating).not.toHaveBeenCalled()
  })

  it('does not let basic users export organization-wide reflection answers', async () => {
    await expect(exportDataSetsCsv('reflection')).rejects.toThrow('Zugriff verweigert')
    expect(mocks.reflection).not.toHaveBeenCalled()
  })

  it('lets an admin with a home organization export another organization', async () => {
    profile(['admin'])
    await exportDataSetsCsv('reflection', { organizationId: otherOrgId })
    expect(query(mocks.reflection.mock.calls[0][0].where).params).toEqual([otherOrgId, otherOrgId])
    expect(query(mocks.subOrganizations.mock.calls[0][0].where).params).toEqual([otherOrgId])
  })

  it.each(['org_manager', 'org_view_only'])('restricts reflection exports for %s to their organization', async role => {
    profile([role])
    await exportDataSetsCsv('reflection', { organizationId: otherOrgId })
    const result = query(mocks.reflection.mock.calls[0][0].where)
    expect(result.params).toEqual([orgId, otherOrgId])
    expect(result.sql).not.toContain(' or ')
  })

  it('exports reflection answers for managers even without suborganizations', async () => {
    profile(['org_manager'])
    mocks.subOrganizations.mockResolvedValue([])
    await exportDataSetsCsv('reflection')
    expect(query(mocks.reflection.mock.calls[0][0].where).params).toEqual([orgId])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'data.export', userId: 'user' }))
  })

  it.each(['admin', 'super_admin', 'global_view_only'])('allows global %s readers to filter reflection exports by organization', async role => {
    profile([role], null)
    await exportDataSetsCsv('reflection', { organizationId: otherOrgId })
    expect(query(mocks.reflection.mock.calls[0][0].where).params).toEqual([otherOrgId, otherOrgId])
  })

  it('rejects invalid export filters before querying data', async () => {
    await expect(exportDataSetsCsv('operating', { year: 1 })).rejects.toThrow()
    await expect(exportDataSetsCsv('reflection', { year: 2026 })).rejects.toThrow()
    expect(mocks.operating).not.toHaveBeenCalled()
    expect(mocks.reflection).not.toHaveBeenCalled()
  })
})
