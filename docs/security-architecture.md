# Security Architecture

The current tenant policies, authentication checks, and deployment requirements are documented in [Organization isolation](tenant-isolation.md). That document supersedes the legacy isolation and session details below.

## Authentication

### Email OTP
1. User enters an email on `/login`.
2. Every valid address gets the same response and HttpOnly flow cookie. After the response, and only if an account has this address, a six-digit code is hashed with `AUTH_SECRET`, stored with a ten-minute expiry bound to that browser flow, and emailed.
3. The credentials provider rate-limits per browser flow, verifies, and atomically consumes the code. Other browsers cannot use, guess against, or cancel it.
4. The provider resolves an existing account and Auth.js creates the session. Direct provider requests must supply the code too.

### WebAuthn/Passkeys (Secondary)
1. Users register passkeys via `/settings`
2. Credentials stored in `authenticator` table
3. User verification is **required** (biometric/PIN)
4. Relying Party: `app.ave-gastro.org` (production), `localhost` (dev)

### Session Management
- **Strategy**: JWT (stateless, no server-side session store)
- **Absolute timeout**: 8 hours from sign-in, enforced by the original `authenticatedAt` timestamp
- **Inactivity timeout**: None; idle sessions remain valid until the absolute timeout
- **Revocation**: Via `revoked_sessions` table; JWT callback checks denylist (cached, max once per 60s)

## Authorization (RBAC)

```
super_admin  -> Full system access, user impersonation
  admin      -> System configuration, data export
    org_manager  -> Organization-level data management
      org_view_only -> Read-only dashboard access
        basic_user   -> Data entry for assigned sub-organizations
```

- Roles stored in `user_roles` many-to-many table
- Checked server-side in every server action
- The proxy redirects page requests without a session to `/login`; only the login pages, `/` and public images are open

## Multi-Tenant Data Isolation

```
Organization (tenant)
  |-- Sub-Organization 1
  |     |-- Indicator Data (scoped)
  |     |-- Qualitative Responses (scoped)
  |-- Sub-Organization 2
  |     |-- ...
  |-- User (org_manager, assigned to org)
  |-- User (basic_user, assigned to specific sub-orgs via membership table)
```

- Every application query runs with transaction-local identity and database row-level security.
- Organization and sub-organization checks also validate requested filters on the server.
- `assertSubOrganizationAccess()` validates ownership before every write
- CSV imports validate sub-org ownership per row

## Audit Logging

All security-relevant actions are logged to the `audit_logs` table:

| Action | Severity | Description |
|--------|----------|-------------|
| `auth.login` | info | Successful login |
| `auth.login_failed` | warning | Failed login attempt |
| `auth.logout` | info | User logout |
| `admin.user_create/update/delete` | info/critical | User management |
| `admin.role_change` | info | Role assignment changes |
| `admin.impersonate_start/stop` | critical | Admin impersonation |
| `data.create/update` | info | Indicator data modifications |
| `data.csv_import` | info | CSV data import |
| `data.freeze/unfreeze` | info/warning | Year lock/unlock |
| `authz.denied` | warning | Authorization failures |

Sensitive data (tokens, passwords, full emails) are automatically masked in log details.

## Data Classification

| Classification | Examples | Protection |
|---------------|----------|------------|
| **Restricted** | AUTH_SECRET, email server credentials, JWT tokens | Environment variables only, never logged |
| **Confidential** | User emails, financial data (spend columns) | Access-controlled, partially masked in logs |
| **Internal** | Organization names, indicator configs | Role-based access |
| **Public** | Methodology content, app UI text | No restrictions |

## Encryption

- **In transit**: TLS enforced via HSTS header (`max-age=63072000; includeSubDomains; preload`)
- **At rest**: Delegated to PostgreSQL/infrastructure-level encryption
- **Tokens**: SHA256 hashed before storage

## Security Headers

| Header | Value |
|--------|-------|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...` |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` |
