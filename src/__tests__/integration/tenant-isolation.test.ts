import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool } from 'pg'
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { eq, sql } from 'drizzle-orm'

const state = vi.hoisted(() => ({ actor: null as null | { id: string; email: string; roles: string[] } }))
vi.mock('@/auth', () => ({ auth: async () => state.actor ? { user: state.actor } : null }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { db } from '@/lib/db'
import { authPool } from '@/lib/db/auth'
import { withDataScope } from '@/lib/db/scope-context'
import { auditLogs, indicatorData, organizations, users } from '@/lib/db/schema'
import { getDashboardData } from '@/app/actions/dashboard'
import { getComparisonData } from '@/app/actions/comparison'
import { getIndicatorDataSetDetail, getIndicatorDataSets, getScoringDataSetDetail, getScoringDataSets } from '@/app/actions/datasets'
import { getReflectionDataSetDetail, getReflectionDataSets } from '@/app/actions/reflection'
import { exportDataSetsCsv, type DatasetExportFilters } from '@/app/actions/dataset-export'
import { getMissingData } from '@/app/actions/missing-data'
import { getReportingFilterOptions } from '@/lib/reporting-filter-options'
import { getIndicatorAndBaseData, getIndicatorDetails, getIndicatorTrendData } from '@/app/actions/indicators'
import { exportUserData } from '@/app/actions/data-export'
import { getAuditLogs } from '@/app/admin/audit/actions'
import { getBenchmark } from '@/lib/indicators/benchmark'
import { verifyDatabaseIsolation } from '@/lib/db/verify-isolation'
import { consumeOtp } from '@/lib/auth/verify-otp'
import { hashOtp, newOtpFlowId, otpIdentifier } from '@/lib/otp'
import { FORMULA_POLICY } from '@/lib/indicators/policy'
import { getCalculationReport, saveCalculationReport, getArchivedCalculationReport, listCalculationReports } from '@/app/actions/calculation-reports'
import { TenantPool } from '@/lib/db/tenant-pool'
import { publishOperatingTransaction } from '@/lib/operating-data/write'
import type { Publication } from '@/lib/operating-data/publication'
import { previewPeriodConversion } from '@/app/actions/quarterly-entry'
import { unwrapOperatingResult } from '@/lib/operating-data/result'
import { readFoodWaste } from '@/lib/indicators/food-waste-reader'
import { freezeYear } from '@/app/actions/data-freeze'

const enabled = !!process.env.TEST_DATABASE_URL
const root = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const orgs = Array.from({ length: 6 }, () => randomUUID())
const subs = Array.from({ length: 7 }, () => randomUUID())
const profiles = [
  { id: 'basic-a', role: 'basic_user', org: orgs[0] },
  { id: 'basic-b', role: 'basic_user', org: orgs[1] },
  { id: 'manager-a', role: 'org_manager', org: orgs[0] },
  { id: 'viewer-a', role: 'org_view_only', org: orgs[0] },
  { id: 'global', role: 'global_view_only', org: orgs[0] },
  { id: 'admin', role: 'admin', org: orgs[0] },
  { id: 'super', role: 'super_admin', org: null },
  { id: 'unassigned', role: 'basic_user', org: null },
  { id: 'no-membership', role: 'basic_user', org: orgs[0] },
  { id: 'unknown', role: 'unknown', org: orgs[0] },
]
function login(id = 'basic-a') {
  const p = profiles.find(p => p.id === id)!
  state.actor = { id, email: `${id}@example.invalid`, roles: [p.role] }
}

describe.skipIf(!enabled)('PostgreSQL tenant isolation', () => {
  beforeAll(async () => {
    for (let i = 0; i < orgs.length; i++) {
      await root.query('insert into organizations(id,name) values($1,$2)', [orgs[i], `Organization ${i}`])
      await root.query('insert into sub_organizations(id,organization_id,name,food_waste_base_amount) values($1,$2,$3,1000)', [subs[i], orgs[i], `Kitchen ${i}`])
      await root.query('insert into indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,total_food_spend,organic_spend,meat_spend,food_waste_amount) values($1,$2,2026,0,$3,100,200,100)', [orgs[i], subs[i], (i + 1) * 1000])
      await root.query("insert into qualitative_responses(organization_id,sub_organization_id,reporting_year,indicator_slug,question_key,response_option) values($1,$2,2026,'regional','reg_score_regional_share_total','76-100%')", [orgs[i], subs[i]])
      await root.query("insert into intake_responses(organization_id,indicator_slug,question_key,response_type,response_text) values($1,'general','isolation_question','text',$2)", [orgs[i], `Reflection ${i}`])
    }
    await root.query('insert into sub_organizations(id,organization_id,name) values($1,$2,$3)', [subs[6], orgs[0], 'Unassigned kitchen'])
    await root.query('insert into indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,total_food_spend) values($1,$2,2026,0,500)', [orgs[0], subs[6]])
    for (const p of profiles) {
      await root.query('insert into "user"(id,email,name,organization_id,status) values($1,$2,$1,$3,\'active\')', [p.id, `${p.id}@example.invalid`, p.org])
      if (p.role !== 'unknown') await root.query('insert into user_roles(user_id,role_id) values($1,$2)', [p.id, p.role])
    }
    for (const [user, sub] of [['basic-a', subs[0]], ['basic-b', subs[1]]]) await root.query('insert into sub_organization_members values($1,$2)', [user, sub])
    for (const [user, organization] of [['basic-a', orgs[0]], ['basic-b', orgs[1]]]) {
      await root.query("insert into audit_logs(user_id,organization_id,action) values($1,$2,'isolation.test')", [user, organization])
    }
  }, 30_000)
  beforeEach(() => login())
  afterAll(async () => { await root.end(); await db.$client.end(); await authPool.end() })

  it('accepts restricted runtime credentials and rejects an owner connection', async () => {
    await expect(verifyDatabaseIsolation()).resolves.toBeUndefined()
    const original = process.env.DATABASE_URL
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    try { await expect(verifyDatabaseIsolation()).rejects.toThrow('Unsafe database privileges') }
    finally { process.env.DATABASE_URL = original }
  })

  it('filters an intentionally unscoped query and joins to only assigned sub-organizations', async () => {
    const data = await db.select().from(indicatorData)
    expect(data).toHaveLength(1)
    expect(data[0].organizationId).toBe(orgs[0])
    expect(data[0].subOrganizationId).toBe(subs[0])
    const joined = await db.query.qualitativeResponses.findMany({ with: { organization: true, subOrganization: true } })
    expect(joined).toHaveLength(1)
    expect(joined[0].organization?.id).toBe(orgs[0])
    expect((await db.select().from(organizations)).map(o => o.id)).toEqual([orgs[0]])
  })

  it.each(['basic-b','viewer-a','manager-a','global','admin','super'])('applies the %s read policy', async id => {
    login(id)
    const data = await db.select().from(indicatorData)
    const expectedCount = id === 'basic-b' ? 1 : ['viewer-a','manager-a'].includes(id) ? 2 : 7
    expect(data).toHaveLength(expectedCount)
    if (id.endsWith('-a')) expect(data.every(r => r.organizationId === orgs[0])).toBe(true)
  })

  it.each(['unassigned','no-membership','unknown'])('fails closed for %s', async id => {
    login(id)
    expect(await db.select().from(indicatorData)).toEqual([])
    await expect(getDashboardData()).rejects.toThrow()
    await expect(getBenchmark(2026)).rejects.toThrow()
  })

  it('fails closed without identity, including raw connections outside the scoped module', async () => {
    state.actor = null
    expect(await db.select().from(indicatorData)).toEqual([])
    const raw = new Pool({ connectionString: process.env.DATABASE_URL })
    try {
      expect((await raw.query('select * from indicator_data')).rows).toEqual([])
      await expect(raw.query('select get_benchmark_stats(2026)')).rejects.toThrow()
    } finally { await raw.end() }
  })

  it('does not expose an admin organization directory or accept forged filters for normal users', async () => {
    const data = await getDashboardData(undefined, 2026, 'yearly')
    expect(data.overview.total_spend).toBe(1000)
    expect(data.availableOrganizations).toBeUndefined()
    expect(data.availableSubOrgs?.map(s => s.id)).toEqual([subs[0]])
    await expect(getDashboardData(undefined, 2026, 'yearly', orgs[1])).rejects.toThrow()
    await expect(getDashboardData(subs[1], 2026, 'yearly')).rejects.toThrow()
    await expect(getIndicatorAndBaseData(subs[1], 2026, 0)).rejects.toThrow()
  })

  it('scopes every admin dashboard chart and validates organization/sub-organization pairs', async () => {
    login('admin')
    const data = await getDashboardData(undefined, 2026, 'yearly', orgs[1])
    expect(data.availableOrganizations).toHaveLength(6)
    expect(data.availableSubOrgs?.map(s => s.id)).toEqual([subs[1]])
    expect(data.overview.total_spend).toBe(2000)
    const comparison = await getComparisonData(2026, 'yearly', orgs[1], subs[1])
    expect(comparison.orgOverview.total_spend).toBe(2000)
    expect(comparison.organizationName).toBe('Organization 1')
    await expect(getDashboardData(subs[0], 2026, 'yearly', orgs[1])).rejects.toThrow()
  })

  it('lets an admin with a home organization switch lists, exports and tasks to a selected organization', async () => {
    login('admin')
    expect((await getMissingData(2026)).map(task => task.subOrganizationId).sort()).toEqual([subs[0], subs[6]].sort())
    expect((await getMissingData(2026, { organizationId: orgs[1] })).map(task => task.subOrganizationId)).toEqual([subs[1]])
    expect((await getMissingData(2026, { organizationId: orgs[1], subOrganizationId: subs[0] }))).toEqual([])
    expect((await getIndicatorDataSets()).every(row => row.organizationId === orgs[0])).toBe(true)
    expect((await getIndicatorDataSets({ organizationId: orgs[1] })).map(row => row.subOrganizationId)).toEqual([subs[1]])
    expect((await getScoringDataSets({ organizationId: orgs[1] })).map(row => row.subOrganizationId)).toEqual([subs[1]])
    expect((await getIndicatorDataSetDetail(subs[1], 2026)).subOrgName).toBe('Kitchen 1')
    expect((await getScoringDataSetDetail(subs[1], 2026)).subOrgName).toBe('Kitchen 1')
    await expect(getIndicatorDataSetDetail('not-a-uuid', 2026)).rejects.toThrow('Zugriff verweigert')
    expect((await getReflectionDataSets()).map(row => row.organizationId)).toEqual([orgs[0]])
    expect((await getReflectionDataSets({ organizationId: orgs[1] })).map(row => row.organizationId)).toEqual([orgs[1]])
    const csv = await exportDataSetsCsv('operating', { organizationId: orgs[1] } as DatasetExportFilters)
    expect(csv).toContain('Kitchen 1')
    expect(csv).not.toContain('Kitchen 0')
    expect(await exportDataSetsCsv('reflection', { organizationId: orgs[1] } as DatasetExportFilters)).toContain('Reflection 1')
  })

  it.each(['basic-a', 'manager-a', 'viewer-a'])('confines the shared reporting filter for %s to their own organization', async id => {
    login(id)
    const ownSubs: string[] = id === 'basic-a' ? [subs[0]] : [subs[0], subs[6]]
    // The filter directory never lists foreign organizations, sub-organizations or reporting years.
    const { options } = await getReportingFilterOptions()
    expect(options.organizations).toBeUndefined()
    expect(options.subOrganizations.map(s => s.id).sort()).toEqual([...ownSubs].sort())
    expect(options.years).toEqual([2026, 2025])
    // Forged organizationId / subOrgId URL parameters are rejected before any data is read.
    for (const forged of [
      () => getDashboardData(undefined, 2026, 'yearly', orgs[1]),
      () => getDashboardData(subs[1], 2026, 'yearly'),
      () => getComparisonData(2026, 'yearly', orgs[1]),
      () => getComparisonData(2026, 'yearly', undefined, subs[1]),
      () => getIndicatorDetails('organic_percentage', subs[1], 2026, 'yearly'),
      () => getIndicatorDetails('organic_percentage', undefined, 2026, 'yearly', orgs[1]),
      () => getIndicatorTrendData('organic_percentage', 12, subs[1]),
      () => getIndicatorDataSetDetail(subs[1], 2026),
      () => getScoringDataSetDetail(subs[1], 2026),
      () => getReflectionDataSetDetail(orgs[1]),
    ]) await expect(forged()).rejects.toThrow()
    // Lists, exports and tasks stay inside the own organization whatever filter is supplied.
    for (const list of [getIndicatorDataSets, getScoringDataSets]) {
      const rows = await list({ organizationId: orgs[1] })
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every(row => row.organizationId === orgs[0] && ownSubs.includes(row.subOrganizationId))).toBe(true)
      expect(await list({ subOrganizationId: subs[1] })).toEqual([])
    }
    // A foreign organization or sub-organization filter yields a header-only export, never foreign rows.
    const own = await exportDataSetsCsv('operating')
    expect(own).toContain('Kitchen 0')
    expect(own).not.toContain('Organization 1')
    for (const foreign of [{ organizationId: orgs[1] }, { subOrganizationId: subs[1] }] as DatasetExportFilters[]) {
      expect((await exportDataSetsCsv('operating', foreign)).trim().split('\n')).toHaveLength(1)
    }
    const tasks = await getMissingData(2026)
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.every(task => ownSubs.includes(task.subOrganizationId))).toBe(true)
    if (id === 'basic-a') {
      await expect(getReflectionDataSets()).rejects.toThrow()
      await expect(exportDataSetsCsv('reflection')).rejects.toThrow()
    } else {
      expect((await getReflectionDataSets()).map(row => row.organizationId)).toEqual([orgs[0]])
      expect(await getReflectionDataSets({ organizationId: orgs[1] })).toEqual([])
      const reflection = await exportDataSetsCsv('reflection', { organizationId: orgs[1] } as DatasetExportFilters)
      expect(reflection).not.toContain('Reflection 1')
      expect(reflection.trim().split('\n')).toHaveLength(1)
      expect(await exportDataSetsCsv('reflection')).toContain('Reflection 0')
    }
  })

  it('prevents unscoped SQL functions from bypassing row policies', async () => {
    const result = await db.execute(sql`select * from get_dashboard_stats(NULL, NULL, 2026, 'yearly')`)
    expect(Number(result.rows[0].total_spend)).toBe(1000)
    const cross = await db.execute(sql`select * from get_dashboard_stats(${orgs[1]}::uuid, NULL, 2026, 'yearly')`)
    expect(Number(cross.rows[0].total_spend)).toBe(0)
  })

  it.each(['monthly', 'quarterly', 'yearly'])('retains a preference-only %s year and its due tasks after rollover without exposing foreign years', async frequency => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2028-01-01T12:00:00Z'))
    try {
      await root.query('insert into operating_reporting_preferences(organization_id,sub_organization_id,reporting_year,frequency) values($1,$2,2027,$3),($4,$5,2024,$3)', [orgs[0], subs[0], frequency, orgs[1], subs[1]])
      const { options } = await getReportingFilterOptions()
      expect(options.years).toEqual([2028, 2027, 2026, 2025])
      const entries = (await Promise.all(options.years.map(year => getMissingData(year)))).flat()
      const tasks = entries.flatMap(entry => entry.operatingTasks).filter(task => task.period.year === 2027)
      expect(tasks).toHaveLength(frequency === 'yearly' ? 1 : frequency === 'quarterly' ? 4 : 12)
      expect(tasks.every(task => task.state === 'due')).toBe(true)
      expect(entries.every(entry => entry.subOrganizationId === subs[0])).toBe(true)
    } finally {
      vi.useRealTimers()
      await root.query('delete from operating_reporting_preferences where (sub_organization_id=$1 and reporting_year=2027) or (sub_organization_id=$2 and reporting_year=2024)', [subs[0], subs[1]])
    }
  })

  it('includes an entirely skipped intermediate year so all-years tasks ask for its reporting frequency', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2028-01-01T12:00:00Z'))
    try {
      const { options } = await getReportingFilterOptions()
      expect(options.years).toEqual([2028, 2027, 2026, 2025])
      const years = await Promise.all(options.years.map(async year => ({ year, entries: await getMissingData(year) })))
      expect(years.find(row => row.year === 2027)?.entries).toEqual([
        expect.objectContaining({ subOrganizationId: subs[0], needsFrequency: true, canWriteOperating: true, operatingTasks: [] }),
      ])
    } finally { vi.useRealTimers() }
  })

  it('applies the admin organization filter to calculation reports and detail values', async () => {
    login('admin')
    const { report } = await getCalculationReport(2026, 'yearly', undefined, orgs[1])
    expect(report.inputs.kitchens.map(k => k.id)).toEqual([subs[1]])
    expect(report.inputs.rows.map(r => r.subOrganizationId)).toEqual([subs[1]])
    const detail = await getIndicatorDetails('organic_percentage', undefined, 2026, 'yearly', orgs[1])
    expect(detail?.summary.currentValue).toBe(5)
    expect(detail?.breakdown.map(r => r.subOrganizationId)).toEqual([subs[1]])
  })

  it('scopes formula helpers and archived calculation reports to the current user', async () => {
    const measurements = await db.execute(sql`select * from get_indicator_measurements(NULL, NULL, 2026, 'yearly')`)
    expect(measurements.rows.length).toBeGreaterThan(0)
    expect(measurements.rows.every(r => r.sub_organization_id === subs[0])).toBe(true)
    const scores = await db.execute(sql`select * from get_live_qualitative_scores(NULL, NULL, 2026)`)
    expect(scores.rows.map(r => r.sub_organization_id)).toEqual([subs[0]])
    await expect(authPool.query('select * from get_indicator_measurements(NULL, NULL, 2026, NULL)')).rejects.toThrow()
    const { report } = await getCalculationReport(2026, 'yearly', subs[0])
    const id = await saveCalculationReport(2026, 'yearly', subs[0], report.inputRevision, report.formulaVersion)
    expect((await getArchivedCalculationReport(id)).inputRevision).toBe(report.inputRevision)
    await expect(db.execute(sql`update indicator_report_snapshots set formula_version = 'changed' where id = ${id}`)).rejects.toThrow()
    login('basic-b')
    expect((await db.execute(sql`select * from indicator_report_snapshots where id = ${id}`)).rows).toEqual([])
    await expect(getArchivedCalculationReport(id)).rejects.toThrow('Bericht nicht gefunden')
    await expect(db.execute(sql`insert into indicator_report_snapshots
      (organization_id, sub_organization_id, reporting_year, granularity, formula_version, input_revision, payload, created_by)
      values (${orgs[0]}, ${subs[0]}, 2026, 'yearly', 'forged', 'forged', '{}', 'basic-b')`)).rejects.toThrow()
    login('viewer-a')
    await expect(saveCalculationReport(2026, 'yearly', subs[0], report.inputRevision, report.formulaVersion)).rejects.toThrow('Archivieren')
  })

  it('blocks foreign writes, mismatched parent IDs, and read-only writes', async () => {
    expect(await db.update(indicatorData).set({ totalFoodSpend: '9999' }).where(eq(indicatorData.subOrganizationId, subs[1])).returning()).toEqual([])
    expect(await db.delete(indicatorData).where(eq(indicatorData.subOrganizationId, subs[1])).returning()).toEqual([])
    await expect(db.insert(indicatorData).values({ organizationId: orgs[1], subOrganizationId: subs[1], reportingYear: 2025, reportingMonth: 0 })).rejects.toThrow()
    login('admin')
    await expect(db.insert(indicatorData).values({ organizationId: orgs[0], subOrganizationId: subs[1], reportingYear: 2025, reportingMonth: 0 })).rejects.toThrow()
    login('viewer-a')
    expect(await db.update(indicatorData).set({ totalFoodSpend: '9999' }).returning()).toEqual([])
  })

  it('allows assigned users to create, update and delete their own data', async () => {
    const [created] = await db.insert(indicatorData).values({ organizationId: orgs[0], subOrganizationId: subs[0],
      reportingYear: 2024, reportingMonth: 0, totalFoodSpend: '123' }).returning()
    expect(created.organizationId).toBe(orgs[0])
    const [updated] = await db.update(indicatorData).set({ totalFoodSpend: '456' }).where(eq(indicatorData.id, created.id)).returning()
    expect(Number(updated.totalFoodSpend)).toBe(456)
    expect(await db.delete(indicatorData).where(eq(indicatorData.id, created.id)).returning()).toHaveLength(1)
  })

  it('enables forced RLS on every table with an organization column', async () => {
    const { rows } = await root.query(`SELECT DISTINCT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
      WHERE n.nspname='public' AND c.relkind='r' AND a.attname IN ('organization_id','sub_organization_id')
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)`)
    expect(rows).toEqual([])
  })

  it('keeps benchmark scoring metadata aligned with the questionnaire', async () => {
    const { rows } = await root.query('select question_key,indicator_slug,max_points from app_private.benchmark_questions order by question_key')
    const expected = FORMULA_POLICY.questions.filter(q => ['regional','seasonal','guest_satisfaction'].includes(q.indicator))
      .map(q => ({ question_key: q.key, indicator_slug: q.indicator, max_points: q.maxPoints }))
      .sort((a,b) => a.question_key.localeCompare(b.question_key))
    expect(rows).toEqual(expected)
  })

  it('prevents a normal user from promoting or reassigning their own account', async () => {
    await expect(db.update(users).set({ organizationId: orgs[1] }).where(eq(users.id, 'basic-a'))).rejects.toThrow()
    await expect(db.execute(sql`insert into user_roles(user_id,role_id) values('basic-a','admin')`)).rejects.toThrow()
    expect(await db.update(users).set({ name: 'Renamed' }).where(eq(users.id, 'basic-a')).returning()).toHaveLength(1)
  })

  it('rejects cross-org membership creation even for administrators', async () => {
    login('admin')
    await expect(db.execute(sql`insert into sub_organization_members values('basic-a', ${subs[1]})`)).rejects.toThrow()
  })

  it('applies current membership and status on each query', async () => {
    await root.query("update \"user\" set status = 'deactivated' where id = 'basic-a'")
    try { expect(await db.select().from(indicatorData)).toEqual([]) }
    finally { await root.query("update \"user\" set status = 'active' where id = 'basic-a'") }
  })

  it('keeps tenant data out of the authentication connection', async () => {
    await expect(authPool.query('select * from indicator_data')).rejects.toThrow()
    await expect(authPool.query('select get_dashboard_stats(NULL,NULL,2026,\'yearly\')')).rejects.toThrow()
  })

  it('scopes exports even when a user originally authored a row for another organization', async () => {
    await root.query("update indicator_data set created_by = 'basic-a' where sub_organization_id = $1", [subs[1]])
    const exported = await exportUserData()
    expect(exported.data.indicatorData).toEqual([])
  })

  it.each(['admin', 'super'])('preserves audit log access across organizations for %s', async id => {
    login(id)
    const result = await getAuditLogs({ action: 'isolation.test' })
    expect(result.total).toBe(2)
    expect(result.logs.map(log => log.organizationId).sort()).toEqual([orgs[0], orgs[1]].sort())
    expect(result.logs.map(log => log.userEmail).sort()).toEqual(['basic-a@example.invalid', 'basic-b@example.invalid'])
  })

  it('limits normal users to their own audit entries and denies the admin audit action', async () => {
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'isolation.test'))
    expect(logs).toHaveLength(1)
    expect(logs[0].userId).toBe('basic-a')
    await expect(getAuditLogs({})).rejects.toThrow('Only Admins can view audit logs')
  })

  it('releases only aggregate benchmarks with at least five contributing organizations per metric', async () => {
    const benchmark = await getBenchmark(2026)
    expect(benchmark.availableIndicators).toContain('organic')
    expect(benchmark.availableIndicators).toContain('regional')
    expect(benchmark.availableIndicators).not.toContain('fair_trade')
    expect(benchmark.overview.organic_percentage).toBeGreaterThan(0)
    expect(benchmark.overview.total_spend).toBeNull()
    expect(JSON.stringify(benchmark)).not.toContain(orgs[1])
    // Large cohort for organic must not expose a single contributor to fair trade.
    await root.query('update indicator_data set coffee_spend=100, fair_trade_coffee_spend=50 where sub_organization_id=$1', [subs[0]])
    expect((await getBenchmark(2026)).availableIndicators).not.toContain('fair_trade')
    await root.query('insert into indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,organic_spend,total_food_spend) values($1,$2,2025,0,100,1000)', [orgs[0], subs[0]])
    expect((await getBenchmark(2025)).availableIndicators).toEqual([])
  })

  it('requires configured baselines and five matched organizations in the privacy-protected benchmark', async () => {
    try {
      await root.query('update sub_organizations set food_waste_base_amount = NULL where id = ANY($1::uuid[])', [subs.slice(0, 6)])
      for (let i = 0; i < orgs.length; i++) {
        await root.query(`insert into indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,food_waste_amount)
          values($1,$2,2022,1,100),($1,$2,2023,1,40)`, [orgs[i], subs[i]])
      }
      // Partial years are suppressed even when the privacy threshold is met.
      expect((await getBenchmark(2023, 'monthly')).overview.food_waste).toBeNull()
      for (let i = 0; i < orgs.length; i++) {
        await root.query(`insert into indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,food_waste_amount)
          select $1,$2,2023,month,40 from generate_series(2,12) as month`, [orgs[i], subs[i]])
      }
      const benchmark = await getBenchmark(2023, 'monthly')
      // The raw global total is never released, even above the threshold.
      expect(benchmark.overview.food_waste).toBeNull()
      expect(benchmark.foodWaste).toBeNull()
      expect(benchmark.availableIndicators).not.toContain('food_waste')
      await root.query('update sub_organizations set food_waste_base_amount = 1200 where id = ANY($1::uuid[])', [subs.slice(0, 5)])
      const partial = await getBenchmark(2023, 'monthly')
      expect(partial.foodWaste).toEqual({ reduction: -60, progress: 100, reportingSubOrganizations: 6,
        matchedSubOrganizations: 5, missingBaselineSubOrganizations: 1, status: 'partial' })
      expect(partial.availableIndicators).toContain('food_waste')
      // Check the SQL response too, so unused fields cannot leak through a direct query.
      const released = (await db.execute(sql`select get_benchmark_stats(2023, 'monthly') as benchmark`)).rows[0].benchmark as Record<string, unknown>
      expect(released).not.toHaveProperty('baseFoodWaste')
      expect(released.foodWaste).toEqual(partial.foodWaste)
      await root.query('update sub_organizations set food_waste_base_amount = NULL where id = $1', [subs[0]])
      const suppressed = await getBenchmark(2023, 'monthly')
      expect(suppressed.foodWaste).toBeNull()
      expect(suppressed.availableIndicators).not.toContain('food_waste')
    } finally {
      await root.query('delete from indicator_data where reporting_year in (2022,2023)')
      await root.query('update sub_organizations set food_waste_base_amount = 1000 where id = ANY($1::uuid[])', [subs.slice(0, 6)])
    }
  })

  it('releases the same benchmark for every granularity so cohorts cannot be subtracted', async () => {
    // Five organizations report monthly and one reports quarterly. Granularity-specific
    // cohorts would both pass the threshold and differ by exactly that one organization.
    try {
      for (let i = 0; i < 5; i++) {
        await root.query(`insert into indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,total_food_spend,organic_spend,food_waste_amount)
          select $1,$2,2019,month,1000,100,40 from generate_series(1,12) as month`, [orgs[i], subs[i]])
      }
      await root.query("insert into operating_reporting_modes(organization_id,sub_organization_id,reporting_year,mode) values($1,$2,2019,'quarterly')", [orgs[5], subs[5]])
      await root.query(`insert into indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,period_kind,period_index,coverage_confirmed,total_food_spend,organic_spend,food_waste_amount)
        select $1,$2,2019,NULL,'quarter',quarter,true,3000,3000,300 from generate_series(1,4) as quarter`, [orgs[5], subs[5]])
      const released = async (granularity: string) =>
        (await db.execute(sql`select get_benchmark_stats(2019, ${granularity}) as benchmark`)).rows[0].benchmark as Record<string, any>
      const canonical = await released('auto')
      expect(canonical.stats.organic_percentage).toBe(25)
      expect(canonical.stats.food_waste).toBeNull()
      expect(canonical.foodWaste).toMatchObject({ reportingSubOrganizations: 6, matchedSubOrganizations: 6, status: 'available' })
      for (const granularity of ['monthly', 'quarterly', 'yearly']) expect(await released(granularity)).toEqual(canonical)
      const overviews = await Promise.all(['monthly', 'quarterly', 'yearly', 'auto'].map(g => getBenchmark(2019, g)))
      for (const overview of overviews) expect(overview).toEqual(overviews[3])
    } finally {
      await root.query('delete from indicator_data where reporting_year = 2019')
      await root.query('delete from operating_reporting_modes where reporting_year = 2019')
    }
  })

  it('uses transaction-local identity through commit, rollback, nested savepoints, and concurrent scopes', async () => {
    await db.transaction(async tx => {
      expect(await tx.select().from(indicatorData).where(eq(indicatorData.reportingYear, 2026))).toHaveLength(1)
      await tx.transaction(async nested => {
        expect((await nested.select().from(indicatorData)).every(r => r.organizationId === orgs[0])).toBe(true)
      })
    })
    await expect(db.transaction(async tx => { await tx.execute(sql`select 1`); throw new Error('rollback') })).rejects.toThrow('rollback')
    login('admin')
    const results = await Promise.all(orgs.map(organizationId => withDataScope({ organizationId, subOrganizationId: null }, () => db.select().from(indicatorData))))
    results.forEach((rows, i) => expect(rows.every(r => r.organizationId === orgs[i])).toBe(true))
    // Force one physical connection to move from admin to basic to anonymous.
    const source = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
    let actor: string | null = 'admin'
    const scoped = new TenantPool(source, async () => ({ userId: actor }))
    try {
      expect((await scoped.query('select * from indicator_data')).rows.length).toBeGreaterThan(1)
      actor = 'basic-b'
      expect((await scoped.query('select organization_id from indicator_data')).rows).toEqual([{ organization_id: orgs[1] }])
      actor = null
      expect((await scoped.query('select * from indicator_data')).rows).toEqual([])
    } finally { await scoped.end() }
  })

  // Codes belong to the browser flow that requested them (see src/lib/otp.ts).
  // Limits are kept per flow, so every test uses fresh browsers.
  let browser = '', attacker = ''
  beforeEach(() => { browser = newOtpFlowId(); attacker = newOtpFlowId() })
  const storeOtp = (email: string, flow: string, code = '123456', lifetime = '5 minutes') => root.query(
    'insert into "verificationToken"(identifier,token,expires) values($1,$2,now()+$3::interval)', [otpIdentifier(email, flow), hashOtp(code), lifetime])
  const pending = async (email: string, flow: string) =>
    (await root.query('select token from "verificationToken" where identifier=$1', [otpIdentifier(email, flow)])).rows.length

  it('verifies and atomically consumes OTPs at the credentials boundary', async () => {
    const email = 'otp@example.invalid'
    expect(await consumeOtp(email, undefined, browser)).toBe(false)
    await storeOtp(email, browser)
    expect(await consumeOtp(email, '000000', browser)).toBe(false)
    expect(await pending(email, browser)).toBe(1)
    const result = await Promise.all([consumeOtp(email, '123456', browser), consumeOtp(email, '123456', browser)])
    expect(result.sort()).toEqual([false, true])
    expect(await consumeOtp(email, '123456', browser)).toBe(false)
  })

  it('discards an OTP after five wrong guesses from its own browser', async () => {
    const email = 'otp-guess@example.invalid'
    await storeOtp(email, browser)
    for (const guess of ['000001', '000002', '000003', '000004']) expect(await consumeOtp(email, guess, browser)).toBe(false)
    expect(await pending(email, browser)).toBe(1)
    expect(await consumeOtp(email, '000005', browser)).toBe(false)
    expect(await pending(email, browser)).toBe(0)
    expect(await consumeOtp(email, '123456', browser)).toBe(false)
  })

  it('does not let another browser use, guess against or cancel a pending OTP', async () => {
    const email = 'otp-victim@example.invalid'
    await storeOtp(email, browser)
    expect(await consumeOtp(email, '123456', attacker)).toBe(false)
    expect(await consumeOtp(email, '123456', undefined)).toBe(false)
    for (const guess of ['000001', '000002', '000003', '000004', '000005', '000006']) expect(await consumeOtp(email, guess, attacker)).toBe(false)
    expect(await pending(email, browser)).toBe(1)
    expect(await consumeOtp(email, '123456', browser)).toBe(true)
  })

  it('rejects expired and malformed OTPs and preserves unrelated pending codes', async () => {
    const email = 'otp-expired@example.invalid'
    await storeOtp(email, browser, '123456', '-1 minute')
    await storeOtp('otp-other@example.invalid', browser)
    expect(await consumeOtp(email, '123456', browser)).toBe(false)
    expect(await consumeOtp('otp-other@example.invalid', 'abcdef', browser)).toBe(false)
    expect(await consumeOtp({ email: 'otp-other@example.invalid' }, '123456', browser)).toBe(false)
    expect(await consumeOtp(' OTP-Other@Example.Invalid ', '123456', browser)).toBe(true)
  })
  describe('production HTTP authentication and dashboard', () => {
    let server: ChildProcess
    let origin: string
    let output = ''
    beforeAll(async () => {
      const socket = createServer()
      const port = await new Promise<number>(resolve => socket.listen(0, '127.0.0.1', () => {
        const port = (socket.address() as { port: number }).port
        socket.close(() => resolve(port))
      }))
      origin = `http://127.0.0.1:${port}`
      server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], {
        env: { ...process.env, NODE_ENV: 'production', AUTH_URL: origin, AUTH_TRUST_HOST: 'true', NEXT_TELEMETRY_DISABLED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      server.stdout?.on('data', chunk => { output += chunk.toString() })
      server.stderr?.on('data', chunk => { output += chunk.toString() })
      for (let i = 0; i < 120; i++) {
        if (server.exitCode !== null) throw new Error(`Production server failed: ${output}`)
        try { if ((await fetch(`${origin}/api/health`)).ok) return } catch { /* Startup. */ }
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      throw new Error(`Production server did not become healthy: ${output}`)
    }, 40_000)
    afterAll(async () => {
      if (server && server.exitCode === null) {
        const exited = new Promise<void>(resolve => server.once('exit', () => resolve()))
        server.kill('SIGTERM')
        await exited
      }
    })

    function browser(initial: Record<string, string> = {}) {
      const cookies = new Map<string, string>(Object.entries(initial))
      return async (path: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers)
        headers.set('cookie', [...cookies].map(([key, value]) => `${key}=${value}`).join('; '))
        const response = await fetch(`${origin}${path}`, { ...init, headers, redirect: 'manual' })
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0]
          const split = pair.indexOf('=')
          cookies.set(pair.slice(0, split), pair.slice(split + 1))
        }
        return response
      }
    }

    // A browser holding the flow cookie of a freshly requested OTP (production uses
    // the plain cookie name here because AUTH_URL is HTTP).
    async function otpBrowser(email: string) {
      const flow = newOtpFlowId()
      await root.query('insert into "verificationToken"(identifier,token,expires) values($1,$2,now()+interval \'5 minutes\')', [otpIdentifier(email, flow), hashOtp('654321')])
      return browser({ 'ave-otp-flow': flow })
    }

    async function signedIn(id: string) {
      const email = `${id}@example.invalid`
      const request = await otpBrowser(email)
      const { csrfToken } = await (await request('/api/auth/csrf')).json()
      await request('/api/auth/callback/otp', { method: 'POST', body: new URLSearchParams({ csrfToken, email, code: '654321', callbackUrl: origin + '/dashboard' }) })
      const session = await (await request('/api/auth/session')).json()
      expect(session?.user?.id).toBe(id)
      return { request, csrfToken }
    }

    async function checkScriptPolicy(response: Response) {
      const policy = response.headers.get('content-security-policy')!
      const scripts = policy.match(/(?:^|;\s*)script-src ([^;]+)/)?.[1]
      expect(scripts).not.toContain("'unsafe-inline'")
      expect(scripts).not.toContain("'unsafe-eval'")
      const nonce = scripts?.match(/'nonce-([^']+)'/)?.[1]
      expect(nonce).toBeTruthy()
      expect(response.headers.get('cache-control')).toContain('no-store')
      const html = await response.text()
      const tags = html.match(/<script\b[^>]*>/g) ?? []
      expect(tags.length).toBeGreaterThan(0)
      for (const tag of tags) expect(tag).toContain(`nonce="${nonce}"`)
      expect(html).not.toContain('NEXT_HTTP_ERROR_FALLBACK;500')
      return nonce
    }

    it('uses fresh CSP nonces for public, error and not-found documents', async () => {
      const request = browser()
      const first = await checkScriptPolicy(await request('/login', { headers: {
        'x-nonce': 'attacker-value', 'content-security-policy': "script-src 'unsafe-inline'",
      } }))
      expect(first).not.toBe('attacker-value')
      const second = await checkScriptPolicy(await request('/login'))
      expect(first).not.toBe(second)
      await checkScriptPolicy(await request('/error'))
      // Unknown paths are not public, so only signed-in visitors see the not-found page.
      const anonymous = await request('/this-page-does-not-exist')
      expect(anonymous.status).toBe(307)
      expect(new URL(anonymous.headers.get('location')!, origin).pathname).toBe('/login')
      const missing = await (await signedIn('basic-a')).request('/this-page-does-not-exist')
      expect(missing.status).toBe(404)
      await checkScriptPolicy(missing)
    }, 20_000)

    it('nonces authenticated dashboard, chart and passkey settings scripts', async () => {
      const { request } = await signedIn('basic-a')
      for (const path of ['/dashboard?year=2026', '/indikatoren', '/settings']) {
        const response = await request(path)
        expect(response.status).toBe(200)
        await checkScriptPolicy(response)
      }
    }, 20_000)

    it('rejects email-only direct credential requests', async () => {
      const request = browser()
      const { csrfToken } = await (await request('/api/auth/csrf')).json()
      await request('/api/auth/callback/otp', { method: 'POST', body: new URLSearchParams({ csrfToken, email: 'super@example.invalid' }) })
      expect(await (await request('/api/auth/session')).json()).toBeNull()
    })

    it('keeps a browser session update from changing identity or roles', async () => {
      const { request, csrfToken } = await signedIn('basic-a')
      const response = await request('/api/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csrfToken, data: { id: 'super', roles: ['super_admin'], organizationId: orgs[1] } }) })
      const session = await response.json()
      expect(session?.user?.id).toBe('basic-a')
      expect(session?.user?.roles).toEqual(['basic_user'])
      const html = await (await request('/dashboard?year=2026')).text()
      expect(html.includes('aria-label="Organisation auswählen"')).toBe(false)
      expect(html.includes('Organization 1')).toBe(false)
      expect(html.includes('NEXT_HTTP_ERROR_FALLBACK;500')).toBe(false)
    }, 20_000)

    it('rejects and audits a browser impersonation command from a basic user', async () => {
      const { request, csrfToken } = await signedIn('basic-a')
      await request('/api/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csrfToken, data: { impersonateUserId: 'super', impersonateUserRoles: ['super_admin'] } }) })
      expect(await (await request('/api/auth/session')).json()).toBeNull()
      const { rows } = await root.query("select resource, severity from audit_logs where action = 'authz.denied' and user_id = 'basic-a'")
      expect(rows).toEqual([{ resource: 'user:super', severity: 'critical' }])
    })

    it('renders the organization selector for admins and applies the selected organization', async () => {
      const { request } = await signedIn('admin')
      const response = await request(`/dashboard?year=2026&organizationId=${orgs[1]}`)
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html.includes('aria-label="Organisation auswählen"')).toBe(true)
      expect(html.includes('Organization 1')).toBe(true)
      expect(html.includes('NEXT_HTTP_ERROR_FALLBACK;500')).toBe(false)
    }, 20_000)

    it('renders the scoped team page for a manager', async () => {
      const { request } = await signedIn('manager-a')
      const response = await request('/organization')
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Teammitglied einladen')
      expect(html).toContain('basic-a@example.invalid')
      expect(html).not.toContain('basic-b@example.invalid')
      expect(html).not.toContain('NEXT_HTTP_ERROR_FALLBACK;500')
    })

    it('includes native quarter totals on every default reporting page and preserves explicit annual filtering', async () => {
      const year = 2021
      await root.query("insert into operating_reporting_modes(organization_id,sub_organization_id,reporting_year,mode) values($1,$2,$3,'quarterly')", [orgs[0], subs[0], year])
      try {
        await root.query("insert into indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,period_kind,period_index,coverage_confirmed,total_food_spend,organic_spend) values($1,$2,$3,NULL,'quarter',1,true,1200,300)", [orgs[0], subs[0], year])
        const { request } = await signedIn('basic-a')
        for (const [path, metric] of [
          ['/dashboard', '"organic_percentage":25'],
          ['/indikatoren', '"value":25'],
          ['/detail/organic_percentage', '"currentValue":25'],
          ['/vergleich', '"organic_percentage":25'],
        ]) {
          const response = await request(`${path}?year=${year}`)
          expect(response.status).toBe(200)
          const html = (await response.text()).replaceAll('\\"', '"')
          expect(html, path).not.toContain('NEXT_HTTP_ERROR_FALLBACK')
          expect(html, path).toContain(metric)
        }
        expect((await getComparisonData(year)).orgOverview.organic_percentage).toBe(25)
        expect((await getComparisonData(year, 'yearly')).orgOverview.organic_percentage).toBeNull()
        const annualHtml = (await (await request(`/detail/organic_percentage?year=${year}&granularity=yearly`)).text()).replaceAll('\\"', '"')
        expect(annualHtml).toContain('"currentValue":null')
      } finally {
        await root.query('delete from indicator_data where sub_organization_id=$1 and reporting_year=$2', [subs[0], year])
        await root.query('delete from operating_reporting_modes where sub_organization_id=$1 and reporting_year=$2', [subs[0], year])
      }
    }, 20_000)

    it('accepts a valid invitation through OTP and invalidates the session after manager suspension', async () => {
      const id = randomUUID()
      await root.query('insert into "user"(id,email,organization_id,status,invitation_expires_at) values($1,$2,$3,\'invited\',now()+interval \'7 days\')', [id, `${id}@example.invalid`, orgs[0]])
      await root.query('insert into user_roles(user_id,role_id) values($1,\'basic_user\')', [id])
      await root.query('insert into sub_organization_members values($1,$2)', [id, subs[0]])
      const { request } = await signedIn(id)
      expect((await root.query('select status,"emailVerified" from "user" where id=$1', [id])).rows[0]).toMatchObject({ status: 'active', emailVerified: expect.any(Date) })
      login('manager-a')
      await db.execute(sql`select * from app_private.manage_org_member(${id}, 'suspend')`)
      expect(await (await request('/api/auth/session')).json()).toBeNull()
    })

    it.each(['expired', 'cancelled'])('rejects a valid OTP for an %s invitation over HTTP', async state => {
      const id = randomUUID(), email = `${id}@example.invalid`
      await root.query('insert into "user"(id,email,organization_id,status,invitation_expires_at) values($1,$2,$3,$4,now()-interval \'1 day\')', [id, email, orgs[0], state === 'expired' ? 'invited' : 'deactivated'])
      await root.query('insert into user_roles(user_id,role_id) values($1,\'basic_user\')', [id])
      const request = await otpBrowser(email)
      const { csrfToken } = await (await request('/api/auth/csrf')).json()
      await request('/api/auth/callback/otp', { method: 'POST', body: new URLSearchParams({ csrfToken, email, code: '654321', callbackUrl: origin + '/dashboard' }) })
      expect(await (await request('/api/auth/session')).json()).toBeNull()
      expect((await root.query('select status from "user" where id=$1', [id])).rows[0].status).not.toBe('active')
    })
  })

  it('excludes superseded sources from every calculation reader after a reviewed correction', async () => {
    login('manager-a')
    const year = 2020
    const legacy: Publication = { subOrganizationId: subs[0], year, requestId: randomUUID(), workflow: 'legacy',
      entries: [{ period: { kind: 'month', year, index: 3 }, expectedRevision: 0,
        values: { totalFoodSpend: '1000', organicSpend: '250', foodWasteAmount: '210' } }] }
    await db.transaction(tx => publishOperatingTransaction(tx, 'manager-a', legacy))
    const replacement = { ...legacy, requestId: randomUUID(), entries: [{ ...legacy.entries[0],
      period: { kind: 'quarter' as const, year, index: 1 }, coverageConfirmed: true }] }
    const preview = unwrapOperatingResult(await previewPeriodConversion(replacement, 'quarterly'))
    await db.transaction(tx => publishOperatingTransaction(tx, 'manager-a', { ...replacement, workflow: 'conversion',
      conversion: { mode: 'quarterly', confirmed: true, reason: 'Quarter total was incorrectly recorded as March.', expectedSourceRevision: preview.sourceRevision } }))

    const sourceRows = (await root.query('select period_kind,superseded_at from indicator_data where sub_organization_id=$1 and reporting_year=$2', [subs[0], year])).rows
    expect(sourceRows).toHaveLength(2)
    expect(sourceRows.find(row => row.period_kind === 'month')?.superseded_at).not.toBeNull()
    expect(sourceRows.find(row => row.period_kind === 'quarter')?.superseded_at).toBeNull()
    const dashboard = await getDashboardData(subs[0], year, 'auto')
    expect(dashboard.overview.organic_percentage).toBe(25)
    expect(dashboard.dataEntryProgress.total_entries).toBe(3)
    expect(dashboard.breakdown).toHaveLength(1)
    expect(await readFoodWaste({ organizationId: orgs[0], subOrganizationId: subs[0] }, year, 'auto'))
      .toMatchObject({ matchedAmount: 210, matchedBaseline: 250, reduction: -16 })
    expect((await getIndicatorDetails('organic_percentage', subs[0], year, 'auto'))?.summary.currentValue).toBe(25)
    expect((await getIndicatorDetails('food_waste', subs[0], year, 'auto'))?.summary.currentValue).toBe(-16)
    const { report } = await getCalculationReport(year, 'auto', subs[0])
    expect(report.inputs.rows).toHaveLength(1)
    expect(report.inputs.history).toHaveLength(1)
    expect(report.inputs.rows[0].periodKind).toBe('quarter')
    const nextPreview = unwrapOperatingResult(await previewPeriodConversion({ ...legacy, requestId: randomUUID() }, 'legacy'))
    expect(nextPreview.before.inputs.rows).toHaveLength(1)
    expect(nextPreview.before.inputs.rows[0].periodKind).toBe('quarter')

    login('admin')
    await expect(freezeYear(year)).resolves.toEqual({ success: true })
    const snapshots = (await root.query('select payload from indicator_report_snapshots where sub_organization_id=$1 and reporting_year=$2', [subs[0], year])).rows
    expect(snapshots).toHaveLength(4)
    expect(snapshots.every(({ payload }) => payload.inputs.rows.length === 1 && payload.inputs.rows[0].periodKind === 'quarter')).toBe(true)
    // The freeze-time archive stays authoritative: no later archive for the frozen year.
    const frozen = await getCalculationReport(year, 'auto', subs[0])
    expect(frozen.canArchive).toBe(false)
    expect(frozen.frozenAt).not.toBeNull()
    await expect(saveCalculationReport(year, 'auto', subs[0], frozen.report.inputRevision, frozen.report.formulaVersion)).rejects.toThrow('beim Sperren archivierte Bericht')
    await expect(db.execute(sql`insert into indicator_report_snapshots
      (organization_id, sub_organization_id, reporting_year, granularity, formula_version, input_revision, payload, created_by)
      values (${orgs[0]}, ${subs[0]}, ${year}, 'auto', 'later', 'later', '{}', 'admin')`))
      .rejects.toMatchObject({ cause: { message: expect.stringContaining('gesperrt') } })
    const archives = await listCalculationReports(subs[0], year)
    expect(archives).toHaveLength(4)
    expect(archives.every(archive => archive.atFreeze)).toBe(true)
  }, 20_000)
})
