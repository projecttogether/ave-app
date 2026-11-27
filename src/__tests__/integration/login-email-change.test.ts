import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import path from 'node:path'

const state = vi.hoisted(() => ({ actor: null as null | { id: string; email: string; roles: string[] }, audit: vi.fn(), sendMail: vi.fn(), database: `ave_login_email_test_${process.pid}` }))
vi.mock('@/auth', () => ({ auth: async () => state.actor ? { user: state.actor } : null }))
vi.mock('@/lib/audit', () => ({ auditLog: state.audit }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('Redirect') } }))
vi.mock('@/lib/rate-limit', () => ({ apiLimiter: {}, checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: state.sendMail }) }))
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
import { updateUser, updateUserEmail } from '@/app/admin/actions'
import { applyMigrations } from '@/lib/db/migrate'
import { TenantPool } from '@/lib/db/tenant-pool'

const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const targetUrl = new URL(process.env.TEST_DATABASE_URL ?? 'postgresql://unset')
targetUrl.pathname = `/${state.database}`
const root = new Pool({ connectionString: targetUrl.toString() })
const runtimeUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://unset')
runtimeUrl.pathname = `/${state.database}`

const org = randomUUID()
const administrator = randomUUID(), otherAdministrator = randomUUID(), superAdmin = randomUUID()

function login(id: string, roles: string[]) {
    state.actor = { id, email: `${id}@example.invalid`, roles }
}

async function createUser(id: string, roles: string[], passkeys = 0) {
    await root.query('insert into "user"(id,email,organization_id,status) values($1,$2,$3,\'active\')', [id, `${id}@example.invalid`, org])
    for (const role of roles) await root.query('insert into user_roles(user_id,role_id) values($1,$2)', [id, role])
    for (let i = 0; i < passkeys; i++) {
        await root.query('insert into authenticator("credentialID","userId","providerAccountId","credentialPublicKey",counter,"credentialDeviceType","credentialBackedUp") values($1,$2,$1,\'key\',0,\'singleDevice\',false)', [randomUUID(), id])
    }
}

const passkeys = async (id: string) => (await root.query('select count(*)::int n from authenticator where "userId"=$1', [id])).rows[0].n
const revocations = async (id: string) => (await root.query('select count(*)::int n from revoked_sessions where user_id=$1', [id])).rows[0].n

/** Runs one statement as the restricted web role with the given identity. */
async function asWebRole(userId: string, query: string, values: unknown[]) {
    const pool = new TenantPool(new Pool({ connectionString: runtimeUrl.toString() }), async () => ({ userId }))
    try { return await pool.query(query, values) } finally { await pool.end() }
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('login email changes with the restricted database role', () => {
    beforeAll(async () => {
        await admin.query(`CREATE DATABASE ${state.database}`)
        const client = await root.connect()
        try { await applyMigrations(client, path.join(process.cwd(), 'drizzle')) }
        finally { client.release() }
        await root.query('insert into organizations(id,name) values ($1,\'Email Org\')', [org])
        await createUser(administrator, ['admin'])
        await createUser(otherAdministrator, ['admin'], 1)
        await createUser(superAdmin, ['super_admin'], 1)
    }, 30_000)
    beforeEach(() => {
        login(administrator, ['admin'])
        state.audit.mockReset()
        state.sendMail.mockReset().mockResolvedValue({ rejected: [], pending: [] })
    })
    afterAll(async () => {
        await root.end(); await db.$client.end()
        await admin.query(`DROP DATABASE ${state.database}`); await admin.end()
    })

    it.each(['updateUserEmail', 'updateUser'] as const)('removes every passkey and ends sessions when %s changes the address', async action => {
        const member = randomUUID()
        await createUser(member, ['basic_user'], 2)
        const address = `moved-${member}@example.invalid`
        if (action === 'updateUserEmail') await updateUserEmail(member, address)
        else await updateUser(member, { email: address })
        expect((await root.query('select email from "user" where id=$1', [member])).rows).toEqual([{ email: address }])
        expect(await passkeys(member)).toBe(0)
        expect(await revocations(member)).toBe(1)
        expect(state.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: `${member}@example.invalid` }))
    })

    it('keeps the database rules when the action guard is bypassed', async () => {
        // Regular admins cannot change another administrator's address or touch super admins.
        await expect(updateUserEmail(otherAdministrator, 'taken@example.invalid')).rejects.toThrow('Super Admins')
        await expect(asWebRole(administrator, 'update "user" set email=$2 where id=$1', [otherAdministrator, 'taken@example.invalid'])).rejects.toThrow('login email')
        expect((await asWebRole(administrator, 'update "user" set name=\'x\' where id=$1', [superAdmin])).rowCount).toBe(0)
        await expect(asWebRole(administrator, 'insert into revoked_sessions(user_id,reason) values($1,\'admin_revoked\')', [superAdmin])).rejects.toThrow()
        expect((await asWebRole(administrator, 'delete from authenticator where "userId"=$1', [otherAdministrator])).rowCount).toBe(0)
        expect(await passkeys(otherAdministrator)).toBe(1)
        expect(await passkeys(superAdmin)).toBe(1)
        // Super admins may change an administrator's address; credentials go with it.
        login(superAdmin, ['super_admin'])
        await updateUserEmail(otherAdministrator, 'admin-moved@example.invalid')
        expect(await passkeys(otherAdministrator)).toBe(0)
    })
})
