// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { periodColumns } from '@/lib/operating-data/periods'

const actions = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), publish: vi.fn(), preview: vi.fn() }))
const frequency = vi.hoisted(() => ({ current: 'quarterly' as 'monthly' | 'quarterly' | 'yearly' }))

vi.mock('@/app/actions/reporting-preferences', () => ({
  getReportingPreference: async () => ({ data: { frequency: frequency.current, revision: 1, source: 'user', suggestion: null,
    canWrite: true, frozen: false, yearClosed: true, existingPeriods: [], annual: null } }),
  setReportingFrequency: async (input: { frequency: 'monthly' | 'quarterly' | 'yearly' }) => {
    frequency.current = input.frequency
    return { data: { kind: 'saved', frequency: input.frequency, revision: 1 } }
  },
  confirmAnnualReporting: vi.fn(),
}))
vi.mock('@/app/actions/quarterly-entry', () => ({ loadQuarterlyEntry: actions.load, saveQuarterlyDraft: actions.save, publishQuarterlyEntry: actions.publish, previewPeriodConversion: actions.preview }))
vi.mock('@/app/actions/sub-organizations', () => ({ getUserSubOrganizations: async () => [{ id: 'kitchen-a', name: 'Kitchen A' }, { id: 'kitchen-b', name: 'Kitchen B' }] }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }))
import { QuarterlyEntry } from '@/components/dashboard/quarterly-entry'
let root: Root, container: HTMLDivElement
beforeEach(() => {
  frequency.current = 'quarterly'
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-02-10T12:00:00Z'))
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  window.history.replaceState({}, '', '/operating-periods?year=2025')
  actions.load.mockReset().mockImplementation(async selection => {
    const periods = selection.workflow === 'year' ? [{ kind: 'year', year: selection.year, index: 1 }] : selection.workflow === 'quarter' ? [{ kind: 'quarter', year: selection.year, index: selection.quarter }]
      : [0, 1, 2].map(i => ({ kind: 'month', year: selection.year, index: (selection.quarter - 1) * 3 + i + 1 }))
    const draft = { expectedModeRevision: 0, entries: periods.map(period => ({ period, expectedRevision: 0, coverageConfirmed: false, values: {} })) }
    return { data: { selection, mode: 'legacy', modeRevision: 0, draft, saved: structuredClone(draft), draftRevision: 0, frozen: false, canWrite: true,
      baseline: { amount: '1200', date: null, expectedRevision: 0 }, existingPeriods: [], sourceRevision: 'source' } }
  })
  actions.save.mockReset().mockResolvedValue({ data: { revision: 1 } })
  actions.publish.mockReset().mockResolvedValue({ data: { revisions: { '2025:quarter:1': 1 }, modeRevision: 2, baselineRevision: 0 } })
  actions.preview.mockReset()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllTimers(); vi.useRealTimers() })
const mount = async () => { await act(async () => root.render(<QuarterlyEntry />)) }
async function enter(value: string) {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>('input[aria-label^="Gesamteinkauf"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(label: string) {
  await act(async () => { [...container.querySelectorAll('button')].find(button => button.textContent?.includes(label))!.click() })
}
async function select(index: number, value: string) {
  await act(async () => {
    const control = container.querySelectorAll('select')[index]
    control.value = value; control.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
it('loads without saving and autosaves edits only as a draft', async () => {
  await mount(); await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(actions.save).not.toHaveBeenCalled()
  await enter('1000,000001'); await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ subOrganizationId: 'kitchen-a', year: 2025, quarter: 1 }), expect.objectContaining({ entries: [expect.objectContaining({ values: { totalFoodSpend: '1000.000001' } })] }), 0)
  expect(actions.publish).not.toHaveBeenCalled()
})
it('keeps the original selection and edits if flushing the draft fails during a switch', async () => {
  await mount(); await enter('123')
  actions.save.mockRejectedValue(new Error('Entwurf konnte nicht gespeichert werden'))
  await select(0, 'kitchen-b')
  expect(container.querySelector('select')!.value).toBe('kitchen-a')
  expect(actions.load).toHaveBeenCalledTimes(1)
  expect(container.textContent).toContain('Entwurf konnte nicht gespeichert werden')
  expect(container.querySelector<HTMLInputElement>('input[aria-label^="Gesamteinkauf"]')!.value).toContain('123')
})
it('retries publication with the same request token after a lost response', async () => {
  await mount(); await enter('1000')
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  actions.publish.mockRejectedValueOnce(new Error('Verbindung unterbrochen'))
  await click('Abgeschlossene Perioden veröffentlichen'); await click('Abgeschlossene Perioden veröffentlichen')
  expect(actions.publish).toHaveBeenCalledTimes(2)
  expect(actions.publish.mock.calls[0][0]).toEqual(actions.publish.mock.calls[1][0])
  expect(actions.publish.mock.calls[0][0].entries[0]).toMatchObject({ period: { kind: 'quarter', year: 2025, index: 1 }, coverageConfirmed: true, values: { totalFoodSpend: '1000' } })
})
it('keeps three batch months distinct and does not publish automatically', async () => {
  await mount(); await select(3, 'batch')
  expect(container.querySelectorAll('fieldset')).toHaveLength(3)
  await enter('100'); await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  const payload = actions.save.mock.calls.at(-1)![1]
  expect(payload.entries.map((e: { period: Parameters<typeof periodColumns>[0] }) => periodColumns(e.period).reportingMonth)).toEqual([1, 2, 3])
  expect(actions.publish).not.toHaveBeenCalled()
})
it('prevents entry for a frozen year and leaves stored drafts readable', async () => {
  const original = actions.load.getMockImplementation()!
  actions.load.mockImplementation(async selection => ({ data: { ...(await original(selection)).data, frozen: true } }))
  await mount()
  expect(container.querySelector('fieldset')!.disabled).toBe(true)
  await click('Abgeschlossene Perioden veröffentlichen')
  expect(actions.publish).not.toHaveBeenCalled()
  expect(actions.save).not.toHaveBeenCalled()
})

it.each(['batch', 'year'])('publishes a reviewed %s correction away from quarterly data', async workflow => {
  window.history.replaceState({}, '', `/operating-periods?year=2025&quarter=1&workflow=${workflow}`)
  const original = actions.load.getMockImplementation()!
  let published = false
  actions.load.mockImplementation(async selection => ({ data: { ...(await original(selection)).data,
    mode: published ? 'legacy' : 'quarterly',
    existingPeriods: [{ period: { kind: 'quarter', year: 2025, index: 1 }, revision: 1 }] } }))
  actions.preview.mockResolvedValue({ data: { before: { indicators: [] }, after: { indicators: [] },
    replacedPeriods: [{ kind: 'quarter', year: 2025, index: 1 }], sourceRevision: 'source', targetMode: 'legacy' } })
  actions.publish.mockImplementation(async () => { published = true; return { data: { revisions: {}, modeRevision: 2, preferenceRevision: 2, baselineRevision: 0 } } })
  await mount()
  expect(container.querySelector('fieldset')!.disabled).toBe(false)
  await enter('1000'); await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(actions.save).toHaveBeenCalledTimes(1)
  await click('Vorher/Nachher-Vorschau erstellen')
  expect(actions.preview).toHaveBeenCalledWith(expect.objectContaining({ entries: [expect.objectContaining({ values: { totalFoodSpend: '1000' } })] }), 'legacy')
  await act(async () => {
    const label = [...container.querySelectorAll('label')].find(label => label.textContent?.includes('Grund der Korrektur'))!
    const input = label.querySelector('input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Geprüfte Umstellung auf den gewählten Rhythmus.')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  await click('Geprüfte Jahreskorrektur veröffentlichen')
  expect(actions.publish).toHaveBeenCalledWith(expect.objectContaining({ workflow: 'conversion', conversion: expect.objectContaining({ mode: 'legacy', frequency: workflow === 'year' ? 'yearly' : 'monthly', confirmed: true }) }))
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(actions.save).toHaveBeenCalledTimes(2)
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.textContent).toContain('Veröffentlicht.')
  expect(container.querySelector('fieldset')!.disabled).toBe(false)
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(false)
})

it('opens the exact task quarter and preserves it on reload', async () => {
  window.history.replaceState({}, '', '/operating-periods?year=2025&subOrgId=kitchen-b&quarter=3&workflow=quarter')
  await mount()
  expect(actions.load).toHaveBeenCalledWith({ subOrganizationId: 'kitchen-b', year: 2025, quarter: 3, workflow: 'quarter' })
  expect(container.querySelectorAll('select')[2].value).toBe('3')
  await act(async () => root.unmount())
  root = createRoot(container)
  await mount()
  expect(actions.load.mock.calls.at(-1)![0]).toMatchObject({ subOrganizationId: 'kitchen-b', quarter: 3 })
})
it('does not substitute a different kitchen for an unavailable task target', async () => {
  window.history.replaceState({}, '', '/operating-periods?year=2025&subOrgId=unavailable&quarter=2&workflow=quarter')
  await mount()
  expect(actions.load).not.toHaveBeenCalled()
  expect(container.textContent).toContain('nicht verfügbar')
})
it('does not load an editable fallback for an invalid explicit quarter', async () => {
  window.history.replaceState({}, '', '/operating-periods?year=2025&subOrgId=kitchen-a&quarter=5')
  await mount()
  expect(actions.load).not.toHaveBeenCalled()
  expect(container.querySelector('fieldset')).toBeNull()
})
