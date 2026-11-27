import 'server-only'
import { createTransport } from 'nodemailer'
import { inviteHtml, inviteText } from '@/lib/email-templates'

/** Sending an email never changes account permissions or account status. */
export async function deliverInvitation(email: string, organizationName?: string, expiresAt?: Date) {
    const baseUrl = process.env.AUTH_URL || 'http://localhost:3000'
    const content = { url: new URL('/login', baseUrl).toString(), host: new URL(baseUrl).host,
        organizationName, expiresAt }
    const transport = createTransport({
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT),
        auth: { user: process.env.EMAIL_SERVER_USER, pass: process.env.EMAIL_SERVER_PASSWORD },
    })
    const result = await transport.sendMail({
        to: email, from: `AVE Plattform <${process.env.EMAIL_FROM}>`, subject: 'Einladung – AVE Dashboard',
        text: inviteText(content), html: inviteHtml(content),
    })
    if (result.rejected?.length || result.pending?.length) throw new Error('Invitation delivery rejected')
}
