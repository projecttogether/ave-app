'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPeriodAutosave, reportingPeriodKey, type PeriodAdapter, type ReportingPeriod } from '@/lib/forms/period-autosave'

/** React subscribes to the same editing interface exercised by lifecycle tests. */
export function usePeriodAutosave<T>(period: ReportingPeriod | null, adapter: PeriodAdapter<T>, initialData: T) {
  const [editor] = useState(() => createPeriodAutosave(adapter))
  const organizationId = period?.organizationId
  const subOrganizationId = period?.subOrganizationId
  const year = period?.year
  const month = period?.month
  const selection = useMemo(() => organizationId && subOrganizationId && year !== undefined && month !== undefined
    ? { organizationId, subOrganizationId, year, month } : null, [organizationId, subOrganizationId, year, month])
  useEffect(() => {
    void editor.select(selection, adapter)
  }, [editor, selection, adapter])
  useEffect(() => () => editor.leave(), [editor])
  const snapshot = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot)
  // Selection changes render before the effect runs. Never expose the old
  // period's draft or save controls during that render.
  const current = snapshot.key === reportingPeriodKey(selection)
  return {
    formData: current ? snapshot.data ?? initialData : initialData,
    setFormData: (change: T | ((previous: T) => T)) => editor.edit(selection, change),
    loading: !current || snapshot.loading,
    saving: current && snapshot.saving,
    frozen: current && snapshot.frozen,
    readOnly: !current || snapshot.readOnly,
    hasUnsavedChanges: current && snapshot.hasUnsavedChanges,
    lastSaved: current ? snapshot.lastSaved : null,
    error: current ? snapshot.error : null,
    save: () => current ? editor.save() : Promise.resolve(false),
  }
}
