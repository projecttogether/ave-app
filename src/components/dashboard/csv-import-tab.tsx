'use client'

import { unwrapOperatingResult } from '@/lib/operating-data/result'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { previewIndicatorCsv, importIndicatorCsv, type CsvPreview, type CsvImportResult } from '@/app/actions/csv-import'

export function CsvImportTab() {
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [result, setResult] = useState<CsvImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const generation = useRef(0)

  async function inspect(file?: File) {
    const current = ++generation.current
    setPreview(null); setResult(null); setError(''); setConfirmed(false)
    if (!file) return
    setBusy(true)
    try {
      const form = new FormData(); form.set('file', file)
      const checked = unwrapOperatingResult(await previewIndicatorCsv(form))
      if (current === generation.current) setPreview(checked)
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'Datei konnte nicht geprüft werden.') }
    finally { if (current === generation.current) setBusy(false) }
  }

  async function commit() {
    if (!preview || !confirmed) return
    setBusy(true); setError('')
    try {
      const form = new FormData(); form.set('previewToken', preview.token)
      const saved = await importIndicatorCsv(form)
      setResult(saved)
      if (saved.success) setPreview(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Keine Bestätigung erhalten. Mit derselben Vorschau erneut versuchen; der Import wird nicht doppelt gespeichert.') }
    finally { setBusy(false) }
  }

  return <div className="space-y-6">
    <div className="space-y-3 rounded-lg border p-5">
      <h2 className="font-semibold text-lg">Betriebsdaten als CSV importieren</h2>
      <p className="text-sm">Zahlen mit Dezimalpunkt, ohne Tausendertrennzeichen eingeben. Leere Zellen lassen bestehende Werte unverändert. <code>__CLEAR__</code> löscht einen Wert ausdrücklich. 0 ist ein gemessener Nullwert. Scoring wird weiterhin aus dem jährlichen Fragebogen berechnet.</p>
      <p className="text-sm">In der neuen Vorlage steht <code>period_kind</code> für <code>month</code>, <code>quarter</code> oder <code>year</code>. <code>period_index</code> ist 1–12, 1–4 oder 1. Quartale benötigen <code>coverage_confirmed=true</code> und dürfen ausschließlich vollständige, abgeschlossene Quartale enthalten. Keine kumulierten Jahreswerte. Bestehende Monats-/Jahresvorlagen bleiben lesbar.</p>
      <a className="underline text-sm" href="/api/indicator-template" download>CSV-Vorlage herunterladen</a>
      <label className="block text-sm">Datei auswählen (höchstens 750 KB / 1.000 Zeilen)<input className="block mt-2" type="file" accept=".csv,text/csv" disabled={busy} onChange={e => { void inspect(e.target.files?.[0]) }} /></label>
    </div>
    {busy && <p role="status">Daten werden geprüft oder gespeichert …</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {preview && <div className="space-y-4">
      <p>{preview.total} Perioden geprüft. Alle Änderungen werden gemeinsam gespeichert. Änderungen anderer Personen seit dieser Vorschau brechen den gesamten Import ab.</p>
      <div className="max-h-96 overflow-auto border rounded"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Betrieb / Zeitraum</th><th className="p-2 text-left">Änderungen (bisher → neu)</th></tr></thead><tbody>{preview.rows.map((row, i) => <tr key={i} className="border-t"><td className="p-2">{row.kitchen}<br />{row.period}</td><td className="p-2">{Object.entries(row.changes).map(([field, value]) => <div key={field}>{field}: {String(row.before[field] ?? 'Unbekannt')} → {String(value ?? 'Löschen')}</div>)}</td></tr>)}</tbody></table></div>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Ich habe Betriebe, Zeiträume, Werte und ausdrückliche Löschungen geprüft. Quartalsbeträge umfassen genau das angegebene Quartal.</label>
      <Button onClick={() => { void commit() }} disabled={busy || !confirmed}>Geprüfte Änderungen importieren</Button>
    </div>}
    {result && (result.success ? <p role="status">{result.imported} Perioden erfolgreich gespeichert.</p> : <div role="alert" className="text-destructive"><p>Import abgebrochen. Es wurden keine Änderungen gespeichert.</p>{result.errors.map((issue, i) => <p key={i}>{issue.line ? `Zeile ${issue.line}: ` : ''}{issue.message}</p>)}</div>)}
  </div>
}
