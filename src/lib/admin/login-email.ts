import 'server-only'
import { eq } from 'drizzle-orm'
import { createTransport } from 'nodemailer'
import type { db } from '@/lib/db'
import { authenticators, revokedSessions } from '@/lib/db/schema'
import { auditLog } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { loginEmailChangedHtml, loginEmailChangedText } from '@/lib/email-templates'
import { maskEmail } from '@/lib/redact'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * A login email decides who can sign in. Run in the transaction that changes
 * it: ending sessions and removing passkeys means a passkey enrolled while the
 * address pointed elsewhere cannot outlive the change.
 */
export async function endLoginCredentials(tx: Transaction, userId: string) {
    await tx.delete(authenticators).where(eq(authenticators.userId, userId))
    await tx.insert(revokedSessions).values({ userId, reason: 'admin_revoked' })
}

/** Call after the change is committed. Delivery failures are logged, not thrown. */
export async function recordLoginEmailChange(actorId: string, userId: string, previousEmail: string, newEmail: string) {
    await auditLog({ action: 'admin.user_update', userId: actorId, resource: `user:${userId}`, resourceType: 'user',
        details: { action: 'login_email_change', previousEmail, newEmail, credentialsRemoved: true }, severity: 'critical' })
    try {
        const baseUrl = process.env.AUTH_URL || 'http://localhost:3000'
        const content = { host: new URL(baseUrl).host, newAddressHint: maskEmail(newEmail) }
        const transport = createTransport({
            host: process.env.EMAIL_SERVER_HOST,
            port: Number(process.env.EMAIL_SERVER_PORT),
            auth: { user: process.env.EMAIL_SERVER_USER, pass: process.env.EMAIL_SERVER_PASSWORD },
        })
        const result = await transport.sendMail({
            to: previousEmail, from: `AVE Plattform <${process.env.EMAIL_FROM}>`,
            subject: 'Ihre Anmelde-E-Mail wurde geändert – AVE Dashboard',
            text: loginEmailChangedText(content), html: loginEmailChangedHtml(content),
        })
        if (result.rejected?.length || result.pending?.length) throw new Error('Notice delivery rejected')
    } catch (error) {
        // Mail errors can quote the recipient; log only the error code.
        logger.error('Login email change notice failed', { userId, code: (error as { code?: string })?.code ?? 'unknown' })
    }
}
