import { z } from 'zod'
import { emailSchema, uuidSchema } from '@/lib/validation'
import type { UserStatus } from '@/types/auth'

export const teamKitchenIdsSchema = z.array(uuidSchema).min(1, 'Wählen Sie mindestens eine Küche.').max(500)
export const teamInvitationSchema = z.object({
    email: emailSchema,
    role: z.enum(['basic_user', 'org_view_only']),
    subOrganizationIds: z.array(uuidSchema).max(500),
}).strict().superRefine((value, ctx) => {
    if (value.role === 'basic_user' && value.subOrganizationIds.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['subOrganizationIds'], message: 'Wählen Sie mindestens eine Küche.' })
    }
    if (value.role === 'org_view_only' && value.subOrganizationIds.length > 0) {
        ctx.addIssue({ code: 'custom', path: ['subOrganizationIds'], message: 'Organisationsbetrachter sehen alle Küchen.' })
    }
})
export type TeamInvitation = z.infer<typeof teamInvitationSchema>
export type TeamMember = {
    id: string
    name: string | null
    email: string
    roles: string[]
    status: UserStatus
    subOrganizationIds: string[]
    invitationExpiresAt: string | null
    invitationSentAt: string | null
}

export function isOrdinaryTeamMember(member: Pick<TeamMember, 'roles' | 'id'>, actorId: string) {
    return member.id !== actorId && member.roles.length === 1
        && ['basic_user', 'org_view_only'].includes(member.roles[0])
}

export function teamMemberStatus(member: Pick<TeamMember, 'status' | 'invitationExpiresAt' | 'invitationSentAt'>, now: number) {
    if (member.status === 'active') return 'Aktiv'
    if (member.status === 'deactivated') return 'Deaktiviert'
    if (member.invitationExpiresAt && Date.parse(member.invitationExpiresAt) <= now) return 'Einladung abgelaufen'
    return member.invitationSentAt || member.status === 'invited' ? 'Eingeladen' : 'Noch nicht versendet'
}

export type TeamActionResult = { success: true; warning?: string } | { success: false; error: string }
