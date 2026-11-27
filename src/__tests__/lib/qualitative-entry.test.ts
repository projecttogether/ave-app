import { beforeEach, expect, it, vi } from 'vitest'
import { qualitativePeriodAdapter } from '@/lib/forms/qualitative-entry'
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }))
vi.mock('@/app/actions/qualitative', () => ({ getQualitativeResponses: mocks.load, saveAllQualitativeResponses: mocks.save }))
vi.mock('@/app/actions/data-freeze', () => ({ isYearFrozen: vi.fn().mockResolvedValue(false) }))
const period = { organizationId: 'org', subOrganizationId: 'kitchen', year: 2025, month: 0 }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.load.mockResolvedValue({ question: { option: 'Ja' } })
  mocks.save.mockResolvedValue({ success: true })
})
it('serializes writes across editor mounts and loads after the last write', async () => {
  let finish!: (result: { success: true }) => void
  mocks.save.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const a = qualitativePeriodAdapter(vi.fn())
  const b = qualitativePeriodAdapter(vi.fn())
  const first = a.save(period, { question: { option: 'Ja' } })
  const second = b.save(period, { question: { option: 'Nein' } })
  const load = b.load(period)
  await Promise.resolve(); await Promise.resolve()
  expect(mocks.save).toHaveBeenCalledTimes(1)
  expect(mocks.load).not.toHaveBeenCalled()
  finish({ success: true })
  await Promise.all([first, second, load])
  expect(mocks.save).toHaveBeenLastCalledWith('org', 'kitchen', 2025, { question: { option: 'Nein' } })
  expect(mocks.load).toHaveBeenCalledTimes(1)
})
it('propagates errors and lets the next save retry', async () => {
  mocks.save.mockResolvedValueOnce({ error: 'Frozen' })
  const adapter = qualitativePeriodAdapter(vi.fn())
  await expect(adapter.save(period, {})).rejects.toThrow('Frozen')
  await expect(adapter.save(period, {})).resolves.toBeUndefined()
})
