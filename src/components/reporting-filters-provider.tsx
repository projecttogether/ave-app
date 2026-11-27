'use client'

import { createContext, useContext, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  hasReportingFilters, isReportingView, readReportingFilters, reportingHref, reportingQueryMatches,
  validateReportingFilters, writeReportingFilters,
  type ReportingFilters, type ReportingFilterOptions,
} from '@/lib/reporting-filters'

type ReportingContext = {
  filters: ReportingFilters
  options: ReportingFilterOptions
  ready: boolean
  pending: boolean
  notice: string
  href: (href: string) => string
  update: (filters: ReportingFilters, resetList?: boolean) => void
}
const Context = createContext<ReportingContext | null>(null)
// Survives switching between the data, form and admin layouts when storage is unavailable.
const memory = new Map<string, string>()

export function ReportingFiltersProvider({ children, options, storageKey }: {
  children: React.ReactNode; options: ReportingFilterOptions; storageKey: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()
  const router = useRouter()
  const [remembered, setRemembered] = useState<ReportingFilters>()
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [pending, startTransition] = useTransition()
  const isView = isReportingView(pathname)
  const params = new URLSearchParams(query)
  const explicit = isView && hasReportingFilters(params)
  const filters = validateReportingFilters(explicit ? readReportingFilters(params, options.defaultYear)
    : remembered ?? readReportingFilters(new URLSearchParams(), options.defaultYear), options)
  const canonical = !isView || reportingQueryMatches(params, filters)

  useEffect(() => {
    let saved: string | null = null
    try { saved = sessionStorage.getItem(storageKey) } catch { /* URLs work when storage is unavailable. */ }
    const params = new URLSearchParams(query)
    const requested = readReportingFilters(isReportingView(pathname) && hasReportingFilters(params)
      ? params : new URLSearchParams(saved ?? memory.get(storageKey) ?? ''), options.defaultYear)
    const next = validateReportingFilters(requested, options)
    if (requested.organizationId !== next.organizationId || requested.subOrgId !== next.subOrgId) {
      setNotice('Eine frühere Auswahl ist nicht mehr verfügbar. Die Filter wurden zurückgesetzt.')
    }
    setRemembered(next)
    setReady(true)
    const serialized = writeReportingFilters(new URLSearchParams(), next).toString()
    memory.set(storageKey, serialized)
    try { sessionStorage.setItem(storageKey, serialized) } catch { /* Optional persistence. */ }
    if (isReportingView(pathname) && !reportingQueryMatches(params, next)) {
      const normalized = writeReportingFilters(params, next).toString()
      router.replace(`${pathname}?${normalized}${window.location.hash}`, { scroll: false })
    }
  }, [pathname, query, options, storageKey, router])

  const update = (next: ReportingFilters, resetList = false) => {
    setNotice('')
    const params = writeReportingFilters(new URLSearchParams(query), validateReportingFilters(next, options))
    // Choosing a year explicitly exits the list's all-years override.
    if (next.year !== filters.year || resetList) params.delete('allYears')
    startTransition(() => router.push(`${pathname}?${params}${window.location.hash}`, { scroll: false }))
  }

  // Canonical URLs fully describe the view, so they render without waiting for storage.
  return <Context.Provider value={{ filters, options, ready: (ready || explicit || !isView) && canonical, pending, notice,
    href: href => reportingHref(href, filters, options.formSubOrgIds), update }}>{children}</Context.Provider>
}

export function useReportingFilters() {
  const context = useContext(Context)
  if (!context) throw new Error('ReportingFiltersProvider is missing')
  return context
}

/** Navigation through an unrelated page keeps the selection; record URLs keep their identity. */
export function ReportingLink({ href, ...props }: Omit<React.ComponentProps<typeof Link>, 'href'> & { href: string }) {
  const context = useContext(Context)
  return <Link href={context ? context.href(href) : href} {...props} />
}

export function ReportingContent({ children }: { children: React.ReactNode }) {
  const { ready, pending } = useReportingFilters()
  return ready ? <div aria-busy={pending} className={pending ? 'opacity-60' : undefined}>{children}</div>
    : <p role="status" className="py-6 text-sm text-muted-foreground">Auswahl wird geladen…</p>
}
