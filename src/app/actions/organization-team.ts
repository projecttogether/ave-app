'use server'

import { asc, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { isOrgManager } from '@/lib/roles'
import { apiLimiter, checkRateLimit, teamInviteLimiter } from '@/lib/rate-limit'
import { deliverInvitation } from '@/lib/invitation-mail'
import { logger } from '@/lib/logger'
import { teamInvitationSchema, teamKitchenIdsSchema, type TeamActionResult, type TeamInvitation, type TeamMember } from '@/lib/organization-team'
import { uuidSchema } from '@/lib/validation'

class TeamRequestError extends Error {}

async function checkTeamManager() {
    const session = await auth()
    // @ts-expect-error roles is added in auth.ts
    if (!session?.user?.id || !isOrgManager(session.user.roles)) throw new TeamRequestError('Zugriff verweigert.')
    const profile = await db.query.users.findFirst({
        where: eq(users.id, session.user.id), columns: { organizationId: true },
    })
    if (!profile?.organizationId) throw new TeamRequestError('Keine Organisation zugewiesen.')
    return { userId: session.user.id, organizationId: profile.organizationId }
}

async function limitAction(actor: Awaited<ReturnType<typeof checkTeamManager>>, sendsEmail: boolean) {
    if (!(await checkRateLimit(apiLimiter, `team:${actor.userId}`)).allowed
        || (sendsEmail && !(await checkRateLimit(teamInviteLimiter, `org:${actor.organizationId}`)).allowed)) {
        throw new TeamRequestError('Zu viele Anfragen. Bitte versuchen Sie es in einer Minute erneut.')
    }
}

type InvitationRow = { id: string; email: string; organization_name: string; expires_at: Date | null }
function kitchenArray(ids: string[]) {
    return sql`ARRAY[${sql.join(ids.map(id => sql`${id}`), sql`, `)}]::uuid[]`
}

async function manageMember(id: string, operation: string, kitchenIds: string[] = []) {
    const result = await db.execute<InvitationRow>(sql`select * from app_private.manage_org_member(${id}, ${operation}, ${kitchenArray(kitchenIds)})`)
    return result.rows[0]
}

function actionError(error: unknown): TeamActionResult {
    if (error instanceof TeamRequestError) return { success: false, error: error.message }
    let cause = error
    for (let depth = 0; cause && typeof cause === 'object' && depth < 5; depth++) {
        const detail = cause as { code?: string; message?: string; cause?: unknown }
        if (detail.code === '23505') return { success: false,
            error: 'Diese E-Mail-Adresse ist bereits registriert. Es wurde keine neue Einladung erstellt. Bestehende Konten werden keiner anderen Organisation zugeordnet. Bitte wenden Sie sich bei Bedarf an AVE.' }
        const messages: Record<string, string> = {
            TEAM_FORBIDDEN: 'Dieses Konto kann hier nicht verwaltet werden.',
            TEAM_NOT_PENDING: 'Die Einladung ist nicht mehr offen. Laden Sie die Teamliste neu.',
            TEAM_NOT_ACTIVE: 'Dieses Konto ist nicht aktiv. Laden Sie die Teamliste neu.',
            TEAM_INVALID_KITCHENS: 'Wählen Sie mindestens eine Küche Ihrer Organisation.',
            TEAM_INVALID_INVITATION: 'Die Einladung enthält ungültige Angaben.',
        }
        if (detail.message && messages[detail.message]) return { success: false, error: messages[detail.message] }
        cause = detail.cause
    }
    logger.error('Organization team action failed')
    return { success: false, error: 'Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.' }
}

function refreshTeam() {
    revalidatePath('/organization')
    revalidatePath('/admin/users')
    revalidatePath('/admin/organizations')
}

async function sendInvitation(invitation: InvitationRow): Promise<TeamActionResult> {
    try {
        await deliverInvitation(invitation.email, invitation.organization_name, invitation.expires_at ?? undefined)
        await manageMember(invitation.id, 'sent')
        return { success: true }
    } catch {
        // The account remains reserved. Retrying delivery uses its ID, never creates another account.
        logger.error('Organization invitation delivery or delivery tracking failed', { userId: invitation.id })
        return { success: true, warning: 'Die Einladung ist gespeichert, aber der E-Mail-Versand konnte nicht bestätigt werden. Nutzen Sie „Erneut senden“ in der Teamliste.' }
    } finally {
        refreshTeam()
    }
}

export async function getOrganizationTeam(): Promise<{ actorId: string; members: TeamMember[]; loadedAt: number }> {
    const actor = await checkTeamManager()
    const members = await db.query.users.findMany({
        where: eq(users.organizationId, actor.organizationId), orderBy: [asc(users.email)],
        columns: { id: true, name: true, email: true, status: true, invitationExpiresAt: true, invitationSentAt: true },
        with: { userRoles: { columns: { roleId: true } }, subOrganizationMembers: { columns: { subOrganizationId: true } } },
    })
    return { actorId: actor.userId, loadedAt: Date.now(), members: members.map(member => ({
        id: member.id, name: member.name, email: member.email, status: member.status ?? 'pending',
        roles: member.userRoles.map(role => role.roleId),
        subOrganizationIds: member.subOrganizationMembers.map(membership => membership.subOrganizationId),
        invitationExpiresAt: member.invitationExpiresAt?.toISOString() ?? null,
        invitationSentAt: member.invitationSentAt?.toISOString() ?? null,
    })) }
}

export async function inviteOrganizationMember(input: TeamInvitation): Promise<TeamActionResult> {
    try {
        const actor = await checkTeamManager()
        await limitAction(actor, true)
        const parsed = teamInvitationSchema.safeParse(input)
        if (!parsed.success) throw new TeamRequestError(parsed.error.issues[0].message)
        const { email, role, subOrganizationIds } = parsed.data
        const result = await db.execute<InvitationRow>(sql`select * from app_private.create_org_invitation(${email}, ${role}, ${kitchenArray(subOrganizationIds)})`)
        return await sendInvitation(result.rows[0])
    } catch (error) { return actionError(error) }
}

export async function resendOrganizationInvitation(userId: string): Promise<TeamActionResult> {
    try {
        const actor = await checkTeamManager()
        await limitAction(actor, true)
        if (!uuidSchema.safeParse(userId).success) throw new TeamRequestError('Ungültiger Benutzer.')
        return await sendInvitation(await manageMember(userId, 'resend'))
    } catch (error) { return actionError(error) }
}

async function changeMember(userId: string, operation: 'cancel' | 'suspend' | 'kitchens', kitchenIds: string[] = []): Promise<TeamActionResult> {
    try {
        const actor = await checkTeamManager()
        await limitAction(actor, false)
        if (!uuidSchema.safeParse(userId).success) throw new TeamRequestError('Ungültiger Benutzer.')
        if (operation === 'kitchens' && !teamKitchenIdsSchema.safeParse(kitchenIds).success) {
            throw new TeamRequestError('Wählen Sie mindestens eine gültige Küche.')
        }
        await manageMember(userId, operation, kitchenIds)
        refreshTeam()
        return { success: true }
    } catch (error) { return actionError(error) }
}

export async function cancelOrganizationInvitation(userId: string) {
    return changeMember(userId, 'cancel')
}

export async function suspendOrganizationMember(userId: string) {
    return changeMember(userId, 'suspend')
}

export async function updateOrganizationMemberKitchens(userId: string, subOrganizationIds: string[]) {
    return changeMember(userId, 'kitchens', subOrganizationIds)
}
