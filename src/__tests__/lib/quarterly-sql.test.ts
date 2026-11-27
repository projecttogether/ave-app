import { unwrapOperatingResult } from '@/lib/operating-data/result'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { and, eq, isNull, sql } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { applyMigrations } from '@/lib/db/migrate'
import { operatingSourceRevision, publishOperatingTransaction, type OperatingTransaction } from '@/lib/operating-data/write'
import { type Publication } from '@/lib/operating-data/publication'
import { periodColumns } from '@/lib/operating-data/periods'
import { loadCalculationReport, archiveCalculationReport } from '@/lib/indicators/report-data'

const mocks = vi.hoisted(() => ({ actor: 'quarter-manager', transaction: vi.fn() }))
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: mocks.actor, email: mocks.actor + '@example.org' } }) }))
vi.mock('@/lib/db', () => ({ db: { transaction: (...args: unknown[]) => mocks.transaction(...args) } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { previewIndicatorCsv, importIndicatorCsv } from '@/app/actions/csv-import'
import { loadQuarterlyEntry, saveQuarterlyDraft, previewPeriodConversion, publishQuarterlyEntry } from '@/app/actions/quarterly-entry'

import { getReportingPreference, setReportingFrequency, confirmAnnualReporting } from '@/app/actions/reporting-preferences'
import { getOperatingTasks } from '@/lib/operating-data/preferences'

const container = process.env.INDICATOR_SQL_TEST_CONTAINER
const socket = process.env.INDICATOR_SQL_TEST_SOCKET
describe.skipIf(!container && !socket)('quarterly publication with real PostgreSQL and runtime RLS', () => {
  let pool: Pool
  let database: ReturnType<typeof drizzle<typeof schema>>
  let org: string, kitchen: string, otherOrg: string, otherKitchen: string
  const manager = 'quarter-manager'
  const actorTransaction = <T>(actor: string, callback: (tx: OperatingTransaction) => Promise<T>) => database.transaction(async tx => {
    await tx.execute(sql`SET LOCAL ROLE ave_app`)
    await tx.execute(sql`SELECT set_config('app.user_id', ${actor}, true)`)
    return callback(tx)
  })
  const request = (overrides: Partial<Publication> = {}): Publication => ({ subOrganizationId: kitchen, year: 2025,
    requestId: randomUUID(), workflow: 'quarter', entries: [{ period: { kind: 'quarter', year: 2025, index: 1 }, expectedRevision: 0,
      coverageConfirmed: true, values: { totalFoodSpend: '1000', organicSpend: '250', foodWasteAmount: '210' } }], ...overrides })
  const publish = (input: Publication, actor = manager) => actorTransaction(actor, tx => publishOperatingTransaction(tx, actor, input))
  const active = () => database.select().from(schema.indicatorData).where(and(eq(schema.indicatorData.subOrganizationId, kitchen), isNull(schema.indicatorData.supersededAt)))

  beforeAll(async () => {
    let host = '127.0.0.1', port: number | undefined
    if (socket) { if (!socket.startsWith('/tmp/ave-indicator-tests-')) throw new Error('Isolated socket required'); host = socket }
    else {
      if (!container?.startsWith('ave-indicator-tests-')) throw new Error('Isolated container required')
      const address = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim()
      if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error('Loopback port required')
      port = Number(address.split(':')[1])
    }
    const admin = new Pool({ host, port, user: 'postgres', database: 'postgres' })
    await admin.query('CREATE DATABASE ave_quarter_test'); await admin.end()
    pool = new Pool({ host, port, user: 'postgres', database: 'ave_quarter_test', max: 6 })
    const client = await pool.connect()
    try { await applyMigrations(client, path.resolve('drizzle')) } finally { client.release() }
    database = drizzle(pool, { schema })
    org = (await database.insert(schema.organizations).values({ name: 'Quarter organization' }).returning())[0].id
    otherOrg = (await database.insert(schema.organizations).values({ name: 'Other organization' }).returning())[0].id
    otherKitchen = (await database.insert(schema.subOrganizations).values({ organizationId: otherOrg, name: 'Other kitchen' }).returning())[0].id
    await database.insert(schema.roles).values([{ id: 'org_manager' }, { id: 'basic_user' }, { id: 'org_view_only' }]).onConflictDoNothing()
    await database.insert(schema.users).values([{ id: manager, email: 'manager@example.org', organizationId: org }, { id: 'quarter-basic', email: 'basic@example.org', organizationId: org }, { id: 'quarter-viewer', email: 'viewer@example.org', organizationId: org }, { id: 'quarter-other', email: 'other@example.org', organizationId: otherOrg }])
    await database.insert(schema.userRoles).values([{ userId: manager, roleId: 'org_manager' }, { userId: 'quarter-basic', roleId: 'basic_user' }, { userId: 'quarter-viewer', roleId: 'org_view_only' }, { userId: 'quarter-other', roleId: 'org_manager' }])
    process.env.AUTH_SECRET = 'isolated-test-secret-with-at-least-32-characters'
  }, 30000)
  beforeEach(async () => {
    kitchen = (await database.insert(schema.subOrganizations).values({ organizationId: org, name: 'Kitchen ' + randomUUID(), foodWasteBaseAmount: '1200' }).returning())[0].id
    mocks.actor = manager
    mocks.transaction.mockImplementation((callback: (tx: OperatingTransaction) => Promise<unknown>) => actorTransaction(mocks.actor, callback))
  })
  afterAll(async () => { await pool?.end() })

  const preference = (year = 2025) => getReportingPreference({ subOrganizationId: kitchen, year }).then(unwrapOperatingResult)
  const choose = (frequency: 'monthly' | 'quarterly' | 'yearly', expectedRevision = 0, confirmed = false) =>
    setReportingFrequency({ subOrganizationId: kitchen, year: 2025, frequency, expectedRevision, confirmed }).then(unwrapOperatingResult)
  const annualRequest = (overrides: Partial<Publication> = {}) => request({ workflow: 'legacy', expectedPreferenceRevision: 1,
    entries: [{ period: { kind: 'year', year: 2025, index: 1 }, expectedRevision: 0, values: { totalFoodSpend: '0' } }], ...overrides })

  it('persists an explicit choice before any data and rejects concurrent stale choices', async () => {
    expect(await preference()).toMatchObject({ frequency: null, revision: 0 })
    expect(await choose('yearly')).toMatchObject({ kind: 'saved', frequency: 'yearly', revision: 1 })
    expect(await active()).toEqual([])
    await expect(choose('monthly')).rejects.toThrow('inzwischen geändert')
    expect(await preference()).toMatchObject({ frequency: 'yearly', revision: 1 })
    expect(await choose('yearly', 1)).toMatchObject({ revision: 1 })
  })

  it('confirms the reviewed annual revision, accepts zero, and reopens after a later edit', async () => {
    await choose('yearly')
    await publish(annualRequest())
    const [row] = await active()
    const confirmation = { subOrganizationId: kitchen, year: 2025, expectedRevision: 1, recordId: row.id, recordRevision: row.revision }
    expect((await preference()).annual?.confirmed).toBe(false)
    expect(getOperatingTasks(2025, 'yearly', [row])).toHaveLength(1)
    expect(unwrapOperatingResult(await confirmAnnualReporting(confirmation))).toMatchObject({ revision: 2 })
    expect(unwrapOperatingResult(await confirmAnnualReporting(confirmation))).toMatchObject({ revision: 2 })
    expect((await preference()).annual?.confirmed).toBe(true)
    expect(getOperatingTasks(2025, 'yearly', [row], { annualRecordId: row.id, annualRecordRevision: row.revision })).toEqual([])
    await publish(annualRequest({ expectedPreferenceRevision: 2, entries: [{ ...annualRequest().entries[0], expectedRevision: row.revision, values: { totalFoodSpend: '200' } }] }))
    expect((await preference()).annual?.confirmed).toBe(false)
    expect(await confirmAnnualReporting({ ...confirmation, expectedRevision: 2 })).toMatchObject({ error: expect.stringContaining('geändert oder sind leer') })
    const [changed] = await active()
    expect(getOperatingTasks(2025, 'yearly', [changed], { annualRecordId: row.id, annualRecordRevision: row.revision })).toHaveLength(1)
  })

  it('rejects annual completion during the current year and for an empty record', async () => {
    const year = new Date().getFullYear()
    unwrapOperatingResult(await setReportingFrequency({ subOrganizationId: kitchen, year, frequency: 'yearly', expectedRevision: 0 }))
    await publish(annualRequest({ year, entries: [{ period: { kind: 'year', year, index: 1 }, expectedRevision: 0, values: { totalFoodSpend: '1' } }] }))
    const [row] = await active()
    expect(await confirmAnnualReporting({ subOrganizationId: kitchen, year, expectedRevision: 1, recordId: row.id, recordRevision: row.revision })).toMatchObject({ error: expect.stringContaining('abgeschlossene Jahre') })
    expect(getOperatingTasks(year, 'yearly', [row])[0].state).toBe('in_progress')
    await choose('yearly')
    await publish(annualRequest())
    await publish(annualRequest({ entries: [{ ...annualRequest().entries[0], expectedRevision: 1, values: { totalFoodSpend: null } }] }))
    const empty = (await active()).find(r => r.reportingYear === 2025)!
    expect(await confirmAnnualReporting({ subOrganizationId: kitchen, year: 2025, expectedRevision: 1, recordId: empty.id, recordRevision: empty.revision })).toHaveProperty('error')
  })

  it('previews a monthly/yearly change without changing source values or calculations', async () => {
    await choose('yearly'); await publish(annualRequest())
    const rows = await active()
    const before = await database.transaction(tx => loadCalculationReport(tx, { organizationId: org, subOrganizationId: kitchen }, 2025, 'auto'))
    const preview = await choose('monthly', 1)
    expect(preview).toMatchObject({ kind: 'preview', tasks: expect.any(Array) })
    if (preview.kind === 'preview') expect(preview.tasks).toHaveLength(12)
    expect((await preference()).frequency).toBe('yearly')
    await choose('monthly', 1, true)
    expect(await active()).toEqual(rows)
    const after = await database.transaction(tx => loadCalculationReport(tx, { organizationId: org, subOrganizationId: kitchen }, 2025, 'auto'))
    expect(after.inputRevision).toBe(before.inputRevision)
    await expect(publish(annualRequest())).rejects.toThrow('inzwischen geändert')
    await expect(publish(annualRequest({ expectedPreferenceRevision: 2 }))).rejects.toThrow('Erfassungsrhythmus')
  })

  it('changes quarterly data to annual data and its preference in one reviewed transaction', async () => {
    await choose('quarterly'); await publish(request({ expectedPreferenceRevision: 1 }))
    const original = (await active())[0]
    expect(await choose('yearly', 1)).toMatchObject({ kind: 'conversion', href: expect.stringContaining('workflow=year') })
    expect((await preference()).frequency).toBe('quarterly')
    const selection = { subOrganizationId: kitchen, year: 2025, quarter: 1, workflow: 'year' as const }
    const loaded = unwrapOperatingResult(await loadQuarterlyEntry(selection))
    expect(loaded.saved.entries).toHaveLength(1)
    expect(loaded.saved.entries[0].period.kind).toBe('year')
    const input = annualRequest({ expectedModeRevision: loaded.modeRevision })
    const { workflow: _workflow, ...forPreview } = input
    const preview = unwrapOperatingResult(await previewPeriodConversion(forPreview, 'legacy'))
    const converted = { ...input, workflow: 'conversion' as const, conversion: { mode: 'legacy' as const, frequency: 'yearly' as const,
      expectedSourceRevision: preview.sourceRevision, reason: 'Jahresgesamtwert geprüft und neu erfasst.', confirmed: true as const } }
    expect(await publishQuarterlyEntry({ ...converted, expectedPreferenceRevision: 0 })).toHaveProperty('error')
    expect((await preference()).frequency).toBe('quarterly'); expect((await active())[0].id).toBe(original.id)
    expect(unwrapOperatingResult(await publishQuarterlyEntry(converted))).toMatchObject({ preferenceRevision: 2 })
    expect(await preference()).toMatchObject({ frequency: 'yearly', annual: { confirmed: false } })
    expect((await active())[0].periodKind).toBe('year')
    const old = await database.query.indicatorData.findFirst({ where: eq(schema.indicatorData.id, original.id) })
    expect(old?.totalFoodSpend).toBe(original.totalFoodSpend); expect(old?.supersededAt).not.toBeNull()
    expect(unwrapOperatingResult(await publishQuarterlyEntry(converted))).toMatchObject({ preferenceRevision: 2 })
  })

  it('isolates preferences and prevents viewers or frozen-year writes', async () => {
    await choose('yearly')
    mocks.actor = 'quarter-viewer'
    expect(await preference()).toMatchObject({ frequency: 'yearly', canWrite: false })
    await expect(choose('monthly', 1)).rejects.toThrow('Berechtigung')
    mocks.actor = 'quarter-other'
    await expect(preference()).rejects.toThrow('Zugriff')
    expect(await actorTransaction('quarter-other', tx => tx.query.operatingReportingPreferences.findMany({ where: eq(schema.operatingReportingPreferences.subOrganizationId, kitchen) }))).toEqual([])
    mocks.actor = manager
    await database.insert(schema.dataFreezes).values({ year: 2025 })
    try { await expect(choose('monthly', 1)).rejects.toThrow('gesperrt') }
    finally { await database.delete(schema.dataFreezes).where(eq(schema.dataFreezes.year, 2025)) }
  })

  it('stores a native quarter and gives SQL, report and baseline the same coverage', async () => {
    await publish(request())
    const rows = await active()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ reportingMonth: null, periodKind: 'quarter', periodIndex: 1, totalFoodSpend: '1000', revision: 1 })
    const report = await database.transaction(tx => loadCalculationReport(tx, { organizationId: org, subOrganizationId: kitchen }, 2025, 'auto'))
    expect(report.schemaVersion).toBe(2)
    expect(report.indicators.find(i => i.slug === 'organic_percentage')).toMatchObject({ value: 25, coverage: [{ reportedMonths: 3 }] })
    expect(report.indicators.find(i => i.slug === 'food_waste')).toMatchObject({ value: -30, denominator: '300' })
    const stats = await pool.query('SELECT * FROM get_dashboard_stats($1,$2,2025,$3)', [org, kitchen, 'auto'])
    expect(Number(stats.rows[0].organic_percentage)).toBe(25)
    expect((await pool.query("SELECT * FROM get_dashboard_stats($1,$2,2025,'monthly')", [org, kitchen])).rows[0].organic_percentage).toBeNull()
    const id = await database.transaction(async tx => archiveCalculationReport(tx, await loadCalculationReport(tx, { organizationId: org, subOrganizationId: kitchen }, 2025, 'quarterly'), manager))
    expect(id).toBeTruthy()
  })
  it('retries one request exactly once and rejects token reuse with different values', async () => {
    const input = request()
    const [a, b] = await Promise.all([publish(input), publish(input)])
    expect(a).toEqual(b)
    expect((await active())[0].revision).toBe(1)
    await expect(publish({ ...input, entries: [{ ...input.entries[0], values: { totalFoodSpend: '2000' } }] })).rejects.toThrow('anderem Inhalt')
  })
  it('makes concurrent competing edits fail instead of overwriting', async () => {
    const results = await Promise.allSettled([publish(request()), publish(request())])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect((await active())[0].revision).toBe(1)
  })
  it('retains the empty period revision after clearing so a stale tab cannot resurrect it', async () => {
    await publish(request())
    const clear = request(); clear.entries[0].expectedRevision = 1
    clear.entries[0].values = { totalFoodSpend: null, organicSpend: null, foodWasteAmount: null }
    await publish(clear)
    expect((await active())[0]).toMatchObject({ revision: 2, totalFoodSpend: null, organicSpend: null, foodWasteAmount: null })
    await expect(publish(request())).rejects.toThrow('inzwischen geändert')
    const report = await database.transaction(tx => loadCalculationReport(tx, { organizationId: org, subOrganizationId: kitchen }, 2025, 'auto'))
    expect(report.indicators.find(i => i.slug === 'food_waste')?.value).toBeNull()
  })
  it('can publish the next quarter while the year is in quarterly mode', async () => {
    await publish(request())
    const input = request(); input.entries[0].period.index = 2
    await publish(input)
    expect(await active()).toHaveLength(2)
  })
  it('rejects monthly/annual overlap through both the writer and direct SQL', async () => {
    await publish(request())
    const monthly = request({ workflow: 'legacy' }); monthly.entries[0].period = { kind: 'month', year: 2025, index: 1 }
    await expect(publish(monthly)).rejects.toThrow('vermischt')
    await expect(pool.query('INSERT INTO indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,total_food_spend) VALUES($1,$2,2025,0,100)', [org, kitchen])).rejects.toThrow('vermischt')
    expect(await active()).toHaveLength(1)
  })
  it('rolls back every batch row and the baseline when any row is invalid', async () => {
    const input = request({ workflow: 'batch', entries: [1, 2, 3].map(index => ({ period: { kind: 'month', year: 2025, index }, expectedRevision: 0, values: { totalFoodSpend: '100', organicSpend: index === 3 ? '101' : '20' } })), baseline: { amount: '2400', date: null, expectedRevision: 0 } })
    await expect(publish(input)).rejects.toThrow('übersteigen')
    expect(await active()).toHaveLength(0)
    expect((await database.query.subOrganizations.findFirst({ where: eq(schema.subOrganizations.id, kitchen) }))?.foodWasteBaseAmount).toBe('1200')
    expect(await database.query.operatingMutationReceipts.findMany({ where: eq(schema.operatingMutationReceipts.subOrganizationId, kitchen) })).toHaveLength(0)
  })
  it('rolls back numerical edits if the baseline revision is stale', async () => {
    await expect(publish(request({ baseline: { amount: '2400', date: null, expectedRevision: 99 } }))).rejects.toThrow('Basiswert')
    expect(await active()).toHaveLength(0)
  })
  it('validates a partial edit against the stored complete row', async () => {
    await publish(request())
    const input = request(); input.entries[0].expectedRevision = 1; input.entries[0].values = { totalFoodSpend: '100' }
    await expect(publish(input)).rejects.toThrow('übersteigen')
    expect((await active())[0].totalFoodSpend).toBe('1000')
  })
  it('uses a reviewed source revision for conversion and retains original records', async () => {
    const old = request({ workflow: 'legacy' }); old.entries[0].period = { kind: 'month', year: 2025, index: 3 }
    await publish(old)
    const rows = await active()
    const baseline = await database.query.subOrganizations.findFirst({ where: eq(schema.subOrganizations.id, kitchen) })
    const mode = await database.query.operatingReportingModes.findFirst({ where: eq(schema.operatingReportingModes.subOrganizationId, kitchen) })
    const input = request({ workflow: 'conversion', expectedModeRevision: mode!.revision, conversion: { mode: 'quarterly', confirmed: true, reason: 'Q1 wurde zuvor als März gespeichert.', expectedSourceRevision: operatingSourceRevision(rows, { amount: baseline!.foodWasteBaseAmount, date: baseline!.foodWasteBaseDate, revision: baseline!.baselineRevision }, mode) } })
    await publish(input)
    expect((await active())[0].periodKind).toBe('quarter')
    const original = await database.query.indicatorData.findFirst({ where: eq(schema.indicatorData.id, rows[0].id) })
    expect(original?.totalFoodSpend).toBe('1000'); expect(original?.supersededAt).not.toBeNull()
    await expect(pool.query('UPDATE indicator_data SET total_food_spend=999 WHERE id=$1', [rows[0].id])).rejects.toThrow('unveränderlich')
    const ledger = await database.query.operatingDataRevisions.findMany({ where: eq(schema.operatingDataRevisions.subOrganizationId, kitchen) })
    expect(ledger.some(row => row.reason === input.conversion!.reason && row.before !== null)).toBe(true)
  })
  it('isolates drafts by author and keeps them out of reports', async () => {
    const selection = { subOrganizationId: kitchen, year: 2025, quarter: 1, workflow: 'quarter' as const }
    const loaded = unwrapOperatingResult(await loadQuarterlyEntry(selection))
    loaded.draft.entries[0].values = { totalFoodSpend: '123' }
    await saveQuarterlyDraft(selection, loaded.draft, 0)
    expect(await saveQuarterlyDraft(selection, loaded.draft, 0)).toMatchObject({ data: { revision: 1 } }) // Lost-response retry.
    const competing = structuredClone(loaded.draft); competing.entries[0].values.totalFoodSpend = '456'
    expect(await saveQuarterlyDraft(selection, competing, 0)).toMatchObject({ error: expect.stringContaining('anderen Fenster') })
    expect(await active()).toHaveLength(0)
    const drafts = await actorTransaction('quarter-viewer', tx => tx.query.operatingEntryDrafts.findMany())
    expect(drafts).toHaveLength(0)
  })
  it('denies viewers and foreign kitchens, including modes and history', async () => {
    await expect(publish(request(), 'quarter-viewer')).rejects.toThrow()
    await expect(publish(request({ subOrganizationId: otherKitchen }))).rejects.toThrow()
    await publish(request())
    expect(await actorTransaction('quarter-other', tx => tx.query.operatingDataRevisions.findMany({ where: eq(schema.operatingDataRevisions.subOrganizationId, kitchen) }))).toHaveLength(0)
    expect(await actorTransaction('quarter-other', tx => tx.query.operatingReportingModes.findMany({ where: eq(schema.operatingReportingModes.subOrganizationId, kitchen) }))).toHaveLength(0)
  })
  it('enforces closed quarters and full coverage in direct database writes', async () => {
    await database.insert(schema.operatingReportingModes).values({ organizationId: org, subOrganizationId: kitchen, reportingYear: 2099, mode: 'quarterly' })
    await expect(database.insert(schema.indicatorData).values({ organizationId: org, subOrganizationId: kitchen, ...periodColumns({ kind: 'quarter', year: 2099, index: 1 }), totalFoodSpend: '100', coverageConfirmed: true })).rejects.toThrow()
    await expect(publish(request({ entries: [{ ...request().entries[0], coverageConfirmed: false }] }))).rejects.toThrow('vollständiger')
  })
  it('waits for an in-flight freeze, then rejects the whole publication', async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(1936028722,2025)')
      const attempt = publish(request()).then(() => 'saved', () => 'blocked')
      await client.query('INSERT INTO data_freezes(year) VALUES(2025)')
      await client.query('COMMIT')
      expect(await attempt).toBe('blocked'); expect(await active()).toHaveLength(0)
    } finally { await client.query('ROLLBACK'); client.release(); await pool.query('DELETE FROM data_freezes WHERE year=2025') }
  })
  it('rejects a CSV preview after a coworker changes the chosen frequency', async () => {
    await choose('monthly')
    const form = new FormData()
    form.set('file', new File([`format_version,sub_organization_id,reporting_year,period_kind,period_index,total_food_spend\n2,${kitchen},2025,month,1,1000`], 'month.csv'))
    const preview = unwrapOperatingResult(await previewIndicatorCsv(form))
    await choose('yearly', 1)
    const commit = new FormData(); commit.set('previewToken', preview.token)
    expect(await importIndicatorCsv(commit)).toMatchObject({ success: false, imported: 0, errors: [expect.objectContaining({ message: expect.stringContaining('inzwischen geändert') })] })
    expect(await active()).toHaveLength(0)
    expect(await previewIndicatorCsv(form)).toMatchObject({ error: expect.stringContaining('Erfassungsrhythmus') })
  })
  it('imports a signed preview atomically, preserves blanks, and permits safe retries', async () => {
    const file = new File([`format_version,sub_organization_id,reporting_year,period_kind,period_index,coverage_confirmed,total_food_spend,organic_spend\n2,${kitchen},2025,quarter,1,true,1000,250\n2,${kitchen},2025,quarter,2,true,2000,500`], 'quarter.csv')
    const form = new FormData(); form.set('file', file)
    const preview = unwrapOperatingResult(await previewIndicatorCsv(form))
    const commit = new FormData(); commit.set('previewToken', preview.token)
    expect(await importIndicatorCsv(commit)).toMatchObject({ success: true, imported: 2 })
    expect(await importIndicatorCsv(commit)).toMatchObject({ success: true, imported: 2 })
    expect(await active()).toHaveLength(2)
    const edit = new FormData(); edit.set('file', new File([`format_version,sub_organization_id,reporting_year,period_kind,period_index,coverage_confirmed,total_food_spend,organic_spend\n2,${kitchen},2025,quarter,1,true,,200`], 'edit.csv'))
    const editPreview = unwrapOperatingResult(await previewIndicatorCsv(edit))
    commit.set('previewToken', editPreview.token)
    expect(await importIndicatorCsv(commit)).toMatchObject({ success: true })
    expect((await active()).find(r => r.periodIndex === 1)?.totalFoodSpend).toBe('1000')
  })
  it('lets an assigned kitchen member publish a baseline atomically without broader kitchen access', async () => {
    await database.insert(schema.subOrganizationMembers).values({ userId: 'quarter-basic', subOrganizationId: kitchen })
    const input = request({ baseline: { amount: '2400', date: '2024-01-01', expectedRevision: 0 } })
    expect(await publish(input, 'quarter-basic')).toMatchObject({ baselineRevision: 1 })
    expect((await database.query.subOrganizations.findFirst({ where: eq(schema.subOrganizations.id, kitchen) }))?.foodWasteBaseAmount).toBe('2400')
    expect(await actorTransaction('quarter-basic', tx => tx.update(schema.subOrganizations).set({ name: 'Unauthorized name' }).where(eq(schema.subOrganizations.id, kitchen)).returning())).toHaveLength(0)
    expect((await database.query.subOrganizations.findFirst({ where: eq(schema.subOrganizations.id, kitchen) }))?.name).not.toBe('Unauthorized name')
  })
  it.each(['monthly', 'yearly'] as const)('allows a reviewed conversion from quarters to %s, including a lost-response retry', async frequency => {
    await choose('quarterly'); await publish(request({ expectedPreferenceRevision: 1 }))
    const [original] = await active()
    try {
      const workflow = frequency === 'yearly' ? 'year' as const : 'batch' as const
      expect(await choose(frequency, 1)).toMatchObject({ kind: 'conversion', href: expect.stringContaining(`workflow=${workflow}`) })
      const selection = { subOrganizationId: kitchen, year: 2025, quarter: 1, workflow }
      const loaded = unwrapOperatingResult(await loadQuarterlyEntry(selection))
      const draft = { ...loaded.draft, entries: loaded.draft.entries.map(entry => ({ ...entry, values: { totalFoodSpend: '1000' } })) }
      expect(unwrapOperatingResult(await saveQuarterlyDraft(selection, draft, 0))).toMatchObject({ revision: 1 })
      const { workflow: _workflow, ...input } = request({ ...draft })
      const preview = unwrapOperatingResult(await previewPeriodConversion(input, 'legacy'))
      const conversion = { ...input, workflow: 'conversion' as const, conversion: { mode: 'legacy' as const, frequency,
        expectedSourceRevision: preview.sourceRevision, reason: 'Geprüfte Umstellung auf den gewählten Rhythmus.', confirmed: true as const } }
      expect(await publishQuarterlyEntry({ ...conversion, expectedPreferenceRevision: 0 })).toHaveProperty('error')
      expect(await publishQuarterlyEntry({ ...conversion, conversion: { ...conversion.conversion, expectedSourceRevision: 'stale' } })).toMatchObject({ error: expect.stringContaining('veraltet') })
      mocks.actor = 'quarter-viewer'
      expect(await saveQuarterlyDraft(selection, draft, 0)).toMatchObject({ error: expect.stringContaining('Berechtigung') })
      expect(await publishQuarterlyEntry(conversion)).toMatchObject({ error: expect.stringContaining('Berechtigung') })
      mocks.actor = manager
      await database.insert(schema.dataFreezes).values({ year: 2025 })
      try {
        expect(await saveQuarterlyDraft(selection, draft, 1)).toMatchObject({ error: expect.stringContaining('gesperrt') })
        expect(await publishQuarterlyEntry(conversion)).toMatchObject({ error: expect.stringContaining('gesperrt') })
      } finally { await database.delete(schema.dataFreezes).where(eq(schema.dataFreezes.year, 2025)) }
      expect((await active())[0].id).toBe(original.id)
      const result = unwrapOperatingResult(await publishQuarterlyEntry(conversion))
      expect(result.preferenceRevision).toBe(2)
      expect(await preference()).toMatchObject({ frequency, revision: 2 })
      const rows = await active()
      expect(rows).toHaveLength(frequency === 'yearly' ? 1 : 3)
      expect(rows.every(row => row.periodKind === (frequency === 'yearly' ? 'year' : 'month'))).toBe(true)
      const old = await database.query.indicatorData.findFirst({ where: eq(schema.indicatorData.id, original.id) })
      expect(old?.totalFoodSpend).toBe(original.totalFoodSpend); expect(old?.supersededAt).not.toBeNull()
      // A retry must use the receipt even though the source is no longer quarterly.
      expect(unwrapOperatingResult(await publishQuarterlyEntry(conversion))).toEqual(result)
    } finally { mocks.actor = manager }
  })
  it('requires four complete quarters per indicator before a year enters the protected benchmark', async () => {
    const kitchens: { org: string; id: string }[] = []
    for (let i = 0; i < 5; i++) {
      const organization = (await database.insert(schema.organizations).values({ name: 'Benchmark organization ' + i }).returning())[0]
      const kitchen = (await database.insert(schema.subOrganizations).values({ organizationId: organization.id, name: 'Benchmark kitchen', foodWasteBaseAmount: '1200' }).returning())[0]
      kitchens.push({ org: organization.id, id: kitchen.id })
      await database.insert(schema.operatingReportingModes).values({ organizationId: organization.id, subOrganizationId: kitchen.id, reportingYear: 2018, mode: 'quarterly' })
      await database.insert(schema.indicatorData).values({ organizationId: organization.id, subOrganizationId: kitchen.id, ...periodColumns({ kind: 'quarter', year: 2018, index: 1 }), totalFoodSpend: '100', organicSpend: '100', coverageConfirmed: true })
    }
    const benchmark = () => actorTransaction(manager, tx => tx.execute(sql`SELECT get_benchmark_stats(2018,'auto') AS result`))
    expect((await benchmark()).rows[0].result).toMatchObject({ stats: { organic_percentage: null } })
    for (const kitchen of kitchens) for (const index of [2, 3, 4]) await database.insert(schema.indicatorData).values({ organizationId: kitchen.org, subOrganizationId: kitchen.id, ...periodColumns({ kind: 'quarter', year: 2018, index }), totalFoodSpend: '300', organicSpend: '0', coverageConfirmed: true })
    expect((await benchmark()).rows[0].result).toMatchObject({ stats: { organic_percentage: 10 } })
  })
  it('rejects a stale import or tampered preview without writing its other rows', async () => {
    await publish(request())
    const form = new FormData(); form.set('file', new File([`format_version,sub_organization_id,reporting_year,period_kind,period_index,coverage_confirmed,total_food_spend\n2,${kitchen},2025,quarter,1,true,2000\n2,${kitchen},2025,quarter,2,true,3000`], 'edit.csv'))
    const preview = unwrapOperatingResult(await previewIndicatorCsv(form))
    const edit = request(); edit.entries[0].expectedRevision = 1; edit.entries[0].values = { totalFoodSpend: '1500' }
    await publish(edit)
    const commit = new FormData(); commit.set('previewToken', preview.token)
    expect(await importIndicatorCsv(commit)).toMatchObject({ success: false, imported: 0 })
    expect(await active()).toHaveLength(1)
    commit.set('previewToken', preview.token + 'x')
    expect(await importIndicatorCsv(commit)).toMatchObject({ success: false, imported: 0 })
  })
})
