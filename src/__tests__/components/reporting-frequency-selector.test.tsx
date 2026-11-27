// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const actions = vi.hoisted(() => ({ load: vi.fn(), change: vi.fn(), confirm: vi.fn() }))
vi.mock('@/app/actions/reporting-preferences', () => ({ getReportingPreference: actions.load, setReportingFrequency: actions.change, confirmAnnualReporting: actions.confirm }))
import { ReportingFrequencySelector } from '@/components/dashboard/reporting-frequency-selector'

let root: Root, container: HTMLDivElement
const initial = { frequency: 'yearly', revision: 4, source: 'user', suggestion: null, canWrite: true, frozen: false,
  yearClosed: true, existingPeriods: [], annual: { id: 'annual-record', revision: 7, values: { totalFoodSpend: '1200', organicSpend: null }, confirmed: false } }
const flush = vi.fn(), changed = vi.fn()
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  actions.load.mockReset().mockResolvedValue({ data: structuredClone(initial) })
  actions.change.mockReset().mockResolvedValue({ data: { kind: 'saved', frequency: 'monthly', revision: 5 } })
  actions.confirm.mockReset().mockResolvedValue({ data: { revision: 5 } })
  flush.mockReset().mockResolvedValue(undefined); changed.mockReset()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
const mount = async () => { await act(async () => root.render(<ReportingFrequencySelector subOrganizationId="kitchen" year={2025} beforeChange={flush} onChanged={changed} />)) }
async function click(label: string) {
  await act(async () => {
    const button = [...container.querySelectorAll('button')].find(b => b.textContent === label)
    expect(button).toBeDefined(); button!.click()
  })
}
it('requires reviewing saved annual values before confirming the exact revision', async () => {
  await mount()
  expect(container.textContent).not.toContain('Jahresdaten bestätigen')
  await click('Jahresdaten prüfen')
  expect(flush).toHaveBeenCalledTimes(1)
  expect(container.textContent).toContain('1200 €')
  expect(container.textContent).toContain('Unbekannt')
  expect(actions.confirm).not.toHaveBeenCalled()
  await click('Jahresdaten bestätigen')
  expect(flush).toHaveBeenCalledTimes(2)
  expect(actions.confirm).toHaveBeenCalledWith({ subOrganizationId: 'kitchen', year: 2025, expectedRevision: 4, recordId: 'annual-record', recordRevision: 7 })
  expect(changed).toHaveBeenCalledWith('yearly')
})
it('shows the current year in progress without offering early confirmation', async () => {
  actions.load.mockResolvedValue({ data: { ...initial, yearClosed: false } })
  await mount()
  expect(container.textContent).toContain('Jahr läuft')
  expect(container.textContent).not.toContain('Jahresdaten prüfen')
  expect(actions.confirm).not.toHaveBeenCalled()
})
it('keeps the existing frequency and values when flushing fails', async () => {
  flush.mockRejectedValue(new Error('Speichern fehlgeschlagen'))
  await mount(); await click('Monatlich')
  expect(actions.change).not.toHaveBeenCalled()
  expect(changed).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Speichern fehlgeschlagen')
  expect(container.textContent).toContain('Gewählt: Jährlich')
})
it('requires the change preview to be accepted and sends the reviewed preference revision', async () => {
  actions.change.mockResolvedValueOnce({ data: { kind: 'preview', periods: [{ kind: 'year', year: 2025, index: 1 }], tasks: [] } })
  await mount(); await click('Monatlich')
  expect(changed).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Vorhandene Beträge bleiben erhalten')
  await click('Rhythmus ändern')
  expect(actions.change.mock.calls.at(-1)![0]).toMatchObject({ frequency: 'monthly', expectedRevision: 4, confirmed: true })
  expect(changed).toHaveBeenCalledWith('monthly')
})
it('does not implicitly save a suggested frequency for an unconfigured kitchen', async () => {
  actions.load.mockResolvedValue({ data: { ...initial, frequency: null, suggestion: 'yearly', revision: 0, annual: null } })
  await mount()
  expect(container.textContent).toContain('Vorschlag: Jährlich')
  expect(actions.change).not.toHaveBeenCalled()
  expect([...container.querySelectorAll('button[aria-pressed]')].every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true)
})
it('preserves permission and freeze restrictions on the shared selector', async () => {
  actions.load.mockResolvedValue({ data: { ...initial, canWrite: false, frozen: true } })
  await mount(); await click('Monatlich'); await click('Jahresdaten prüfen')
  expect(actions.change).not.toHaveBeenCalled(); expect(actions.confirm).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Nur Ansicht')
  expect(container.textContent).toContain('Berichtsjahr ist gesperrt')
})

it('uses updated callbacks without reloading the reporting preference', async () => {
  await mount()
  const nextFlush = vi.fn().mockResolvedValue(undefined)
  const nextChanged = vi.fn()
  await act(async () => root.render(<ReportingFrequencySelector subOrganizationId="kitchen" year={2025} beforeChange={nextFlush} onChanged={nextChanged} />))
  expect(actions.load).toHaveBeenCalledTimes(1)
  await click('Monatlich')
  expect(nextFlush).toHaveBeenCalledOnce()
  expect(nextChanged).toHaveBeenCalledWith('monthly')
  expect(flush).not.toHaveBeenCalled()
  expect(changed).not.toHaveBeenCalled()
})

it('ignores an old frequency change after switching to another kitchen', async () => {
  let resolveChange!: (value: unknown) => void
  actions.change.mockImplementationOnce(() => new Promise(resolve => { resolveChange = resolve }))
  await mount()
  await click('Monatlich')
  await act(async () => root.render(<ReportingFrequencySelector subOrganizationId="other-kitchen" year={2025} beforeChange={flush} onChanged={changed} />))
  await act(async () => resolveChange({ data: { kind: 'saved', frequency: 'monthly', revision: 5 } }))
  expect(container.textContent).toContain('Gewählt: Jährlich')
  expect(changed).not.toHaveBeenCalled()
  expect(actions.load).toHaveBeenCalledTimes(2)
})
