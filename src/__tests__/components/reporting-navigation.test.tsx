// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportingFilterOptions } from '@/lib/reporting-filters'

const navigation = vi.hoisted(() => ({ pathname: '/dashboard', query: '', router: { push: vi.fn(), replace: vi.fn() } }))
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => navigation.router,
}))
import { ReportingContent, ReportingFiltersProvider, ReportingLink, useReportingFilters } from '@/components/reporting-filters-provider'
import { ReportingFilterBar } from '@/components/reporting-filter-bar'

const options: ReportingFilterOptions = { defaultYear: 2026, years: [2026, 2025], organizationName: 'Alle Organisationen', canViewReflection: true, formSubOrgIds: ['a1'],
  organizations: [{ id: 'a', name: 'Organisation A' }, { id: 'b', name: 'Organisation B' }],
  subOrganizations: [{ id: 'a1', organizationId: 'a', name: 'Standort A' }, { id: 'b1', organizationId: 'b', name: 'Standort B' }] }
const oldView = 'year=2025&granularity=monthly&organizationId=a&subOrgId=a1'
let root: Root
let container: HTMLDivElement
function View() {
  const { filters, update } = useReportingFilters()
  return <><output>{JSON.stringify(filters)}</output><ReportingLink href="/indikatoren">Indikatoren</ReportingLink>
    <button onClick={() => update({ ...filters, organizationId: 'b', subOrgId: undefined })}>Organisation wechseln</button></>
}
async function render(opts = options, storageKey = 'test-user') {
  await act(async () => root.render(<ReportingFiltersProvider options={opts} storageKey={storageKey} key={storageKey}>
    <ReportingFilterBar /><ReportingContent><View /></ReportingContent>
  </ReportingFiltersProvider>))
}
async function navigate(pathname: string, query = '') {
  navigation.pathname = pathname
  navigation.query = query
  await render()
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  sessionStorage.clear()
  vi.clearAllMocks()
  navigation.pathname = '/dashboard'
  navigation.query = ''
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('reporting filter persistence', () => {
  it('restores a tab selection before displaying data on a bare page and keeps navigation links complete', async () => {
    sessionStorage.setItem('test-user', oldView)
    await render()
    expect(container.querySelector('output')).toBeNull()
    expect(navigation.router.replace).toHaveBeenCalledWith(`/dashboard?${oldView}`, { scroll: false })
    await navigate('/dashboard', oldView)
    expect(container.querySelector('output')?.textContent).toContain('2025')
    expect(container.querySelector('a')?.getAttribute('href')).toBe(`/indikatoren?${oldView}`)
  })
  it('uses explicit links and browser Back snapshots instead of a later remembered choice', async () => {
    sessionStorage.setItem('test-user', oldView)
    await navigate('/dashboard', 'year=2026&granularity=auto')
    expect(container.querySelector('output')?.textContent).not.toContain('a1')
    expect(sessionStorage.getItem('test-user')).toBe('year=2026&granularity=auto')
    await navigate('/dashboard', oldView)
    expect(sessionStorage.getItem('test-user')).toBe(oldView)
  })
  it('retains reporting state on unrelated pages, forms, and fixed record routes', async () => {
    await navigate('/dashboard', oldView)
    await navigate('/methodology')
    expect(container.textContent).toContain('Diese Seite wird nicht gefiltert')
    await navigate('/form/operating', 'year=2024&subOrgId=b1')
    expect(sessionStorage.getItem('test-user')).toBe(oldView)
    expect([...container.querySelectorAll<HTMLButtonElement>('[role="combobox"]')].every(select => select.disabled)).toBe(true)
    await navigate('/datasets/operating/b1/2024')
    expect(sessionStorage.getItem('test-user')).toBe(oldView)
  })
  it('ignores other tab storage and isolates a new login or impersonation identity', async () => {
    sessionStorage.setItem('test-user', oldView)
    await render(options, 'new-login')
    expect(navigation.router.replace).toHaveBeenLastCalledWith('/dashboard?year=2026&granularity=auto', { scroll: false })
  })
  it('shows organization switching only for admins and clears a dependent site when switching', async () => {
    await navigate('/dashboard', oldView)
    expect(container.querySelector('[aria-label="Organisation auswählen"]')).not.toBeNull()
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Organisation wechseln')!.click())
    expect(navigation.router.push).toHaveBeenCalledWith('/dashboard?year=2025&granularity=monthly&organizationId=b', { scroll: false })
    await render({ ...options, organizations: undefined, subOrganizations: [options.subOrganizations[0]] })
    expect(container.querySelector('[aria-label="Organisation auswählen"]')).toBeNull()
  })
  it('keeps filters active when an unavailable reflection tab falls back to operating data', async () => {
    navigation.pathname = '/datasets'
    navigation.query = `tab=reflection&${oldView}`
    await render({ ...options, canViewReflection: false, subOrganizations: [...options.subOrganizations, { id: 'a2', organizationId: 'a', name: 'Standort A2' }] })
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Berichtsjahr auswählen"]')?.disabled).toBe(false)
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Unterorganisation auswählen"]')?.disabled).toBe(false)
    expect(container.textContent).toContain('Listen und Exporte verwenden dieselbe Auswahl')
  })
  it('disables irrelevant reflection filters and explains all-years list overrides', async () => {
    await navigate('/datasets', `tab=reflection&${oldView}`)
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Berichtsjahr auswählen"]')?.disabled).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Unterorganisation auswählen"]')?.disabled).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Organisation auswählen"]')?.disabled).toBe(false)
    await navigate('/datasets', `allYears=1&${oldView}`)
    expect(container.textContent).toContain('Diese Liste zeigt alle Jahre')
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Datenansicht auswählen"]')?.disabled).toBe(true)
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Organisation wechseln')!.click())
    expect(navigation.router.push).toHaveBeenLastCalledWith('/datasets?allYears=1&year=2025&granularity=monthly&organizationId=b', { scroll: false })
  })
  it('server-renders content unless a reporting view still needs its URL normalized', () => {
    const html = (pathname: string, query = '') => {
      navigation.pathname = pathname
      navigation.query = query
      return renderToString(<ReportingFiltersProvider options={options} storageKey="test-user">
        <ReportingContent><View /></ReportingContent>
      </ReportingFiltersProvider>)
    }
    expect(html('/methodology')).not.toContain('Auswahl wird geladen')
    expect(html('/form/operating', 'year=2025')).not.toContain('Auswahl wird geladen')
    expect(html('/dashboard', oldView)).not.toContain('Auswahl wird geladen')
    expect(html('/dashboard')).toContain('Auswahl wird geladen')
    expect(html('/dashboard', 'year=2025')).toContain('Auswahl wird geladen')
  })
  it('hides the shared filter on the admin start page', async () => {
    await navigate('/admin')
    expect(container.querySelector('[aria-label="Gemeinsame Filter"]')).toBeNull()
  })
  it('keeps the selection across layouts when session storage is unavailable', async () => {
    const storage = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    await render(options, 'no-storage')
    navigation.query = oldView
    await render(options, 'no-storage')
    await act(async () => root.unmount())
    root = createRoot(container)
    navigation.query = ''
    await render(options, 'no-storage')
    expect(navigation.router.replace).toHaveBeenLastCalledWith(`/dashboard?${oldView}`, { scroll: false })
    storage.mockRestore()
    vi.restoreAllMocks()
  })
})
