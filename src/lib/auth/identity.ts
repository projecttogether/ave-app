import type { JWT } from 'next-auth/jwt'
import { canAuthenticateAccount } from './account-status'

export type IdentityProfile = {
  id: string
  email: string
  name: string | null
  organizationId: string | null
  status: string | null
  roles: string[]
  invitationExpiresAt?: Date | null
}

/**
 * Update commands are untrusted. Identity and permissions always come from storage.
 * The app only sends impersonation commands for super admins, so `onDenied`
 * hears of forged ones.
 */
export async function refreshIdentity(
  token: JWT,
  update: unknown,
  load: (id: string) => Promise<IdentityProfile | undefined>,
  onDenied?: (userId: string, targetId: string) => Promise<void>,
): Promise<JWT | null> {
  token = { ...token }
  if (typeof token.id !== 'string') return null
  const originalId = typeof token.realUserId === 'string' ? token.realUserId : token.id
  const original = await load(originalId)
  if (!original || !canAuthenticateAccount(original)) return null
  if (token.isImpersonating && !original.roles.includes('super_admin')) return null

  const command = update && typeof update === 'object' ? update as Record<string, unknown> : {}
  let targetId = token.id
  if (command.stopImpersonating === true && token.isImpersonating) {
    targetId = originalId
    delete token.realUserId
    delete token.realUserEmail
    token.isImpersonating = false
  } else if (typeof command.impersonateUserId === 'string') {
    if (!original.roles.includes('super_admin')) {
      await onDenied?.(original.id, command.impersonateUserId)
      return null
    }
    targetId = command.impersonateUserId
    token.realUserId = originalId
    token.realUserEmail = original.email
    token.isImpersonating = true
  }

  const profile = targetId === originalId ? original : await load(targetId)
  if (!profile || !canAuthenticateAccount(profile)) return null
  return { ...token, id: profile.id, email: profile.email, name: profile.name,
    organizationId: profile.organizationId, roles: profile.roles }
}
