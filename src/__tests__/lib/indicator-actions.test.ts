import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { calculateFoodWaste, calculateFoodWasteTrend } from '@/lib/indicators/food-waste'
import { PgDialect } from 'drizzle-orm/pg-core'
import { EMPTY_QUALITATIVE_SCORES } from '@/lib/qualitative/scoring'
import { indicatorData, qualitativeResponses, subOrganizations } from '@/lib/db/schema'
import { indicatorScopeConditions } from '@/lib/indicators/scope'
import { and } from 'drizzle-orm'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), waste: vi.fn(), wasteTrend: vi.fn(), rows: vi.fn(), profile: vi.fn(), select: vi.fn(), execute: vi.fn(), scores: vi.fn(), memberships: vi.fn(), subOrg: vi.fn(), directory: vi.fn(), org: vi.fn(), orgs: vi.fn() }))
vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/db', () => ({ db: {
    query: {
        users: { findFirst: mocks.profile },
        organizations: { findFirst: mocks.org, findMany: mocks.orgs },
        indicatorData: { findMany: mocks.rows },
        subOrganizations: { findMany: mocks.directory, findFirst: mocks.subOrg },
        subOrganizationMembers: { findMany: mocks.memberships },
    }, select: mocks.select, execute: mocks.execute,
} }))
vi.mock('@/lib/indicators/data', () => ({ loadQualitativeScores: mocks.scores }))
vi.mock('@/lib/indicators/food-waste-reader', () => ({ readFoodWaste: mocks.waste, readFoodWasteTrend: mocks.wasteTrend }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/app/actions/data-freeze', () => ({ isYearFrozen: vi.fn() }))
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { getIndicatorDetails, getIndicatorTrendData } from '@/app/actions/indicators'

const row = (fields = {}) => ({ subOrganizationId: '00000000-0000-4000-8000-000000000002', reportingYear: 2026, reportingMonth: 0, totalFoodSpend: null, ...fields })
const dialect = new PgDialect()

beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ user: { id: 'user-a', email: 'audit@example.org' } })
    mocks.profile.mockResolvedValue({ organizationId: '00000000-0000-4000-8000-000000000001', userRoles: [{ roleId: 'org_manager' }] })
    mocks.directory.mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000002', organizationId: '00000000-0000-4000-8000-000000000001', name: 'Kitchen A' }])
    mocks.org.mockResolvedValue({ name: 'Organization A' })
    mocks.orgs.mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000001', name: 'Organization A' }])
    mocks.rows.mockResolvedValue([])
    mocks.waste.mockResolvedValue(calculateFoodWaste([]))
    mocks.wasteTrend.mockResolvedValue([])
    mocks.subOrg.mockResolvedValue({ organizationId: '00000000-0000-4000-8000-000000000001' })
    mocks.select.mockReturnValue({ from: () => ({ orderBy: async () => [{ year: 2026 }] }) })
    mocks.execute.mockResolvedValue({ rows: [{ benchmark: { stats: { fair_trade_percentage: 50 }, qualitative: {}, baseFoodWaste: null } }] })
    mocks.scores.mockResolvedValue(EMPTY_QUALITATIVE_SCORES)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('indicator server action regressions', () => {
    it('shows Fairtrade without unrelated total food spending', async () => {
        mocks.rows.mockResolvedValueOnce([row({ coffeeSpend: 100, fairTradeCoffeeSpend: 80 })]).mockResolvedValueOnce([])
        const detail = await getIndicatorDetails('fair_trade_percentage', undefined, 2026, 'yearly')
        expect(detail?.summary.currentValue).toBe(80)
        expect(detail?.hasOperationalData).toBe(true)
    })
    it('does not invent a Fairtrade zero from total food spending alone', async () => {
        mocks.rows.mockResolvedValueOnce([row({ totalFoodSpend: 1000 })]).mockResolvedValueOnce([])
        const detail = await getIndicatorDetails('fair_trade_percentage', undefined, 2026, 'yearly')
        expect(detail?.summary.currentValue).toBeNull()
        expect(detail?.hasOperationalData).toBe(false)
    })
    it('applies the selected granularity to the previous year as well', async () => {
        mocks.rows.mockResolvedValueOnce([row({ coffeeSpend: 1000, fairTradeCoffeeSpend: 500 })]).mockResolvedValueOnce([
            row({ reportingYear: 2025, coffeeSpend: 1000, fairTradeCoffeeSpend: 900 }),
            row({ reportingYear: 2025, reportingMonth: 1, coffeeSpend: 100, fairTradeCoffeeSpend: 0 }),
        ])
        expect((await getIndicatorDetails('fair_trade_percentage', undefined, 2026, 'yearly'))?.summary.prevPeriodChange).toBe(-44.44)
    })
    it('includes annual-only kitchens in automatic mode', async () => {
        mocks.rows.mockResolvedValueOnce([row({ reportingMonth: 1, coffeeSpend: 100, fairTradeCoffeeSpend: 90 }), row({ subOrganizationId: '00000000-0000-4000-8000-000000000003', coffeeSpend: 900, fairTradeCoffeeSpend: 0 })]).mockResolvedValueOnce([])
        const detail = await getIndicatorDetails('fair_trade_percentage', undefined, 2026)
        expect(detail?.summary.currentValue).toBe(9)
        expect(detail?.trendData[0].value).toBe(9)
    })
    it('uses the monthly food-waste baseline for the summary and chart', async () => {
        mocks.rows.mockResolvedValueOnce([row({ reportingMonth: 1, foodWasteAmount: 80 })]).mockResolvedValueOnce([])
        const measured = { ...row({}), foodWasteAmount: 80, reportingMonth: 1, baseline: 1200 }
        mocks.waste.mockResolvedValueOnce(calculateFoodWaste([measured], 'monthly'))
        mocks.wasteTrend.mockResolvedValue(calculateFoodWasteTrend([measured], { year: 2026, month: 1 }, { year: 2026, month: 12 }))
        const detail = await getIndicatorDetails('food_waste', undefined, 2026, 'monthly')
        expect(detail?.summary.currentValue).toBe(-20)
        expect(detail?.trendData[0].value).toBe(-20)
    })
    it('returns a percentage for the annual food-waste chart and kilograms for raw rows', async () => {
        mocks.rows.mockResolvedValueOnce([row({ foodWasteAmount: 840 })]).mockResolvedValueOnce([])
        mocks.waste.mockResolvedValueOnce(calculateFoodWaste([{ ...row({}), foodWasteAmount: 840, baseline: 1200 }], 'yearly'))
        const detail = await getIndicatorDetails('food_waste', undefined, 2026, 'yearly')
        expect(detail?.summary).toMatchObject({ currentValue: -30, unit: '%' })
        expect(detail?.trendData).toMatchObject([{ month: 'Gesamt 2026', value: -30, target: -30 }])
        expect(detail?.breakdown[0].foodWasteAmount).toBe(840)
    })
    it('uses fresh questionnaire scores rather than stored legacy values', async () => {
        mocks.rows.mockResolvedValueOnce([row({ regionalScoringResult: 90 })]).mockResolvedValueOnce([])
        mocks.scores.mockResolvedValueOnce({ ...EMPTY_QUALITATIVE_SCORES, regional: 20 }).mockResolvedValueOnce(EMPTY_QUALITATIVE_SCORES)
        const detail = await getIndicatorDetails('regional_score', undefined, 2026, 'yearly')
        expect(detail?.summary).toMatchObject({ currentValue: 20, target: 20, unit: 'Pkt.' })
        expect(detail?.qualitativeScore).toBe(20)
        expect(detail?.breakdown).toEqual([])
    })
    it('weights quarterly trend values in the public server action', async () => {
        mocks.rows.mockResolvedValue([row({ reportingMonth: 1, coffeeSpend: 100, fairTradeCoffeeSpend: 90 }), row({ reportingMonth: 2, coffeeSpend: 900, fairTradeCoffeeSpend: 0 })])
        expect(await getIndicatorTrendData('fair_trade_percentage', 3, undefined, 'quarterly')).toEqual([{ period: 'Q1 2026', value: 9, target: 90 }])
    })
    it('rejects unbounded or malformed trend requests before reading data', async () => {
        for (const args of [['food_waste', 1_000_000], ['food_waste', 0], ['food_waste', 1.5], ['food_waste', Number.NaN],
            ['constructor', 12], ['food_waste', 12, undefined, 'yearly']] as const) {
            await expect(getIndicatorTrendData(...(args as unknown as Parameters<typeof getIndicatorTrendData>))).rejects.toThrow()
        }
        expect(mocks.rows).not.toHaveBeenCalled()
        expect(mocks.wasteTrend).not.toHaveBeenCalled()
    })
    it('applies global exclusions to detail, previous year, scores, and trends', async () => {
        mocks.profile.mockResolvedValue({ organizationId: null, userRoles: [{ roleId: 'global_view_only' }] })
        await getIndicatorDetails('fair_trade_percentage', undefined, 2026, 'yearly')
        await getIndicatorTrendData('fair_trade_percentage')
        for (const [query] of mocks.rows.mock.calls) {
            const statement = dialect.sqlToQuery(query.where).sql
            expect(statement).toContain("organizations where name ilike '%test%'")
            expect(statement).toContain("sub_organizations where name ilike '%test%'")
        }
        expect(mocks.scores).toHaveBeenCalledWith({ organizationId: null, subOrganizationId: undefined, accessibleSubOrgIds: undefined }, 2026)
    })
    it('retains organization and membership restrictions', async () => {
        mocks.profile.mockResolvedValue({ organizationId: '00000000-0000-4000-8000-000000000001', userRoles: [{ roleId: 'basic_user' }] })
        mocks.memberships.mockResolvedValue([{ subOrganizationId: '00000000-0000-4000-8000-000000000002' }])
        await expect(getIndicatorDetails('fair_trade_percentage', '00000000-0000-4000-8000-000000000003', 2026, 'yearly')).rejects.toThrow('Zugriff verweigert')
        expect(mocks.rows).not.toHaveBeenCalled()
        await getIndicatorDetails('fair_trade_percentage', undefined, 2026, 'yearly')
        for (const [query] of mocks.rows.mock.calls) {
            expect(dialect.sqlToQuery(query.where).params).toEqual(expect.arrayContaining(['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']))
        }
    })
})

it('uses the same global scope for operational rows, questionnaire answers and baselines', () => {
    for (const table of [indicatorData, qualitativeResponses, { organizationId: subOrganizations.organizationId, subOrganizationId: subOrganizations.id }]) {
        const statement = dialect.sqlToQuery(and(...indicatorScopeConditions(table, { organizationId: null }))!).sql
        expect(statement).toContain("organizations where name ilike '%test%'")
        expect(statement).toContain("sub_organizations where name ilike '%test%'")
    }
    expect(dialect.sqlToQuery(and(...indicatorScopeConditions(indicatorData, { organizationId: '00000000-0000-4000-8000-000000000001', accessibleSubOrgIds: [] }))!).sql).toContain('false')
})
