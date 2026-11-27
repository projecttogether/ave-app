import { beforeEach, describe, expect, it, vi } from 'vitest'
import reference from '../fixtures/indicator-reference.json'
import { buildCalculationReport } from '@/lib/indicators/report'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), memberships: vi.fn(), kitchen: vi.fn(), snapshots: vi.fn(), snapshot: vi.fn(), transaction: vi.fn(), load: vi.fn(), archive: vi.fn(), directory: vi.fn(), org: vi.fn(), orgs: vi.fn(), freeze: vi.fn() }))
vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/db', () => ({ db: { query: {
    users: { findFirst: mocks.user }, subOrganizationMembers: { findMany: mocks.memberships }, subOrganizations: { findFirst: mocks.kitchen, findMany: mocks.directory }, organizations: { findFirst: mocks.org, findMany: mocks.orgs },
    indicatorReportSnapshots: { findMany: mocks.snapshots, findFirst: mocks.snapshot },
    dataFreezes: { findFirst: mocks.freeze },
}, transaction: mocks.transaction } }))
vi.mock('@/lib/indicators/report-data', () => ({ loadCalculationReport: mocks.load, archiveCalculationReport: mocks.archive }))

import { getCalculationReport, getArchivedCalculationReport, listCalculationReports, saveCalculationReport } from '@/app/actions/calculation-reports'
const org = reference.inputs.kitchens[0].organizationId
const sub = reference.inputs.kitchens[0].id
const other = '00000000-0000-4000-8000-000000000099'
const report = buildCalculationReport(reference.inputs, 'current-revision')
const tx = { query: {} }

beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ user: { id: 'user-a' } })
    mocks.user.mockResolvedValue({ id: 'user-a', organizationId: org, userRoles: [{ roleId: 'org_manager' }] })
    mocks.directory.mockResolvedValue([{ id: sub, organizationId: org, name: 'Kitchen A' }])
    mocks.org.mockResolvedValue({ name: 'Organization A' })
    mocks.orgs.mockResolvedValue([{ id: org, name: 'Organization A' }])
    mocks.kitchen.mockResolvedValue({ id: sub, organizationId: org })
    mocks.memberships.mockResolvedValue([{ subOrganizationId: sub }])
    mocks.transaction.mockImplementation(async callback => callback(tx))
    mocks.load.mockResolvedValue(report)
    mocks.archive.mockResolvedValue('saved-report')
    mocks.snapshots.mockResolvedValue([])
})

describe('calculation report authorization and revisions', () => {
    it('reads all inputs in one repeatable-read transaction with the authorized scope', async () => {
        const result = await getCalculationReport(2026, null, sub)
        expect(result.report).toBe(report)
        expect(result.canArchive).toBe(true)
        expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'repeatable read', accessMode: 'read only' })
        expect(mocks.load).toHaveBeenCalledWith(tx, { organizationId: org, subOrganizationId: sub }, 2026, null)
    })
    it('rejects foreign kitchens before reading report inputs or archive lists', async () => {
        mocks.kitchen.mockResolvedValue({ id: other, organizationId: other })
        await expect(getCalculationReport(2026, null, other)).rejects.toThrow(/Unberechtigt|Zugriff verweigert/)
        await expect(listCalculationReports(other, 2026)).rejects.toThrow(/Unberechtigt|Zugriff verweigert/)
        expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.snapshots).not.toHaveBeenCalled()
    })
    it('limits basic users to current kitchen memberships', async () => {
        mocks.user.mockResolvedValue({ id: 'user-a', organizationId: org, userRoles: [{ roleId: 'basic_user' }] })
        await expect(getCalculationReport(2026, null, other)).rejects.toThrow(/Unberechtigt|Zugriff verweigert/)
        await getCalculationReport(2026, null)
        expect(mocks.load).toHaveBeenCalledWith(tx, { organizationId: org, subOrganizationId: undefined, accessibleSubOrgIds: [sub] }, 2026, null)
    })
    it('does not load archived contents before checking membership and organization', async () => {
        mocks.snapshot.mockResolvedValue({ subOrganizationId: other, organizationId: other })
        mocks.kitchen.mockResolvedValue({ id: other, organizationId: other })
        await expect(getArchivedCalculationReport(other)).rejects.toThrow(/Unberechtigt|Zugriff verweigert/)
        expect(mocks.snapshot).toHaveBeenCalledTimes(1)
        expect(mocks.snapshot.mock.calls[0][0].columns).toEqual({ subOrganizationId: true, organizationId: true })
    })
    it('prevents viewing old organization archives after a kitchen changes owner', async () => {
        mocks.snapshot.mockResolvedValue({ subOrganizationId: sub, organizationId: other })
        await expect(getArchivedCalculationReport(other)).rejects.toThrow(/Unberechtigt|Zugriff verweigert/)
        expect(mocks.snapshot).toHaveBeenCalledTimes(1)
    })
    it('returns archived contents without recalculating them', async () => {
        const archived = { ...report, formulaVersion: 'older-policy', indicators: [] }
        mocks.snapshot.mockResolvedValueOnce({ subOrganizationId: sub, organizationId: org }).mockResolvedValueOnce({ payload: archived })
        expect(await getArchivedCalculationReport(other)).toBe(archived)
        expect(mocks.load).not.toHaveBeenCalled()
    })
    it('requires the reviewed data and formula revisions before saving', async () => {
        await expect(saveCalculationReport(2026, null, sub, 'stale-revision', report.formulaVersion)).rejects.toThrow('geändert')
        await expect(saveCalculationReport(2026, null, sub, report.inputRevision, 'old-formula')).rejects.toThrow('geändert')
        expect(mocks.archive).not.toHaveBeenCalled()
        expect(await saveCalculationReport(2026, null, sub, report.inputRevision, report.formulaVersion)).toBe('saved-report')
    })
    it('keeps the report archived at freeze time authoritative for a frozen year', async () => {
        const frozenAt = new Date('2027-01-15T10:00:00Z')
        mocks.freeze.mockResolvedValue({ frozenAt })
        expect(await getCalculationReport(2026, null, sub)).toMatchObject({ canArchive: false, frozenAt: frozenAt.toISOString() })
        await expect(saveCalculationReport(2026, null, sub, report.inputRevision, report.formulaVersion)).rejects.toThrow('beim Sperren archivierte Bericht')
        expect(mocks.archive).not.toHaveBeenCalled()
    })
    it('lets view-only users read but rejects archive writes', async () => {
        mocks.user.mockResolvedValue({ id: 'user-a', organizationId: org, userRoles: [{ roleId: 'org_view_only' }] })
        expect((await getCalculationReport(2026, null, sub)).canArchive).toBe(false)
        await expect(saveCalculationReport(2026, null, sub, report.inputRevision, report.formulaVersion)).rejects.toThrow('Archivieren')
        expect(mocks.archive).not.toHaveBeenCalled()
    })
    it('rejects unauthenticated access and invalid periods', async () => {
        mocks.auth.mockResolvedValue(null)
        await expect(getCalculationReport(2026, null, sub)).rejects.toThrow('eingeloggt')
        await expect(getCalculationReport(1, null, sub)).rejects.toThrow()
        expect(mocks.load).not.toHaveBeenCalled()
    })
})
