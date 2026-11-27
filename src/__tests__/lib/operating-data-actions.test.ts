import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_OPERATING_DATA, type OperatingPeriod } from '@/lib/operating-data/fields'

const mocks = vi.hoisted(() => ({ load: vi.fn(), frozen: vi.fn(), publish: vi.fn(), transaction: vi.fn() }))
vi.mock('@/app/actions/indicators', () => ({ getIndicatorAndBaseData: mocks.load }))
vi.mock('@/app/actions/data-freeze', () => ({ isYearFrozen: mocks.frozen }))
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: 'user' } }) }))
vi.mock('@/lib/db', () => ({ db: { transaction: mocks.transaction } }))
vi.mock('@/lib/operating-data/write', () => ({ publishOperatingTransaction: mocks.publish }))
vi.mock('@/lib/operating-data/preference-store', () => ({ checkPreferenceRevision: async () => ({ frequency: 'monthly', revision: 2 }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { loadOperatingDataDraft, saveOperatingDataDraft } from '@/app/actions/operating-data'

const period: OperatingPeriod = { organizationId: 'org', subOrganizationId: 'kitchen', year: 2025, month: 1 }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.frozen.mockResolvedValue(false)
  mocks.transaction.mockImplementation(callback => callback('transaction'))
  mocks.publish.mockResolvedValue({ revisions: { '2025:month:1': 5 }, baselineRevision: 2, modeRevision: 1 })
})

describe('operating-data action adapter', () => {
  it('loads decimal strings and concurrency revisions even without an operating record', async () => {
    mocks.load.mockResolvedValue({ indicatorData: null, baseData: { foodWasteBaseAmount: '1000.000001', foodWasteBaseDate: '2024-02-03', baselineRevision: 3 } })
    expect(await loadOperatingDataDraft(period)).toMatchObject({ data: { totalFoodSpend: '', foodWasteBaseAmount: '1000.000001', foodWasteBaseDate: '2024-02-03' }, frozen: false, revision: 0, baselineRevision: 3 })
    mocks.load.mockResolvedValue({ indicatorData: { totalFoodSpend: '0', revision: 4 }, baseData: null })
    expect(await loadOperatingDataDraft(period)).toMatchObject({ data: { totalFoodSpend: '0', foodWasteBaseAmount: '' }, revision: 4 })
  })
  it('sends the original period, expected revision and stable request id to one transaction', async () => {
    const result = await saveOperatingDataDraft({ period, data: { ...EMPTY_OPERATING_DATA, foodWasteAmount: '0' }, expectedRevision: 4, requestId: 'stable-token' })
    expect(result).toEqual({ success: true, revision: 5, baselineRevision: 2, modeRevision: 1 })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.publish).toHaveBeenCalledWith('transaction', 'user', expect.objectContaining({ subOrganizationId: 'kitchen', year: 2025, requestId: 'stable-token', baseline: undefined,
      entries: [expect.objectContaining({ period: { kind: 'month', year: 2025, index: 1 }, expectedRevision: 4, values: expect.objectContaining({ foodWasteAmount: '0', totalFoodSpend: null }) })] }))
  })
  it('sends explicit baseline clearing in the same publication as data', async () => {
    mocks.publish.mockRejectedValue(new Error('Basiswert wurde inzwischen geändert.'))
    const result = await saveOperatingDataDraft({ period, data: { ...EMPTY_OPERATING_DATA, foodWasteAmount: '25' }, baseline: { foodWasteBaseAmount: '', foodWasteBaseDate: '' }, expectedBaselineRevision: 7 })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.publish).toHaveBeenCalledWith('transaction', 'user', expect.objectContaining({ baseline: { amount: null, date: null, expectedRevision: 7 }, entries: [expect.anything()] }))
    expect(result).toEqual({ error: 'Basiswert wurde inzwischen geändert.' })
  })
  it('enforces frozen and future years even for baseline-only edits', async () => {
    const baseline = { foodWasteBaseAmount: '100', foodWasteBaseDate: '' }
    mocks.frozen.mockResolvedValue(true)
    expect(await saveOperatingDataDraft({ period, baseline })).toHaveProperty('error')
    mocks.frozen.mockResolvedValue(false)
    expect(await saveOperatingDataDraft({ period: { ...period, year: new Date().getFullYear() + 1 }, baseline })).toHaveProperty('error')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('rejects invalid amounts before entering a write transaction', async () => {
    for (const amount of [-1, Infinity, NaN]) {
      expect(await saveOperatingDataDraft({ period, data: { ...EMPTY_OPERATING_DATA, totalFoodSpend: amount } })).toHaveProperty('error')
      expect(await saveOperatingDataDraft({ period, data: EMPTY_OPERATING_DATA, baseline: { foodWasteBaseAmount: amount, foodWasteBaseDate: '' } })).toHaveProperty('error')
    }
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
