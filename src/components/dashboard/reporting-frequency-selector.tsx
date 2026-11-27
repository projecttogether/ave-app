'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { confirmAnnualReporting, getReportingPreference, setReportingFrequency } from '@/app/actions/reporting-preferences'
import { unwrapOperatingResult } from '@/lib/operating-data/result'
import { FREQUENCY_LABELS, type ReportingFrequency } from '@/lib/operating-data/preferences'
import { periodLabel } from '@/lib/operating-data/periods'
import { INPUT_LABELS, type InputField } from '@/lib/indicators/validation'
import { Button } from '@/components/ui/button'

type Status = Exclude<Awaited<ReturnType<typeof getReportingPreference>>['data'], undefined>
type Change = Exclude<Awaited<ReturnType<typeof setReportingFrequency>>['data'], undefined>

export function ReportingFrequencySelector({ subOrganizationId, year, beforeChange, onResolved, onChanged, refreshRevision }: {
  subOrganizationId: string; year: number; beforeChange: () => Promise<void>; refreshRevision?: number
  onResolved?: (frequency: ReportingFrequency | null) => void
  onChanged: (frequency: ReportingFrequency) => Promise<void> | void
}) {
  const [state, setState] = useState<{ key: string; data: Status } | null>(null)
  const [selected, setSelected] = useState<ReportingFrequency | null>(null)
  const [result, setResult] = useState<Change | null>(null)
  const [annualReview, setAnnualReview] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const callbacks = useRef({ beforeChange, onResolved, onChanged })
  const key = `${subOrganizationId}:${year}`
  const currentKey = useRef(key)
  useLayoutEffect(() => {
    callbacks.current = { beforeChange, onResolved, onChanged }
    currentKey.current = key
  }, [beforeChange, onResolved, onChanged, key])
  const data = state?.key === key ? state.data : null
  useEffect(() => {
    let alive = true
    setError(''); setResult(null); setAnnualReview(null); setBusy(false)
    if (subOrganizationId) void getReportingPreference({ subOrganizationId, year }).then(unwrapOperatingResult).then(value => {
      if (!alive) return
      setState({ key, data: value }); setSelected(value.frequency ?? value.suggestion)
      callbacks.current.onResolved?.(value.frequency)
    }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Erfassungsrhythmus konnte nicht geladen werden.') })
    return () => { alive = false }
  }, [key, subOrganizationId, year, refreshRevision])

  async function refresh() {
    const next = unwrapOperatingResult(await getReportingPreference({ subOrganizationId, year }))
    if (currentKey.current !== key) throw new Error('Die Auswahl wurde inzwischen geändert.')
    setState({ key, data: next })
    return next
  }

  async function choose(frequency: ReportingFrequency, confirmed = false) {
    if (!data || busy) return
    setBusy(true); setError(''); setAnnualReview(null); setSelected(frequency)
    try {
      await callbacks.current.beforeChange()
      const change = unwrapOperatingResult(await setReportingFrequency({ subOrganizationId, year, frequency, expectedRevision: data.revision, confirmed }))
      if (currentKey.current !== key) return
      setResult(change)
      if (change.kind === 'saved') {
        await refresh()
        await callbacks.current.onChanged(change.frequency)
      }
    } catch (e) { if (currentKey.current === key) setError(e instanceof Error ? e.message : 'Änderung fehlgeschlagen.') }
    finally { if (currentKey.current === key) setBusy(false) }
  }

  async function reviewAnnual() {
    setBusy(true); setError('')
    try { await callbacks.current.beforeChange(); setAnnualReview(await refresh()) }
    catch (e) { if (currentKey.current === key) setError(e instanceof Error ? e.message : 'Jahresdaten konnten nicht geladen werden.') }
    finally { if (currentKey.current === key) setBusy(false) }
  }

  async function confirmAnnual() {
    if (!annualReview?.annual || busy) return
    setBusy(true); setError('')
    try {
      await callbacks.current.beforeChange()
      unwrapOperatingResult(await confirmAnnualReporting({ subOrganizationId, year, expectedRevision: annualReview.revision,
        recordId: annualReview.annual.id, recordRevision: annualReview.annual.revision }))
      await refresh(); setAnnualReview(null)
      await callbacks.current.onChanged('yearly')
    } catch (e) { if (currentKey.current === key) { setError(e instanceof Error ? e.message : 'Bestätigung fehlgeschlagen.'); setAnnualReview(null) } }
    finally { if (currentKey.current === key) setBusy(false) }
  }

  if (!subOrganizationId) return null
  const disabled = busy || !data?.canWrite || data.frozen
  return <section aria-label="Erfassungsrhythmus" className="rounded-lg border p-4 space-y-3" aria-busy={busy}>
    <div><h3 className="font-medium">Erfassungsrhythmus für {year}</h3>
      <p className="text-sm text-muted-foreground">Diese Auswahl gilt für alle, die Betriebsdaten dieses Betriebs und Jahres erfassen. Aufgaben folgen diesem Rhythmus.</p></div>
    {!data && !error && <p role="status">Erfassungsrhythmus wird geladen …</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {data && <>
      <p className="text-sm">{data.frequency ? `Gewählt: ${FREQUENCY_LABELS[data.frequency]}` : 'Bitte einen Erfassungsrhythmus wählen.'}
        {data.source === 'legacy' && ' Aus vorhandenen Daten übernommen.'}
        {!data.frequency && data.suggestion && ` Vorschlag: ${FREQUENCY_LABELS[data.suggestion]}.`}</p>
      <div className="flex flex-wrap gap-2">{(['monthly', 'quarterly', 'yearly'] as const).map(frequency =>
        <Button key={frequency} type="button" size="sm" variant={data.frequency === frequency ? 'default' : 'outline'}
          aria-pressed={data.frequency === frequency} disabled={disabled}
          onClick={() => { void choose(frequency) }}>{FREQUENCY_LABELS[frequency]}</Button>)}</div>
      {!data.canWrite && <p className="text-sm">Nur Ansicht. Zum Ändern ist eine Schreibberechtigung erforderlich.</p>}
      {data.frozen && <p className="text-sm">Dieses Berichtsjahr ist gesperrt.</p>}
      {result?.kind === 'preview' && selected && <div className="rounded border p-3 space-y-2 text-sm">
        <p>Vorhandene Daten: {result.periods.map(periodLabel).join('; ')}.</p>
        <p>Nach Wechsel zu {FREQUENCY_LABELS[selected]}: {result.tasks.length ? result.tasks.map(task => periodLabel(task.period)).join('; ') : 'Keine offenen Betriebsdatenaufgaben.'}</p>
        <p>Vorhandene Beträge bleiben erhalten. Ein Jahreswert ersetzt keine Monatsmessungen. Bei gleichzeitig gespeicherten Monats- und Jahreswerten verwenden Auswertungen weiterhin ihre bisherige Auswahl mit Vorrang der Monatswerte je Indikator.</p>
        <Button type="button" disabled={disabled} onClick={() => { void choose(selected, true) }}>Rhythmus ändern</Button>
      </div>}
      {result?.kind === 'conversion' && <p className="text-sm">Vorhandene Daten benötigen eine geprüfte Jahreskorrektur. Der bisherige Rhythmus bleibt bis zur Veröffentlichung erhalten. <Link className="underline" href={result.href}>Jahreskorrektur öffnen</Link></p>}
      {data.frequency === 'yearly' && <div className="text-sm space-y-2">
        <p role="status">{!data.yearClosed ? 'Jahr läuft. Die Jahresaufgabe wird nach Jahresende fällig. Zwischenstände können bereits gespeichert werden.'
          : data.annual?.confirmed ? 'Jahresdaten bestätigt. Spätere Änderungen erfordern eine erneute Bestätigung.' : 'Jahresdaten fällig. Bitte die Werte nach Jahresende prüfen und bestätigen.'}</p>
        {data.yearClosed && <Button type="button" variant="outline" disabled={disabled} onClick={() => { void reviewAnnual() }}>Jahresdaten prüfen</Button>}
        {annualReview && <div className="rounded border p-3 space-y-3">
          {annualReview.annual ? <>
            <p>Gespeicherte Jahreswerte für {year}. Bitte vor der Bestätigung prüfen. Leer bedeutet unbekannt.</p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">{Object.entries(annualReview.annual.values).map(([field, value]) => <div key={field}><dt className="text-muted-foreground">{INPUT_LABELS[field as InputField]}</dt><dd>{value ?? 'Unbekannt'}{value != null ? field === 'foodWasteAmount' ? ' kg' : ' €' : ''}</dd></div>)}</dl>
            <Button type="button" disabled={disabled} onClick={() => { void confirmAnnual() }}>Jahresdaten bestätigen</Button>
          </> : <p>Es sind noch keine Jahreswerte gespeichert. Bitte zuerst die Jahresdaten erfassen.</p>}
        </div>}
      </div>}
    </>}
  </section>
}
