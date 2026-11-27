import { describe, expect, it } from 'vitest'
import { isReportingView, readReportingFilters, reportingHref, reportingPage, reportingQueryMatches, validateReportingFilters,
  writeReportingFilters, type ReportingFilterOptions, type ReportingFilters } from '@/lib/reporting-filters'

const selection: ReportingFilters = { year: 2025, granularity: 'monthly', organizationId: 'a', subOrgId: 'a1' }
const options: ReportingFilterOptions = { defaultYear: 2026, years: [2026, 2025], organizationName: 'Alle Organisationen', canViewReflection: true, formSubOrgIds: ['a1'],
  organizations: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
  subOrganizations: [{ id: 'a1', organizationId: 'a', name: 'A1' }, { id: 'b1', organizationId: 'b', name: 'B1' }] }

describe('shared reporting navigation', () => {
  it('accepts page-specific options in any query order without a second navigation, but normalizes duplicate filters', () => {
    const filters = { year: 2025, granularity: 'monthly' as const }
    expect(reportingQueryMatches(new URLSearchParams('year=2025&tab=scoring&granularity=monthly&allYears=1'), filters)).toBe(true)
    expect(reportingQueryMatches(new URLSearchParams('year=2025&year=2026&granularity=monthly'), filters)).toBe(false)
    expect(reportingQueryMatches(new URLSearchParams('year=2025'), filters)).toBe(false)
  })
  it('carries the whole selection through sidebar links and preserves hashes and page-specific parameters', () => {
    expect(reportingHref('/datasets?tab=scoring&allYears=1#rows', selection))
      .toBe('/datasets?tab=scoring&allYears=1&year=2025&granularity=monthly&organizationId=a&subOrgId=a1#rows')
    expect(reportingHref('/indikatoren', selection)).toContain('subOrgId=a1')
  })
  it('gives an explicit shared link precedence over remembered scope, including omitted all-organizations scope', () => {
    expect(reportingHref('/dashboard?year=2024', selection)).toBe('/dashboard?year=2024&granularity=auto')
    expect(readReportingFilters(new URLSearchParams('year=not-a-year&granularity=weekly'), 2026))
      .toEqual({ year: 2026, granularity: 'auto' })
  })
  it('preserves fixed record identity and leaves unrelated and external pages alone', () => {
    for (const href of ['/datasets/operating/b1/2024', '/admin/datasets/reflection/b', '/methodology', '/settings', 'https://example.com', '//example.com']) {
      expect(reportingHref(href, selection)).toBe(href)
    }
    expect(reportingPage('/detail/food_waste/operating')).toBe('form')
    expect(isReportingView('/detail/food_waste')).toBe(true)
    expect(isReportingView('/detail/food_waste/reflection')).toBe(false)
  })
  it('prefills a form without treating its entry mode as an analytical filter or overriding an explicit task target', () => {
    expect(reportingHref('/form/operating', selection)).toBe('/form/operating?year=2025&subOrgId=a1')
    expect(reportingHref('/form/scoring?year=2024&subOrgId=b1#question', selection))
      .toBe('/form/scoring?year=2024&subOrgId=b1#question')
    expect(reportingHref('/form/reflection', selection)).toBe('/form/reflection')
  })
  it('never prefills a form with a site the entry forms cannot open', () => {
    expect(reportingHref('/form/operating', selection, ['a1'])).toBe('/form/operating?year=2025&subOrgId=a1')
    expect(reportingHref('/form/operating', selection, ['x1'])).toBe('/form/operating?year=2025')
    expect(reportingHref('/form/scoring?subOrgId=b1', selection, ['x1'])).toBe('/form/scoring?subOrgId=b1&year=2025')
    expect(reportingHref('/indikatoren', selection, ['x1'])).toContain('subOrgId=a1')
  })
  it('clears a site from another organization and removes admin-only selections for ordinary users', () => {
    expect(validateReportingFilters({ ...selection, organizationId: 'b' }, options).subOrgId).toBeUndefined()
    const normal = { ...options, organizations: undefined, subOrganizations: [options.subOrganizations[0]] }
    expect(validateReportingFilters(selection, normal)).toEqual({ ...selection, organizationId: undefined })
    expect(validateReportingFilters({ ...selection, subOrgId: 'b1' }, normal).subOrgId).toBeUndefined()
  })
  it('encodes clearing a filter in a complete URL while retaining page-specific options', () => {
    expect(writeReportingFilters(new URLSearchParams('tab=scoring&subOrgId=a1&organizationId=a'), {
      year: 2026, granularity: 'yearly',
    }).toString()).toBe('tab=scoring&year=2026&granularity=yearly')
  })
})
