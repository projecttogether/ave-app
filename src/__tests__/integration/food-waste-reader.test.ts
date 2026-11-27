import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { Pool } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const schema = `ave_food_waste_${process.pid}`
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` })
  return { db: drizzle(pool) }
})

import { db } from '@/lib/db'
import { readFoodWaste, readFoodWasteTrend } from '@/lib/indicators/food-waste-reader'

// Only a new schema in an explicitly supplied test database is modified.
describe.skipIf(!process.env.TEST_DATABASE_URL)('food-waste PostgreSQL reader', () => {
  const schema = `ave_food_waste_${process.pid}`
  const org = '00000000-0000-0000-0000-000000000001'
  const other = '00000000-0000-0000-0000-000000000002'
  const testOrg = '00000000-0000-0000-0000-000000000003'
  const sub = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  beforeAll(async () => {
    await db.$client.query(`CREATE SCHEMA ${schema}`)
    await db.$client.query(`
      CREATE TABLE organizations (id uuid PRIMARY KEY, name text);
      CREATE TABLE sub_organizations (id uuid PRIMARY KEY, organization_id uuid, name text, food_waste_base_amount numeric);
      CREATE TABLE indicator_data (organization_id uuid, sub_organization_id uuid, reporting_year integer, reporting_month integer, food_waste_amount numeric, period_kind text, period_index integer, superseded_at timestamptz);
    `)
    await db.$client.query('INSERT INTO organizations VALUES ($1, $2), ($3, $4), ($5, $6)', [org, 'Catering', other, 'Cafeteria', testOrg, 'TEST organization'])
    for (const [id, parent, name, baseline] of [[sub(1), org, 'Kitchen A', 1200], [sub(2), org, 'Kitchen B', 2400], [sub(3), other, 'Kitchen C', null], [sub(4), testOrg, 'Kitchen D', 1200], [sub(5), org, 'Test kitchen', 1200]]) {
      await db.$client.query('INSERT INTO sub_organizations VALUES ($1, $2, $3, $4)', [id, parent, name, baseline])
    }
    for (const [parent, id, month, amount] of [[org, sub(1), 1, 100], [org, sub(1), 2, 100], [org, sub(1), 0, 900], [org, sub(2), 3, 200], [other, sub(3), 1, 500], [testOrg, sub(4), 1, 999], [org, sub(5), 1, 999]]) {
      await db.$client.query('INSERT INTO indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,food_waste_amount) VALUES ($1, $2, 2026, $3, $4)', [parent, id, month, amount])
    }
  })
  afterAll(async () => {
    await db.$client.query(`DROP SCHEMA ${schema} CASCADE`)
    await db.$client.end()
  })

  it('intersects organization, requested sub-organization and assigned scope', async () => {
    expect(await readFoodWaste({ organizationId: org, accessibleSubOrgIds: [sub(1), sub(2)] }, 2026, 'monthly')).toMatchObject({ reduction: 0, matchedAmount: 400, matchedBaseline: 400 })
    expect(await readFoodWaste({ organizationId: org, subOrganizationId: sub(3) }, 2026)).toMatchObject({ status: 'no-data' })
    expect(await readFoodWaste({ organizationId: org, subOrganizationId: sub(2), accessibleSubOrgIds: [sub(1)] }, 2026)).toMatchObject({ status: 'no-data' })
    expect(await readFoodWaste({ organizationId: null, accessibleSubOrgIds: [] }, 2026)).toMatchObject({ status: 'no-data' })
  })

  it('excludes named test organizations and sub-organizations in global mode, retaining missing-baseline coverage', async () => {
    expect(await readFoodWaste({ organizationId: null }, 2026, 'monthly')).toMatchObject({ status: 'partial', reportedAmount: 900, matchedAmount: 400, missingBaselineSubOrganizations: 1 })
  })

  it('respects explicit granularity and the requested year', async () => {
    expect(await readFoodWaste({ organizationId: org, subOrganizationId: sub(1) }, 2026, 'yearly')).toMatchObject({ matchedAmount: 900, matchedBaseline: 1200, reduction: -25 })
    expect(await readFoodWaste({ organizationId: org }, 2025)).toMatchObject({ status: 'no-data' })
  })

  it('returns weighted quarter results through the same reading scope', async () => {
    const points = await readFoodWasteTrend({ organizationId: org, accessibleSubOrgIds: [sub(1), sub(2)] }, { year: 2026, month: 1 }, { year: 2026, month: 3 }, 'quarterly')
    expect(points[0]).toMatchObject({ value: 0, foodWaste: { matchedAmount: 400, matchedBaseline: 400 } })
  })
})
