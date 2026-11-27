// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Radar, RadarChart, PolarAngleAxis, PolarRadiusAxis } from 'recharts'
import { calculateFoodWaste, calculateFoodWasteTrend } from '@/lib/indicators/food-waste'
import { transformDashboardStats } from '@/lib/indicators/engine'
import { INDICATOR_TARGETS } from '@/lib/indicators/targets'
import type { ComparisonData } from '@/app/actions/comparison'
import { AvailableRadarShape } from '@/components/dashboard/available-radar-shape'
import { IndicatorProgressCard } from '@/components/dashboard/indicator-progress-card'
import { RadarOverviewChart } from '@/components/dashboard/radar-overview-chart'
import { RadarComparisonChart } from '@/components/dashboard/radar-comparison-chart'
import { ComparisonClient } from '@/components/dashboard/comparison-client'
import { TrendLineChart } from '@/components/dashboard/trend-line-chart'
import { IndicatorDetailClient } from '@/components/dashboard/indicator-detail-client'
import { INDICATOR_CONFIG } from '@/lib/indicators/config'
import type { IndicatorDetailData } from '@/app/actions/indicators'
import IndikatorenPage from '@/app/(data)/indikatoren/page'
import IndicatorScoresDetailPage from '@/app/(data)/datasets/indicators/[subOrgId]/[year]/page'

const actions = vi.hoisted(() => ({ dashboard: vi.fn() }))
vi.mock('@/app/actions/dashboard', () => ({ getDashboardData: actions.dashboard }))
vi.mock('@/app/actions/indicators', () => ({ getIndicatorTrendData: async () => [] }))
vi.mock('@/lib/content/content', () => ({ getAppContent: async () => ({}) }))
vi.mock('@/lib/db', () => ({ db: { query: { subOrganizations: { findFirst: async () => ({ name: 'Küche' }) } } } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/indikatoren', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/dashboard/calculation-breakdown', () => ({ CalculationBreakdown: () => null }))
vi.mock('@/components/editable-text', () => ({ EditableText: ({ children }: { children: ReactNode }) => children }))

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.tagName === 'SPAN' ? 60 : 400
    const height = this.tagName === 'SPAN' ? 14 : 400
    return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} }
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const render = async (node: ReactNode) => { await act(async () => root.render(node)) }
const record = (id: string, amount: number, baseline: number | null) => ({ subOrganizationId: id, reportingYear: 2025, reportingMonth: 1, foodWasteAmount: amount, baseline })
const unavailable = calculateFoodWaste([record('a', 100, null)])
const zero = calculateFoodWaste([record('a', 100, 1200)])
const partial = calculateFoodWaste([record('a', 100, 1200), record('b', 50, null)])
const overview = Object.fromEntries(Object.keys(transformDashboardStats(null)).map(key => [key, 50])) as ReturnType<typeof transformDashboardStats>
const chartProps = { overview, targets: INDICATOR_TARGETS, selectedYear: 2025 }
const comparison: ComparisonData = {
  orgOverview: overview, globalOverview: overview, targets: INDICATOR_TARGETS,
  benchmarkAvailableIndicators: ['plant_based', 'organic', 'fair_trade', 'food_waste', 'regional', 'seasonal', 'guest_satisfaction'],
  selectedYear: 2025, availableYears: [2025], userRoles: ['org_manager'], organizationName: 'Küche',
  orgQualScoring: { regional: 50, seasonal: 50, guest_satisfaction: 50 },
  globalQualScoring: { regional: 50, seasonal: 50, guest_satisfaction: 50 },
  foodWasteOrg: unavailable, foodWasteGlobal: zero,
}

describe('food-waste displays', () => {
  it('renders unavailable progress with a reason, while retaining genuine zero and partial coverage', async () => {
    await render(<IndicatorProgressCard {...chartProps} foodWaste={unavailable} />)
    expect(container.textContent).toContain('Nicht berechenbar')
    expect(container.textContent).toContain('Es fehlt ein gültiger Basiswert')
    await render(<IndicatorProgressCard {...chartProps} foodWaste={zero} />)
    expect(container.textContent).not.toContain('Nicht berechenbar')
    expect(container.textContent).toContain('0% · Ziel: -30%')
    await render(<IndicatorProgressCard {...chartProps} foodWaste={partial} />)
    expect(container.textContent).toContain('1 von 2 meldenden Betrieben')
  })

  it('omits null radar coordinates but keeps a measured zero at the center using real Recharts points', async () => {
    const radar = (value: number | null) => <RadarChart width={400} height={400} data={[{ name: 'A', value: 50 }, { name: 'Waste', value }, { name: 'C', value: 50 }]}>
      <PolarAngleAxis dataKey="name" />
      <PolarRadiusAxis domain={[0, 100]} />
      <Radar dataKey="value" shape={AvailableRadarShape} isAnimationActive={false} stroke="blue" fill="blue" />
    </RadarChart>
    await render(radar(null))
    const gap = container.querySelector('.recharts-radar-polygon path')!
    expect(gap).not.toBeNull()
    expect(gap.getAttribute('d')).not.toContain('200,200')
    expect(gap.getAttribute('d')).not.toContain('Z')
    expect(gap.getAttribute('fill')).toBe('none')
    expect(container.querySelectorAll('.recharts-radar-polygon circle')).toHaveLength(2)
    await render(radar(0))
    const complete = container.querySelector('.recharts-radar-polygon path')!
    expect(complete.getAttribute('d')).toContain('200,200')
    expect(complete.getAttribute('d')).toContain('Z')
  })

  it('uses gaps independently for organization and global series in every radar view', async () => {
    await render(<RadarOverviewChart {...chartProps} foodWaste={unavailable} />)
    expect(container.textContent).toContain('Es fehlt ein gültiger Basiswert')
    expect(container.querySelector('.recharts-radar-polygon path')?.getAttribute('fill')).toBe('none')
    for (const view of [<RadarComparisonChart key="dashboard" data={comparison} />, <ComparisonClient key="comparison" data={comparison} />]) {
      await render(view)
      const paths = container.querySelectorAll('.recharts-radar-polygon path')
      expect(paths).toHaveLength(2)
      expect(paths[0].getAttribute('d')).not.toContain('Z')
      expect(paths[1].getAttribute('d')).toContain('Z')
      expect(container.textContent).toContain('Es fehlt ein gültiger Basiswert')
    }
  })

  it('preserves trend gaps, negative reductions and the negative target without drawing a missing dot', async () => {
    const points = calculateFoodWasteTrend([record('a', 50, 1200), { ...record('a', 100, 1200), reportingMonth: 3 }], { year: 2025, month: 1 }, { year: 2025, month: 3 })
    await render(<TrendLineChart data={points} unit="%" />)
    expect(container.textContent).toContain('Ziel: -30,0%')
    expect(container.querySelectorAll('.recharts-area-dots circle')).toHaveLength(2)
    const curve = container.querySelector('.recharts-area-curve')!
    expect(curve).not.toBeNull()
    expect(curve.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    await render(<TrendLineChart data={[{ period: 'Jan 2025', value: null }]} unit="%" />)
    expect(container.textContent).toContain('Keine Verlaufsdaten verfügbar')
  })

  it('renders the indicator overview and dataset detail with unavailable and genuine zero reduction', async () => {
    for (const foodWaste of [unavailable, zero]) {
      actions.dashboard.mockResolvedValue({ ...chartProps, foodWaste, comparisons: {}, availableYears: [2025], qualitativeScoringResults: { regional: null, seasonal: null, guest_satisfaction: null },
        dataEntryProgress: { total_entries: 1, expected_entries: 12, percentage: 8 } })
      await render(await IndikatorenPage({ searchParams: Promise.resolve({ year: '2025' }) }))
      const card = [...container.querySelectorAll('[data-slot="card"]')].find(card => card.querySelector('[data-slot="card-title"]')?.textContent === INDICATOR_CONFIG.food_waste.title)!
      expect(card.textContent).toContain(foodWaste.reduction === null ? 'Keine Daten' : '0%')
      await render(await IndicatorScoresDetailPage({ params: Promise.resolve({ subOrgId: 'a', year: '2025' }) }))
      expect(container.textContent).not.toContain('Fehler beim Laden')
      const row = [...container.querySelectorAll('tbody tr')].find(row => row.firstChild?.textContent === INDICATOR_CONFIG.food_waste.title)!
      expect(row.querySelectorAll('td')[1].textContent).toBe(foodWaste.reduction === null ? 'Nicht berechenbar' : '0%')
      expect(row.querySelectorAll('td')[4].textContent).toBe(foodWaste.reduction === null ? 'Nicht berechenbar' : '0%')
    }
  })

  it('keeps raw waste in kilograms in detail even when its reduction is unavailable', async () => {
    const data: IndicatorDetailData = {
      reportingYear: 2025, requestedGranularity: 'yearly',
      slug: 'food_waste', title: INDICATOR_CONFIG.food_waste.title, description: '', dataGranularity: 'yearly',
      trendData: [{ month: '2025', value: null, target: -30, foodWaste: unavailable }],
      summary: { currentValue: null, target: -30, unit: '%' }, foodWaste: unavailable,
      breakdown: [{ id: 'row-1', foodWasteAmount: '100', reportingYear: 2025, reportingMonth: 0, subOrganization: { name: 'Küche' } }] as IndicatorDetailData['breakdown'],
      qualitativeScore: null, hasOperationalData: true, userRoles: [], availableSubOrgs: [], availableYears: [2025],
    }
    await render(<IndicatorDetailClient data={data} />)
    expect(container.textContent).toContain('Es fehlt ein gültiger Basiswert')
    expect(container.textContent).toContain('Keine Daten')
    const table = container.querySelector('tbody')!
    expect(table.textContent).toContain('100,0 kg')
    expect(table.textContent).not.toContain('100%')
  })
})
