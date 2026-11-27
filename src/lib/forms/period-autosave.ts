import { isFutureReportingPeriod } from '@/lib/reporting-period'

export type ReportingPeriod = {
  organizationId: string
  subOrganizationId: string
  year: number
  month: number
}

export type PeriodAdapter<T> = {
  load: (period: ReportingPeriod) => Promise<{ data: T; frozen: boolean }>
  save: (period: ReportingPeriod, data: T) => Promise<void>
  onError: (error: unknown, phase: 'load' | 'save', period: ReportingPeriod) => void
}

export function reportingPeriodKey(period: ReportingPeriod | null) {
  return period ? `${period.organizationId}|${period.subOrganizationId}|${period.year}|${period.month}` : null
}

type Draft<T> = {
  period: ReportingPeriod
  adapter: PeriodAdapter<T>
  data: T | null
  revision: number
  savedRevision: number
  loading: boolean
  ready: boolean
  saving: boolean
  frozen: boolean
  lastSaved: Date | null
  error: unknown
  pending?: Promise<boolean>
  writes: DraftWrite<T>[]
  writing?: DraftWrite<T>
}

type DraftWrite<T> = { adapter: PeriodAdapter<T>; data: T; revision: number }

export type PeriodSnapshot<T> = {
  key: string | null
  data: T | null
  loading: boolean
  saving: boolean
  frozen: boolean
  readOnly: boolean
  hasUnsavedChanges: boolean
  lastSaved: Date | null
  error: unknown
}

/** Owns draft identity and ordering. Adapters always receive the draft's period,
 * including when a delayed save finishes after the user changes selection. */
export function createPeriodAutosave<T>(adapter: PeriodAdapter<T>, delay = 2000) {
  const drafts = new Map<string, Draft<T>>()
  const listeners = new Set<() => void>()
  let active: Draft<T> | null = null
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const empty: PeriodSnapshot<T> = {
    key: null, data: null, loading: false, saving: false, frozen: false,
    readOnly: true, hasUnsavedChanges: false, lastSaved: null, error: null,
  }
  let snapshot = empty

  function publish() {
    snapshot = active ? {
      key: reportingPeriodKey(active.period), data: active.data,
      loading: active.loading, saving: active.saving, frozen: active.frozen,
      readOnly: !active.ready || active.loading || active.data === null || active.frozen || isFutureReportingPeriod(active.period.year, active.period.month),
      hasUnsavedChanges: active.revision !== active.savedRevision,
      lastSaved: active.lastSaved, error: active.error,
    } : empty
    listeners.forEach(listener => listener())
  }

  function clearTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  function persist(draft: Draft<T>): Promise<boolean> {
    if (draft.pending) return draft.pending
    if (draft.revision === draft.savedRevision) return Promise.resolve(true)
    if (!draft.ready || draft.loading || draft.data === null || draft.frozen || isFutureReportingPeriod(draft.period.year, draft.period.month)) return Promise.resolve(false)
    draft.saving = true
    draft.error = null
    draft.pending = Promise.resolve().then(async () => {
      try {
        // A replacement adapter must not absorb writes made through the old
        // adapter, including failed writes that still need retrying.
        while (draft.writes.length > 0) {
          const write = draft.writes[0]
          const attemptedRevision = draft.revision
          draft.writing = write
          try {
            await write.adapter.save(draft.period, write.data)
          } catch (error) {
            if (draft.revision === attemptedRevision) throw error
            // An edit arrived while this request was in flight. Its timer may
            // already have fired, so continue with the correction now. Keep
            // the failed adapter's write unless the next write uses it too.
            if (draft.writes[1]?.adapter === write.adapter) {
              draft.writes.shift()
            } else {
              draft.writes[0] = { ...write, data: draft.data! }
            }
            continue
          }
          draft.writes.shift()
          draft.writing = undefined
          draft.savedRevision = write.revision
          draft.lastSaved = new Date()
          publish()
        }
        return true
      } catch (error) {
        draft.error = error
        const errorAdapter = draft.writing?.adapter ?? draft.adapter
        errorAdapter.onError(error, 'save', draft.period)
        return false
      } finally {
        draft.saving = false
        draft.pending = undefined
        draft.writing = undefined
        publish()
      }
    })
    publish()
    return draft.pending
  }

  async function select(period: ReportingPeriod | null, selectedAdapter: PeriodAdapter<T> = adapter) {
    const request = ++generation
    clearTimer()
    if (active) void persist(active)
    if (!period) {
      active = null
      publish()
      return
    }
    const key = reportingPeriodKey(period)!
    let draft = drafts.get(key)
    if (!draft) {
      draft = { period: { ...period }, adapter: selectedAdapter, data: null, revision: 0, savedRevision: 0,
        writes: [],
        loading: true, ready: false, saving: false, frozen: false, lastSaved: null, error: null }
      drafts.set(key, draft)
    }
    active = draft
    draft.loading = true
    draft.ready = false
    publish()
    try {
      // Revisiting a period waits for its earlier write before reading it.
      await draft.pending
      if (request !== generation) return
      draft.adapter = selectedAdapter
      const loaded = await selectedAdapter.load(draft.period)
      if (request !== generation) return
      // Retain failed edits when revisiting a period; loading refreshes its
      // freeze status without replacing an unsaved draft.
      if (draft.revision === draft.savedRevision) draft.data = loaded.data
      draft.ready = true
      draft.frozen = loaded.frozen
      draft.error = null
    } catch (error) {
      if (request !== generation) return
      draft.error = error
      selectedAdapter.onError(error, 'load', draft.period)
    } finally {
      if (request === generation) {
        draft.loading = false
        publish()
      }
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    select,
    edit(period: ReportingPeriod | null, change: T | ((previous: T) => T)) {
      if (!active || snapshot.readOnly || reportingPeriodKey(period) !== snapshot.key) return
      const draft = active
      draft.data = typeof change === 'function' ? (change as (previous: T) => T)(draft.data!) : change
      draft.revision++
      draft.error = null
      // A correction also repairs a failed, unsent write from an earlier
      // adapter. Never change the snapshot currently being persisted.
      draft.writes = draft.writes.map(write => write === draft.writing ? write : { ...write, data: draft.data! })
      const last = draft.writes[draft.writes.length - 1]
      const write: DraftWrite<T> = { adapter: draft.adapter, data: draft.data!, revision: draft.revision }
      if (last && last !== draft.writing && last.adapter === draft.adapter) {
        draft.writes[draft.writes.length - 1] = write
      } else {
        draft.writes.push(write)
      }
      clearTimer()
      timer = setTimeout(() => { timer = undefined; void persist(draft) }, delay)
      publish()
    },
    async save() {
      clearTimer()
      return active ? persist(active) : false
    },
    leave() {
      generation++
      clearTimer()
      if (active) void persist(active)
      active = null
      publish()
    },
  }
}
