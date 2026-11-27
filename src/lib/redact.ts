// Shared by the audit log, the application logger and Sentry. Keep this module
// free of imports so every one of them can use it.

const SENSITIVE_KEYS = new Set(['token', 'secret', 'password', 'auth_secret', 'pass', 'credential'])

/** s****@example.com: recognisable to the owner, not a full address. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  return at > 1 ? `${email[0]}****${email.slice(at)}` : `****${email.slice(Math.max(at, 0))}`
}

/** Mask addresses inside free text, e.g. SMTP errors that quote the recipient. */
export function maskEmailsInText(text: string): string {
  return text.replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+\.[A-Za-z]{2,}/g, maskEmail)
}

export function maskSensitiveFields(obj: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      masked[key] = '[REDACTED]'
    } else if (typeof value === 'string' && key.toLowerCase().includes('email')) {
      // Partially mask emails: s****@example.com
      masked[key] = value.indexOf('@') > 1 ? maskEmail(value) : value
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      masked[key] = maskSensitiveFields(value as Record<string, unknown>)
    } else {
      masked[key] = value
    }
  }
  return masked
}
