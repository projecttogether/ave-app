export function canAuthenticateAccount(account: {
    status: string | null
    invitationExpiresAt?: Date | null
}, now = Date.now()) {
    return account.status !== 'deactivated' && (account.status === 'active'
        || !account.invitationExpiresAt || account.invitationExpiresAt.getTime() > now)
}
