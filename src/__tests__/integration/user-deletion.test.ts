import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import path from 'node:path'

const state = vi.hoisted(() => ({ actor: null as null | { id: string; email: string; roles: string[] }, audit: vi.fn(), database: `ave_user_deletion_test_${process.pid}` }))
vi.mock('@/auth', () => ({ auth: async () => state.actor ? { user: state.actor } : null }))
vi.mock('@/lib/audit', () => ({ auditLog: state.audit }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('Redirect') } }))
vi.mock('@/lib/rate-limit', () => ({ apiLimiter: {}, checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/db', async () => {
    const { Pool } = await import('pg')
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const { TenantPool } = await import('@/lib/db/tenant-pool')
    const schema = await import('@/lib/db/schema')
    const url = new URL(process.env.DATABASE_URL!)
    url.pathname = `/${state.database}`
    return { db: drizzle(new TenantPool(new Pool({ connectionString: url.toString() }), async () => ({ userId: state.actor?.id ?? null })), { schema }) }
})

import { db } from '@/lib/db'
import { deleteUser } from '@/app/admin/actions'
import { applyMigrations } from '@/lib/db/migrate'
import { TenantPool } from '@/lib/db/tenant-pool'

const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const targetUrl = new URL(process.env.TEST_DATABASE_URL!)
targetUrl.pathname = `/${state.database}`
const root = new Pool({ connectionString: targetUrl.toString() })
const runtimeUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://unset')
runtimeUrl.pathname = `/${state.database}`

const org = randomUUID()
const administrator = randomUUID(), superAdmin = randomUUID(), otherSuperAdmin = randomUUID(), member = randomUUID()
const frozenYear = 2023, openYear = 2024

function login(id: string, roles: string[]) {
    state.actor = { id, email: `${id}@example.invalid`, roles }
}

/** Runs one statement as the restricted web role with the given identity. */
async function asWebRole(userId: string, query: string, values: unknown[]) {
    const pool = new TenantPool(new Pool({ connectionString: runtimeUrl.toString() }), async () => ({ userId }))
    try { return await pool.query(query, values) } finally { await pool.end() }
}

async function createUser(id: string, roles: string[], kitchens: string[] = []) {
    await root.query('insert into "user"(id,email,organization_id,status) values($1,$2,$3,\'active\')', [id, `${id}@example.invalid`, org])
    for (const role of roles) await root.query('insert into user_roles(user_id,role_id) values($1,$2)', [id, role])
    for (const sub of kitchens) await root.query('insert into sub_organization_members(user_id,sub_organization_id) values($1,$2)', [id, sub])
}

/** An author with data in a frozen year, a superseded correction and every other authored table. */
async function createAuthor() {
    const author = randomUUID(), kitchen = randomUUID()
    await root.query('insert into sub_organizations(id,organization_id,name) values ($1,$2,$3)', [kitchen, org, `Kitchen ${author}`])
    await root.query('insert into sub_organization_members(user_id,sub_organization_id) values($1,$2)', [member, kitchen])
    await createUser(author, ['basic_user'], [kitchen])
    const rows = { frozen: randomUUID(), frozenSuperseded: randomUUID(), open: randomUUID(), openSuperseded: randomUUID() }
    const insertRow = 'insert into indicator_data(id,organization_id,sub_organization_id,reporting_year,reporting_month,total_food_spend,superseded_at,created_by,updated_by) values($1,$2,$3,$4,0,$5,$6,$7,$7)'
    const client = await root.connect()
    let audit: string
    try {
        await client.query('begin')
        // Keep the author's identity in the stored attribution and revision history.
        await client.query("select set_config('app.user_id',$1,true)", [author])
        await client.query('delete from data_freezes where year=$1', [frozenYear])
        await client.query(insertRow, [rows.frozenSuperseded, org, kitchen, frozenYear, 90, new Date('2024-02-01'), author])
        await client.query(insertRow, [rows.frozen, org, kitchen, frozenYear, 100, null, author])
        await client.query(insertRow, [rows.openSuperseded, org, kitchen, openYear, 190, new Date('2025-02-01'), author])
        await client.query(insertRow, [rows.open, org, kitchen, openYear, 200, null, author])
        await client.query('insert into qualitative_responses(organization_id,sub_organization_id,indicator_slug,reporting_year,question_key,response_text,created_by,updated_by) values($1,$2,\'organic\',$3,$4,\'yes\',$5,$5)',
            [org, kitchen, frozenYear, `q-${author}`, author])
        await client.query('insert into intake_responses(organization_id,question_key,response_text,created_by,updated_by) values($1,$2,\'yes\',$3,$3)', [org, `q-${author}`, author])
        await client.query('insert into app_content(key,value,updated_by) values($1,\'text\',$2)', [`content-${author}`, author])
        audit = (await client.query('insert into audit_logs(user_id,action) values($1,\'auth.login\') returning id', [author])).rows[0].id
        await client.query('insert into revoked_sessions(user_id,reason) values($1,\'logout_all\')', [author])
        await client.query('insert into operating_entry_drafts(organization_id,sub_organization_id,reporting_year,author_id,workflow,quarter,payload) values($1,$2,$3,$4,\'year\',1,\'{}\')',
            [org, kitchen, openYear, author])
        // A confirmed annual report references the exact revision of its source row.
        const revision = (await client.query('select revision from indicator_data where id=$1', [rows.open])).rows[0].revision
        await client.query('insert into operating_reporting_preferences(organization_id,sub_organization_id,reporting_year,frequency,annual_record_id,annual_record_revision) values($1,$2,$3,\'yearly\',$4,$5)',
            [org, kitchen, openYear, rows.open, revision])
        await client.query('insert into data_freezes(year,frozen_by) values($1,$2)', [frozenYear, author])
        await client.query('commit')
    } catch (error) {
        await client.query('rollback')
        throw error
    } finally { client.release() }
    return { author, kitchen, audit, rows }
}

async function snapshot(ids: string[]) {
    return (await root.query('select id,revision,superseded_at,total_food_spend,updated_at,created_by,updated_by from indicator_data where id = any($1::uuid[]) order by id', [ids])).rows
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('account deletion with the restricted database role', () => {
    beforeAll(async () => {
        await admin.query(`CREATE DATABASE ${state.database}`)
        const client = await root.connect()
        try { await applyMigrations(client, path.join(process.cwd(), 'drizzle')) }
        finally { client.release() }
        await root.query('insert into organizations(id,name) values ($1,\'Deletion Org\')', [org])
        await createUser(administrator, ['admin'])
        await createUser(superAdmin, ['super_admin'])
        await createUser(otherSuperAdmin, ['super_admin'])
        await createUser(member, ['basic_user'])
    }, 30_000)
    beforeEach(() => { login(administrator, ['admin']); state.audit.mockReset() })
    afterAll(async () => {
        await root.end(); await db.$client.end()
        await admin.query(`DROP DATABASE ${state.database}`); await admin.end()
    })

    it('deletes an author of frozen and superseded data without changing the data or its history', async () => {
        const { author, kitchen, audit, rows } = await createAuthor()
        const ids = Object.values(rows)
        const before = await snapshot(ids)
        const history = (await root.query('select count(*)::int n from operating_data_revisions')).rows[0].n
        expect(before.every(row => row.created_by === author && row.updated_by === author)).toBe(true)

        await deleteUser(author)

        expect((await root.query('select 1 from "user" where id=$1', [author])).rows).toEqual([])
        // Values, revisions and supersession are untouched; only attribution is cleared.
        expect(await snapshot(ids)).toEqual(before.map(row => ({ ...row, created_by: null, updated_by: null })))
        expect((await root.query('select count(*)::int n from operating_data_revisions')).rows[0].n).toBe(history)
        expect((await root.query('select created_by,updated_by from qualitative_responses where question_key=$1', [`q-${author}`])).rows).toEqual([{ created_by: null, updated_by: null }])
        expect((await root.query('select created_by,updated_by from intake_responses where question_key=$1', [`q-${author}`])).rows).toEqual([{ created_by: null, updated_by: null }])
        expect((await root.query('select updated_by from app_content where key=$1', [`content-${author}`])).rows).toEqual([{ updated_by: null }])
        expect((await root.query('select frozen_by from data_freezes where year=$1', [frozenYear])).rows).toEqual([{ frozen_by: null }])
        expect((await root.query('select user_id,action from audit_logs where id=$1', [audit])).rows).toEqual([{ user_id: null, action: 'auth.login' }])
        for (const table of ['user_roles', 'sub_organization_members', 'revoked_sessions']) {
            expect((await root.query(`select 1 from ${table} where user_id=$1`, [author])).rows).toEqual([])
        }
        expect((await root.query('select 1 from operating_entry_drafts where author_id=$1', [author])).rows).toEqual([])
        // The annual confirmation still matches its source revision.
        const [preference] = (await root.query('select p.annual_record_revision, d.revision from operating_reporting_preferences p join indicator_data d on d.id=p.annual_record_id where p.sub_organization_id=$1 and p.reporting_year=$2', [kitchen, openYear])).rows
        expect(preference.annual_record_revision).toBe(preference.revision)
        expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.user_delete', userId: administrator, resource: `user:${author}` }))
    })

    it('keeps frozen and superseded data immutable for ordinary writes, including clearing attribution', async () => {
        const { author, rows } = await createAuthor()
        const attempts: [string, string][] = [
            ['update indicator_data set created_by=null, updated_by=null where id=$1', rows.frozen],
            ['update indicator_data set updated_by=null where id=$1', rows.openSuperseded],
        ]
        for (const [query, id] of attempts) {
            await expect(root.query(query, [id])).rejects.toThrow(/gesperrt|unveränderlich/)
            await expect(asWebRole(member, query, [id])).rejects.toThrow(/gesperrt|unveränderlich/)
        }
        await expect(asWebRole(member, 'update qualitative_responses set updated_by=null where question_key=$1', [`q-${author}`])).rejects.toThrow('gesperrt')
        expect((await snapshot([rows.frozen, rows.openSuperseded])).every(row => row.created_by === author && row.updated_by === author)).toBe(true)
        await deleteUser(author)
    })

    it('enforces the protected-account rules in the action and in the database', async () => {
        await expect(deleteUser(superAdmin)).rejects.toThrow('Super Admin accounts')
        await expect(deleteUser(administrator)).rejects.toThrow('eigenen Admin-Zugang')
        // Direct deletes by the web role obey the same rules.
        expect((await asWebRole(administrator, 'delete from "user" where id=$1', [superAdmin])).rowCount).toBe(0)
        expect((await asWebRole(administrator, 'delete from "user" where id=$1', [administrator])).rowCount).toBe(0)
        expect((await asWebRole(member, 'delete from "user" where id=$1', [otherSuperAdmin])).rowCount).toBe(0)
        expect((await root.query('select count(*)::int n from "user" where id = any($1)', [[superAdmin, administrator, otherSuperAdmin]])).rows[0].n).toBe(3)

        login(superAdmin, ['super_admin'])
        await deleteUser(otherSuperAdmin)
        expect((await root.query('select 1 from "user" where id=$1', [otherSuperAdmin])).rows).toEqual([])
    })

    it('does not report success when nothing was deleted', async () => {
        await expect(deleteUser(randomUUID())).rejects.toThrow('nicht gefunden')
        expect(state.audit).not.toHaveBeenCalled()
    })
})
