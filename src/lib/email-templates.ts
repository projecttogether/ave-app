/**
 * Branded email templates for the AVE Dashboard.
 *
 * All emails share a common layout (emailLayout) that includes
 * the AVE logo header, a white content card, and a footer with
 * privacy link and ignore notice.
 */

const APP_NAME = "AVE Dashboard"
const PRIVACY_URL = "https://ave-gastro.org/datenschutz/"

// Brand colors (matching globals.css)
const colors = {
  primary: "#f2733c",       // Orange
  background: "#f4ede4",    // Beige
  foreground: "#1a1a1a",    // Dark charcoal
  muted: "#737373",         // Muted foreground
  cardBg: "#ffffff",        // White
  border: "#e6dbd0",        // Border color
  buttonText: "#ffffff",    // White button text
}

/**
 * Derive the logo URL from the magic link URL's origin,
 * falling back to a sensible default.
 */
function logoUrl(host: string): string {
  return `https://${host}/images/ave-logo.png`
}

/**
 * Shared email layout wrapper.
 * Takes inner HTML content and wraps it in a branded shell.
 */
function emailLayout(innerContent: string, host: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${colors.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${colors.background};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 520px; margin: 0 auto;">

          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <img src="${logoUrl(host)}" alt="${APP_NAME}" width="120" height="auto" style="display: block; border: 0;" />
            </td>
          </tr>

          <!-- Content Card -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background-color: ${colors.cardBg}; border-radius: 16px; border: 1px solid ${colors.border}; overflow: hidden;">
                <tr>
                  <td style="padding: 40px 36px;">
                    ${innerContent}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 0 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="font-size: 12px; line-height: 18px; color: ${colors.muted};">
                    <a href="${PRIVACY_URL}" target="_blank" rel="noopener noreferrer"
                      style="color: ${colors.muted}; text-decoration: underline;">Datenschutzerklärung</a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px; font-size: 12px; line-height: 18px; color: ${colors.muted};">
                    &copy; ${new Date().getFullYear()} ProjectTogether gGmbH
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * CTA button markup (shared across templates).
 */
function ctaButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
  <tr>
    <td align="center" style="border-radius: 10px; background-color: ${colors.primary};">
      <a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 36px; font-size: 16px; font-weight: 600; color: ${colors.buttonText}; text-decoration: none; border-radius: 10px; background-color: ${colors.primary};">${label}</a>
    </td>
  </tr>
</table>`
}

// ─── Magic Link Email ──────────────────────────────────────────────

/**
 * HTML body for the magic link sign-in email.
 */
export function magicLinkHtml({ url, host }: { url: string; host: string }): string {
  const inner = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: ${colors.foreground}; text-align: center;">
      Anmeldelink
    </h1>
    <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 24px; color: ${colors.muted}; text-align: center;">
      Klicken Sie auf den Button, um sich sicher beim ${APP_NAME} anzumelden. Dieser Link ist 7&nbsp;Tage gültig.
    </p>

    ${ctaButton(url, "Anmelden")}

    <p style="margin: 28px 0 0 0; font-size: 13px; line-height: 20px; color: ${colors.muted}; text-align: center; word-break: break-all;">
      Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br />
      <a href="${url}" style="color: ${colors.primary}; text-decoration: underline;">${url}</a>
    </p>

    <p style="margin: 20px 0 0 0; font-size: 13px; line-height: 20px; color: ${colors.muted}; text-align: center;">
      Falls Sie diese E-Mail nicht angefordert haben, können Sie sie ignorieren.
    </p>`

  return emailLayout(inner, host)
}

/**
 * Plain-text fallback for the magic link email.
 */
export function magicLinkText({ url, host }: { url: string; host: string }): string {
  return `Anmeldelink – ${APP_NAME}

Melden Sie sich beim ${APP_NAME} an, indem Sie den folgenden Link öffnen:

${url}

Dieser Link ist 7 Tage gültig.

Falls Sie diese E-Mail nicht angefordert haben, können Sie sie ignorieren.

---
${APP_NAME} | https://${host}
Datenschutz: ${PRIVACY_URL}
`
}

// ─── OTP Code Email ───────────────────────────────────────────────

/**
 * HTML body for the OTP code sign-in email.
 */
export function otpCodeHtml({ code, host }: { code: string; host: string }): string {
  const inner = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: ${colors.foreground}; text-align: center;">
      Ihr Anmeldecode
    </h1>
    <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 24px; color: ${colors.muted}; text-align: center;">
      Geben Sie diesen Code im ${APP_NAME} ein, um sich anzumelden.
    </p>

    <div style="margin: 0 auto 28px auto; background-color: #f5f5f5; border-radius: 12px; padding: 20px; text-align: center;">
      <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: ${colors.foreground}; font-family: monospace;">
        ${code}
      </span>
    </div>

    <p style="margin: 0 0 0 0; font-size: 13px; line-height: 20px; color: ${colors.muted}; text-align: center;">
      Dieser Code ist 10&nbsp;Minuten gültig.
    </p>

    <p style="margin: 16px 0 0 0; font-size: 13px; line-height: 20px; color: ${colors.muted}; text-align: center;">
      Falls Sie diese E-Mail nicht angefordert haben, können Sie sie ignorieren.
    </p>`

  return emailLayout(inner, host)
}

/**
 * Plain-text fallback for the OTP code email.
 */
export function otpCodeText({ code, host }: { code: string; host: string }): string {
  return `Ihr Anmeldecode – ${APP_NAME}

Ihr Anmeldecode lautet: ${code}

Geben Sie diesen Code im ${APP_NAME} ein, um sich anzumelden.
Der Code ist 10 Minuten gültig.

Falls Sie diese E-Mail nicht angefordert haben, können Sie sie ignorieren.

---
${APP_NAME} | https://${host}
Datenschutz: ${PRIVACY_URL}
`
}

// ─── Invite Email ──────────────────────────────────────────────────

/**
 * HTML body for the user invite email.
 */
type InvitationContent = { url: string; host: string; organizationName?: string; expiresAt?: Date }

function invitationContext({ organizationName, expiresAt }: InvitationContent) {
  return [organizationName ? `Organisation: ${organizationName}.` : '', expiresAt
    ? `Melden Sie sich bis ${expiresAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} Uhr (Berlin) mit dieser E-Mail-Adresse an, um die Einladung anzunehmen.` : ''].filter(Boolean).join(' ')
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function inviteHtml(content: InvitationContent): string {
  const { url, host } = content
  const inner = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: ${colors.foreground}; text-align: center;">
      Sie wurden eingeladen
    </h1>
    <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 24px; color: ${colors.muted}; text-align: center;">
      Sie wurden zum <strong style="color: ${colors.foreground};">${APP_NAME}</strong> eingeladen – der Plattform zur
      Erfassung und Auswertung Ihrer Nachhaltigkeitsindikatoren. Öffnen Sie die Anmeldeseite und fordern Sie
      dort einen Anmeldecode an, um loszulegen.
    </p>

    <p style="font-size: 15px; line-height: 24px; text-align: center;">${escapeHtml(invitationContext(content))}</p>
    ${ctaButton(url, "Zur Anmeldung")}

    <p style="margin: 28px 0 0 0; font-size: 13px; line-height: 20px; color: ${colors.muted}; text-align: center; word-break: break-all;">
      Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br />
      <a href="${url}" style="color: ${colors.primary}; text-decoration: underline;">${url}</a>
    </p>

    <p style="margin: 20px 0 0 0; font-size: 13px; line-height: 20px; color: ${colors.muted}; text-align: center;">
      Falls Sie diese E-Mail nicht erwartet haben, können Sie sie ignorieren.
    </p>`

  return emailLayout(inner, host)
}

/**
 * Plain-text fallback for the invite email.
 */
export function inviteText(content: InvitationContent): string {
  const { url, host } = content
  return `Einladung – ${APP_NAME}

Sie wurden zum ${APP_NAME} eingeladen – der Plattform zur Erfassung und Auswertung Ihrer Nachhaltigkeitsindikatoren.

${invitationContext(content)}

Öffnen Sie die Anmeldeseite und fordern Sie dort einen Anmeldecode an, um loszulegen:

${url}

---
${APP_NAME} | https://${host}
Datenschutz: ${PRIVACY_URL}
`
}

// ─── Login Email Change Notice ─────────────────────────────────────

type LoginEmailChangedContent = { host: string; newAddressHint: string }

/**
 * HTML body sent to the previous address after an administrator changes
 * an account's login email.
 */
export function loginEmailChangedHtml({ host, newAddressHint }: LoginEmailChangedContent): string {
  const inner = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: ${colors.foreground}; text-align: center;">
      Anmelde-E-Mail geändert
    </h1>
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 24px; color: ${colors.muted}; text-align: center;">
      Die E-Mail-Adresse für die Anmeldung bei Ihrem Konto im ${APP_NAME} wurde von einer Administratorin
      oder einem Administrator geändert auf <strong style="color: ${colors.foreground};">${escapeHtml(newAddressHint)}</strong>.
    </p>
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 24px; color: ${colors.muted}; text-align: center;">
      Alle Sitzungen wurden beendet und hinterlegte Passkeys entfernt.
    </p>
    <p style="margin: 0; font-size: 13px; line-height: 20px; color: ${colors.muted}; text-align: center;">
      Falls Sie diese Änderung nicht erwartet haben, wenden Sie sich bitte umgehend an Ihre Organisationsleitung
      oder den AVE-Administrator.
    </p>`

  return emailLayout(inner, host)
}

/**
 * Plain-text fallback for the login email change notice.
 */
export function loginEmailChangedText({ host, newAddressHint }: LoginEmailChangedContent): string {
  return `Anmelde-E-Mail geändert – ${APP_NAME}

Die E-Mail-Adresse für die Anmeldung bei Ihrem Konto im ${APP_NAME} wurde von einer Administratorin oder einem Administrator geändert auf ${newAddressHint}.

Alle Sitzungen wurden beendet und hinterlegte Passkeys entfernt.

Falls Sie diese Änderung nicht erwartet haben, wenden Sie sich bitte umgehend an Ihre Organisationsleitung oder den AVE-Administrator.

---
${APP_NAME} | https://${host}
Datenschutz: ${PRIVACY_URL}
`
}
