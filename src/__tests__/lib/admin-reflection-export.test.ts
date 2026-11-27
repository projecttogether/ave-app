import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({
  checkAdmin: vi.fn(), reflection: vi.fn(), operating: vi.fn(),
  organizationsWhere: vi.fn(), audit: vi.fn(),
}))
vi.mock('@/app/admin/actions', () => ({ checkAdmin: mocks.checkAdmin }))
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }))
vi.mock('@/lib/datasets/operating', () => ({ readOperatingDataset: mocks.operating }))
vi.mock('@/lib/db', () => ({ db: {
  select: () => ({ from: () => ({ where: mocks.organizationsWhere }) }),
  query: {
    intakeResponses: { findMany: mocks.reflection },
  },
} }))

import { exportIndicatorDataCsv, exportReflectionDataCsv } from '@/app/actions/export'

const orgId = '11111111-1111-4111-8111-111111111111'
const otherOrgId = '22222222-2222-4222-8222-222222222222'
const dialect = new PgDialect()

beforeEach(() => {
  vi.resetAllMocks()
  mocks.checkAdmin.mockResolvedValue({ user: { id: 'admin' } })
  mocks.organizationsWhere.mockResolvedValue([{ id: orgId }])
  mocks.reflection.mockResolvedValue([])
})

describe('admin reflection export', () => {
  it('requires admin access before reading any data', async () => {
    mocks.checkAdmin.mockRejectedValue(new Error('Unauthorized'))
    await expect(exportReflectionDataCsv()).rejects.toThrow('Unauthorized')
    expect(mocks.organizationsWhere).not.toHaveBeenCalled()
    expect(mocks.reflection).not.toHaveBeenCalled()
  })

  it('exports selected organizations without a year filter and keeps test organizations excluded', async () => {
    await exportReflectionDataCsv([orgId])
    const orgQuery = dialect.sqlToQuery(mocks.organizationsWhere.mock.calls[0][0])
    expect(orgQuery.params).toEqual(['%test%', orgId])
    expect(orgQuery.sql).toContain('not ')
    const responseQuery = dialect.sqlToQuery(mocks.reflection.mock.calls[0][0].where)
    expect(responseQuery.params).toEqual([orgId])
    expect(responseQuery.sql).not.toContain('year')
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'data.export', userId: 'admin' }))
  })

  it('does not expand an empty selection to every organization', async () => {
    const csv = await exportReflectionDataCsv([])
    expect(csv).toContain('Antwort (Text)')
    expect(mocks.organizationsWhere).not.toHaveBeenCalled()
    expect(mocks.reflection).not.toHaveBeenCalled()
  })

  it('rejects organization IDs that are not UUIDs before reading any data', async () => {
    await expect(exportReflectionDataCsv(['not-a-uuid'])).rejects.toThrow()
    expect(mocks.organizationsWhere).not.toHaveBeenCalled()
  })

  // Admins may select any organization, even when their account has a home organization.
  it('exports the selected organizations regardless of the admin’s home organization', async () => {
    mocks.organizationsWhere.mockResolvedValue([{ id: otherOrgId }])
    mocks.operating.mockResolvedValue([])
    await exportReflectionDataCsv([otherOrgId])
    expect(dialect.sqlToQuery(mocks.organizationsWhere.mock.calls[0][0]).params).toEqual(['%test%', otherOrgId])
    expect(dialect.sqlToQuery(mocks.reflection.mock.calls[0][0].where).params).toEqual([otherOrgId])
    await exportIndicatorDataCsv(2025, [otherOrgId])
    expect(dialect.sqlToQuery(mocks.operating.mock.calls[0][0].where).params).toEqual([2025, otherOrgId])
  })

  it('exports every non-test organization when all are selected', async () => {
    mocks.organizationsWhere.mockResolvedValue([{ id: orgId }, { id: otherOrgId }])
    await exportReflectionDataCsv()
    expect(dialect.sqlToQuery(mocks.organizationsWhere.mock.calls[0][0]).params).toEqual(['%test%'])
    expect(dialect.sqlToQuery(mocks.reflection.mock.calls[0][0].where).params).toEqual([orgId, otherOrgId])
  })
})
