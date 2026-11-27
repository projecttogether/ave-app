# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in the AVE Dashboard, please report it responsibly.

**Do not file a public issue.** Instead, contact us directly:

- Email: security@ave-gastro.org

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

We will acknowledge receipt within 48 hours and aim to provide a resolution timeline within 5 business days.

## Security Measures

The AVE Dashboard implements the following security controls aligned with ISO 27001:

### Authentication (A.8.5)
- Passwordless authentication via verified email OTPs
- WebAuthn/FIDO2 passkey support with user verification required
- Session timeout: 8 hours from sign-in, including during inactivity
- Session revocation capability ("logout all devices")
- Deactivated users are blocked from login
- Rate limiting on authentication endpoints (10 attempts per 15 minutes per IP, per-email limits on OTP requests, and per-browser limits on OTP verification)
- OTP codes are bound to the browser that requested them, so other people's wrong guesses cannot cancel a pending code

### Authorization (A.8.3)
- Six-tier role-based access control (RBAC): super_admin, admin, org_manager, global_view_only, org_view_only, basic_user
- Multi-tenant data isolation with organization and sub-organization scoping
- Server-side authorization checks on all mutations

### Organization invitations and account identity

- An email address identifies one account across the entire platform. Addresses are trimmed and lowercased, and PostgreSQL enforces normalized uniqueness. Pending, expired, active, and deactivated accounts all reserve their addresses.
- A new-user invitation must fail if the email address already exists, including in another organization. It must not send an invitation, create a second account, attach an existing account, change its roles, reactivate it, or change its organization. Concurrent requests must obey the same rule.
- Invitations never switch organizations automatically. Any organization reassignment requires a separate, explicit administrator operation. A duplicate-address response must not disclose the existing account's organization, roles, or status.
- Resending an invitation is a separate operation on an existing, authorized account ID. Managers may resend only pending invitations in their own organization. Resending must never reactivate a deactivated account or change an active account back to invited.
- Organization managers may invite only `basic_user` and `org_view_only` accounts into their own stored organization. Basic users require explicit kitchen assignments within that organization. Organization viewers can read every kitchen in that organization, including future kitchens.
- Managers may change kitchen assignments for ordinary basic users, cancel pending invitations, and suspend active ordinary members. They cannot manage themselves, other managers, global roles, unknown roles, or accounts with multiple roles. Role changes, login-email changes, reactivation, permanent deletion, and organization transfers remain administrator operations.
- Manager-created invitations expire after seven days. The recipient accepts by signing in with a verified OTP. Cancellation blocks login; suspension also revokes existing sessions. Both preserve submitted reports and keep the email address reserved. An administrator may explicitly reactivate an account.
- SMTP failure must leave a visible, retryable invitation for the same account. Finishing email delivery after cancellation, suspension, or acceptance must not undo that state change.
- Team mutations derive the organization from the authenticated actor and enforce the boundary in PostgreSQL. The `ave_team` NOLOGIN role owns narrowly scoped functions and must never be granted to runtime logins. Runtime connections must not bypass row-level security. Team mutations and invitation delivery are audited with the actor, organization, and target account.

These are required security properties, not accepted exceptions. Account duplication, invitation-driven organization switching, cross-organization management, privilege escalation, and restoration of cancelled or suspended access through an invitation are reportable findings.

### Data Protection (A.8.10, A.8.11)
- Input validation with Zod schemas on all server actions
- CSRF protection via Next.js Server Actions
- Parameterized database queries via Drizzle ORM (SQL injection prevention)
- CSV upload validation: file size limits (5MB), MIME type checking, row count limits (10,000)
- Sensitive field masking in audit logs (emails partially masked, tokens redacted)
- User data export (GDPR Art. 20 - data portability)
- Automated data retention cleanup

### Logging & Monitoring (A.8.15, A.8.16)
- Comprehensive audit logging: authentication, authorization, admin actions, data mutations
- Structured JSON logging for Docker log collection
- Audit log admin interface for super admins
- Login attempt tracking with severity levels

### Infrastructure (A.5.23)
- Security headers: CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy
- Docker container runs as non-root user (UID 1001)
- Multi-stage Docker builds with Alpine base (minimal attack surface)
- Environment variable validation at startup
- Health check endpoint with database connectivity verification
- Automated dependency vulnerability scanning via Dependabot

### Development (A.8.25)
- CI/CD pipeline with linting, type checking, testing, and security auditing
- Automated dependency updates via Dependabot
- Unit tests for security-critical code (roles, validation, logging)
