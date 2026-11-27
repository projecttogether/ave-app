import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOperatingDataEditor, type OperatingDataAdapter, type OperatingSave } from '@/lib/operating-data/editor'
import { EMPTY_OPERATING_DATA, operatingPeriodKey, type OperatingPeriod } from '@/lib/operating-data/fields'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const a: OperatingPeriod = { organizationId: 'org', subOrganizationId: 'kitchen', year: 2025, month: 1 }
const b = { ...a, month: 2 }
const loaded = { data: { ...EMPTY_OPERATING_DATA, totalFoodSpend: 100, foodWasteBaseAmount: 1200 }, frozen: false }
const tick = async () => { await vi.advanceTimersByTimeAsync(0) }

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-10T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

describe('operating-data editing', () => {
  it('flushes A under its own period, ignores its late load for B, and restores A on return', async () => {
    const loadA = deferred<typeof loaded>()
    const loadB = deferred<typeof loaded>()
    const saved: OperatingSave[] = []
    const editor = createOperatingDataEditor({ load: period => period.month === 1 ? loadA.promise : loadB.promise,
      save: async request => { saved.push(request); return { success: true } } })
    editor.select(a)
    editor.select(b)
    loadB.resolve({ ...loaded, data: { ...loaded.data, totalFoodSpend: 200 } })
    await tick()
    loadA.resolve(loaded)
    await tick()
    expect(editor.getSnapshot().current?.data.totalFoodSpend).toBe(200)
    expect(saved).toHaveLength(0)
    editor.select(a); await tick()
    editor.edit('totalFoodSpend', 111)
    editor.select(b)
    expect(editor.getSnapshot().current?.period).toEqual(b)
    await tick()
    expect(saved[0]).toMatchObject({ period: a, data: { totalFoodSpend: 111 } })
    expect(saved[0].baseline).toBeUndefined()
    editor.select(a)
    expect(editor.getSnapshot().current?.data.totalFoodSpend).toBe(111)
  })

  it('only acknowledges the revision that completed while keeping newer edits pending', async () => {
    const first = deferred<{ success: boolean }>()
    const save = vi.fn<OperatingDataAdapter['save']>().mockReturnValueOnce(first.promise).mockResolvedValue({ success: true })
    const editor = createOperatingDataEditor({ load: async () => loaded, save })
    editor.select(a); await tick()
    editor.edit('totalFoodSpend', 111)
    const saving = editor.flush()
    await tick()
    editor.edit('totalFoodSpend', 222)
    first.resolve({ success: true }); await saving
    expect(editor.getSnapshot().current).toMatchObject({ dirty: true, data: { totalFoodSpend: 222 } })
    await vi.advanceTimersByTimeAsync(2000)
    expect(save.mock.calls.map(([request]) => request.data?.totalFoodSpend)).toEqual([111, 222])
    expect(editor.getSnapshot().current?.dirty).toBe(false)
  })

  it('makes a final save attempt for failed drafts when the editor is disposed', async () => {
    const save = vi.fn<OperatingDataAdapter['save']>().mockResolvedValueOnce({ error: 'Offline' }).mockResolvedValue({ success: true })
    const editor = createOperatingDataEditor({ load: async () => loaded, save })
    editor.select(a); await tick()
    editor.edit('foodWasteAmount', 25)
    await editor.flush()
    expect(editor.getSnapshot().failures).toHaveLength(1)
    editor.dispose(); await tick()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0]).toMatchObject({ period: a, data: { foodWasteAmount: 25 } })
    expect(editor.getSnapshot()).toMatchObject({ failures: [], pending: false })
  })

  it('retains a failed inactive draft and retries it without blocking or altering the selected period', async () => {
    const first = deferred<{ error: string }>()
    const save = vi.fn<OperatingDataAdapter['save']>().mockReturnValueOnce(first.promise).mockResolvedValue({ success: true })
    const editor = createOperatingDataEditor({ load: async () => loaded, save })
    editor.select(a); await tick()
    editor.edit('foodWasteAmount', 25)
    editor.select(b); await tick()
    first.resolve({ error: 'Offline' }); await tick()
    expect(editor.getSnapshot().current?.period).toEqual(b)
    expect(editor.getSnapshot().failures).toEqual([{ key: operatingPeriodKey(a), period: a, error: 'Offline' }])
    await vi.advanceTimersByTimeAsync(10000)
    expect(save).toHaveBeenCalledTimes(1)
    await editor.retry(operatingPeriodKey(a))
    expect(save.mock.calls[1][0]).toMatchObject({ period: a, data: { foodWasteAmount: 25 } })
    expect(editor.getSnapshot().failures).toEqual([])
    expect(editor.getSnapshot().current?.period).toEqual(b)
    editor.select(a)
    expect(editor.getSnapshot().current?.data.foodWasteAmount).toBe(25)
  })

  it('serializes shared baseline writes and keeps later period loads from restoring an old baseline', async () => {
    const first = deferred<{ success: boolean }>()
    const save = vi.fn<OperatingDataAdapter['save']>().mockReturnValueOnce(first.promise).mockResolvedValue({ success: true })
    const editor = createOperatingDataEditor({ load: async () => loaded, save })
    editor.select(a); await tick()
    editor.edit('foodWasteBaseAmount', 2400)
    editor.select(b); await tick()
    expect(editor.getSnapshot().current?.data.foodWasteBaseAmount).toBe(2400)
    editor.edit('foodWasteBaseAmount', 3600)
    const savingB = editor.flush()
    await tick()
    expect(save).toHaveBeenCalledTimes(1)
    first.resolve({ success: true }); await savingB
    expect(save.mock.calls.map(([request]) => request.baseline?.foodWasteBaseAmount)).toEqual([2400, 3600])
    expect(save.mock.calls.map(([request]) => request.data)).toEqual([undefined, undefined])
    editor.select(a)
    expect(editor.getSnapshot().current?.data.foodWasteBaseAmount).toBe(3600)
    expect(editor.getSnapshot().pending).toBe(false)
  })

  it('retries baseline failures, preserves explicit clearing and does not mark a failed save as complete', async () => {
    const save = vi.fn<OperatingDataAdapter['save']>().mockResolvedValueOnce({ error: 'Basiswert fehlgeschlagen' }).mockResolvedValue({ success: true })
    const editor = createOperatingDataEditor({ load: async () => loaded, save })
    editor.select(a); await tick()
    editor.edit('foodWasteBaseAmount', '')
    await editor.flush()
    expect(editor.getSnapshot().current).toMatchObject({ dirty: true, lastSaved: null })
    expect(editor.getSnapshot().failures[0].error).toContain('Basiswert')
    await editor.retry(operatingPeriodKey(a))
    expect(save.mock.calls[1][0].baseline?.foodWasteBaseAmount).toBe('')
    expect(editor.getSnapshot().current?.dirty).toBe(false)
  })

  it('saves a corrected draft when an older in-flight revision fails after its debounce expires', async () => {
    const first = deferred<{ error: string }>()
    const save = vi.fn<OperatingDataAdapter['save']>().mockReturnValueOnce(first.promise).mockResolvedValue({ success: true })
    const editor = createOperatingDataEditor({ load: async () => loaded, save })
    editor.select(a); await tick()
    editor.edit('totalFoodSpend', 111)
    const saving = editor.flush(); await tick()
    editor.edit('totalFoodSpend', 222)
    await vi.advanceTimersByTimeAsync(2000)
    first.resolve({ error: 'Old validation failure' }); await saving
    expect(save.mock.calls.map(([request]) => request.data?.totalFoodSpend)).toEqual([111, 222])
    expect(editor.getSnapshot()).toMatchObject({ pending: false, failures: [], current: { dirty: false } })
  })

  it('does not save initial loads, frozen periods, future periods or edits attempted during loading', async () => {
    const save = vi.fn<OperatingDataAdapter['save']>().mockResolvedValue({ success: true })
    const editor = createOperatingDataEditor({ load: async period => ({ ...loaded, frozen: period.year === 2025 }), save })
    editor.select(a)
    editor.edit('totalFoodSpend', 999)
    await tick()
    editor.edit('totalFoodSpend', 999)
    editor.select({ ...a, year: 2027 })
    await tick()
    editor.edit('totalFoodSpend', 999)
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).not.toHaveBeenCalled()
  })

  it('retries a failed load through the same editor interface', async () => {
    const load = vi.fn<OperatingDataAdapter['load']>().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(loaded)
    const editor = createOperatingDataEditor({ load, save: async () => ({ success: true }) })
    editor.select(a); await tick()
    expect(editor.getSnapshot().failures[0].error).toBe('Offline')
    await editor.retry(operatingPeriodKey(a))
    expect(editor.getSnapshot().current?.loaded).toBe(true)
    expect(editor.getSnapshot().failures).toEqual([])
  })

  it('refreshes saved values and locks when revisiting a period', async () => {
    const refresh = deferred<typeof loaded>()
    const load = vi.fn<OperatingDataAdapter['load']>().mockResolvedValue(loaded)
    const save = vi.fn<OperatingDataAdapter['save']>().mockResolvedValue({ success: true })
    const editor = createOperatingDataEditor({ load, save })
    editor.select(a); await tick()
    editor.select(b); await tick()
    load.mockReturnValueOnce(refresh.promise)
    editor.select(a)
    editor.edit('totalFoodSpend', 999)
    expect(editor.getSnapshot().current?.loaded).toBe(false)
    refresh.resolve({ data: { ...loaded.data, totalFoodSpend: 333, foodWasteBaseAmount: 2400 }, frozen: true })
    await tick()
    expect(editor.getSnapshot().current).toMatchObject({ loaded: true, frozen: true,
      data: { totalFoodSpend: 333, foodWasteBaseAmount: 2400 } })
    editor.edit('totalFoodSpend', 999)
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).not.toHaveBeenCalled()
  })

  it('retains failed edits through a refresh and blocks edits after a failed refresh', async () => {
    const load = vi.fn<OperatingDataAdapter['load']>().mockResolvedValue(loaded)
    const save = vi.fn<OperatingDataAdapter['save']>().mockResolvedValueOnce({ error: 'Offline' }).mockResolvedValue({ success: true })
    const editor = createOperatingDataEditor({ load, save })
    editor.select(a); await tick()
    editor.edit('totalFoodSpend', 222); await editor.flush()
    editor.select(b); await tick()
    load.mockRejectedValueOnce(new Error('No connection'))
    editor.select(a); await tick()
    editor.edit('totalFoodSpend', 999)
    expect(editor.getSnapshot().current).toMatchObject({ loaded: false, data: { totalFoodSpend: 222 } })
    await editor.retry(operatingPeriodKey(a))
    expect(save.mock.calls.map(([request]) => request.data?.totalFoodSpend)).toEqual([222, 222])
    expect(editor.getSnapshot().current).toMatchObject({ loaded: true, dirty: false })
  })

  it('saves newer edits after revisiting a period whose older save is still pending', async () => {
    const first = deferred<{ success: boolean }>()
    const save = vi.fn<OperatingDataAdapter['save']>().mockReturnValueOnce(first.promise).mockResolvedValue({ success: true })
    const editor = createOperatingDataEditor({ load: async () => loaded, save })
    editor.select(a); await tick()
    editor.edit('totalFoodSpend', 111)
    const saving = editor.flush(); await tick()
    editor.edit('totalFoodSpend', 222)
    editor.select(b); await tick()
    editor.select(a)
    first.resolve({ success: true }); await saving; await tick()
    expect(save.mock.calls.map(([request]) => request.data?.totalFoodSpend)).toEqual([111, 222])
    expect(editor.getSnapshot().current).toMatchObject({ loaded: true, dirty: false })
  })

  it('flushes the old period and disables editing when selection is cleared', async () => {
    const save = vi.fn<OperatingDataAdapter['save']>().mockResolvedValue({ success: true })
    const editor = createOperatingDataEditor({ load: async () => loaded, save })
    editor.select(a); await tick()
    editor.edit('totalFoodSpend', 111)
    editor.select(null)
    editor.edit('totalFoodSpend', 999)
    await tick()
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ period: a, data: expect.objectContaining({ totalFoodSpend: 111 }) }))
    expect(editor.getSnapshot().current).toBeNull()
  })
})
