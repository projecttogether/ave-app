import { resolveGranularity } from '@/lib/indicators/granularity'
import type { Granularity } from '@/lib/indicators/aggregation'
import { reportingToday } from '@/lib/operating-data/periods'

export type ReportingFilters = {
  year: number
  granularity: Granularity
  organizationId?: string
  subOrgId?: string
}

export type ReportingFilterOptions = {
  defaultYear: number
  years: number[]
  organizations?: { id: string; name: string }[]
  subOrganizations: { id: string; name: string; organizationId: string }[]
  organizationName: string
  personalOrganizationName?: string
  canViewReflection: boolean
  /** Sites the entry forms can open; reporting-only sites are never prefilled into a form. */
  formSubOrgIds: string[]
}

export type ReportingSearchParams = Record<string, string | string[] | undefined>
const keys = ['year', 'granularity', 'organizationId', 'subOrgId'] as const

export function reportingParams(values: ReportingSearchParams) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') params.set(key, value)
  }
  return params
}

export function hasReportingFilters(params: URLSearchParams) {
  return keys.some(key => params.has(key))
}

// A URL with any reporting parameter describes a complete view. Missing scope
// parameters mean all accessible data, never a hidden remembered restriction.
export function readReportingFilters(params: URLSearchParams, defaultYear = reportingToday().year): ReportingFilters {
  const year = Number(params.get('year'))
  return {
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : defaultYear,
    granularity: resolveGranularity(params.get('granularity')),
    organizationId: params.get('organizationId') || undefined,
    subOrgId: params.get('subOrgId') || undefined,
  }
}

export function validateReportingFilters(filters: ReportingFilters, options: ReportingFilterOptions): ReportingFilters {
  const organizationId = options.organizations?.some(org => org.id === filters.organizationId)
    ? filters.organizationId : undefined
  const subOrgId = options.subOrganizations.some(sub => sub.id === filters.subOrgId && (!organizationId || sub.organizationId === organizationId))
    ? filters.subOrgId : undefined
  return { ...filters, organizationId, subOrgId }
}

export function writeReportingFilters(params: URLSearchParams, filters: ReportingFilters) {
  const next = new URLSearchParams(params)
  keys.forEach(key => next.delete(key))
  next.set('year', String(filters.year))
  next.set('granularity', filters.granularity)
  if (filters.organizationId) next.set('organizationId', filters.organizationId)
  if (filters.subOrgId) next.set('subOrgId', filters.subOrgId)
  return next
}

export function reportingQueryMatches(params: URLSearchParams, filters: ReportingFilters) {
  const expected = writeReportingFilters(new URLSearchParams(), filters)
  // Query order and page-specific controls must not trigger a second navigation.
  return keys.every(key => params.getAll(key).length === expected.getAll(key).length
    && params.get(key) === expected.get(key))
}

export function reportingPage(pathname: string) {
  if (['/dashboard', '/indikatoren', '/vergleich'].includes(pathname) || /^\/detail\/[^/]+$/.test(pathname)) return 'analysis'
  if (['/datasets', '/admin/datasets'].includes(pathname)) return 'datasets'
  if (pathname === '/tasks') return 'tasks'
  if (pathname === '/operating-periods' || pathname.startsWith('/form/') || /^\/detail\/[^/]+\/(operating|scoring|reflection)$/.test(pathname)) return 'form'
  if (/^\/(admin\/)?datasets\/.+/.test(pathname)) return 'record'
  return 'other'
}

export function isReportingView(pathname: string) {
  return ['analysis', 'datasets', 'tasks'].includes(reportingPage(pathname))
}

export function reportingHref(href: string, filters: ReportingFilters, formSubOrgIds?: string[]) {
  if (!href.startsWith('/') || href.startsWith('//')) return href
  const url = new URL(href, 'https://ave.invalid')
  const page = reportingPage(url.pathname)
  if (isReportingView(url.pathname)) {
    const selection = hasReportingFilters(url.searchParams) ? readReportingFilters(url.searchParams) : filters
    url.search = writeReportingFilters(url.searchParams, selection).toString()
  } else if (page === 'form' && !url.pathname.endsWith('/reflection')) {
    // Forms receive initial values only. Their own controls own the save target.
    if (!url.searchParams.has('year')) url.searchParams.set('year', String(filters.year))
    const openable = !formSubOrgIds || formSubOrgIds.includes(filters.subOrgId ?? '')
    if (!url.searchParams.has('subOrgId') && filters.subOrgId && openable) url.searchParams.set('subOrgId', filters.subOrgId)
  }
  return `${url.pathname}${url.search}${url.hash}`
}
