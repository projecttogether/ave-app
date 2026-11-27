'use client'

import { periodLabel } from '@/lib/operating-data/periods'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getCalculationReport, saveCalculationReport, listCalculationReports, getArchivedCalculationReport } from '@/app/actions/calculation-reports'
import type { CalculationReport } from '@/lib/indicators/report'
import type { Granularity } from '@/lib/indicators/aggregation'
import { calculationReportCsv } from '@/lib/indicators/report-export'
import { formatNumber } from '@/lib/format-utils'

type Archived = Awaited<ReturnType<typeof listCalculationReports>>

function download(report: CalculationReport, format: 'json' | 'csv') {
    const body = format === 'json' ? JSON.stringify(report, null, 2) : calculationReportCsv(report)
    const url = URL.createObjectURL(new Blob([body], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `AVE-Berechnung-${report.inputs.year}-${report.formulaVersion}-${report.inputRevision.slice(0, 12)}.${format}`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CalculationBreakdown({ slug, year, granularity, subOrgId, organizationId }: { slug: string; year: number; granularity: Granularity | null; subOrgId?: string; organizationId?: string }) {
    const [live, setLive] = useState<CalculationReport | null>(null)
    const [report, setReport] = useState<CalculationReport | null>(null)
    const [archives, setArchives] = useState<Archived>([])
    const [archiveId, setArchiveId] = useState('')
    const [canArchive, setCanArchive] = useState(false)
    const [frozenAt, setFrozenAt] = useState<string | null>(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [reload, setReload] = useState(0)
    useEffect(() => {
        let cancelled = false
        setReport(null); setLive(null); setArchiveId(''); setError(''); setArchives([]); setCanArchive(false); setFrozenAt(null)
        Promise.all([getCalculationReport(year, granularity, subOrgId, organizationId), subOrgId ? listCalculationReports(subOrgId, year) : Promise.resolve([])])
            .then(([result, saved]) => {
                if (!cancelled) { setReport(result.report); setLive(result.report); setArchives(saved); setCanArchive(result.canArchive); setFrozenAt(result.frozenAt) }
            }).catch(e => { if (!cancelled) setError(e.message) })
        return () => { cancelled = true }
    }, [year, granularity, subOrgId, organizationId, reload])
    const indicator = report?.indicators.find(item => item.slug === slug)

    async function archive() {
        if (!report || !subOrgId) return
        setBusy(true); setError('')
        try {
            const id = await saveCalculationReport(year, granularity, subOrgId, report.inputRevision, report.formulaVersion)
            setArchives(await listCalculationReports(subOrgId, year))
            setReport(await getArchivedCalculationReport(id)); setArchiveId(id)
        } catch (e) { setError(e instanceof Error ? e.message : 'Archivierung fehlgeschlagen') }
        finally { setBusy(false) }
    }
    async function chooseArchive(id: string) {
        if (!id) { setArchiveId(''); setReport(live); return }
        setBusy(true); setError('')
        try { const saved = await getArchivedCalculationReport(id); setReport(saved); setArchiveId(id) }
        catch (e) { setError(e instanceof Error ? e.message : 'Bericht konnte nicht geladen werden') }
        finally { setBusy(false) }
    }

    return <section className="rounded-lg border p-4 space-y-4" aria-label="Berechnung und Datenabdeckung">
        <div className="flex flex-wrap justify-between gap-3 items-center">
            <h2 className="text-xl font-semibold">Berechnung und Datenabdeckung</h2>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setReload(value => value + 1)}>Neu laden</Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!report && !error && <p role="status">Berechnung wird geladen…</p>}
        {report && indicator && <>
            <p className="text-sm">{archiveId ? 'Archivierter Bericht' : 'Aktueller Datenstand'} vom {new Date(report.createdAt).toLocaleString('de-DE')}. Ergebnis: <strong>{indicator.value === null ? 'Nicht berechenbar' : `${formatNumber(indicator.value, 2)} ${indicator.unit}`}</strong></p>
            {archiveId && <p className="text-sm text-muted-foreground">Dieser Bericht behält die damaligen Eingaben und Regeln. Die übrigen Diagramme auf dieser Seite zeigen den aktuellen Datenstand.</p>}
            {frozenAt && <p className="text-sm text-muted-foreground">Das Berichtsjahr ist seit {new Date(frozenAt).toLocaleString('de-DE')} gesperrt. Maßgeblich ist der beim Sperren archivierte Bericht. Der aktuelle Datenstand verwendet den aktuellen Basiswert und kann davon abweichen.</p>}
            {indicator.coverage.length > 0 && <ul className="text-sm space-y-1">{indicator.coverage.map((c, i) => <li key={i}>{c.kitchen}: {c.annual ? 'Jahreswert vorhanden' : `${c.reportedMonths} von ${c.expectedMonths} Monaten erfasst`}</li>)}</ul>}
            {indicator.warnings.length > 0 && <ul className="text-sm text-amber-800 dark:text-amber-300 space-y-1">{indicator.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
            <details className="space-y-3">
                <summary className="cursor-pointer font-medium">Rechenweg, Eingaben und Ausschlüsse anzeigen</summary>
                <p className="text-sm break-words">{indicator.formula}</p>
                {indicator.numerator !== null && <p className="text-sm">{slug === 'food_waste' ? 'Erfasste Abfallmenge' : 'Zähler / Summe'}: {indicator.numerator}{indicator.denominator !== null ? `; ${slug === 'food_waste' ? 'Vergleichsbasis' : 'Nenner'}: ${indicator.denominator}` : ''}</p>}
                {indicator.rows.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm text-left">
                    <thead><tr><th className="p-2">Betrieb / Periode</th><th className="p-2">Status</th><th className="p-2">Zähler</th><th className="p-2">Nenner</th></tr></thead>
                    <tbody>{indicator.rows.map(row => <tr key={row.id} className="border-t"><td className="p-2">{row.kitchen}, {row.period ? periodLabel(row.period) : `${row.month || 'Jahr'}/${row.year}`} </td><td className="p-2">{row.reason}{row.warnings.map(w => <p key={w} className="text-amber-800 dark:text-amber-300">{w}</p>)}</td><td className="p-2">{row.numerator ?? '–'}</td><td className="p-2">{row.denominator ?? '–'}</td></tr>)}</tbody>
                </table></div>}
                {indicator.baselineSources.map((base, i) => <p className="text-sm" key={i}>{base.kitchen}: {base.source}. Basis für die erfassten Perioden: {base.amount === null ? 'fehlt' : `${formatNumber(base.amount, 6)} kg`}.</p>)}
                {indicator.questionnaire.map((q, i) => <p className="text-sm" key={i}>{q.kitchen}: {q.answered} von {q.questions} Fragen beantwortet; {q.points} von {q.maximum} möglichen Punkten; Ergebnis {q.score ?? '–'} Punkte.</p>)}
                <p className="text-xs text-muted-foreground break-all">Formelversion {report.formulaVersion}; Datenrevision {report.inputRevision}. Beträge werden vor der Division summiert. Ergebnisse werden kaufmännisch auf zwei Nachkommastellen gerundet; Fragebogenscores auf ganze Punkte.</p>
            </details>
            <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => download(report, 'csv')}>Rechenweg als CSV</Button>
                <Button variant="outline" size="sm" onClick={() => download(report, 'json')}>Vollständigen Bericht herunterladen</Button>
                {canArchive && !archiveId && <Button size="sm" disabled={busy} onClick={archive}>Bericht unveränderlich archivieren</Button>}
            </div>
            {!subOrgId && <p className="text-sm text-muted-foreground">Zum Archivieren einen einzelnen Betrieb auswählen. Die Downloads enthalten alle Betriebe dieser Auswahl.</p>}
        </>}
        {archives.length > 0 && <label className="block text-sm">Gespeicherte Berichte
            <select aria-label="Gespeicherten Bericht auswählen" className="mt-1 block w-full rounded border p-2 bg-background" value={archiveId} disabled={busy} onChange={event => chooseArchive(event.target.value)}>
                <option value="">Aktueller Datenstand</option>
                {archives.map(a => <option key={a.id} value={a.id}>{new Date(a.createdAt).toLocaleString('de-DE')} · {a.granularity === 'auto' ? 'Automatische Periodenwahl' : a.granularity === 'monthly' ? 'Monatswerte' : a.granularity === 'quarterly' ? 'Quartalswerte' : a.granularity === 'yearly' ? 'Jahreswerte' : 'Jahresübersicht'} · {a.formulaVersion} · {a.inputRevision.slice(0, 8)}{a.atFreeze ? ' · beim Sperren archiviert' : ''}</option>)}
            </select>
        </label>}
    </section>
}
