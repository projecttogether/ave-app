// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IndicatorDataSet } from '@/app/actions/datasets'

const state = vi.hoisted(() => ({ query: '', filters: { year: 2025, granularity: 'monthly', organizationId: 'a', subOrgId: 'a1' },
  operating: vi.fn(), scoring: vi.fn(), reflection: vi.fn(), adminOperating: vi.fn(), adminScoring: vi.fn(), adminReflection: vi.fn(),
  router: { push: vi.fn() } }))
vi.mock('next/navigation', () => ({ usePathname: () => '/datasets', useSearchParams: () => new URLSearchParams(state.query), useRouter: () => state.router }))
vi.mock('@/components/reporting-filters-provider', () => ({ useReportingFilters: () => ({ filters: state.filters }) }))
vi.mock('@/components/editable-text', () => ({ EditableText: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/components/dashboard/dataset-export-button', () => ({ DatasetExportButton: ({ filters, type }: { filters: unknown; type: string }) => <output data-export={type}>{JSON.stringify(filters)}</output> }))
vi.mock('@/app/actions/datasets', () => ({ getIndicatorDataSets: state.operating, getScoringDataSets: state.scoring }))
vi.mock('@/app/actions/reflection', () => ({ getReflectionDataSets: state.reflection }))
vi.mock('@/app/admin/actions/datasets', () => ({ getAdminIndicatorDataSets: state.adminOperating, getAdminScoringDataSets: state.adminScoring, getAdminReflectionDataSets: state.adminReflection }))
import { DatasetsPageClient } from '@/components/dashboard/datasets-page-client'

let root: Root
let container: HTMLDivElement
const options = { organizations: [], subOrganizations: [], years: [2025], canViewReflection: true }
async function render(admin = false) { await act(async () => root.render(<DatasetsPageClient filterOptions={options} admin={admin} />)) }
const row: IndicatorDataSet = { organizationId: 'a', organizationName: 'Org A', subOrganizationId: 'a1', subOrganizationName: 'Site A', year: 2025, completeness: 100, entryCount: 1, lastUpdated: null }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.resetAllMocks()
  state.query = ''
  state.filters = { year: 2025, granularity: 'monthly', organizationId: 'a', subOrgId: 'a1' }
  for (const read of [state.operating, state.scoring, state.reflection, state.adminOperating, state.adminScoring, state.adminReflection]) read.mockResolvedValue([])
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('dataset list and export scope', () => {
  it('uses the same selected organization, site and year for the list and export, including all-years override', async () => {
    await render()
    expect(state.operating).toHaveBeenLastCalledWith({ organizationId: 'a', subOrganizationId: 'a1', year: 2025 })
    expect(JSON.parse(container.querySelector('[data-export="operating"]')!.textContent!)).toEqual({ organizationId: 'a', subOrganizationId: 'a1', year: 2025 })
    state.query = 'allYears=1'
    await render()
    expect(state.operating).toHaveBeenLastCalledWith({ organizationId: 'a', subOrganizationId: 'a1', year: undefined })
    expect(container.querySelector('[data-export="operating"]')!.textContent).not.toContain('year')
    expect(state.filters.year).toBe(2025)
  })
  it('shares the selection with scoring and applies only organization to reflection data and exports', async () => {
    state.query = 'tab=scoring'
    await render()
    expect(state.scoring).toHaveBeenCalledWith({ organizationId: 'a', subOrganizationId: 'a1', year: 2025 })
    state.query = 'tab=reflection'
    await render()
    expect(state.reflection).toHaveBeenCalledWith({ organizationId: 'a' })
    expect(JSON.parse(container.querySelector('[data-export="reflection"]')!.textContent!)).toEqual({ organizationId: 'a' })
  })
  it('keeps admin reads on the existing admin actions', async () => {
    await render(true)
    expect(state.adminOperating).toHaveBeenCalledWith({ organizationId: 'a', subOrganizationId: 'a1', year: 2025 })
    expect(state.operating).not.toHaveBeenCalled()
  })
  it('does not render a stale response after the selection changes', async () => {
    let finishOld!: (rows: IndicatorDataSet[]) => void
    state.operating.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    await render()
    state.filters = { ...state.filters, subOrgId: 'a2' }
    state.operating.mockResolvedValue([{ ...row, subOrganizationId: 'a2', subOrganizationName: 'Site B' }])
    await render()
    await act(async () => finishOld([row]))
    expect(container.textContent).toContain('Site B')
    expect(container.textContent).not.toContain('Site A')
  })
})
