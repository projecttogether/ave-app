'use client'

import { useOptimistic, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { reportingPage } from '@/lib/reporting-filters'
import type { Granularity } from '@/lib/indicators/aggregation'
import { useReportingFilters } from './reporting-filters-provider'
import { Button } from './ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

export function ReportingFilterBar() {
  const { filters, options, ready, pending, notice, update } = useReportingFilters()
  const pathname = usePathname()
  const params = useSearchParams()
  const page = reportingPage(pathname)
  const reflection = page === 'datasets' && params.get('tab') === 'reflection' && options.canViewReflection
  const active = ['analysis', 'datasets', 'tasks'].includes(page)
  const allYears = params.get('allYears') === '1' && (page === 'datasets' || page === 'tasks')
  const subs = options.subOrganizations.filter(sub => !filters.organizationId || sub.organizationId === filters.organizationId)
  const disabled = !ready || pending || !active
  const years = Array.from(new Set([...options.years, filters.year])).sort((a, b) => b - a)

  // Administrative tools have their own operational scope, not a reporting scope.
  if ((pathname === '/admin' || pathname.startsWith('/admin/')) && page === 'other') return null

  const description = page === 'form' ? 'Die gemerkte Auswahl bleibt erhalten. Ziel und Zeitraum der Eingabe werden im Formular festgelegt.'
    : page === 'record' ? 'Die Organisation und gegebenenfalls das Berichtsjahr sind durch den geöffneten Datensatz festgelegt. Die gemerkte Auswahl gilt wieder in der Übersicht.'
    : !active ? 'Diese Seite wird nicht gefiltert. Ihre Auswahl bleibt für die nächste Datenansicht erhalten.'
    : reflection ? 'Reflexionsdaten gelten für die gesamte Organisation, unabhängig von Berichtsjahr und Datenansicht. Die übrige Auswahl bleibt gemerkt.'
    : page === 'datasets' ? 'Listen und Exporte verwenden dieselbe Auswahl. Monats- und Jahresdatensätze werden gemeinsam aufgelistet.'
    : page === 'tasks' ? 'Aufgaben berücksichtigen Betriebsdaten und jährliche Scoring-Fragen. Die Datenansicht wird hier nicht angewendet.'
    : filters.granularity === 'monthly' ? 'Monatsdaten verwenden monatliche Meldungen. Jährliche Scoring-Ergebnisse werden in dieser Ansicht nicht angezeigt.'
    : null

  return (
    <section aria-label="Gemeinsame Filter" aria-busy={pending} className="mb-6 space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        {options.organizations ? (
          <FilterSelect label="Organisation" value={filters.organizationId ?? 'all'} disabled={disabled}
            onChange={value => update({ ...filters, organizationId: value === 'all' ? undefined : value, subOrgId: undefined })}
            items={[{ value: 'all', label: 'Alle Organisationen' }, ...options.organizations.map(org => ({ value: org.id, label: org.name }))]} />
        ) : <div className="text-sm"><span className="block text-xs text-muted-foreground">Organisation</span>{options.organizationName}</div>}
        <FilterSelect label="Unterorganisation" value={filters.subOrgId ?? 'all'} disabled={disabled || reflection || subs.length <= 1}
          onChange={value => {
            const sub = subs.find(sub => sub.id === value)
            update({ ...filters, subOrgId: sub?.id, organizationId: options.organizations && sub ? sub.organizationId : filters.organizationId })
          }} items={[{ value: 'all', label: subs.length === 1 ? subs[0].name : 'Alle Unterorganisationen' }, ...subs.map(sub => ({ value: sub.id, label: sub.name }))]} />
        <FilterSelect label="Berichtsjahr" value={String(filters.year)} disabled={disabled || reflection}
          onChange={value => update({ ...filters, year: Number(value) })}
          items={years.map(year => ({ value: String(year), label: String(year) }))} />
        <FilterSelect label="Datenansicht" value={filters.granularity} disabled={disabled || page !== 'analysis'}
          onChange={value => update({ ...filters, granularity: value as Granularity })}
          items={[{ value: 'auto', label: 'Jahresübersicht · alle Perioden' }, { value: 'quarterly', label: 'Quartalsverlauf' },
            { value: 'yearly', label: 'Erfasste Jahreswerte' }, { value: 'monthly', label: 'Erfasste Monatswerte' }]} />
        {active && <Button variant="ghost" disabled={disabled} onClick={() => update({ year: options.defaultYear, granularity: 'auto' }, true)}>Zurücksetzen</Button>}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {allYears && !reflection && <p className="text-sm font-medium">Diese Liste zeigt alle Jahre. Die Jahresauswahl bleibt für andere Datenansichten gemerkt.</p>}
      {options.personalOrganizationName && (pathname === '/datasets' || page === 'tasks') && <p className="text-xs text-muted-foreground">
        Ohne Organisationsauswahl zeigt diese Seite die Daten Ihrer zugeordneten Organisation {options.personalOrganizationName}.
      </p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {pending && <p role="status" className="text-sm">Daten werden aktualisiert…</p>}
    </section>
  )
}

function FilterSelect({ label, value, disabled, onChange, items }: {
  label: string; value: string; disabled: boolean; onChange: (value: string) => void
  items: { value: string; label: string }[]
}) {
  return <div className="min-w-0 max-w-full space-y-1">
    <span className="block text-xs text-muted-foreground">{label}</span>
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={`${label} auswählen`} className="max-w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>
}

export function AllReportingYears() {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [allYears, setAllYears] = useOptimistic(params.get('allYears') === '1')
  return <label className="flex items-center gap-2 text-sm" aria-busy={pending}>
    <input type="checkbox" checked={allYears} disabled={pending} onChange={event => {
      const checked = event.target.checked
      const next = new URLSearchParams(params)
      if (checked) next.set('allYears', '1')
      else next.delete('allYears')
      startTransition(() => {
        setAllYears(checked)
        router.push(`${pathname}?${next}`, { scroll: false })
      })
    }} />Alle Jahre anzeigen
    {pending && <span role="status" className="text-muted-foreground">Wird aktualisiert…</span>}
  </label>
}
