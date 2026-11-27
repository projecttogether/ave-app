import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { applyMigrations } from '@/lib/db/migrate'
import { prepareDatabase } from '@/lib/db/startup'
import { verifyDatabaseIsolation } from '@/lib/db/verify-isolation'
import { FORMULA_REVISION } from '@/lib/indicators/revision'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import * as schema from '@/lib/db/schema'
import { loadCalculationReport, archiveCalculationReport } from '@/lib/indicators/report-data'

const container = process.env.INDICATOR_SQL_TEST_CONTAINER
const socket = process.env.INDICATOR_SQL_TEST_SOCKET
describe.skipIf(!container && !socket)('complete migration lifecycle on isolated PostgreSQL', () => {
    let pool: Pool
    beforeAll(async () => {
        let host = '127.0.0.1'
        let port: number | undefined
        if (socket) {
            if (!socket.startsWith('/tmp/ave-indicator-tests-')) throw new Error('Isolated test socket required')
            host = socket
        } else {
            if (!container?.startsWith('ave-indicator-tests-')) throw new Error('Isolated test container required')
            const address = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim()
            if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error('Expected an isolated loopback port')
            port = Number(address.split(':')[1])
        }
        const admin = new Pool({ host, port, user: 'postgres', database: 'postgres' })
        await admin.query('CREATE DATABASE ave_migration_test')
        await admin.end()
        pool = new Pool({ host, port, user: 'postgres', database: 'ave_migration_test' })
    })
    afterAll(async () => { await pool?.end() })

    it('upgrades the schema from before PR 57 without losing existing data', async () => {
        const directory = mkdtempSync(path.join(tmpdir(), 'ave-migration-upgrade-'))
        await pool.query('CREATE DATABASE ave_upgrade_test')
        const upgrade = new Pool({ ...pool.options, database: 'ave_upgrade_test' })
        const client = await upgrade.connect()
        try {
            cpSync('drizzle', directory, { recursive: true })
            const journalPath = path.join(directory, 'meta/_journal.json')
            const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
            journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag < '0030')
            writeFileSync(journalPath, JSON.stringify(journal))
            for (const file of ['0001_add_stats_function.sql', '0007_add_percentile_function.sql']) {
                const typeSql = readFileSync(path.join(directory, file), 'utf8').match(/DO \$\$ BEGIN[\s\S]*?END \$\$;/)![0]
                await client.query(typeSql)
            }
            await migrate(drizzle(client), { migrationsFolder: directory })
            for (const file of ['0027_add_mixed_product_spend.sql', '0029_fix_org_percentiles_food_waste.sql']) {
                await client.query(readFileSync(path.join(directory, file), 'utf8'))
            }
            const { rows: [org] } = await client.query("INSERT INTO organizations(name) VALUES ('Existing organization') RETURNING id")
            const { rows: [sub] } = await client.query("INSERT INTO sub_organizations(name, organization_id) VALUES ('Existing kitchen', $1) RETURNING id", [org.id])
            await client.query('INSERT INTO indicator_data(organization_id, sub_organization_id, reporting_year, reporting_month, total_food_spend, organic_spend) VALUES ($1, $2, 2026, 1, 1000, 250)', [org.id, sub.id])

            const url = new URL('postgresql://postgres@localhost/ave_upgrade_test')
            if (upgrade.options.port) url.port = String(upgrade.options.port)
            url.searchParams.set('host', upgrade.options.host!)
            const environment = { DATABASE_URL: url.toString(), AUTH_SECRET: 'upgrade-test-secret-at-least-32-characters' }
            const runtime = await prepareDatabase(environment)
            expect(runtime.DATABASE_URL).not.toBe(environment.DATABASE_URL)
            expect(runtime.AUTH_DATABASE_URL).not.toBe(runtime.DATABASE_URL)
            await expect(verifyDatabaseIsolation(runtime)).resolves.toBeUndefined()

            expect((await client.query('SELECT name FROM organizations WHERE id=$1', [org.id])).rows[0].name).toBe('Existing organization')
            expect(Number((await client.query('SELECT organic_spend FROM indicator_data WHERE sub_organization_id=$1', [sub.id])).rows[0].organic_spend)).toBe(250)
            expect((await client.query('SELECT indicator_formula_revision() AS revision')).rows[0].revision).toBe(FORMULA_REVISION)
            expect((await client.query("SELECT relrowsecurity AND relforcerowsecurity AS protected FROM pg_class WHERE oid='public.indicator_data'::regclass")).rows[0].protected).toBe(true)
        } finally { client.release(); await upgrade.end(); rmSync(directory, { recursive: true, force: true }) }
    }, 30000)

    it('upgrades existing validation constraints without changing historical amounts', async () => {
        const directory = mkdtempSync(path.join(tmpdir(), 'ave-quarterly-upgrade-'))
        await pool.query('CREATE DATABASE ave_quarterly_upgrade_test')
        const upgrade = new Pool({ ...pool.options, database: 'ave_quarterly_upgrade_test' })
        const client = await upgrade.connect()
        try {
            cpSync('drizzle', directory, { recursive: true })
            const journalPath = path.join(directory, 'meta/_journal.json')
            const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
            journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag < '0037')
            writeFileSync(journalPath, JSON.stringify(journal))
            for (const file of ['0001_add_stats_function.sql', '0007_add_percentile_function.sql']) {
                const typeSql = readFileSync(path.join(directory, file), 'utf8').match(/DO \$\$ BEGIN[\s\S]*?END \$\$;/)![0]
                await client.query(typeSql)
            }
            await migrate(drizzle(client), { migrationsFolder: directory })
            await client.query(readFileSync(path.join(directory, '0027_add_mixed_product_spend.sql'), 'utf8'))
            const { rows: [org] } = await client.query("INSERT INTO organizations(name) VALUES ('Historical organization') RETURNING id")
            const { rows: [sub] } = await client.query("INSERT INTO sub_organizations(name, organization_id) VALUES ('Historical kitchen', $1) RETURNING id", [org.id])
            // These rows predate the NOT VALID constraints, which deliberately
            // preserve historical inconsistencies while rejecting new ones.
            await client.query(`INSERT INTO indicator_data(organization_id, sub_organization_id, reporting_year, reporting_month, total_food_spend, organic_spend)
                VALUES ($1,$2,2024,0,1000,250), ($1,$2,2025,1,100,150), ($1,$2,2025,2,-1,NULL), ($1,$2,2025,3,0.0000001,NULL)`, [org.id, sub.id])
            await client.query('INSERT INTO data_freezes(year) VALUES (2024)')
            await client.query(readFileSync(path.join(directory, '0033_indicator_reliability.sql'), 'utf8'))
            const originalRows = (await client.query('SELECT * FROM indicator_data ORDER BY reporting_month')).rows
            const constraints = async () => (await client.query(`SELECT conname, convalidated
                FROM pg_constraint WHERE conrelid='indicator_data'::regclass AND contype='c'
                AND conname != 'indicator_period_shape' ORDER BY conname`)).rows
            const originalConstraints = await constraints()
            expect(originalConstraints).toHaveLength(17)

            // A failure after the backfill must roll back both the metadata and
            // the temporary constraint changes, leaving startup safe to retry.
            cpSync('drizzle/meta/_journal.json', journalPath)
            const migrationPath = path.join(directory, '0037_quarterly_periods.sql')
            writeFileSync(migrationPath, readFileSync(migrationPath, 'utf8') + '\nSELECT * FROM missing_upgrade_test_table;')
            await expect(applyMigrations(client, directory)).rejects.toMatchObject({ cause: { code: '42P01' } })
            expect((await client.query('SELECT * FROM indicator_data ORDER BY reporting_month')).rows).toEqual(originalRows)
            expect(await constraints()).toEqual(originalConstraints)

            await applyMigrations(client, path.resolve('drizzle'))
            const upgradedRows = (await client.query('SELECT * FROM indicator_data ORDER BY reporting_month')).rows
            expect(upgradedRows).toHaveLength(originalRows.length)
            for (const [index, row] of upgradedRows.entries()) {
                expect(row).toMatchObject(originalRows[index])
                expect(row.period_kind).toBe(row.reporting_month === 0 ? 'year' : 'month')
                expect(row.period_index).toBe(row.reporting_month === 0 ? 1 : row.reporting_month)
            }
            expect(await constraints()).toEqual(originalConstraints)
            expect((await client.query('SELECT reporting_year, mode FROM operating_reporting_modes ORDER BY reporting_year')).rows).toEqual([
                { reporting_year: 2024, mode: 'legacy' }, { reporting_year: 2025, mode: 'legacy' },
            ])
            expect((await client.query('SELECT year FROM data_freezes')).rows).toEqual([{ year: 2024 }])
            await expect(client.query('UPDATE indicator_data SET organic_spend=200 WHERE reporting_month=1')).rejects.toMatchObject({ code: '23514' })
            for (const amount of ['-1', '0.0000001', '1000000000001', 'NaN', 'Infinity']) {
                await expect(client.query(`INSERT INTO indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,total_food_spend)
                    VALUES ($1,$2,2025,4,$3)`, [org.id, sub.id, amount])).rejects.toMatchObject({ code: '23514' })
            }
            await applyMigrations(client, path.resolve('drizzle'))
            expect((await client.query('SELECT * FROM indicator_data ORDER BY reporting_month')).rows).toEqual(upgradedRows)
        } finally { client.release(); await upgrade.end(); rmSync(directory, { recursive: true, force: true }) }
    }, 30000)

    it('backfills only unambiguous preferences and confirms only closed historical annual records', async () => {
        const directory = mkdtempSync(path.join(tmpdir(), 'ave-preference-upgrade-'))
        await pool.query('CREATE DATABASE ave_preferences_upgrade_test')
        const upgrade = new Pool({ ...pool.options, database: 'ave_preferences_upgrade_test' })
        const client = await upgrade.connect()
        try {
            cpSync('drizzle', directory, { recursive: true })
            const journalPath = path.join(directory, 'meta/_journal.json')
            const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
            journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag < '0039')
            writeFileSync(journalPath, JSON.stringify(journal))
            await applyMigrations(client, directory)
            const { rows: [org] } = await client.query("INSERT INTO organizations(name) VALUES ('Frequency migration') RETURNING id")
            const sites: Record<string, string> = {}
            for (const name of ['monthly', 'yearly', 'mixed', 'empty', 'quarterly', 'blank']) {
                sites[name] = (await client.query('INSERT INTO sub_organizations(name,organization_id) VALUES ($1,$2) RETURNING id', [name, org.id])).rows[0].id
            }
            const currentYear = Number((await client.query("SELECT extract(year FROM current_timestamp AT TIME ZONE 'Europe/Berlin') AS year")).rows[0].year)
            for (const [site, year, month, amount] of [
                ['monthly', 2025, 1, '0'], ['yearly', currentYear - 1, 0, '1200'], ['yearly', currentYear, 0, '500'],
                ['mixed', 2025, 0, '1000'], ['mixed', 2025, 1, '200'], ['blank', 2025, 1, null],
            ] as const) {
                await client.query('INSERT INTO indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,total_food_spend) VALUES ($1,$2,$3,$4,$5)', [org.id, sites[site], year, month, amount])
            }
            await client.query("INSERT INTO operating_reporting_modes(organization_id,sub_organization_id,reporting_year,mode) VALUES ($1,$2,2025,'quarterly')", [org.id, sites.quarterly])
            const original = (await client.query('SELECT * FROM indicator_data ORDER BY id')).rows
            await client.query('INSERT INTO data_freezes(year) VALUES ($1)', [currentYear - 1])
            await applyMigrations(client, path.resolve('drizzle'))
            const preferences = (await client.query('SELECT * FROM operating_reporting_preferences ORDER BY sub_organization_id,reporting_year')).rows
            expect(preferences).toHaveLength(4)
            expect(preferences.find(p => p.sub_organization_id === sites.monthly)).toMatchObject({ frequency: 'monthly', source: 'legacy', annual_record_id: null })
            expect(preferences.find(p => p.sub_organization_id === sites.quarterly)).toMatchObject({ frequency: 'quarterly', source: 'legacy' })
            expect(preferences.find(p => p.sub_organization_id === sites.yearly && p.reporting_year === currentYear - 1)).toMatchObject({ frequency: 'yearly', annual_confirmation_source: 'legacy', annual_record_revision: 1 })
            expect(preferences.find(p => p.sub_organization_id === sites.yearly && p.reporting_year === currentYear)).toMatchObject({ frequency: 'yearly', annual_record_id: null })
            expect((await client.query('SELECT * FROM indicator_data ORDER BY id')).rows).toEqual(original)
            await applyMigrations(client, path.resolve('drizzle'))
            expect((await client.query('SELECT * FROM operating_reporting_preferences ORDER BY sub_organization_id,reporting_year')).rows).toEqual(preferences)
        } finally { client.release(); await upgrade.end(); rmSync(directory, { recursive: true, force: true }) }
    }, 30000)

    it('installs the entire history on a fresh database and supports repeated startup', async () => {
        const client = await pool.connect()
        try {
            await applyMigrations(client, path.resolve('drizzle'))
            expect((await client.query('SELECT indicator_formula_revision() AS revision')).rows[0].revision).toBe(FORMULA_REVISION)
            await applyMigrations(client, path.resolve('drizzle'))
            expect((await client.query('SELECT indicator_formula_revision() AS revision')).rows[0].revision).toBe(FORMULA_REVISION)
            expect((await client.query('SELECT * FROM get_dashboard_stats(NULL,NULL,2026,NULL)')).rows[0].food_waste).toBeNull()
        } finally { client.release() }
    }, 30000)
    it('rolls back formula updates, rejects startup and releases its lock on failure', async () => {
        const directory = mkdtempSync(path.join(tmpdir(), 'ave-migration-failure-'))
        const client = await pool.connect()
        try {
            cpSync('drizzle', directory, { recursive: true })
            writeFileSync(path.join(directory, '0034_generated_indicator_formulas.sql'), "CREATE OR REPLACE FUNCTION indicator_formula_revision() RETURNS text LANGUAGE sql AS $$ SELECT 'broken'::text $$; SELECT missing_column FROM missing_table;")
            await expect(applyMigrations(client, directory)).rejects.toThrow()
            expect((await client.query('SELECT indicator_formula_revision() AS revision')).rows[0].revision).toBe(FORMULA_REVISION)
            const other = await pool.connect()
            try {
                expect((await other.query('SELECT pg_try_advisory_lock(1936028721,1) AS acquired')).rows[0].acquired).toBe(true)
                await other.query('SELECT pg_advisory_unlock(1936028721,1)')
            } finally { other.release() }
        } finally { client.release(); rmSync(directory, { recursive: true, force: true }) }
    }, 30000)
    it('archives a coherent report and preserves it when the baseline and inputs change', async () => {
        const database = drizzle(pool, { schema })
        const [org] = await database.insert(schema.organizations).values({ name: 'Reference organization' }).returning()
        const [kitchen] = await database.insert(schema.subOrganizations).values({ organizationId: org.id, name: 'Reference kitchen', foodWasteBaseAmount: '1200' }).returning()
        await database.insert(schema.indicatorData).values({ organizationId: org.id, subOrganizationId: kitchen.id, reportingYear: 2026, reportingMonth: 1, coffeeSpend: '100', fairTradeCoffeeSpend: '80', foodWasteAmount: '70' })
        const scope = { organizationId: org.id, subOrganizationId: kitchen.id }
        const snapshotId = await database.transaction(async tx => {
            const report = await loadCalculationReport(tx, scope, 2026, null)
            expect(report.indicators.find(i => i.slug === 'food_waste')?.value).toBe(-30)
            expect(report.indicators.find(i => i.slug === 'fair_trade_percentage')?.value).toBe(80)
            return archiveCalculationReport(tx, report, 'reference-user')
        }, { isolationLevel: 'repeatable read' })
        await pool.query('UPDATE sub_organizations SET food_waste_base_amount=2400 WHERE id=$1', [kitchen.id])
        await pool.query('UPDATE indicator_data SET fair_trade_coffee_spend=20 WHERE sub_organization_id=$1', [kitchen.id])
        const changed = await database.transaction(tx => loadCalculationReport(tx, scope, 2026, null), { isolationLevel: 'repeatable read' })
        const saved = (await pool.query('SELECT payload FROM indicator_report_snapshots WHERE id=$1', [snapshotId])).rows[0].payload
        expect(saved.inputs.kitchens[0].foodWasteBaseAmount).toBe('1200')
        expect(saved.inputRevision).not.toBe(changed.inputRevision)
        expect(saved.indicators.find((i: {slug:string}) => i.slug === 'fair_trade_percentage').value).toBe(80)
        expect(changed.indicators.find(i => i.slug === 'fair_trade_percentage')?.value).toBe(20)
    })
    it('rejects a successful SQL execution with the wrong formula revision', async () => {
        const directory = mkdtempSync(path.join(tmpdir(), 'ave-migration-version-'))
        const client = await pool.connect()
        try {
            cpSync('drizzle', directory, { recursive: true })
            writeFileSync(path.join(directory, '0034_generated_indicator_formulas.sql'), "CREATE OR REPLACE FUNCTION indicator_formula_revision() RETURNS text LANGUAGE sql AS $$ SELECT 'wrong-version'::text $$;")
            await expect(applyMigrations(client, directory)).rejects.toThrow('revision')
            expect((await client.query('SELECT indicator_formula_revision() AS revision')).rows[0].revision).toBe(FORMULA_REVISION)
        } finally { client.release(); rmSync(directory, { recursive: true, force: true }) }
    }, 30000)
})
