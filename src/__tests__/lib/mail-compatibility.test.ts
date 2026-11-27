import { expect, it } from 'vitest'
import { createTransport } from 'nodemailer'
import { inviteHtml, inviteText, otpCodeHtml, otpCodeText } from '@/lib/email-templates'

it('builds OTP and invitation mail with the patched Nodemailer version without network access', async () => {
  const transport = createTransport({ jsonTransport: true })
  const code = { code: '123456', host: 'example.invalid' }
  const invite = { url: 'https://example.invalid/login', host: 'example.invalid' }
  for (const content of [
    { subject: 'Ihr Anmeldecode', html: otpCodeHtml(code), text: otpCodeText(code) },
    { subject: 'Einladung', html: inviteHtml(invite), text: inviteText(invite) },
  ]) {
    const result = await transport.sendMail({
      from: 'AVE Plattform <sender@example.invalid>', to: 'alice+tag@example.invalid', ...content,
    })
    expect(result.envelope.to).toEqual(['alice+tag@example.invalid'])
    expect(JSON.parse(result.message.toString())).toMatchObject(content)
  }
})

it('escapes organization names and explains how to accept an expiring invitation', () => {
  const content = { url: 'https://example.invalid/login', host: 'example.invalid',
    organizationName: '<img src=x onerror=alert(1)>', expiresAt: new Date('2026-10-06T12:00:00Z') }
  expect(inviteHtml(content)).toContain('&lt;img src=x onerror=alert(1)&gt;')
  expect(inviteHtml(content)).not.toContain('<img src=x')
  expect(inviteText(content)).toContain('6.10.2026')
  expect(inviteText(content)).toContain('um die Einladung anzunehmen')
})
