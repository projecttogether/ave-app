'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createOperatingDataEditor } from '@/lib/operating-data/editor'
import { EMPTY_OPERATING_DATA, operatingPeriodKey, type OperatingDataFields, type OperatingPeriod } from '@/lib/operating-data/fields'
import { createPendingWrites } from '@/lib/forms/pending-writes'
import { loadOperatingDataDraft, saveOperatingDataDraft } from '@/app/actions/operating-data'

const writes = createPendingWrites()
const adapter = {
  load: (period: OperatingPeriod) => writes.read(`${period.organizationId}|${period.subOrganizationId}`, () => loadOperatingDataDraft(period)),
  save: (request: Parameters<typeof saveOperatingDataDraft>[0]) => writes.write(`${request.period.organizationId}|${request.period.subOrganizationId}`, () => saveOperatingDataDraft(request)),
}

export function useOperatingDataEditor(period: OperatingPeriod | null) {
  const [editor] = useState(() => createOperatingDataEditor(adapter))
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot)
  const organizationId = period?.organizationId
  const subOrganizationId = period?.subOrganizationId
  const year = period?.year
  const month = period?.month
  useEffect(() => {
    editor.select(organizationId && subOrganizationId && year !== undefined && month !== undefined
      ? { organizationId, subOrganizationId, year, month } : null)
  }, [editor, organizationId, subOrganizationId, year, month])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!editor.getSnapshot().pending) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { window.removeEventListener('beforeunload', beforeUnload); editor.dispose() }
  }, [editor])
  // Do not expose the previous period's fields during the render before selection's effect.
  const key = period ? operatingPeriodKey(period) : null
  const matches = key !== null && state.current?.key === key
  return {
    ...state,
    current: matches ? state.current : null,
    data: matches ? state.current?.data ?? EMPTY_OPERATING_DATA : EMPTY_OPERATING_DATA,
    loading: !matches || !state.current?.loaded,
    frozen: matches ? state.current?.frozen ?? false : false,
    edit(field: keyof OperatingDataFields, value: string | number) {
      if (key !== null && editor.getSnapshot().current?.key === key) editor.edit(field, value)
    },
    save: () => key !== null && editor.getSnapshot().current?.key === key ? editor.flush(key) : Promise.resolve(),
    retry: editor.retry,
    saveAndCheck: editor.saveAndCheck,
    reload: editor.reload,
  }
}
