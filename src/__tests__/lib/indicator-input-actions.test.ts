import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), profile: vi.fn(), kitchen: vi.fn(), publish: vi.fn(), transaction: vi.fn(), frozen: vi.fn() }))
vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/db', () => ({ db: { query: { users: { findFirst: mocks.profile }, subOrganizations: { findFirst: mocks.kitchen } }, transaction: mocks.transaction } }))
vi.mock('@/lib/operating-data/write', () => ({ publishOperatingTransaction: mocks.publish }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/app/actions/data-freeze', () => ({ isYearFrozen: mocks.frozen }))
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
import { saveIndicatorData, saveFoodWasteBaseData } from '@/app/actions/indicators'

const input = { organizationId: 'org', subOrganizationId: 'sub', reportingYear: 2025, reportingMonth: 1 }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'user', email: 'user@example.com' } })
  mocks.profile.mockResolvedValue({ organizationId: 'org', userRoles: [{ roleId: 'org_manager' }] })
  mocks.kitchen.mockResolvedValue({ id: 'sub', organizationId: 'org' })
  mocks.frozen.mockResolvedValue(false)
  mocks.transaction.mockImplementation(callback => callback('transaction'))
  mocks.publish.mockResolvedValue({ revisions: {}, baselineRevision: 0, modeRevision: 1 })
})
it('rejects noncanonical direct action values before normalization', async () => {
  for (const fields of [{ foodWasteAmount: 'Infinity' }, { totalFoodSpend: '-1' }, { totalFoodSpend: '1e3' }]) expect((await saveIndicatorData({ ...input, ...fields })).error).toBeTruthy()
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it('routes partial edits and expected revisions through the common transaction writer', async () => {
  mocks.publish.mockRejectedValue(new Error('Fairtrade-Kaffee darf Kaffee gesamt nicht übersteigen.'))
  expect((await saveIndicatorData({ ...input, revision: 4, coffeeSpend: '70' })).error).toContain('Fairtrade-Kaffee')
  expect(mocks.publish).toHaveBeenCalledWith('transaction', 'user', expect.objectContaining({ entries: [expect.objectContaining({ expectedRevision: 4, values: { coffeeSpend: '70' } })] }))
})
it('keeps measured zero and filters out scoring and system fields', async () => {
  expect(await saveIndicatorData({ ...input, coffeeSpend: '100.00', fairTradeCoffeeSpend: '0', fairTradeScoringResult: '99' })).toMatchObject({ success: true })
  expect(mocks.publish.mock.calls[0][2].entries[0].values).toEqual({ coffeeSpend: '100', fairTradeCoffeeSpend: '0' })
})
it('does not reinterpret null months as annual, bypass freezing, or accept unversioned baselines', async () => {
  expect((await saveIndicatorData({ ...input, reportingMonth: null })).error).toContain('Quartalswerte')
  expect((await saveIndicatorData({ ...input, reportingMonth: 13 })).error).toBeTruthy()
  mocks.frozen.mockResolvedValue(true)
  expect((await saveIndicatorData({ ...input, totalFoodSpend: '10' })).error).toContain('gesperrt')
  expect((await saveFoodWasteBaseData('sub', null, 100)).error).toContain('Revision')
  expect(mocks.transaction).not.toHaveBeenCalled()
})
