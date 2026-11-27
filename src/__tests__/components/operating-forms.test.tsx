// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_OPERATING_DATA } from '@/lib/operating-data/fields'

const actions = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), preference: vi.fn(), toast: vi.fn(), replace: vi.fn(), push: vi.fn(), query: 'year=2025' }))
const frequency = vi.hoisted(() => ({ current: 'monthly' as 'monthly' | 'quarterly' | 'yearly' }))

vi.mock('@/app/actions/reporting-preferences', () => ({
  getReportingPreference: actions.preference,
  setReportingFrequency: async (input: { frequency: 'monthly' | 'quarterly' | 'yearly' }) => {
    frequency.current = input.frequency
    return { data: { kind: 'saved', frequency: input.frequency, revision: 1 } }
  },
  confirmAnnualReporting: vi.fn(),
}))
vi.mock('@/app/actions/operating-data', () => ({ loadOperatingDataDraft: actions.load, saveOperatingDataDraft: actions.save }))
vi.mock('@/app/actions/sub-organizations', () => ({ getUserSubOrganizations: async () => [
  { id: 'kitchen', name: 'Küche', organizationId: 'org' }, { id: 'other-kitchen', name: 'Andere Küche', organizationId: 'org' },
] }))
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: actions.toast }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/form/operating',
  useRouter: () => ({ push: actions.push, replace: actions.replace }),
  useSearchParams: () => new URLSearchParams(actions.query),
}))
import { DataEntryForm } from '@/components/dashboard/data-entry-form'
import { IndicatorDataEntryForm } from '@/components/dashboard/indicator-data-entry-form'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  frequency.current = 'monthly'
  actions.query = 'year=2025'
  actions.push.mockReset()
  actions.replace.mockReset()
  actions.preference.mockReset().mockImplementation(async () => ({ data: { frequency: frequency.current, revision: 1, source: 'user', suggestion: null,
    canWrite: true, frozen: false, yearClosed: true, existingPeriods: [], annual: null } }))
  HTMLElement.prototype.scrollIntoView = vi.fn()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  actions.load.mockReset().mockImplementation(async period => ({ frozen: false, data: {
    ...EMPTY_OPERATING_DATA, foodWasteAmount: period.month === 0 ? 200 : 100, foodWasteBaseAmount: 1200,
  } }))
  actions.save.mockReset().mockResolvedValue({ success: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllTimers()
  vi.useRealTimers()
})
async function enter(id: string, value: string) {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>(`#${id}`)!
    expect(input).not.toBeNull()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(text: string) {
  await act(async () => {
    const button = [...container.querySelectorAll('button')].find(button => button.textContent?.includes(text))!
    expect(button).not.toBeUndefined()
    button.click()
  })
}
async function select(id: string, text: string) {
  await act(async () => container.querySelector(`#${id}`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
  await act(async () => {
    const option = [...document.querySelectorAll('[role="option"]')].find(option => option.textContent === text)!
    expect(option).toBeDefined()
    option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

describe('form site in the URL', () => {
  it('records the initially selected site so form-to-form links reopen it', async () => {
    actions.replace.mockReset()
    await act(async () => root.render(<DataEntryForm defaultYear={2025} />))
    expect(actions.replace).toHaveBeenCalledWith('/form/operating?year=2025&subOrgId=kitchen')
  })
})

for (const form of ['general', 'indicator'] as const) {
  describe(`${form} operating form`, () => {
    async function mount() {
      await act(async () => root.render(form === 'general'
        ? <DataEntryForm defaultYear={2025} />
        : <IndicatorDataEntryForm slug="food_waste" currentSubOrgId="kitchen" currentYear={2025} />))
    }

    it('switches untouched periods without saving or clearing their loaded values', async () => {
      await mount()
      await click('Jährlich')
      await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
      expect(actions.save).not.toHaveBeenCalled()
      expect(container.querySelector<HTMLInputElement>('#foodWasteAmount')!.value).toContain('200')
      await click('Monatlich')
      await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
      expect(actions.save).not.toHaveBeenCalled()
      expect(container.querySelector<HTMLInputElement>('#foodWasteAmount')!.value).toContain('100')
      expect(container.querySelector<HTMLInputElement>('#foodWasteBaseAmount')!.value).toContain('1200')
    })

    it('does not autosave loaded values and saves pending edits under the old period when switching', async () => {
      await mount()
      await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
      expect(actions.save).not.toHaveBeenCalled()
      await enter('foodWasteAmount', '55')
      await click('Jährlich')
      expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({
        period: { organizationId: 'org', subOrganizationId: 'kitchen', year: 2025, month: 5 },
        data: expect.objectContaining({ foodWasteAmount: '55' }), baseline: undefined,
      }))
      expect(container.querySelector<HTMLInputElement>('#foodWasteAmount')!.value).toContain('200')
    })

    it('keeps a cleared baseline retryable after failure and only shows saved after success', async () => {
      actions.save.mockResolvedValueOnce({ error: 'Basiswert konnte nicht gespeichert werden.' }).mockResolvedValue({ success: true })
      await mount()
      await enter('foodWasteBaseAmount', '')
      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(actions.save.mock.calls[0][0]).toMatchObject({ baseline: { foodWasteBaseAmount: '' } })
      expect(actions.save.mock.calls[0][0].data).toBeUndefined()
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('Basiswert konnte nicht gespeichert')
      await click('Erneut versuchen')
      expect(actions.save).toHaveBeenCalledTimes(2)
      expect(container.querySelector('[role="alert"]')).toBeNull()
      expect(container.textContent).toContain('Eingaben gespeichert')
    })

    it('waits for the previous editor’s pending write before loading a remounted form', async () => {
      let finishSave!: (result: { success: boolean }) => void
      actions.save.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve }))
      await mount()
      await enter('foodWasteAmount', '55')
      await act(async () => root.unmount())
      root = createRoot(container)
      await mount()
      expect(actions.load).toHaveBeenCalledTimes(1)
      expect(container.querySelector('#foodWasteAmount:not(:disabled)')).toBeNull()
      await act(async () => {
        actions.load.mockResolvedValue({ frozen: false, data: { ...EMPTY_OPERATING_DATA, foodWasteAmount: '55' } })
        finishSave({ success: true })
      })
      expect(actions.load).toHaveBeenCalledTimes(2)
      expect(container.querySelector<HTMLInputElement>('#foodWasteAmount')!.value).toContain('55')
    })

    it('opens quarterly entry when the initial saved frequency is quarterly', async () => {
      frequency.current = 'quarterly'
      await mount()
      expect(form === 'general' ? actions.push : actions.replace).toHaveBeenCalledWith('/operating-periods?year=2025&subOrgId=kitchen&quarter=1&workflow=quarter')
      expect(actions.save).not.toHaveBeenCalled()
    })

    it.each(['kitchen', 'year', 'month'])('locks inputs during a %s switch and preserves the old selection if saving fails', async scope => {
      let finishSave!: (result: { error: string }) => void
      actions.save.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve }))
      await mount(); await enter('foodWasteAmount', '55')
      await select(scope === 'kitchen' ? 'sub-org' : scope, scope === 'kitchen' ? 'Andere Küche' : scope === 'year' ? '2026' : 'Februar')
      expect(container.querySelector('#foodWasteAmount')!.matches(':disabled')).toBe(true)
      expect(container.querySelector('#foodWasteBaseAmount')!.matches(':disabled')).toBe(true)
      expect(actions.load.mock.calls.at(-1)![0]).toMatchObject({ subOrganizationId: 'kitchen', year: 2025, month: 5 })
      await act(async () => finishSave({ error: 'Speichern fehlgeschlagen.' }))
      expect(actions.push).not.toHaveBeenCalled()
      expect(actions.load.mock.calls.at(-1)![0]).toMatchObject({ subOrganizationId: 'kitchen', year: 2025, month: 5 })
      expect(container.querySelector('#foodWasteAmount')!.matches(':disabled')).toBe(false)
      expect(container.querySelector<HTMLInputElement>('#foodWasteAmount')!.value).toContain('55')
      expect(container.textContent).toContain('Speichern fehlgeschlagen.')
    })
  })
}

it('opens the exact month supplied by a task link', async () => {
  await act(async () => root.render(<DataEntryForm defaultYear={2025} defaultSubOrgId="kitchen" defaultEntryMode="monthly" defaultMonth={2} />))
  expect(actions.load.mock.calls.at(-1)![0]).toMatchObject({ subOrganizationId: 'kitchen', year: 2025, month: 2 })
})
it('opens an annual task without briefly selecting a monthly record', async () => {
  frequency.current = 'yearly'
  await act(async () => root.render(<DataEntryForm defaultYear={2025} defaultSubOrgId="kitchen" defaultEntryMode="yearly" />))
  expect(actions.load.mock.calls.every(([period]) => period.month === 0)).toBe(true)
  expect(container.querySelector<HTMLInputElement>('#foodWasteAmount')!.value).toContain('200')
})
it('does not silently open the first kitchen when the requested site is unavailable', async () => {
  await act(async () => root.render(<DataEntryForm defaultYear={2025} defaultSubOrgId="unavailable" defaultMonth={2} />))
  expect(actions.load).not.toHaveBeenCalled()
  expect(container.textContent).toContain('nicht verfügbar')
})

for (const scope of ['kitchen', 'year'] as const) {
  it.each(['yearly', 'monthly', 'quarterly'] as const)(`uses the destination's %s frequency when switching ${scope}`, async destination => {
    const source = destination === 'monthly' ? 'yearly' : 'monthly'
    frequency.current = source
    const original = actions.preference.getMockImplementation()!
    actions.preference.mockImplementation(async input => ({ data: { ...(await original(input)).data,
      frequency: input.subOrganizationId === 'other-kitchen' || input.year === 2026 ? destination : source } }))
    await act(async () => root.render(<DataEntryForm defaultYear={2025} defaultSubOrgId="kitchen" defaultEntryMode={source} defaultMonth={2} />))
    await enter('foodWasteAmount', '55')
    await select(scope === 'kitchen' ? 'sub-org' : 'year', scope === 'kitchen' ? 'Andere Küche' : '2026')
    const site = scope === 'kitchen' ? 'other-kitchen' : 'kitchen'
    const year = scope === 'year' ? 2026 : 2025
    const expected = destination === 'quarterly' ? `/operating-periods?year=${year}&subOrgId=${site}&quarter=1&workflow=quarter`
      : `/form/operating?year=${year}&subOrgId=${site}&entryMode=${destination}${destination === 'monthly' ? '&month=2' : ''}`
    expect(actions.push).toHaveBeenLastCalledWith(expected)
    expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ period: { organizationId: 'org', subOrganizationId: 'kitchen', year: 2025, month: source === 'yearly' ? 0 : 2 } }))
    if (destination !== 'quarterly') {
      actions.query = expected.split('?')[1]
      await act(async () => root.render(<DataEntryForm defaultYear={year} defaultSubOrgId={site} defaultEntryMode={destination} defaultMonth={destination === 'monthly' ? 2 : undefined} />))
      expect(actions.load.mock.calls.at(-1)![0]).toMatchObject({ subOrganizationId: site, year, month: destination === 'yearly' ? 0 : 2 })
      expect(container.querySelector<HTMLInputElement>('#foodWasteAmount')!.disabled).toBe(false)
    }
  })
}

it.each(['yearly', 'quarterly'] as const)('preserves an explicit monthly task period even if the saved preference is %s', async savedFrequency => {
  frequency.current = savedFrequency
  await act(async () => root.render(<DataEntryForm defaultYear={2025} defaultSubOrgId="kitchen" defaultEntryMode="monthly" defaultMonth={2} />))
  expect(actions.load.mock.calls.every(([period]) => period.month === 2)).toBe(true)
  expect(actions.push).not.toHaveBeenCalled()
})

it.each(['kitchen', 'year'])('routes an indicator %s selection to the destination quarterly editor after saving old edits', async scope => {
  const original = actions.preference.getMockImplementation()!
  actions.preference.mockImplementation(async input => ({ data: { ...(await original(input)).data,
    frequency: input.subOrganizationId === 'other-kitchen' || input.year === 2026 ? 'quarterly' : 'monthly' } }))
  await act(async () => root.render(<IndicatorDataEntryForm slug="food_waste" currentSubOrgId="kitchen" currentYear={2025} />))
  await enter('foodWasteAmount', '55')
  await select(scope === 'kitchen' ? 'sub-org' : 'year', scope === 'kitchen' ? 'Andere Küche' : '2026')
  expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ period: { organizationId: 'org', subOrganizationId: 'kitchen', year: 2025, month: 5 }, data: expect.objectContaining({ foodWasteAmount: '55' }) }))
  expect(actions.replace).toHaveBeenCalledWith(scope === 'kitchen'
    ? '/operating-periods?year=2025&subOrgId=other-kitchen&quarter=1&workflow=quarter'
    : '/operating-periods?year=2026&subOrgId=kitchen&quarter=2&workflow=quarter')
})

it('keeps the original selection if loading the destination frequency fails', async () => {
  await act(async () => root.render(<DataEntryForm defaultYear={2025} defaultSubOrgId="kitchen" defaultEntryMode="monthly" defaultMonth={2} />))
  actions.preference.mockResolvedValue({ error: 'Erfassungsrhythmus konnte nicht geladen werden.' })
  await select('sub-org', 'Andere Küche')
  expect(actions.push).not.toHaveBeenCalled()
  expect(actions.load.mock.calls.at(-1)![0]).toMatchObject({ subOrganizationId: 'kitchen', year: 2025, month: 2 })
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Erfassungsrhythmus konnte nicht geladen werden')
})
