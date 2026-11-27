import { expect, it, vi } from 'vitest'
import { calculateFoodWaste } from '@/lib/indicators/food-waste'

const mocks = vi.hoisted(() => ({ rows: vi.fn(), waste: vi.fn(), trend: vi.fn() }))
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: 'user', email: 'user@example.test' } }) }))
vi.mock('@/lib/access', () => ({ getDataScope: async () => ({ organizationId: 'org', subOrganizationId: null }) }))
vi.mock('@/lib/indicators/benchmark', () => ({ getBenchmark: async () => ({ overview: {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/indicators/food-waste-reader', () => ({ readFoodWaste: mocks.waste, readFoodWasteTrend: mocks.trend }))
vi.mock('@/lib/db', () => ({ db: {
  select: () => ({ from: () => ({ orderBy: async () => [{ year: 2025 }] }) }),
  execute: async () => ({ rows: [] }),
  query: {
    users: { findFirst: async () => ({ organizationId: 'org', userRoles: [{ roleId: 'org_manager' }] }) },
    subOrganizations: { findMany: async () => [] },
    indicatorData: { findMany: mocks.rows },
    qualitativeResponses: { findMany: async () => [] },
  },
} }))
import { getIndicatorDetails } from '@/app/actions/indicators'

it('uses the same indicator-specific automatic selection for summary, trend and previous year', async () => {
  const yearly = { subOrganizationId: 'kitchen', reportingYear: 2025, reportingMonth: 0, foodWasteAmount: '600', baseline: '1200' }
  const monthly = { ...yearly, reportingMonth: 1, foodWasteAmount: null }
  mocks.rows.mockResolvedValueOnce([monthly, yearly]).mockResolvedValueOnce([])
  mocks.waste.mockImplementation(async (_scope, year, granularity) => calculateFoodWaste(year === 2025 ? [monthly, yearly] : [], granularity))
  const result = await getIndicatorDetails('food_waste', undefined, 2025)
  expect(result).toMatchObject({ dataGranularity: 'yearly', summary: { currentValue: -50 }, breakdown: [yearly], trendData: [{ value: -50, target: -30 }] })
  expect(mocks.waste.mock.calls.map(call => call.slice(1))).toEqual([[2025, undefined], [2024, undefined]])
  expect(mocks.trend).not.toHaveBeenCalled()
})
