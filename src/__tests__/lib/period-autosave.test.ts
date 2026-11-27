import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPeriodAutosave, type ReportingPeriod } from '@/lib/forms/period-autosave'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const a: ReportingPeriod = { organizationId: 'org', subOrganizationId: 'kitchen', year: 2025, month: 1 }
const b: ReportingPeriod = { ...a, month: 2 }
function setup() {
  const load = vi.fn(async (period: ReportingPeriod) => ({ data: { answer: `month ${period.month}` }, frozen: false }))
  const save = vi.fn(async (_period: ReportingPeriod, _data: { answer: string }) => {})
  const onError = vi.fn()
  const editor = createPeriodAutosave({ load, save, onError })
  return { editor, load, save, onError }
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-24T12:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('reporting-period editing', () => {
  it('never saves a loaded draft until it is edited', async () => {
    const { editor, save } = setup()
    await editor.select(a)
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).not.toHaveBeenCalled()
    expect(editor.getSnapshot()).toMatchObject({ data: { answer: 'month 1' }, hasUnsavedChanges: false, readOnly: false })
  })

  it('flushes edits to their original period while a new period loads slowly', async () => {
    const { editor, load, save } = setup()
    await editor.select(a)
    editor.edit(a, { answer: 'edited in A' })
    const slow = deferred<{ data: { answer: string }; frozen: boolean }>()
    load.mockReturnValueOnce(slow.promise)
    const switching = editor.select(b)
    editor.edit(a, { answer: 'stale event' })
    editor.edit(b, { answer: 'event during load' })
    await vi.advanceTimersByTimeAsync(3000)
    expect(save).toHaveBeenCalledExactlyOnceWith(a, { answer: 'edited in A' })
    slow.resolve({ data: { answer: 'loaded B' }, frozen: false })
    await switching
    await vi.advanceTimersByTimeAsync(3000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(editor.getSnapshot()).toMatchObject({ data: { answer: 'loaded B' }, hasUnsavedChanges: false, lastSaved: null })
  })

  it('ignores an older load that resolves after the new period', async () => {
    const { editor, load } = setup()
    const slow = deferred<{ data: { answer: string }; frozen: boolean }>()
    load.mockReturnValueOnce(slow.promise)
    const first = editor.select(a)
    await Promise.resolve()
    await editor.select(b)
    slow.resolve({ data: { answer: 'stale A' }, frozen: true })
    await first
    expect(editor.getSnapshot()).toMatchObject({ data: { answer: 'month 2' }, frozen: false, loading: false })
  })

  it('serializes edits and never acknowledges newer edits with an older write', async () => {
    const { editor, save } = setup()
    const first = deferred<void>()
    const second = deferred<void>()
    save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await editor.select(a)
    editor.edit(a, { answer: 'first edit' })
    await vi.advanceTimersByTimeAsync(2000)
    editor.edit(a, { answer: 'second edit' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).toHaveBeenCalledTimes(1)
    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(a, { answer: 'second edit' })
    expect(editor.getSnapshot()).toMatchObject({ hasUnsavedChanges: true, saving: true })
    second.resolve()
    await editor.save()
    expect(editor.getSnapshot()).toMatchObject({ hasUnsavedChanges: false, saving: false })
  })

  it('retains failed edits on return to a period and allows retry', async () => {
    const { editor, save, onError } = setup()
    const error = new Error('Offline')
    save.mockRejectedValueOnce(error)
    await editor.select(a)
    editor.edit(a, { answer: 'keep me' })
    await editor.select(b)
    expect(onError).toHaveBeenCalledWith(error, 'save', a)
    await editor.select(a)
    expect(editor.getSnapshot()).toMatchObject({ data: { answer: 'keep me' }, hasUnsavedChanges: true })
    expect(await editor.save()).toBe(true)
    expect(save).toHaveBeenLastCalledWith(a, { answer: 'keep me' })
    expect(editor.getSnapshot().hasUnsavedChanges).toBe(false)
  })

  it.each([0, 2000])('saves a correction when the earlier write fails after %i ms', async elapsed => {
    const { editor, save, onError } = setup()
    const first = deferred<void>()
    const corrected = deferred<void>()
    save.mockImplementation(async (_period, data) => {
      if (data.answer === 'invalid') return first.promise
      return corrected.promise
    })
    await editor.select(a)
    editor.edit(a, { answer: 'invalid' })
    await vi.advanceTimersByTimeAsync(2000)
    editor.edit(a, { answer: 'corrected' })
    await vi.advanceTimersByTimeAsync(elapsed)
    first.reject(new Error('Invalid answer'))
    await vi.advanceTimersByTimeAsync(0)

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(a, { answer: 'corrected' })
    expect(editor.getSnapshot()).toMatchObject({ hasUnsavedChanges: true, saving: true })
    corrected.resolve()
    expect(await editor.save()).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()
    expect(editor.getSnapshot()).toMatchObject({ hasUnsavedChanges: false, saving: false, error: null })
  })

  it('retains a failed correction for manual retry without repeatedly retrying it automatically', async () => {
    const { editor, save, onError } = setup()
    const first = deferred<void>()
    const offline = new Error('Offline')
    save.mockImplementation(async (_period, data) => {
      if (data.answer === 'invalid') return first.promise
      throw offline
    })
    await editor.select(a)
    editor.edit(a, { answer: 'invalid' })
    await vi.advanceTimersByTimeAsync(2000)
    editor.edit(a, { answer: 'corrected' })
    await vi.advanceTimersByTimeAsync(2000)
    first.reject(new Error('Invalid answer'))
    await vi.advanceTimersByTimeAsync(60000)

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(a, { answer: 'corrected' })
    expect(onError).toHaveBeenCalledExactlyOnceWith(offline, 'save', a)
    expect(editor.getSnapshot()).toMatchObject({ data: { answer: 'corrected' }, hasUnsavedChanges: true, saving: false })
    save.mockResolvedValue(undefined)
    expect(await editor.save()).toBe(true)
    expect(save).toHaveBeenCalledTimes(3)
    expect(save).toHaveBeenLastCalledWith(a, { answer: 'corrected' })
    expect(editor.getSnapshot()).toMatchObject({ hasUnsavedChanges: false, saving: false })
  })

  it('retries corrections through the original adapter and period after switching away', async () => {
    const { editor, load, save, onError } = setup()
    save.mockRejectedValue(new Error('Invalid answer'))
    await editor.select(a)
    editor.edit(a, { answer: 'invalid' })
    expect(await editor.save()).toBe(false)
    const replacement = { load, save: vi.fn(async () => {}), onError: vi.fn() }
    await editor.select(a, replacement)

    const pending = deferred<void>()
    save.mockImplementation(async (_period, data) => {
      if (data.answer === 'first correction') return pending.promise
    })
    editor.edit(a, { answer: 'first correction' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).toHaveBeenLastCalledWith(a, { answer: 'first correction' })
    editor.edit(a, { answer: 'latest correction' })
    await vi.advanceTimersByTimeAsync(2000)
    await editor.select(b, replacement)
    pending.reject(new Error('Invalid first correction'))
    await vi.advanceTimersByTimeAsync(0)

    expect(save).toHaveBeenCalledTimes(4)
    expect(save).toHaveBeenLastCalledWith(a, { answer: 'latest correction' })
    expect(replacement.save).toHaveBeenCalledExactlyOnceWith(a, { answer: 'latest correction' })
    expect(onError).toHaveBeenCalledTimes(2)
    expect(editor.getSnapshot()).toMatchObject({ data: { answer: 'month 2' }, hasUnsavedChanges: false, saving: false })
  })

  it('waits for a pending write before reloading that period', async () => {
    const { editor, load, save } = setup()
    const write = deferred<void>()
    save.mockReturnValueOnce(write.promise)
    await editor.select(a)
    editor.edit(a, { answer: 'saved A' })
    await editor.select(b)
    const revisit = editor.select(a)
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(2)
    load.mockResolvedValueOnce({ data: { answer: 'saved A' }, frozen: false })
    write.resolve()
    await revisit
    expect(editor.getSnapshot()).toMatchObject({ data: { answer: 'saved A' }, hasUnsavedChanges: false })
  })

  it('flushes on leave and ignores old load completions after remount', async () => {
    const { editor, save } = setup()
    await editor.select(a)
    editor.edit(a, { answer: 'last edit' })
    editor.leave()
    await Promise.resolve()
    expect(save).toHaveBeenCalledWith(a, { answer: 'last edit' })
    expect(editor.getSnapshot().key).toBeNull()
    await editor.select(b)
    expect(editor.getSnapshot().data).toEqual({ answer: 'month 2' })
  })

  it('finishes the old adapter write before a replacement adapter reloads the same period', async () => {
    const pendingWrite = deferred<void>()
    let stored = { answer: 'stored before edit' }
    const original = {
      load: vi.fn(async () => ({ data: stored, frozen: false })),
      save: vi.fn(async (_period: ReportingPeriod, data: { answer: string }) => {
        await pendingWrite.promise
        stored = data
      }),
      onError: vi.fn(),
    }
    const replacement = {
      load: vi.fn(async () => ({ data: stored, frozen: false })),
      save: vi.fn(async (_period: ReportingPeriod, data: { answer: string }) => { stored = data }),
      onError: vi.fn(),
    }
    const editor = createPeriodAutosave(original)
    await editor.select(a)
    editor.edit(a, { answer: 'old adapter edit' })
    const switching = editor.select(a, replacement)
    await Promise.resolve()
    expect(original.save).toHaveBeenCalledWith(a, { answer: 'old adapter edit' })
    expect(replacement.load).not.toHaveBeenCalled()
    expect(editor.getSnapshot().readOnly).toBe(true)
    pendingWrite.resolve()
    await switching
    expect(editor.getSnapshot()).toMatchObject({ data: { answer: 'old adapter edit' }, hasUnsavedChanges: false })

    editor.edit(a, { answer: 'replacement adapter edit' })
    await editor.save()
    expect(original.save).toHaveBeenCalledTimes(1)
    expect(replacement.save).toHaveBeenCalledExactlyOnceWith(a, { answer: 'replacement adapter edit' })
  })

  it('allows retry after an adapter throws synchronously', async () => {
    const { editor, save, onError } = setup()
    const error = new Error('Synchronous adapter failure')
    save.mockImplementationOnce(() => { throw error })
    await editor.select(a)
    editor.edit(a, { answer: 'retry me' })
    expect(await editor.save()).toBe(false)
    expect(onError).toHaveBeenCalledWith(error, 'save', a)
    expect(editor.getSnapshot()).toMatchObject({ saving: false, hasUnsavedChanges: true })
    expect(await editor.save()).toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
    expect(editor.getSnapshot()).toMatchObject({ saving: false, hasUnsavedChanges: false })
  })

  it('preserves failed adapter writes while allowing corrections through a replacement adapter', async () => {
    const { editor, load, save, onError } = setup()
    save.mockRejectedValue(new Error('Invalid answer'))
    await editor.select(a)
    editor.edit(a, { answer: 'invalid' })
    expect(await editor.save()).toBe(false)
    const replacement = { load, save: vi.fn(async () => {}), onError: vi.fn() }
    await editor.select(a, replacement)
    expect(editor.getSnapshot()).toMatchObject({ data: { answer: 'invalid' }, hasUnsavedChanges: true, readOnly: false })
    expect(replacement.save).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(2)

    editor.edit(a, { answer: 'corrected' })
    save.mockResolvedValue(undefined)
    expect(await editor.save()).toBe(true)
    expect(save).toHaveBeenLastCalledWith(a, { answer: 'corrected' })
    expect(replacement.save).toHaveBeenCalledExactlyOnceWith(a, { answer: 'corrected' })
    expect(editor.getSnapshot()).toMatchObject({ hasUnsavedChanges: false, saving: false })
  })

  it('blocks editing after a failed load, including a revisit with a cached draft', async () => {
    const { editor, load, save } = setup()
    await editor.select(a)
    await editor.select(b)
    load.mockRejectedValueOnce(new Error('Failed to load'))
    await editor.select(a)
    editor.edit(a, { answer: 'must not write' })
    await vi.advanceTimersByTimeAsync(3000)
    expect(editor.getSnapshot().readOnly).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it.each(['frozen', 'future'] as const)('does not write %s periods', async kind => {
    const { editor, load, save } = setup()
    const period = kind === 'future' ? { ...a, year: 2027 } : a
    load.mockResolvedValue({ data: { answer: 'read only' }, frozen: kind === 'frozen' })
    await editor.select(period)
    editor.edit(period, { answer: 'blocked' })
    await editor.save()
    await vi.advanceTimersByTimeAsync(3000)
    expect(editor.getSnapshot().readOnly).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })
})
