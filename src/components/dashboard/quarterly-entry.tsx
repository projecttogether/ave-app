'use client'

import { unwrapOperatingResult } from '@/lib/operating-data/result'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ReportingFrequencySelector } from './reporting-frequency-selector'
import { operatingEntryHref, readEntrySelection } from '@/lib/operating-data/entry-selection'
import { getUserSubOrganizations } from '@/app/actions/sub-organizations'
import { loadQuarterlyEntry, saveQuarterlyDraft, publishQuarterlyEntry, previewPeriodConversion } from '@/app/actions/quarterly-entry'
import { INPUT_FIELDS, INPUT_LABELS, type InputField } from '@/lib/indicators/validation'
import { periodKey, periodLabel, periodState, reportingToday } from '@/lib/operating-data/periods'
import type { EntryDraft, Publication } from '@/lib/operating-data/publication'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CurrencyInput } from '@/components/ui/currency-input'
import { NumberInput } from '@/components/ui/number-input'

type Selection = Parameters<typeof loadQuarterlyEntry>[0]
type Loaded = Exclude<Awaited<ReturnType<typeof loadQuarterlyEntry>>['data'], undefined>
const selectionHref = (next: Selection) => operatingEntryHref(next.subOrganizationId,
    { kind: 'quarter', year: next.year, index: next.quarter }, next.workflow === 'quarter' ? undefined : next.workflow)


const selectStyle = 'rounded-md border bg-background p-2 text-sm'

/** Draft saves are serialized per mounted selection. Publication uses a stable
 * request token until the payload changes, including after a lost response. */
export function QuarterlyEntry() {
  const today = reportingToday()
  const query = useSearchParams().toString()
  const [kitchens, setKitchens] = useState<{ id: string; name: string }[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [draft, setDraft] = useState<EntryDraft | null>(null)
  const [status, setStatus] = useState('Daten werden geladen …')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<Exclude<Awaited<ReturnType<typeof previewPeriodConversion>>['data'], undefined> | null>(null)
  const [conversionConfirmed, setConversionConfirmed] = useState(false)
  const current = useRef<{ selection: Selection; draft: EntryDraft; revision: number; saved: string } | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const token = useRef<{ payload: string; id: string } | null>(null)
  const alive = useRef(true)
  const loadGeneration = useRef(0)

  const saveDraft = useCallback(async () => {
    const snapshot = current.current
    if (!snapshot || snapshot.saved === JSON.stringify(snapshot.draft)) return
    const payload = structuredClone(snapshot.draft)
    const serialized = JSON.stringify(payload)
    const task = queue.current.then(async () => {
      if (snapshot.saved === serialized) return
      const result = unwrapOperatingResult(await saveQuarterlyDraft(snapshot.selection, payload, snapshot.revision))
      snapshot.revision = result.revision
      snapshot.saved = serialized
      if (alive.current) setStatus('Entwurf gespeichert. Noch nicht in Auswertungen enthalten.')
    })
    queue.current = task.catch(() => {})
    await task
  }, [])


  const load = useCallback(async (next: Selection) => {
    const generation = ++loadGeneration.current
    setBusy(true); setError(''); setPreview(null); setConversionConfirmed(false)
    try {
      await saveDraft()
      const result = unwrapOperatingResult(await loadQuarterlyEntry(next))
      if (generation !== loadGeneration.current || !alive.current) return
      current.current = { selection: next, draft: result.draft, revision: result.draftRevision, saved: JSON.stringify(result.draft) }
      setSelection(next); setLoaded(result); setDraft(result.draft)
      window.history.replaceState(window.history.state, '', selectionHref(next))
      setStatus(result.draftRevision ? 'Gespeicherten Entwurf geladen. Veröffentlichte Werte werden beim Speichern auf Änderungen geprüft.' : 'Gespeicherte Betriebsdaten geladen.')
    } catch (e) { if (generation === loadGeneration.current) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.')
      if (current.current) window.history.replaceState(window.history.state, '', selectionHref(current.current.selection))
    } }
    finally { if (generation === loadGeneration.current) setBusy(false) }
  }, [saveDraft])

  useEffect(() => {
    alive.current = true
    let cancelled = false
    void getUserSubOrganizations().then(items => {
      if (cancelled) return
      setKitchens(items)
      if (!items.length) setError('Keine zugänglichen Betriebe vorhanden.')
    }).catch(e => setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'))
    return () => { cancelled = true; alive.current = false; void saveDraft().catch(() => {}) }
  }, [saveDraft])

  useEffect(() => {
    if (!kitchens.length) return
    try {
      const requested = readEntrySelection(new URLSearchParams(query), { quarterly: true })
      const kitchen = requested.subOrgId ? kitchens.find(k => k.id === requested.subOrgId) : kitchens[0]
      if (!kitchen) throw new Error('Der angeforderte Betrieb ist für dieses Formular nicht verfügbar.')
      const next: Selection = { subOrganizationId: kitchen.id, year: requested.period.year,
        quarter: requested.workflow === 'year' ? 1 : requested.quarter, workflow: requested.workflow }
      if (JSON.stringify(current.current?.selection) !== JSON.stringify(next)) void load(next)
    } catch (e) { setError(e instanceof Error ? e.message : 'Ungültige Auswahl.'); setBusy(false)
      if (current.current) window.history.replaceState(window.history.state, '', selectionHref(current.current.selection))
    }
  }, [query, kitchens, load])

  useEffect(() => {
    if (!draft || !loaded || loaded.frozen || !loaded.canWrite) return
    const timer = setTimeout(() => { void saveDraft().catch(e => { setError(e instanceof Error ? e.message : 'Entwurf nicht gespeichert.'); setStatus('Ungespeicherte Änderungen') }) }, 800)
    return () => clearTimeout(timer)
  }, [draft, loaded, saveDraft])

  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (current.current && current.current.saved !== JSON.stringify(current.current.draft)) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [])

  useEffect(() => {
    const guardNavigation = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const snapshot = current.current
      if (!snapshot || snapshot.saved === JSON.stringify(snapshot.draft)) return
      event.preventDefault(); event.stopPropagation()
      setBusy(true)
      void saveDraft().then(() => { window.location.assign(anchor.href) }).catch(e => setError(e instanceof Error ? e.message : 'Entwurf konnte vor dem Seitenwechsel nicht gespeichert werden.')).finally(() => setBusy(false))
    }
    document.addEventListener('click', guardNavigation, true)
    return () => document.removeEventListener('click', guardNavigation, true)
  }, [saveDraft])

  function change(next: EntryDraft) {
    if (!current.current || busy) return
    current.current.draft = next
    setDraft(next); setStatus('Ungespeicherter Entwurf'); setError(''); setPreview(null); setConversionConfirmed(false)
  }

  function edit(index: number, field: InputField, value: string) {
    if (!draft) return
    change({ ...draft, entries: draft.entries.map((entry, i) => i === index ? { ...entry, values: { ...entry.values, [field]: value === '' ? null : value } } : entry) })
  }

  function request(): Omit<Publication, 'requestId'> {
    if (!draft || !selection) throw new Error('Keine Periode ausgewählt.')
    const entries = draft.entries.filter(entry => selection.workflow !== 'batch' || periodState(entry.period) === 'closed')
      .filter(entry => entry.expectedRevision > 0 || INPUT_FIELDS.some(field => entry.values[field] != null && entry.values[field] !== ''))
    const payload = { subOrganizationId: selection.subOrganizationId, year: selection.year, entries, baseline: draft.baseline,
      expectedModeRevision: draft.expectedModeRevision, expectedPreferenceRevision: draft.expectedPreferenceRevision, workflow: selection.workflow === 'year' ? 'legacy' as const : selection.workflow }
    return payload
  }

  async function publish() {
    if (!selection || !draft || !loaded) return
    setBusy(true); setError('')
    try {
      await saveDraft()
      const input: Publication = { ...request(), requestId: '' }
      if (preview) {
        if (!conversionConfirmed || reason.trim().length < 10) throw new Error('Bitte die vollständige Jahreskorrektur bestätigen und begründen.')
        input.workflow = 'conversion'
        input.conversion = { mode: selection.workflow === 'quarter' ? 'quarterly' : 'legacy', frequency: selection.workflow === 'quarter' ? 'quarterly' : selection.workflow === 'year' ? 'yearly' : 'monthly', expectedSourceRevision: preview.sourceRevision, reason, confirmed: true }
      }
      const serialized = JSON.stringify({ ...input, requestId: undefined })
      if (token.current?.payload !== serialized) token.current = { payload: serialized, id: crypto.randomUUID() }
      input.requestId = token.current.id
      const result = unwrapOperatingResult(await publishQuarterlyEntry(input))
      const updated = { ...draft, baseline: undefined, expectedModeRevision: result.modeRevision, expectedPreferenceRevision: result.preferenceRevision ?? draft.expectedPreferenceRevision,
        entries: draft.entries.map(entry => ({ ...entry, expectedRevision: result.revisions[periodKey(entry.period)] ?? entry.expectedRevision })) }
      current.current!.draft = updated
      setStatus('Veröffentlicht. Alle ausgewählten Perioden wurden gemeinsam gespeichert.')
      try { await saveDraft() } catch { setError('Die Betriebsdaten wurden veröffentlicht, aber der Entwurf konnte nicht aktualisiert werden. Bitte den Entwurf erneut speichern.') }
      setDraft(updated); setPreview(null); setConversionConfirmed(false)
      const fresh = unwrapOperatingResult(await loadQuarterlyEntry(selection))
      setLoaded(fresh)
      setStatus('Veröffentlicht. Alle ausgewählten Perioden wurden gemeinsam gespeichert.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Veröffentlichung fehlgeschlagen. Der Entwurf bleibt erhalten.') }
    finally { setBusy(false) }
  }

  async function showConversion() {
    setBusy(true); setError('')
    try {
      await saveDraft()
      const { workflow: _workflow, ...input } = request()
      setPreview(unwrapOperatingResult(await previewPeriodConversion({ ...input, requestId: crypto.randomUUID() }, selection!.workflow === 'quarter' ? 'quarterly' : 'legacy')))
    } catch (e) { setError(e instanceof Error ? e.message : 'Vorschau fehlgeschlagen.') }
    finally { setBusy(false) }
  }

  async function reloadPublished() {
    if (!selection || !window.confirm('Neueste veröffentlichte Werte laden und den aktuellen Entwurf ersetzen? Nicht veröffentlichte Änderungen dieses Entwurfs gehen dabei verloren.')) return
    setBusy(true); setError('')
    try {
      await queue.current
      const fresh = unwrapOperatingResult(await loadQuarterlyEntry(selection))
      setLoaded(fresh)
      current.current = { selection, draft: fresh.saved, revision: fresh.draftRevision, saved: JSON.stringify(fresh.draft) }
      setDraft(fresh.saved); setPreview(null); setConversionConfirmed(false)
      await saveDraft()
    } catch (e) { setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.') }
    finally { setBusy(false) }
  }

  const conflictingMode = loaded && selection && (selection.workflow === 'quarter'
    ? loaded.mode !== 'quarterly' && loaded.existingPeriods.length > 0 : loaded.mode === 'quarterly')
  const targetFrequency = selection?.workflow === 'quarter' ? 'quarterly' : selection?.workflow === 'year' ? 'yearly' : 'monthly'
  const readOnly = busy || !loaded || !loaded.canWrite || loaded.frozen || (loaded.preferenceRevision !== undefined && loaded.frequency !== targetFrequency && !conflictingMode)
  const closed = draft?.entries.some(e => selection?.workflow === 'year' ? periodState(e.period) !== 'future' : periodState(e.period) === 'closed')
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">{selection?.workflow === 'year' ? 'Jahresdaten für eine Korrektur erfassen' : 'Quartalsweise Betriebsdaten erfassen'}</h1>
      <p className="text-muted-foreground mt-2">Einen Quartalsgesamtwert eingeben oder drei Monatswerte gemeinsam bearbeiten. Entwürfe verändern noch keine Auswertung.</p></div>
    {error && <div role="alert" className="rounded border border-destructive p-4 text-destructive">{error}<Button className="ml-3" variant="outline" disabled={busy} onClick={() => { void saveDraft().catch(e => setError(e.message)) }}>Entwurf erneut speichern</Button></div>}
    <p role="status" aria-live="polite" className="text-sm">{status}</p>
    {selection && <ReportingFrequencySelector subOrganizationId={selection.subOrganizationId} year={selection.year} beforeChange={saveDraft} refreshRevision={loaded?.preferenceRevision}
      onChanged={async frequency => {
        if (frequency === 'yearly') window.location.assign(operatingEntryHref(selection.subOrganizationId, { kind: 'year', year: selection.year, index: 1 }))
        else await load({ ...selection, workflow: frequency === 'quarterly' ? 'quarter' : 'batch' })
      }} />}
    {selection && <div className="flex flex-wrap gap-4 rounded-lg border p-4">
      <label className="grid gap-1 text-sm">Betrieb<select className={selectStyle} disabled={busy} value={selection.subOrganizationId} onChange={e => { void load({ ...selection, subOrganizationId: e.target.value }) }}>{kitchens.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Jahr<select className={selectStyle} disabled={busy} value={selection.year} onChange={e => { void load({ ...selection, year: Number(e.target.value), quarter: Number(e.target.value) === today.year ? Math.min(selection.quarter, Math.ceil(today.month / 3)) : selection.quarter }) }}>{Array.from({ length: today.year - 2024 }, (_, i) => 2025 + i).map(year => <option key={year}>{year}</option>)}</select></label>
      <label className="grid gap-1 text-sm" hidden={selection.workflow === 'year'}>Quartal<select className={selectStyle} disabled={busy} value={selection.quarter} onChange={e => { void load({ ...selection, quarter: Number(e.target.value) }) }}>{[1, 2, 3, 4].filter(q => selection.year < today.year || q <= Math.ceil(today.month / 3)).map(q => <option key={q} value={q}>Q{q}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Vorliegende Zahlen<select className={selectStyle} disabled={busy} value={selection.workflow} onChange={e => { void load({ ...selection, quarter: e.target.value === 'year' ? 1 : selection.quarter, workflow: e.target.value as Selection['workflow'] }) }}><option value="quarter">Gesamtwert für das Quartal</option><option value="batch">Einzelwerte für die drei Monate</option><option value="year">Gesamtwert für das Jahr</option></select></label>
    </div>}
    {selection?.workflow === 'year' && !conflictingMode && <Link className="text-sm underline" href={operatingEntryHref(selection.subOrganizationId, { kind: 'year', year: selection.year, index: 1 })}>Jahresdaten bearbeiten und bestätigen</Link>}
    {loaded?.frozen && <p className="rounded border p-4">Dieses Jahr ist gesperrt. Entwürfe bleiben erhalten, können aber nicht veröffentlicht werden.</p>}
    {conflictingMode && <p className="rounded border border-amber-600 p-4">Für dieses Jahr liegt eine andere Erfassungsart vor. Die vorhandenen Werte werden nicht überschrieben. Eine Änderung erfordert die unten beschriebene Jahreskorrektur.</p>}
    {draft && <div className={`grid gap-4 ${selection?.workflow === 'batch' ? 'xl:grid-cols-3' : ''}`}>
      {draft.entries.map((entry, index) => <fieldset key={periodKey(entry.period)} disabled={readOnly || periodState(entry.period) === 'future'} className="min-w-0 rounded-lg border p-4 space-y-3">
        <legend className="px-2 font-semibold">{periodLabel(entry.period)}</legend>
        {periodState(entry.period) !== 'closed' && <p className="text-sm text-amber-800">{entry.period.kind === 'year' ? 'Jahr läuft. Eine veröffentlichte Korrektur gilt als Zwischenstand. Die Jahresdaten können erst nach Jahresende bestätigt werden.' : 'Dieser Zeitraum ist noch nicht abgeschlossen. Werte bleiben als Entwurf gespeichert.'}</p>}
        <p className="text-xs text-muted-foreground">Nur Beträge dieses Zeitraums. Leer bedeutet unbekannt; 0 bedeutet gemessener Nullwert.</p>
        {INPUT_FIELDS.map(field => <label key={field} className="block text-sm space-y-1"><span>{INPUT_LABELS[field]}{field === 'foodWasteAmount' ? ' (kg)' : ' (€)'}</span>
          {field === 'foodWasteAmount' ? <NumberInput aria-label={`${INPUT_LABELS[field]} ${periodLabel(entry.period)}`} value={entry.values[field] ?? ''} onValueChange={(v, source) => { if (source.source === 'event') edit(index, field, v.value) }} />
            : <CurrencyInput aria-label={`${INPUT_LABELS[field]} ${periodLabel(entry.period)}`} value={entry.values[field] ?? ''} onValueChange={(v, source) => { if (source.source === 'event') edit(index, field, v.value) }} />}
        </label>)}
        {entry.period.kind === 'quarter' && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={entry.coverageConfirmed} onChange={e => change({ ...draft, entries: draft.entries.map((item, i) => i === index ? { ...item, coverageConfirmed: e.target.checked } : item) })} /><span>Die eingetragenen Beträge umfassen dieses vollständige Quartal und sind keine kumulierten Jahreswerte.</span></label>}
      </fieldset>)}
    </div>}
    {draft && loaded && <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Jährlichen Abfall-Basiswert prüfen oder ändern</summary>
      <p className="my-3 text-sm">Der Basiswert gilt für das ganze Jahr. Für ein vollständiges Quartal verwendet die Berechnung ein Viertel davon. Eine Änderung wirkt auf laufende Auswertungen; archivierte Berichte bleiben erhalten.</p>
      <label className="block text-sm">Basiswert (kg/Jahr)<NumberInput disabled={readOnly} value={(draft.baseline ?? loaded.baseline).amount ?? ''} onValueChange={(v, source) => { if (source.source === 'event') change({ ...draft, baseline: { ...(draft.baseline ?? loaded.baseline), amount: v.value || null } }) }} /></label>
      <label className="block text-sm mt-3">Basisdatum<Input type="date" disabled={readOnly} value={(draft.baseline ?? loaded.baseline).date ?? ''} onChange={e => change({ ...draft, baseline: { ...(draft.baseline ?? loaded.baseline), date: e.target.value || null } })} /></label>
    </details>}
    {conflictingMode && <details className="rounded border border-amber-600 p-4"><summary className="cursor-pointer font-medium">Erfassungsart für das gesamte Jahr korrigieren</summary>
      <p className="my-3 text-sm">Diese Korrektur ersetzt alle aktiven Betriebsdaten dieses Betriebs und Jahres durch die unten geprüften Eingaben. Frühere Quellen bleiben unverändert in der Änderungshistorie. Monatswerte werden niemals aus einem Quartalswert geschätzt.</p>
      <Button disabled={readOnly} variant="outline" onClick={() => { void showConversion() }}>Vorher/Nachher-Vorschau erstellen</Button>
      {preview && <div className="mt-4 space-y-4"><p className="text-sm">Betroffene Quellen: {preview.replacedPeriods.map(periodLabel).join('; ')}</p>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Indikator</th><th>Vorher</th><th>Danach</th><th>Neue Abdeckung</th></tr></thead><tbody>{preview.after.indicators.map(after => <tr key={after.slug}><td>{after.title}</td><td>{preview.before.indicators.find(i => i.slug === after.slug)?.value ?? 'Nicht verfügbar'}</td><td>{after.value ?? 'Nicht verfügbar'}</td><td>{after.coverage.map(c => `${c.reportedMonths}/${c.expectedMonths} Monate`).join(', ')}</td></tr>)}</tbody></table></div>
        <details><summary>Vollständige Eingaben, Rechenwege und Ausschlüsse</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ before: preview.before, after: preview.after }, null, 2)}</pre></details>
        <label className="block text-sm">Grund der Korrektur<Input value={reason} disabled={busy} onChange={e => { setReason(e.target.value); setConversionConfirmed(false) }} /></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={conversionConfirmed} disabled={busy} onChange={e => setConversionConfirmed(e.target.checked)} /><span>Ich habe alle Perioden und Beträge geprüft. Nicht ersetzte Perioden bleiben nur in der Historie und fehlen anschließend in der aktiven Jahresauswertung.</span></label>
      </div>}
    </details>}
    {loaded?.revisions && loaded.revisions.length > 0 && <details className="rounded border p-4"><summary className="cursor-pointer">Letzte Änderungen und ursprüngliche Werte (bis zu 50 Einträge)</summary>
      <p className="text-sm my-3">Veröffentlichte Änderungen bleiben mit ihren ursprünglichen Werten erhalten. Ersetzte Werte fließen nicht mehr in Auswertungen ein.</p>
      {loaded.revisions.map(item => <details key={item.id} className="border-t py-2 text-sm"><summary>{new Date(item.createdAt).toLocaleString('de-DE')} · {item.source === 'sub_organizations' ? 'Jahresbasis' : item.source === 'operating_reporting_modes' ? 'Erfassungsart' : item.source === 'operating_reporting_preferences' ? 'Erfassungsrhythmus und Jahresbestätigung' : 'Betriebsdaten'} · {item.reason}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ vorher: item.before, nachher: item.after }, null, 2)}</pre></details>)}
    </details>}
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={readOnly || !closed || (selection?.workflow === 'year' && !conflictingMode) || Boolean(conflictingMode && (!preview || !conversionConfirmed))} onClick={() => { void publish() }}>{busy ? 'Wird gespeichert …' : preview ? 'Geprüfte Jahreskorrektur veröffentlichen' : 'Abgeschlossene Perioden veröffentlichen'}</Button>
      <Button variant="outline" disabled={readOnly} onClick={() => { void reloadPublished() }}>Veröffentlichte Werte laden</Button>
      <Button variant="outline" disabled={readOnly} onClick={() => { void saveDraft().catch(e => setError(e.message)) }}>Entwurf speichern</Button>
      {selection && <Link className="text-sm underline" href={`/tasks?year=${selection.year}&subOrgId=${selection.subOrganizationId}&granularity=auto`}>Aufgaben für diesen Betrieb anzeigen</Link>}
      {selection && <Link className="text-sm underline" href={`/datasets?year=${selection.year}&subOrgId=${selection.subOrganizationId}&granularity=auto`}>Datensätze anzeigen</Link>}
      {selection && <Link className="text-sm underline" href={`/dashboard?year=${selection.year}&subOrgId=${selection.subOrganizationId}&granularity=auto`} onClick={e => { if (current.current?.saved !== JSON.stringify(current.current?.draft)) { e.preventDefault(); setError('Bitte den Entwurf zuerst speichern.') } }}>Jahresübersicht anzeigen</Link>}
    </div>
  </div>
}
