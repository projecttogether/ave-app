import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { getTableColumns } from 'drizzle-orm'
import { indicatorData, qualitativeResponses } from '@/lib/db/schema'
import { aggregateIndicator, selectIndicatorRows, type ReportingRow } from '@/lib/indicators/aggregation'
import { SCORING_QUESTIONS, INDICATOR_SLUGS } from '@/lib/qualitative/constants'
import { aggregateQualitativeScores } from '@/lib/qualitative/scoring'
import reference from '../fixtures/indicator-reference.json'
import { FORMULA_REVISION } from '@/lib/indicators/revision'
import { roundCalculation } from '@/lib/indicators/decimal'
import { defaultAppContent } from '@/lib/content/defaults'

const container = process.env.INDICATOR_SQL_TEST_CONTAINER
const socket = process.env.INDICATOR_SQL_TEST_SOCKET
const migration = readFileSync('drizzle/0032_consistent_indicator_calculations.sql', 'utf8')
const generated = readFileSync('drizzle/0034_generated_indicator_formulas.sql', 'utf8')
const reliability = readFileSync('drizzle/0033_indicator_reliability.sql', 'utf8')
const org = '00000000-0000-4000-8000-000000000001'
const subA = '00000000-0000-4000-8000-000000000002'
const subB = '00000000-0000-4000-8000-000000000003'
const testOrg = '00000000-0000-4000-8000-000000000004'
const testSub = '00000000-0000-4000-8000-000000000005'

function sql(query: string): string {
    if (socket?.startsWith('/tmp/ave-indicator-tests-')) return execFileSync('psql', ['-h', socket, '-U', 'postgres', '-XAt', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    if (!container?.startsWith('ave-indicator-tests-')) throw new Error('SQL tests require an isolated ave-indicator-tests-* container')
    return execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-XAt', '-v', 'ON_ERROR_STOP=1'], {
        input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
}
const quote = (value: unknown) => value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`
function insert(rows: Record<string, unknown>[]) {
    const columns = getTableColumns(indicatorData)
    sql(rows.map(row => {
        const entries = Object.entries({ organizationId: org, subOrganizationId: subA, reportingYear: 2026, reportingMonth: 1, ...row })
        return `INSERT INTO indicator_data (${entries.map(([key]) => columns[key as keyof typeof columns].name).join(',')}) VALUES (${entries.map(([, value]) => quote(value)).join(',')});`
    }).join('\n'))
}
function stats(granularity: 'monthly' | 'yearly' | null = 'monthly', organizationId: string | null = org) {
    return JSON.parse(sql(`SELECT row_to_json(s) FROM get_dashboard_stats(${quote(organizationId)}, NULL, 2026, ${quote(granularity)}) s`)) as Record<string, number | null>
}

it('keeps SQL questionnaire policy identical to the scoring form definitions', () => {
    const json = migration.split('$policy$')[1]
    expect(JSON.parse(json)).toEqual(SCORING_QUESTIONS.filter(q => q.type === 'single-select' && (q.options?.includes('Ja') || q.options?.includes('<10%'))).map(q => ({ question_key: q.key, indicator_slug: q.indicator, max_points: q.options?.includes('Ja') ? 2 : 5 })))
})

describe.skipIf(!container && !socket)('PostgreSQL indicator calculations', () => {
    beforeAll(() => {
        sql(`
            CREATE TABLE organizations (id uuid, name text);
            CREATE TABLE sub_organizations (id uuid, organization_id uuid, name text, food_waste_base_amount numeric);
            CREATE TABLE indicator_data (${Object.values(getTableColumns(indicatorData)).map(c => `${c.name} ${c.getSQLType()}`).join(',')});
            CREATE TABLE qualitative_responses (${Object.values(getTableColumns(qualitativeResponses)).map(c => `${c.name} ${c.getSQLType()}`).join(',')});
            CREATE TABLE app_content (key text, value text);
            CREATE TYPE dashboard_overview_stats AS (
                total_spend numeric, plant_based_percentage numeric, organic_percentage numeric, fair_trade_percentage numeric, food_waste numeric,
                plant_based_scoring_result numeric, organic_scoring_result numeric, fair_trade_scoring_result numeric, food_waste_scoring_result numeric,
                regional_scoring_result numeric, seasonal_scoring_result numeric, guest_satisfaction_scoring_result numeric
            );
            CREATE TYPE org_percentile_entry AS (indicator_key text, org_value numeric, percentile numeric, org_count int);
            INSERT INTO organizations VALUES ('${org}', 'Kitchen group'), ('${testOrg}', 'Test organisation');
            INSERT INTO sub_organizations (id,organization_id,name) VALUES ('${subA}', '${org}', 'Kitchen A'), ('${subB}', '${org}', 'Kitchen B'), ('${testSub}', '${org}', 'Test kitchen');
            INSERT INTO app_content VALUES ('indicator.seasonal.target', 'Ziel: 70Pkt.'), ('methodology.seasonal.notes', 'Custom methodology');
        `)
        sql(readFileSync('drizzle/0027_add_mixed_product_spend.sql', 'utf8'))
        sql(readFileSync('drizzle/0029_fix_org_percentiles_food_waste.sql', 'utf8'))
        sql(migration)
        sql(migration) // Startup reapplies custom migrations.
        sql(reliability)
        sql(reliability)
        sql(generated)
    }, 30000)

    beforeEach(() => sql('TRUNCATE indicator_data, qualitative_responses'))

    it('updates old target defaults without replacing customized text', () => {
        expect(sql("SELECT value FROM app_content WHERE key = 'indicator.seasonal.target'")).toBe(defaultAppContent['indicator.seasonal.target'])
        expect(sql("SELECT value FROM app_content WHERE key = 'methodology.seasonal.notes'")).toBe('Custom methodology')
    })
    it('preserves corrected functions when the full custom startup sequence is reapplied', () => {
        sql(readFileSync('drizzle/0027_add_mixed_product_spend.sql', 'utf8'))
        sql(readFileSync('drizzle/0029_fix_org_percentiles_food_waste.sql', 'utf8'))
        sql(migration)
        sql(reliability)
        sql(generated)
        expect(sql('SELECT indicator_formula_revision()')).toBe(FORMULA_REVISION)
        expect(stats().food_waste).toBeNull()
        expect(sql(`SELECT count(*) FROM get_org_percentiles('${org}', 2026)`)).toBe('0')
    })
    it('matches the TypeScript formulas for complete inputs', () => {
        const row = { totalFoodSpend: 1000, meatSpend: 100, fishSpend: 25, dairySpend: 50, eggSpend: 25, mixedProductSpend: 100, organicSpend: 400, coffeeSpend: 100, cocoaSpend: 100, bananasSpend: 100, cocoaMixedSpend: 200, fairTradeCoffeeSpend: 80, fairTradeCocoaSpend: 20, fairTradeBananasSpend: 0, fairTradeCocoaMixedSpend: 200, foodWasteAmount: 80 }
        insert([row])
        const result = stats()
        for (const slug of ['total_spend', 'plant_based_percentage', 'organic_percentage', 'fair_trade_percentage', 'food_waste']) {
            expect(result[slug]).toBe(aggregateIndicator([row], slug))
        }
    })
    it('excludes blank values, includes explicit zeros and uses weighted sums', () => {
        insert([{ coffeeSpend: 100, fairTradeCoffeeSpend: 90 }, { reportingMonth: 2, coffeeSpend: 900 }])
        expect(stats().fair_trade_percentage).toBe(90)
        sql('UPDATE indicator_data SET fair_trade_coffee_spend = 0 WHERE reporting_month = 2')
        expect(stats().fair_trade_percentage).toBe(9)
    })
    it('returns null for missing data and zero for an explicit zero', () => {
        expect(stats().food_waste).toBeNull()
        expect(stats().fair_trade_percentage).toBeNull()
        insert([{ foodWasteAmount: 0, coffeeSpend: 100, fairTradeCoffeeSpend: 0 }])
        expect(stats().food_waste).toBe(0)
        expect(stats().fair_trade_percentage).toBe(0)
    })
    it.each([null, 'monthly', 'yearly'] as const)('matches per-kitchen, per-indicator selection for %s granularity', granularity => {
        const rows: ReportingRow[] = [
            { subOrganizationId: subA, reportingYear: 2026, reportingMonth: 1, coffeeSpend: 100, fairTradeCoffeeSpend: 90 },
            { subOrganizationId: subA, reportingYear: 2026, reportingMonth: 0, coffeeSpend: 500, fairTradeCoffeeSpend: 500 },
            { subOrganizationId: subB, reportingYear: 2026, reportingMonth: 0, coffeeSpend: 900, fairTradeCoffeeSpend: 0, organicSpend: 100, totalFoodSpend: 1000 },
            { subOrganizationId: subB, reportingYear: 2026, reportingMonth: 1, organicSpend: 50, totalFoodSpend: 100 },
        ]
        insert(rows)
        for (const slug of ['total_spend', 'organic_percentage', 'fair_trade_percentage']) {
            expect(stats(granularity)[slug]).toBeCloseTo(aggregateIndicator(selectIndicatorRows(rows, slug, granularity), slug)!)
        }
    })
    it('excludes test organizations and kitchens only for global aggregates', () => {
        insert([{ coffeeSpend: 100, fairTradeCoffeeSpend: 90 }, { subOrganizationId: testSub, coffeeSpend: 100, fairTradeCoffeeSpend: 0 }, { organizationId: testOrg, coffeeSpend: 100, fairTradeCoffeeSpend: 0 }])
        expect(stats('monthly', null).fair_trade_percentage).toBe(90)
        expect(stats('monthly', org).fair_trade_percentage).toBe(45)
    })
    it.each(INDICATOR_SLUGS)('calculates live %s scores with the same rules as TypeScript', slug => {
        const questions = SCORING_QUESTIONS.filter(q => q.indicator === slug && q.type === 'single-select' && (q.options?.includes('Ja') || q.options?.includes('<10%')))
        const rows = [subA, subB].flatMap((sub, index) => questions.map((q, i) => ({ subOrganizationId: sub, indicatorSlug: slug, questionKey: q.key, responseOption: i > 2 ? null : q.options?.includes('Ja') ? index === 0 ? 'Ja' : 'Geplant' : '26-50%' })))
        sql(rows.map(r => `INSERT INTO qualitative_responses (organization_id, sub_organization_id, reporting_year, indicator_slug, question_key, response_option) VALUES ('${org}', '${r.subOrganizationId}', 2026, '${slug}', '${r.questionKey}', ${quote(r.responseOption)});`).join('\n'))
        const key = `${slug}_scoring_result`
        expect(stats('yearly')[key]).toBe(aggregateQualitativeScores(rows)[slug])
        sql("UPDATE qualitative_responses SET response_option = 'Nein'")
        expect(stats('yearly')[key]).toBe(0)
        expect(stats('monthly')[key]).toBeNull()
        sql('UPDATE qualitative_responses SET response_option = NULL')
        expect(stats('yearly')[key]).toBeNull()
    })
    it('excludes test responses from global live scores', () => {
        const q = SCORING_QUESTIONS.find(q => q.indicator === 'fair_trade' && q.type === 'single-select')!
        sql(`INSERT INTO qualitative_responses (organization_id, sub_organization_id, reporting_year, indicator_slug, question_key, response_option) VALUES
            ('${org}', '${subA}', 2026, 'fair_trade', '${q.key}', 'Ja'),
            ('${org}', '${testSub}', 2026, 'fair_trade', '${q.key}', 'Nein'),
            ('${testOrg}', '${subA}', 2026, 'fair_trade', '${q.key}', 'Nein');`)
        expect(stats('yearly', null).fair_trade_scoring_result).toBe(14)
        expect(stats('yearly', org).fair_trade_scoring_result).toBe(7)
    })

    it('matches the independently calculated reference values in PostgreSQL', () => {
        insert(reference.inputs.rows.map(({ id: _id, ...row }) => row))
        sql(reference.inputs.answers.map(a => `INSERT INTO qualitative_responses (organization_id,sub_organization_id,reporting_year,indicator_slug,question_key,response_option) VALUES ('${org}',${quote(a.subOrganizationId)},2026,${quote(a.indicatorSlug)},${quote(a.questionKey)},${quote(a.responseOption)});`).join('\n'))
        const result = stats(null)
        for (const slug of ['plant_based_percentage','organic_percentage','fair_trade_percentage','total_spend']) {
            expect(roundCalculation(result[slug])).toBe(reference.expected[slug as keyof typeof reference.expected])
        }
        expect(result.food_waste).toBe(920)
        for (const [slug, expected] of Object.entries(reference.qualitative)) expect(result[`${slug}_scoring_result`]).toBe(expected)
    })
    it.each(['NaN','Infinity','-Infinity','-1','1000000000001','0.0000001'])('rejects invalid database amounts: %s', value => {
        expect(() => insert([{ totalFoodSpend: value }])).toThrow()
    })
    it('rejects contradictory amounts even if application validation is bypassed', () => {
        expect(() => insert([{ coffeeSpend: 10, fairTradeCoffeeSpend: 11 }])).toThrow()
        expect(() => insert([{ fairTradeCoffeeSpend: 1 }])).toThrow()
        expect(() => insert([{ totalFoodSpend: 10, meatSpend: 8, mixedProductSpend: 4 }])).toThrow()
        expect(() => insert([{ reportingMonth: 13, totalFoodSpend: 10 }])).toThrow()
    })
    it('keeps archived reports immutable and deduplicates identical revisions', () => {
        const values = `('${org}','${subA}',2026,'auto','v1','abc','{"value":20}')`
        sql(`INSERT INTO indicator_report_snapshots (organization_id,sub_organization_id,reporting_year,granularity,formula_version,input_revision,payload) VALUES ${values} ON CONFLICT DO NOTHING`)
        sql(`INSERT INTO indicator_report_snapshots (organization_id,sub_organization_id,reporting_year,granularity,formula_version,input_revision,payload) VALUES ${values} ON CONFLICT DO NOTHING`)
        expect(sql('SELECT count(*) FROM indicator_report_snapshots')).toBe('1')
        expect(() => sql("UPDATE indicator_report_snapshots SET payload='{}'")).toThrow()
        expect(() => sql('DELETE FROM indicator_report_snapshots')).toThrow()
        expect(sql("SELECT payload->>'value' FROM indicator_report_snapshots")).toBe('20')
    })
    it('matches TypeScript decimal results for generated datasets regardless of ordering', () => {
        const rows = Array.from({length: 30}, (_,i) => ({ reportingMonth: i % 12 + 1, coffeeSpend: ((i+1)*13.23).toFixed(2), fairTradeCoffeeSpend: ((i+1)*3.11).toFixed(2), cocoaMixedSpend: ((i+1)*7.77).toFixed(2), fairTradeCocoaMixedSpend: ((i+1)*2.33).toFixed(2) }))
        insert(rows)
        expect(stats().fair_trade_percentage).toBeCloseTo(aggregateIndicator(rows, 'fair_trade_percentage')!, 12)
        sql('TRUNCATE indicator_data')
        insert([...rows].reverse())
        expect(stats().fair_trade_percentage).toBeCloseTo(aggregateIndicator(rows, 'fair_trade_percentage')!, 12)
    })

    it('executes percentile ranking on PostgreSQL and omits missing indicators', () => {
        insert([{ coffeeSpend: 100, fairTradeCoffeeSpend: 80 }])
        const results = JSON.parse(sql(`SELECT json_agg(s) FROM get_org_percentiles('${org}', 2026) s`))
        expect(results).toEqual([{ indicator_key: 'fair_trade_percentage', org_value: 80, percentile: 0, org_count: 1 }])
    })
})
