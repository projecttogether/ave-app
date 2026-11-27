import type { ReportingFrequency } from './preferences'
import { isFutureReportingPeriod } from '@/lib/reporting-period'
import { EMPTY_OPERATING_DATA, OPERATING_FIELDS, operatingPeriodKey,
  type BaselineValues, type OperatingDataFields, type OperatingPeriod, type OperatingValues } from './fields'

export type OperatingSave = {
  period: OperatingPeriod
  data?: OperatingValues
  baseline?: BaselineValues
  expectedRevision?: number
  expectedBaselineRevision?: number
  expectedModeRevision?: number
  expectedPreferenceRevision?: number
  requestId?: string
}

export type OperatingDataAdapter = {
  load(period: OperatingPeriod): Promise<{ data: OperatingDataFields; frozen: boolean; quarterly?: boolean; revision?: number; baselineRevision?: number; modeRevision?: number; preferenceRevision?: number; frequency?: ReportingFrequency | null; canEditFrequency?: boolean }>
  save(request: OperatingSave): Promise<{ error?: string; success?: boolean; revision?: number; baselineRevision?: number; modeRevision?: number; preferenceRevision?: number }>
}

type Draft = {
  key: string
  period: OperatingPeriod
  values: OperatingValues
  loaded: boolean
  loading: boolean
  frozen: boolean
  quarterly?: boolean
  canEditFrequency?: boolean
  frequency?: ReportingFrequency | null
  preferenceRevision?: number
  revision: number
  savedRevision: number
  baselineRevision: number
  saving: boolean
  resave: boolean
  pending?: ReturnType<typeof setTimeout>
  inFlight?: Promise<void>
  error: string | null
  lastSaved: Date | null
  recordRevision: number
  modeRevision: number
  token?: { revision: number; baselineRevision: number; id: string; request?: OperatingSave }
}

type Baseline = { values: BaselineValues; revision: number; savedRevision: number; recordRevision: number }

export type OperatingEditorState = {
  current: {
    key: string
    period: OperatingPeriod
    data: OperatingDataFields
    loaded: boolean
    loading: boolean
    frozen: boolean
    quarterly?: boolean
    canEditFrequency?: boolean
    frequency?: ReportingFrequency | null
    preferenceRevision?: number
    recordRevision: number
    saving: boolean
    dirty: boolean
    lastSaved: Date | null
  } | null
  failures: { key: string; period: OperatingPeriod; error: string }[]
  pending: boolean
}

/** Owns draft identity, load lifetime and save acknowledgement for both forms. */
export function createOperatingDataEditor(adapter: OperatingDataAdapter) {
  const drafts = new Map<string, Draft>()
  const baselines = new Map<string, Baseline>()
  const writeQueues = new Map<string, Promise<void>>()
  const listeners = new Set<() => void>()
  let selected: string | null = null
  let state: OperatingEditorState = { current: null, failures: [], pending: false }

  const baselineFor = (draft: Draft) => baselines.get(draft.period.subOrganizationId)
  const dirty = (draft: Draft) => draft.revision > draft.savedRevision || draft.baselineRevision > (baselineFor(draft)?.savedRevision ?? 0)
  const editable = (draft: Draft) => draft.loaded && !draft.frozen && !draft.quarterly && draft.canEditFrequency !== false && !isFutureReportingPeriod(draft.period.year, draft.period.month)

  function emit() {
    const draft = selected ? drafts.get(selected) : undefined
    state = {
      current: draft ? {
        key: draft.key, period: draft.period,
        data: { ...EMPTY_OPERATING_DATA, ...draft.values, ...baselineFor(draft)?.values },
        loaded: draft.loaded, loading: draft.loading, frozen: draft.frozen, quarterly: draft.quarterly, canEditFrequency: draft.canEditFrequency, frequency: draft.frequency, preferenceRevision: draft.preferenceRevision, recordRevision: draft.recordRevision,
        saving: draft.saving, dirty: dirty(draft), lastSaved: draft.lastSaved,
      } : null,
      failures: [...drafts.values()].filter(d => d.error).map(d => ({ key: d.key, period: d.period, error: d.error! })),
      pending: [...drafts.values()].some(d => dirty(d) || d.saving),
    }
    listeners.forEach(listener => listener())
  }

  function clearTimer(draft: Draft) {
    clearTimeout(draft.pending)
    draft.pending = undefined
  }

  async function load(draft: Draft) {
    if (draft.loading) return
    const wasLoaded = draft.loaded
    draft.loaded = false
    draft.loading = true
    if (!wasLoaded) draft.error = null
    emit()
    try {
      await draft.inFlight
      const baselineRevision = baselineFor(draft)?.revision
      const response = await adapter.load(draft.period)
      // Loading never replaces edits. An inactive period only updates its own cache.
      if (draft.revision === draft.savedRevision) {
        draft.values = Object.fromEntries(OPERATING_FIELDS.map(field => [field, response.data[field]])) as OperatingValues
        draft.recordRevision = response.revision ?? 0
        draft.modeRevision = response.modeRevision ?? 0
      }
      const baseline = baselineFor(draft)
      if (!baseline) {
        baselines.set(draft.period.subOrganizationId, { values: {
          foodWasteBaseDate: response.data.foodWasteBaseDate,
          foodWasteBaseAmount: response.data.foodWasteBaseAmount,
        }, revision: 0, savedRevision: 0, recordRevision: response.baselineRevision ?? 0 })
      } else if (baseline.revision === baselineRevision && baseline.revision === baseline.savedRevision) {
        baseline.values = {
          foodWasteBaseDate: response.data.foodWasteBaseDate,
          foodWasteBaseAmount: response.data.foodWasteBaseAmount,
        }
        baseline.recordRevision = response.baselineRevision ?? 0
      }
      draft.frozen = response.frozen
      draft.quarterly = response.quarterly
      if (!dirty(draft)) {
        draft.preferenceRevision = response.preferenceRevision
        draft.frequency = response.frequency
        draft.canEditFrequency = response.canEditFrequency
      }
      draft.loaded = true
      if (!dirty(draft)) draft.error = null
    } catch (error) {
      draft.error = error instanceof Error ? error.message : 'Daten konnten nicht geladen werden.'
    } finally {
      draft.loading = false
      emit()
      // A return visit can overlap a save and consume its resave request.
      if (draft.loaded && !draft.error && dirty(draft)) void flush(draft.key)
    }
  }

  async function flush(key = selected): Promise<void> {
    const draft = key ? drafts.get(key) : undefined
    if (!draft) return
    clearTimer(draft)
    if (!editable(draft) || !dirty(draft)) return
    if (draft.saving) {
      draft.resave = true
      await draft.inFlight
      return
    }
    const revision = draft.revision
    const data = revision > draft.savedRevision ? { ...draft.values } : undefined
    const baseline = baselineFor(draft)!
    const baselineRevision = baseline.revision
    const baselineValues = draft.baselineRevision > baseline.savedRevision ? { ...baseline.values } : undefined
    if (!draft.token || draft.token.revision !== revision || draft.token.baselineRevision !== baselineRevision) {
      draft.token = { revision, baselineRevision, id: crypto.randomUUID() }
    }
    const saveToken = draft.token
    const requestId = saveToken.id
    draft.saving = true
    draft.error = null
    emit()

    const previous = writeQueues.get(draft.period.subOrganizationId) ?? Promise.resolve()
    const operation = previous.then(async () => {
      // A newer successful write may already have satisfied a queued baseline edit.
      const pendingBaseline = baselineValues && baselineRevision > baseline.savedRevision ? baselineValues : undefined
      if (data || pendingBaseline) {
        saveToken.request ??= { period: draft.period, data, baseline: pendingBaseline,
          expectedRevision: draft.recordRevision, expectedPreferenceRevision: draft.preferenceRevision, expectedModeRevision: draft.modeRevision, expectedBaselineRevision: baseline.recordRevision, requestId }
        const result = await adapter.save(saveToken.request)
        if (result.error) throw new Error(result.error)
        draft.recordRevision = result.revision ?? draft.recordRevision
        if (result.modeRevision !== undefined) for (const other of drafts.values()) {
          if (other.period.subOrganizationId === draft.period.subOrganizationId && other.period.year === draft.period.year) other.modeRevision = result.modeRevision
        }
        baseline.recordRevision = result.baselineRevision ?? baseline.recordRevision
      }
      draft.savedRevision = revision
      if (baselineValues) baseline.savedRevision = Math.max(baseline.savedRevision, baselineRevision)
      draft.lastSaved = new Date()
      for (const other of drafts.values()) {
        if (other.loaded && !dirty(other)) other.error = null
      }
    })
    // A failed write does not prevent later periods from saving.
    const settled = operation.catch(() => {})
    writeQueues.set(draft.period.subOrganizationId, settled)
    draft.inFlight = operation.catch(error => {
      draft.error = error instanceof Error ? error.message : 'Speichern fehlgeschlagen.'
    }).then(async () => {
      draft.saving = false
      const resave = draft.resave
      draft.resave = false
      emit()
      if (writeQueues.get(draft.period.subOrganizationId) === settled) writeQueues.delete(draft.period.subOrganizationId)
      // Never retry a failed snapshot indefinitely. Newer edits may still be saved.
      if (resave && dirty(draft) && (!draft.error || draft.revision > revision || draft.baselineRevision > baselineRevision)) {
        await flush(draft.key)
      }
    })
    await draft.inFlight
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    select(period: OperatingPeriod | null) {
      const key = period ? operatingPeriodKey(period) : null
      if (key === selected) return
      const previous = selected ? drafts.get(selected) : undefined
      if (previous && !previous.error) void flush(previous.key)
      selected = key
      if (!period || !key) {
        emit()
        return
      }
      let draft = drafts.get(key)
      if (!draft) {
        draft = { key, period: { ...period }, values: { ...EMPTY_OPERATING_DATA }, loaded: false, loading: false,
          frozen: false, revision: 0, savedRevision: 0, baselineRevision: 0, recordRevision: 0, modeRevision: 0, saving: false, resave: false, error: null, lastSaved: null }
        drafts.set(key, draft)
      }
      emit()
      void load(draft)
    },
    edit(field: keyof OperatingDataFields, value: string | number) {
      const draft = selected ? drafts.get(selected) : undefined
      if (!draft || !editable(draft)) return
      if (field === 'foodWasteBaseDate' || field === 'foodWasteBaseAmount') {
        const baseline = baselineFor(draft)!
        if (baseline.values[field] === value) return
        baseline.values = { ...baseline.values, [field]: value }
        draft.baselineRevision = ++baseline.revision
      } else {
        if (draft.values[field] === value) return
        draft.values = { ...draft.values, [field]: value }
        draft.revision++
      }
      draft.error = null
      clearTimer(draft)
      draft.pending = setTimeout(() => { void flush(draft.key) }, 2000)
      emit()
    },
    flush,
    async saveAndCheck() {
      for (const draft of drafts.values()) {
        await flush(draft.key)
        if (dirty(draft) || draft.error) throw new Error(draft.error ?? 'Bitte zuerst alle Änderungen speichern.')
      }
    },
    async reload() {
      const draft = selected ? drafts.get(selected) : undefined
      if (draft) await load(draft)
    },
    async retry(key: string) {
      const draft = drafts.get(key)
      if (!draft) return
      if (!draft.loaded) await load(draft)
      await flush(key)
    },
    dispose() {
      for (const draft of drafts.values()) {
        clearTimer(draft)
        // Unmount (e.g. client navigation) discards the editor: give failed drafts a final attempt.
        void flush(draft.key)
      }
    },
  }
}
