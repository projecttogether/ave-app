import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { eq, sql } from 'drizzle-orm'
import path from 'node:path'

const state = vi.hoisted(() => ({ actor: null as null | { id: string; email: string; roles: string[] }, mail: vi.fn(), database: `ave_team_test_${process.pid}` }))
vi.mock('@/auth', () => ({ auth: async () => state.actor ? { user: state.actor } : null }))
vi.mock('@/lib/invitation-mail', () => ({ deliverInvitation: state.mail }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ apiLimiter: {}, teamInviteLimiter: {}, checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/db', async () => {
    const { Pool } = await import('pg')
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const { TenantPool } = await import('@/lib/db/tenant-pool')
    const schema = await import('@/lib/db/schema')
    const url = new URL(process.env.DATABASE_URL!)
    url.pathname = `/${state.database}`
    return { db: drizzle(new TenantPool(new Pool({ connectionString: url.toString() }), async () => ({ userId: state.actor?.id ?? null })), { schema }) }
})
vi.mock('@/lib/db/auth', async () => {
    const { Pool } = await import('pg')
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const schema = await import('@/lib/db/schema')
    const url = new URL(process.env.AUTH_DATABASE_URL!)
    url.pathname = `/${state.database}`
    const authPool = new Pool({ connectionString: url.toString() })
    return { authPool, authDb: drizzle(authPool, { schema }) }
})

import { db } from '@/lib/db'
import { authPool } from '@/lib/db/auth'
import { users, userRoles, subOrganizationMembers } from '@/lib/db/schema'
import { activateAccountForSignIn } from '@/lib/auth/activate-account'
import { inviteOrganizationMember, getOrganizationTeam, resendOrganizationInvitation, cancelOrganizationInvitation, suspendOrganizationMember, updateOrganizationMemberKitchens } from '@/app/actions/organization-team'
import type { TeamInvitation } from '@/lib/organization-team'
import { applyMigrations } from '@/lib/db/migrate'
import { TenantPool } from '@/lib/db/tenant-pool'

const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const targetUrl = new URL(process.env.TEST_DATABASE_URL!)
targetUrl.pathname = `/${state.database}`
const root = new Pool({ connectionString: targetUrl.toString() })
const org = randomUUID(), otherOrg = randomUUID()
const kitchen = randomUUID(), otherKitchen = randomUUID(), secondKitchen = randomUUID()
const manager = randomUUID(), peer = randomUUID(), global = randomUUID(), mixed = randomUUID(), viewer = randomUUID(), basic = randomUUID(), foreign = randomUUID()
const foreignManager = randomUUID()
const profiles = [
    { id: manager, org, roles: ['org_manager'] }, { id: peer, org, roles: ['org_manager'] },
    { id: global, org, roles: ['global_view_only'] }, { id: mixed, org, roles: ['basic_user', 'org_manager'] },
    { id: viewer, org, roles: ['org_view_only'] }, { id: basic, org, roles: ['basic_user'] },
    { id: foreign, org: otherOrg, roles: ['basic_user'] },
    { id: foreignManager, org: otherOrg, roles: ['org_manager'] },
]
function login(id = manager) {
    const profile = profiles.find(p => p.id === id)!
    state.actor = { id, email: `${id}@example.invalid`, roles: profile.roles }
}
function invitation(email = `${randomUUID()}@example.invalid`): TeamInvitation {
    return { email, role: 'basic_user', subOrganizationIds: [kitchen] }
}
async function account(email: string) {
    return (await root.query('select * from "user" where email=$1', [email.trim().toLowerCase()])).rows[0]
}
async function createInvited() {
    const input = invitation()
    expect(await inviteOrganizationMember(input)).toEqual({ success: true })
    return await account(input.email)
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('organization team permissions and lifecycle in PostgreSQL', () => {
    beforeAll(async () => {
        await admin.query(`CREATE DATABASE ${state.database}`)
        const client = await root.connect()
        try { await applyMigrations(client, path.join(process.cwd(), 'drizzle')) }
        finally { client.release() }
        await root.query('insert into organizations(id,name) values ($1,\'Team A\'),($2,\'Team B\')', [org, otherOrg])
        await root.query('insert into sub_organizations(id,organization_id,name) values ($1,$2,\'Kitchen A\'),($3,$4,\'Kitchen B\'),($5,$2,\'Kitchen A2\')', [kitchen, org, otherKitchen, otherOrg, secondKitchen])
        for (const profile of profiles) {
            await root.query('insert into "user"(id,email,organization_id,status) values($1,$2,$3,\'active\')', [profile.id, `${profile.id}@example.invalid`, profile.org])
            for (const role of profile.roles) await root.query('insert into user_roles(user_id,role_id) values($1,$2)', [profile.id, role])
        }
    }, 30_000)
    beforeEach(() => { login(); state.mail.mockReset().mockResolvedValue(undefined) })
    afterAll(async () => {
        await root.end(); await db.$client.end(); await authPool.end()
        await admin.query(`DROP DATABASE ${state.database}`); await admin.end()
    })

    it('creates a normalized account with the selected role and kitchens before mailing it', async () => {
        const input = invitation(`  ${randomUUID()}@EXAMPLE.INVALID  `)
        state.mail.mockImplementation(async email => {
            const user = await account(email)
            expect(user.organization_id).toBe(org)
            expect(user.emailVerified).toBeNull()
            expect(user.status).toBe('pending')
        })
        expect(await inviteOrganizationMember(input)).toEqual({ success: true })
        const user = await account(input.email)
        expect(user.status).toBe('invited')
        expect(user.invitation_sent_at).toBeInstanceOf(Date)
        expect(user.invitation_expires_at.getTime() - Date.now()).toBeGreaterThan(6 * 86400000)
        expect((await root.query('select role_id from user_roles where user_id=$1', [user.id])).rows).toEqual([{ role_id: 'basic_user' }])
        expect((await root.query('select sub_organization_id from sub_organization_members where user_id=$1', [user.id])).rows).toEqual([{ sub_organization_id: kitchen }])
        expect((await root.query('select action,user_id,organization_id from audit_logs where resource=$1 order by timestamp', [`user:${user.id}`])).rows).toEqual([
            { action: 'org.invitation_created', user_id: manager, organization_id: org },
            { action: 'org.invitation_sent', user_id: manager, organization_id: org },
        ])
    })

    it.each([basic, foreign])('rejects a duplicate email without sending or changing the existing account %s', async id => {
        const before = await account(`${id}@example.invalid`)
        const result = await inviteOrganizationMember(invitation(` ${id}@EXAMPLE.INVALID `))
        expect(result).toMatchObject({ success: false, error: expect.stringContaining('bereits registriert') })
        expect(JSON.stringify(result)).not.toContain('Team B')
        expect(state.mail).not.toHaveBeenCalled()
        expect(await account(`${id}@example.invalid`)).toEqual(before)
    })

    it('rejects duplicate pending and cancelled accounts, and keeps the original assignment', async () => {
        const user = await createInvited()
        state.mail.mockClear()
        expect(await inviteOrganizationMember(invitation(user.email))).toMatchObject({ success: false })
        expect(await cancelOrganizationInvitation(user.id)).toEqual({ success: true })
        expect(await inviteOrganizationMember(invitation(user.email))).toMatchObject({ success: false })
        expect(state.mail).not.toHaveBeenCalled()
        expect((await account(user.email)).organization_id).toBe(org)
    })

    it('makes concurrent invitations for one address create one account and send one email', async () => {
        const input = invitation()
        const results = await Promise.all([inviteOrganizationMember(input), inviteOrganizationMember({ ...input, email: input.email.toUpperCase() })])
        expect(results.filter(r => r.success)).toHaveLength(1)
        expect(results.filter(r => !r.success)).toHaveLength(1)
        expect(state.mail).toHaveBeenCalledTimes(1)
        expect((await root.query('select id from "user" where email=$1', [input.email])).rows).toHaveLength(1)
    })

    it('also enforces uniqueness when two organizations invite the same address concurrently', async () => {
        const url = new URL(process.env.DATABASE_URL!)
        url.pathname = `/${state.database}`
        const first = new TenantPool(new Pool({ connectionString: url.toString() }), async () => ({ userId: manager }))
        const second = new TenantPool(new Pool({ connectionString: url.toString() }), async () => ({ userId: foreignManager }))
        const email = invitation().email
        try {
            const query = 'select * from app_private.create_org_invitation($1, $2, $3::uuid[])'
            const results = await Promise.allSettled([
                first.query(query, [email, 'basic_user', [kitchen]]),
                second.query(query, [email.toUpperCase(), 'basic_user', [otherKitchen]]),
            ])
            expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
            const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
            expect(rejected.reason.code).toBe('23505')
            const user = await account(email)
            expect([org, otherOrg]).toContain(user.organization_id)
            expect((await root.query('select count(*)::int n from "user" where email=$1', [email])).rows[0].n).toBe(1)
        } finally { await first.end(); await second.end() }
    })

    it('enforces normalized uniqueness on direct inserts and email updates too', async () => {
        await expect(root.query('insert into "user"(id,email) values($1,$2)', [randomUUID(), ` ${basic}@EXAMPLE.INVALID `])).rejects.toMatchObject({ code: '23505' })
        await expect(root.query('update "user" set email=$1 where id=$2', [` ${basic}@EXAMPLE.INVALID `, foreign])).rejects.toMatchObject({ code: '23505' })
    })

    it('invites viewers without kitchen assignments', async () => {
        const input = { ...invitation(), role: 'org_view_only' as const, subOrganizationIds: [] }
        expect(await inviteOrganizationMember(input)).toEqual({ success: true })
        const user = await account(input.email)
        expect((await root.query('select role_id from user_roles where user_id=$1', [user.id])).rows).toEqual([{ role_id: 'org_view_only' }])
        expect((await root.query('select * from sub_organization_members where user_id=$1', [user.id])).rows).toEqual([])
        expect(await updateOrganizationMemberKitchens(user.id, [kitchen])).toMatchObject({ success: false })
    })

    it.each(['org_manager','admin','super_admin','global_view_only'])('rejects a forged %s invitation at both boundaries', async role => {
        const input = { ...invitation(), role } as TeamInvitation
        expect(await inviteOrganizationMember(input)).toMatchObject({ success: false })
        await expect(db.execute(sql`select * from app_private.create_org_invitation(${input.email}, ${role}, ARRAY[${kitchen}]::uuid[])`)).rejects.toThrow()
        expect(await account(input.email)).toBeUndefined()
        expect(state.mail).not.toHaveBeenCalled()
    })

    it('rejects foreign kitchens, empty assignments, and browser-supplied organization IDs atomically', async () => {
        for (const input of [{ ...invitation(), subOrganizationIds: [otherKitchen] }, { ...invitation(), subOrganizationIds: [] }, { ...invitation(), organizationId: otherOrg }]) {
            expect(await inviteOrganizationMember(input)).toMatchObject({ success: false })
            expect(await account(input.email)).toBeUndefined()
        }
        expect(state.mail).not.toHaveBeenCalled()
    })

    it.each([basic, viewer, global])('denies team actions and direct function access to non-managers %s', async id => {
        login(id)
        const input = invitation()
        expect(await inviteOrganizationMember(input)).toMatchObject({ success: false })
        await expect(getOrganizationTeam()).rejects.toThrow('Zugriff')
        await expect(db.execute(sql`select * from app_private.create_org_invitation(${input.email}, 'basic_user', ARRAY[${kitchen}]::uuid[])`)).rejects.toThrow()
    })

    it('denies anonymous and stale manager identities', async () => {
        state.actor = null
        expect(await inviteOrganizationMember(invitation())).toMatchObject({ success: false })
        await expect(db.execute(sql`select * from app_private.create_org_invitation('anonymous@example.invalid', 'org_view_only', '{}')`)).rejects.toThrow()
        login(basic)
        state.actor!.roles = ['org_manager']
        expect(await inviteOrganizationMember(invitation())).toMatchObject({ success: false })
    })

    it.each([manager, peer, global, mixed, foreign])('protects self, privileged and foreign accounts %s', async id => {
        const before = await account(`${id}@example.invalid`)
        for (const action of [resendOrganizationInvitation, cancelOrganizationInvitation, suspendOrganizationMember]) {
            expect(await action(id)).toMatchObject({ success: false })
        }
        expect(await updateOrganizationMemberKitchens(id, [kitchen])).toMatchObject({ success: false })
        expect(await account(`${id}@example.invalid`)).toEqual(before)
        expect(state.mail).not.toHaveBeenCalled()
    })

    it('does not expose other organizations or permit direct account and role writes', async () => {
        const team = await getOrganizationTeam()
        expect(team.members.map(m => m.id)).not.toContain(foreign)
        expect(team.members.find(m => m.id === peer)?.roles).toEqual(['org_manager'])
        await expect(db.insert(users).values({ email: invitation().email, organizationId: org })).rejects.toThrow()
        expect(await db.update(users).set({ status: 'deactivated' }).where(eq(users.id, basic)).returning()).toEqual([])
        await expect(db.insert(userRoles).values({ userId: basic, roleId: 'admin' })).rejects.toThrow()
        await expect(db.insert(subOrganizationMembers).values({ userId: peer, subOrganizationId: kitchen })).rejects.toThrow()
        await expect(db.insert(subOrganizationMembers).values({ userId: viewer, subOrganizationId: kitchen })).rejects.toThrow()
        await expect(db.execute(sql`select app_private.require_team_manager()`)).rejects.toThrow()
        await expect(authPool.query("select * from app_private.create_org_invitation('auth@example.invalid', 'org_view_only', '{}')")).rejects.toThrow()
    })

    it('preserves a retryable account after delivery failure and resends using its ID', async () => {
        state.mail.mockRejectedValueOnce(new Error('SMTP offline'))
        const input = invitation()
        expect(await inviteOrganizationMember(input)).toMatchObject({ success: true, warning: expect.any(String) })
        const user = await account(input.email)
        expect(user.status).toBe('pending')
        expect(user.invitation_sent_at).toBeNull()
        expect(await resendOrganizationInvitation(user.id)).toEqual({ success: true })
        expect((await account(input.email)).id).toBe(user.id)
        expect((await account(input.email)).status).toBe('invited')
    })

    it('expires invitations, renews them, and accepts them only before their deadline', async () => {
        const user = await createInvited()
        await root.query('update "user" set invitation_expires_at=now()-interval \'1 minute\' where id=$1', [user.id])
        expect(await activateAccountForSignIn(user.id)).toBe(false)
        expect(await resendOrganizationInvitation(user.id)).toEqual({ success: true })
        expect(await activateAccountForSignIn(user.id)).toBe(true)
        expect((await account(user.email)).status).toBe('active')
        expect((await account(user.email)).emailVerified).toBeInstanceOf(Date)
        state.mail.mockClear()
        expect(await resendOrganizationInvitation(user.id)).toMatchObject({ success: false })
        expect(await cancelOrganizationInvitation(user.id)).toMatchObject({ success: false })
        expect(state.mail).not.toHaveBeenCalled()
        await root.query('update "user" set invitation_expires_at=now()-interval \'1 minute\' where id=$1', [user.id])
        expect(await activateAccountForSignIn(user.id)).toBe(true)
    })

    it('cancellation during SMTP delivery cannot be undone by the delivery completion', async () => {
        const input = invitation()
        state.mail.mockImplementationOnce(async () => {
            const user = await account(input.email)
            expect(await cancelOrganizationInvitation(user.id)).toEqual({ success: true })
        })
        await inviteOrganizationMember(input)
        const user = await account(input.email)
        expect(user.status).toBe('deactivated')
        expect(await activateAccountForSignIn(user.id)).toBe(false)
        expect(await resendOrganizationInvitation(user.id)).toMatchObject({ success: false })
    })

    it('does not change an accepted account back to invited after delivery', async () => {
        const input = invitation()
        state.mail.mockImplementationOnce(async () => { expect(await activateAccountForSignIn((await account(input.email)).id)).toBe(true) })
        expect(await inviteOrganizationMember(input)).toEqual({ success: true })
        expect((await account(input.email)).status).toBe('active')
    })

    it('updates kitchen assignments atomically, revokes sessions, and preserves reports on suspension', async () => {
        const user = await createInvited()
        await activateAccountForSignIn(user.id)
        expect(await updateOrganizationMemberKitchens(user.id, [secondKitchen, secondKitchen])).toEqual({ success: true })
        expect(await updateOrganizationMemberKitchens(user.id, [kitchen, otherKitchen])).toMatchObject({ success: false })
        expect((await root.query('select sub_organization_id from sub_organization_members where user_id=$1', [user.id])).rows).toEqual([{ sub_organization_id: secondKitchen }])
        await root.query('insert into indicator_data(organization_id,sub_organization_id,reporting_year,reporting_month,created_by) values($1,$2,2026,0,$3)', [org, secondKitchen, user.id])
        expect(await suspendOrganizationMember(user.id)).toEqual({ success: true })
        expect(await activateAccountForSignIn(user.id)).toBe(false)
        expect((await root.query('select id from revoked_sessions where user_id=$1', [user.id])).rows).toHaveLength(2)
        expect((await root.query('select id from indicator_data where created_by=$1', [user.id])).rows).toHaveLength(1)
    })
})
