'use server'

import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { checkAdmin } from '@/app/admin/actions'
import { deliverInvitation } from '@/lib/invitation-mail'
import { auditLog } from '@/lib/audit'
import { adminLimiter, checkRateLimit } from '@/lib/rate-limit'
import { revalidatePath } from 'next/cache'
import { errorSummary } from '@/lib/errors'

/**
 * Send an invite email to a user.
 * Links to the login page where the user requests a new login code.
 */
export async function sendInviteEmail(userId: string): Promise<{ success: boolean; error?: string }> {
    const session = await checkAdmin()

    // Stricter limit for actions that send email
    const { allowed } = await checkRateLimit(adminLimiter, `invite:${session.user.id}`)
    if (!allowed) {
        return { success: false, error: 'Zu viele Einladungen in kurzer Zeit. Bitte warten Sie einen Moment.' }
    }

    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })

    if (!user || !user.email) {
        return { success: false, error: 'Benutzer nicht gefunden' }
    }
    if (user.status === 'deactivated') {
        return { success: false, error: 'Deaktivierte Konten können nicht eingeladen werden. Eine Aktivierung muss ausdrücklich durch einen Administrator erfolgen.' }
    }

    try {
        let expiresAt = user.invitationExpiresAt ?? undefined
        if (expiresAt && ['pending', 'invited'].includes(user.status ?? '')) {
            expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            const renewed = await db.update(users).set({ invitationExpiresAt: expiresAt })
                .where(and(eq(users.id, userId), inArray(users.status, ['pending', 'invited'])))
                .returning({ id: users.id })
            if (!renewed.length) return { success: false, error: 'Der Kontostatus hat sich geändert. Bitte laden Sie die Benutzerliste neu.' }
        }
        await deliverInvitation(user.email, undefined, expiresAt)
        // A resend must never demote an active account or reactivate a disabled one,
        // including when acceptance or suspension races with SMTP delivery.
        await db.update(users).set({ status: 'invited', invitationSentAt: new Date() })
            .where(and(eq(users.id, userId), inArray(users.status, ['pending', 'invited'])))
        await auditLog({ action: 'admin.invite_sent', userId: session.user.id, resource: `user:${userId}`, resourceType: 'user', details: { email: user.email } })
        revalidatePath('/organization')
        revalidatePath('/admin/users')

        return { success: true }
    } catch (error) {
        const { logger } = await import('@/lib/logger')
        logger.error('Failed to send invite email', { userId, ...errorSummary(error) })
        return { success: false, error: 'E-Mail konnte nicht gesendet werden' }
    }
}
