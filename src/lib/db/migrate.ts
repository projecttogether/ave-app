import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool, type PoolClient } from 'pg'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import { FORMULA_REVISION } from '@/lib/indicators/revision'

config({ path: '.env.local' })

const POST_MIGRATE_SQL = [
    '0027_add_mixed_product_spend.sql', '0029_fix_org_percentiles_food_waste.sql',
    '0032_consistent_indicator_calculations.sql', '0033_indicator_reliability.sql',
    '0034_generated_indicator_formulas.sql', '0031_scoped_statistics.sql',
    '0035_formula_scope.sql', '0038_quarterly_statistics.sql',
    '0041_benchmark_canonical_cohort.sql', '0043_frozen_report_archive.sql',
]

export async function applyMigrations(client: PoolClient, migrationsFolder: string) {
    // The session lock spans the journal migrator's own transaction.
    await client.query("SET lock_timeout = '60s'")
    await client.query('SELECT pg_advisory_lock(1936028721, 1)')
    try {
        // Bootstrap only types; do not temporarily replace working formulas.
        for (const file of ['0001_add_stats_function.sql', '0007_add_percentile_function.sql']) {
            const source = readFileSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ migrationsFolder, file), 'utf8')
            const typeSql = source.match(/DO \$\$ BEGIN[\s\S]*?END \$\$;/)?.[0]
            if (!typeSql) throw new Error(`Missing bootstrap type in ${file}`)
            await client.query(typeSql)
        }
        await migrate(drizzle(client), { migrationsFolder })
        await client.query('BEGIN')
        try {
            for (const file of POST_MIGRATE_SQL) {
                await client.query(readFileSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ migrationsFolder, file), 'utf8'))
            }
            const result = await client.query('SELECT indicator_formula_revision() AS revision')
            if (result.rows[0]?.revision !== FORMULA_REVISION) throw new Error('Installed formula revision does not match the application')
            await client.query('COMMIT')
        } catch (error) {
            await client.query('ROLLBACK')
            throw error
        }
    } finally {
        await client.query('SELECT pg_advisory_unlock(1936028721, 1)')
    }
}

export async function runMigrations() {
    if (!process.env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is not set')
    // Docker copies drizzle explicitly; dynamic paths also support isolated migration tests.
    const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, connectionTimeoutMillis: 10000 })
    try {
        const client = await pool.connect()
        try { await applyMigrations(client, path.join(process.cwd(), 'drizzle')) }
        finally { client.release() }
    } finally { await pool.end() }
}
