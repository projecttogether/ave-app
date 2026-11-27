# AVE Dashboard -- Comprehensive Security Documentation

For current organization isolation, authentication enforcement, restricted database accounts, and deployment steps, see [Organization isolation](tenant-isolation.md). It supersedes the legacy descriptions of those mechanisms in this reference.

> **Classification:** Internal -- ISO 27001 ISMS Reference Document
>
> **Last updated:** 2026-04-01
>
> **Applicable standard:** ISO/IEC 27001:2022

---

## Table of Contents

1. [Overview](#1-overview)
2. [ISO 27001 Control Mapping](#2-iso-27001-control-mapping)
3. [Authentication](#3-authentication)
4. [Authorization & Access Control](#4-authorization--access-control)
5. [Multi-Tenant Data Isolation](#5-multi-tenant-data-isolation)
6. [Input Validation & Injection Prevention](#6-input-validation--injection-prevention)
7. [Session Management](#7-session-management)
8. [Cryptography & Data Protection](#8-cryptography--data-protection)
9. [Security Headers & Transport Security](#9-security-headers--transport-security)
10. [Audit Logging & Monitoring](#10-audit-logging--monitoring)
11. [Rate Limiting & Abuse Prevention](#11-rate-limiting--abuse-prevention)
12. [Data Classification](#12-data-classification)
13. [Data Retention & Deletion](#13-data-retention--deletion)
14. [GDPR & Privacy Compliance](#14-gdpr--privacy-compliance)
15. [Infrastructure & Deployment Security](#15-infrastructure--deployment-security)
16. [Environment & Secrets Management](#16-environment--secrets-management)
17. [Database Security](#17-database-security)
18. [Secure Development Lifecycle](#18-secure-development-lifecycle)
19. [Dependency Management](#19-dependency-management)
20. [Backup & Business Continuity](#20-backup--business-continuity)
21. [Incident Response](#21-incident-response)
22. [Vulnerability Disclosure](#22-vulnerability-disclosure)
23. [Appendix A -- Database Schema Reference](#appendix-a--database-schema-reference)
24. [Appendix B -- Audit Action Catalogue](#appendix-b--audit-action-catalogue)
25. [Appendix C -- Environment Variable Reference](#appendix-c--environment-variable-reference)
26. [Appendix D -- Key File Inventory](#appendix-d--key-file-inventory)

---

## 1. Overview

The AVE Dashboard is a B2B SaaS web application that tracks Planetary Health Diet implementation metrics for food-service providers (catering, cafeterias). It collects financial and qualitative sustainability data from organisations, computes key performance indicators, and presents benchmarking dashboards.

**Technology stack:**

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.1 (App Router, React 19) |
| Language | TypeScript 5 (strict mode) |
| Database | PostgreSQL 15 |
| ORM | Drizzle ORM 0.44.4 |
| Authentication | Auth.js v5 (NextAuth) |
| Deployment | Docker (Alpine) on a dedicated server, deployed by GitHub Actions ([Deployment](deployment.md)) |
| Validation | Zod 4 |

**Security design principles:**

- Passwordless by default -- no password storage, no credential-stuffing surface.
- Server-side authority -- every mutation runs in a Next.js Server Action with authentication and authorisation checks; the browser never issues direct database calls.
- Defence in depth -- input validation, parameterised queries, RBAC, tenant isolation, rate limiting, audit logging, and security headers form layered controls.
- Least privilege -- six-tier RBAC restricts each user to the minimum data scope required.

---

## 2. ISO 27001 Control Mapping

The table below maps implemented controls to ISO/IEC 27001:2022 Annex A clauses.

| Annex A Control | Title | Implementation | Section |
|-----------------|-------|----------------|---------|
| A.5.1 | Policies for information security | SECURITY.md, this document, incident-response.md | [22](#22-vulnerability-disclosure) |
| A.5.7 | Threat intelligence | Dependabot, npm audit in CI | [19](#19-dependency-management) |
| A.5.23 | Information security for cloud services | Docker hardening, non-root container, env validation | [15](#15-infrastructure--deployment-security) |
| A.5.24 | Information security incident management | Incident response procedure | [21](#21-incident-response) |
| A.5.28 | Collection of evidence | Audit logs with tamper-evident timestamps | [10](#10-audit-logging--monitoring) |
| A.8.1 | User endpoint devices | WebAuthn passkey support (hardware-bound) | [3](#3-authentication) |
| A.8.2 | Privileged access rights | Super-admin gating on impersonation and role assignment | [4](#4-authorization--access-control) |
| A.8.3 | Information access restriction | RBAC, tenant isolation, sub-org membership | [4](#4-authorization--access-control), [5](#5-multi-tenant-data-isolation) |
| A.8.4 | Access to source code | GitHub repository access controls (external) | -- |
| A.8.5 | Secure authentication | Magic links, WebAuthn, session timeout, revocation, deactivation block | [3](#3-authentication), [7](#7-session-management) |
| A.8.6 | Capacity management | Rate limiting on auth and API endpoints | [11](#11-rate-limiting--abuse-prevention) |
| A.8.7 | Protection against malware | Input validation, CSP, file-upload restrictions | [6](#6-input-validation--injection-prevention) |
| A.8.9 | Configuration management | Env validation at startup, poweredByHeader disabled | [16](#16-environment--secrets-management) |
| A.8.10 | Information deletion | Data retention policies, user deletion/anonymisation, GDPR export | [13](#13-data-retention--deletion) |
| A.8.11 | Data masking | Email partial masking, token redaction in audit logs | [10](#10-audit-logging--monitoring) |
| A.8.12 | Data leakage prevention | Tenant isolation checks, server-side query scoping | [5](#5-multi-tenant-data-isolation) |
| A.8.13 | Information backup | Nightly PostgreSQL dumps and Backup app snapshots | [20](#20-backup--business-continuity) |
| A.8.15 | Logging | Persistent audit log table, structured JSON application logs | [10](#10-audit-logging--monitoring) |
| A.8.16 | Monitoring activities | Audit log admin UI, severity classification, health-check endpoint | [10](#10-audit-logging--monitoring) |
| A.8.20 | Networks security | HSTS, TLS enforcement | [9](#9-security-headers--transport-security) |
| A.8.24 | Use of cryptography | SHA-256 token hashing, TLS, AUTH_SECRET >= 32 chars | [8](#8-cryptography--data-protection) |
| A.8.25 | Secure development lifecycle | Vitest tests, CI pipeline, linting, type checking | [18](#18-secure-development-lifecycle) |
| A.8.26 | Application security requirements | CSP, input validation, CSRF, SQL injection prevention | [6](#6-input-validation--injection-prevention), [9](#9-security-headers--transport-security) |
| A.8.28 | Secure coding | Drizzle ORM (parameterised queries), Zod validation, no raw SQL | [6](#6-input-validation--injection-prevention) |

---

## 3. Authentication

### 3.1 Email OTP (Primary Method)

| Property | Value |
|----------|-------|
| Provider | Auth.js `Credentials` provider (`otp`); Nodemailer delivers the code |
| Token generation | Six-digit code generated from cryptographic random bytes |
| Token storage | SHA-256 hash of `code + AUTH_SECRET` in `verificationToken` table, keyed by email and a digest of the requesting browser's flow cookie |
| Browser binding | HttpOnly `__Host-ave-otp-flow` cookie (`ave-otp-flow` over plain HTTP) set when the code is requested |
| Token expiry | 10 minutes |
| Transport | SMTP via Nodemailer (TLS port 587) |
| File | `src/app/actions/auth.ts`, `src/lib/auth/verify-otp.ts`, `src/auth.ts` |

**Flow:**

1. User submits a single email address on `/login`. Raw input is limited to 320 characters before parsing; the normalized address is limited to 255 characters. Address lists, display names, comments and header injection are rejected.
2. Server applies IP and email rate limits, sets the flow cookie and returns the same response for every address. Only after the response does it look up the account, so neither the response nor its timing reveals whether one exists. For an unknown address it stores and sends nothing. Otherwise it generates a code and stores its hash with a 10-minute expiry. The code is bound to the requesting browser through a random flow id in an HttpOnly cookie. A new request from the same browser replaces that browser's earlier code; codes requested from other browsers stay valid.
3. The code is sent via SMTP. Failures go to the log and Sentry; the user can request a new code. Invitations link to `/login`, where recipients request a fresh code.
4. The credentials provider validates the address, code and flow cookie, applies the flow's rate limit, and atomically deletes only an unexpired matching hash for that browser. Incorrect guesses preserve the pending code; the fifth wrong guess in a flow discards that flow's code. Guesses from other browsers neither consume nor discard it. Concurrent correct submissions can succeed only once. An existing account is required before issuing a JWT session.
5. On first login the user's status transitions from `invited` or `pending` to `active`.

### 3.2 WebAuthn / Passkeys (Secondary Method)

| Property | Value |
|----------|-------|
| Provider | Auth.js `WebAuthn` provider with `@simplewebauthn/server` v9.0.3 |
| Relying Party ID | `app.ave-gastro.org` (production), `localhost` (dev) |
| Origin | `https://app.ave-gastro.org` (production), `http://localhost:3000` (dev) |
| User verification | **Required** (`requireUserVerification: true`) |
| Credential storage | `authenticator` table (`credentialID`, `credentialPublicKey`, `counter`) |
| File | `src/auth.ts`, `src/lib/auth/passkey-enrollment.ts` |

Users register passkeys via the Settings page (`/settings`). Passkeys can be named, listed, and deleted. The counter field protects against cloned authenticators.

Login uses discoverable credentials only. The login options endpoint never resolves an email address or lists an account's credentials, so it cannot reveal which addresses have accounts. New passkeys are registered with `residentKey: required`. Older non-discoverable security-key credentials cannot be selected at login; their owners sign in with an email code and register the key again.

Enrollment requires authentication within the last 10 minutes. Both options generation and completion enforce session lifetime, current account status and revocation. Completion also binds the challenge's user to the current session owner and preserves the original authentication timestamp: adding a credential cannot renew the recent-authentication window or absolute session lifetime. Enrollment is denied while impersonating another user. The settings page provides a sign-out and sign-in action when reauthentication is needed; ordinary passkey login remains available without an existing session.

### 3.3 Deactivated User Blocking

When a user's status is `deactivated`, the `signIn` callback in `src/auth.ts` returns `false`, preventing JWT issuance. The attempt is logged as `auth.login_failed` with severity `warning` and reason `deactivated`.

---

## 4. Authorization & Access Control

### 4.1 Role-Based Access Control (RBAC)

Six roles form a hierarchy. Higher roles inherit the access of lower roles.

| Role | Level | Scope | Key Capabilities |
|------|-------|-------|-----------------|
| `super_admin` | 5 | Global | All admin capabilities + user impersonation + assign super_admin role |
| `admin` | 4 | Global or org-scoped | User management, organisation management, data export, content editing, data freeze |
| `org_manager` | 3 | Own organisation | Data management and oversight for all sub-orgs within the assigned organisation |
| `global_view_only` | 2 | All organisations | Read-only access to dashboards and aggregated data across all organisations; no data entry |
| `org_view_only` | 2 | Own organisation | Read-only access to dashboards and aggregated data; no data entry |
| `basic_user` | 1 | Assigned sub-orgs | Data entry for explicitly assigned sub-organisations only |

**Storage:** `roles` table (definitions) + `user_roles` many-to-many join table.

**Enforcement:** Helper functions in `src/lib/roles.ts` (`isAdmin()`, `isSuperAdmin()`, `isOrgManager()`, `isOrgViewOnly()`, `isBasicUser()`) are called at the top of every server action. `isAdmin()` returns `true` for both `admin` and `super_admin`.

### 4.2 Route Protection

| Layer | Mechanism | File |
|-------|-----------|------|
| Proxy | Redirects page requests (`GET`, `HEAD`) without a session cookie to `/login?callbackUrl=…`, except on public paths. The check only reads the cookie | `src/proxy.ts` |
| Page | Layouts and page loaders call `auth()`, which validates the session against storage, and redirect to `/login`. Layouts and pages render in parallel, so both check | `src/app/*/layout.tsx`, page loaders |
| Layout | Admin layout checks `isAdmin()` and redirects to `/dashboard` if false | `src/app/admin/layout.tsx` |
| Server Action | Every mutating action calls `auth()` and verifies roles before proceeding | `src/app/actions/*.ts`, `src/app/admin/actions.ts` |

**Proxy matcher:** `/((?!api|_next/static|_next/image|favicon.ico).*)`

**Public paths:** `/`, `/login`, `/signup`, `/verify`, `/verify-request`, `/error`, `/icon.png` and `/images/*`. Every other page requires a session, so new pages are protected by default.

The proxy passes a handler to Auth.js, which then ignores the `authorized` callback. `src/proxy.ts` therefore redirects itself; `src/auth.config.ts` has no `authorized` callback. Server Actions are not redirected: an action ID works on any path, including public ones, so every action checks the session itself.

### 4.3 Impersonation

Only `super_admin` users can impersonate other users. The impersonation mechanism:

1. Stores the real identity (`realUserId`, `realUserRoles`, `realUserEmail`, `realUserOrgId`) in the JWT token.
2. Replaces the token's active identity with the target user's.
3. Displays a banner indicating impersonation is active.
4. Logged as `admin.impersonate_start` (severity: **critical**) and `admin.impersonate_stop` (severity: info).

**File:** `src/app/actions/impersonate.ts`

---

## 5. Multi-Tenant Data Isolation

### 5.1 Tenant Model

```
Organisation (top-level tenant)
  +-- Sub-Organisation A
  |     +-- Indicator Data (scoped by org + sub-org)
  |     +-- Qualitative Responses (scoped by org + sub-org)
  +-- Sub-Organisation B
  |     +-- ...
  +-- Users
        +-- org_manager (access to all sub-orgs within org)
        +-- basic_user (access only to sub-orgs via membership table)
```

### 5.2 Isolation Enforcement

| Check | Description | File |
|-------|-------------|------|
| `assertSubOrganizationAccess()` | Validates that the requesting user can access the target sub-org for read or write. Basic users must have a `sub_organization_members` record. Org-scoped admins must belong to the parent org. | `src/app/actions/indicators.ts` |
| `assertOrgAccess()` | Validates organisation-level access for qualitative responses. | `src/app/actions/qualitative.ts` |
| CSV import scoping | Sub-org lookup by name is scoped to the importer's `organizationId` to prevent cross-tenant name collision. | `src/app/actions/csv-import.ts` |
| Dashboard queries | All dashboard aggregation queries include `organizationId` and/or `subOrganizationId` filters. | `src/app/actions/dashboard.ts` |

### 5.3 Foreign Key Constraints

All data tables have `NOT NULL` foreign keys to `organizations` and `sub_organizations` with `ON DELETE CASCADE`, ensuring orphaned data cannot exist.

---

## 6. Input Validation & Injection Prevention

### 6.1 Zod Schema Validation

All server actions validate inputs at entry using Zod schemas defined in `src/lib/validation.ts`:

| Schema | Rules |
|--------|-------|
| `emailSchema` | Trimmed, valid email format, max 255 chars |
| `nameSchema` | 1-100 chars, trimmed |
| `uuidSchema` | Valid UUID v4 format |
| `yearSchema` | Integer, 2000-2100 |
| `monthSchema` | Integer, 0-12 (0 = yearly aggregate) |
| `roleSchema` | Enum: `basic_user`, `org_view_only`, `global_view_only`, `org_manager`, `admin`, `super_admin` |
| `rolesArraySchema` | Array of valid roles |
| `organizationNameSchema` | 1-200 chars, trimmed |
| `userStatusSchema` | Enum: `active`, `pending`, `invited`, `deactivated` |
| `csvFileSchema` | Max 5 MB, MIME type in `text/csv`, `application/vnd.ms-excel`, `text/plain`, or empty |

### 6.2 SQL Injection Prevention

All database queries use Drizzle ORM's parameterised query builder. No raw string concatenation is used. Where raw SQL is required (e.g., PostgreSQL functions), Drizzle's `sql` tagged template literal is used, which automatically parameterises interpolated values.

### 6.3 CSRF Protection

Next.js Server Actions include built-in CSRF protection. All state-changing operations are Server Actions, not API routes.

### 6.4 CSV Upload Hardening

| Control | Value |
|---------|-------|
| Maximum file size | 5 MB |
| Allowed MIME types | `text/csv`, `application/vnd.ms-excel`, `text/plain`, empty |
| Maximum row count | 10,000 |
| BOM stripping | Automatic |
| Delimiter detection | Auto-detect comma vs semicolon |
| Row validation | Year range (2000-2100), month (0-12), numeric columns validated |

**File:** `src/app/actions/csv-import.ts`

### 6.5 XSS Prevention

- React's JSX auto-escapes rendered content by default.
- Content-Security-Policy authorizes scripts with a fresh per-response nonce and `strict-dynamic`. Production does not allow `unsafe-inline` or `unsafe-eval` for scripts. Development additionally permits `unsafe-eval` for framework tooling.
- `object-src 'none'` and `base-uri 'self'` further restrict injection vectors.

---

## 7. Session Management

| Property | Value | ISO 27001 Control |
|----------|-------|-------------------|
| Strategy | JWT (stateless) | A.8.5 |
| Absolute timeout | 8 hours from sign-in, enforced using `authenticatedAt`; cookie `maxAge: 28800` | A.8.5 |
| Inactivity timeout | None; idle sessions remain valid until the absolute timeout | A.8.5 |
| Token storage | `httpOnly` cookie (managed by Auth.js) | A.8.5 |
| Session revocation | `revoked_sessions` table; JWT callback checks denylist (cached, max once per 60 seconds) | A.8.5 |
| Logout all devices | User self-service via Settings page; admin can revoke for any user | A.8.5 |

### 7.1 Session lifetime

The JWT callback in `src/auth.config.ts` records `authenticatedAt` on sign-in. The shared check in `src/lib/auth/session-lifetime.ts` rejects the session once eight hours have elapsed, and the callback returns `null` to require re-authentication. Inactivity does not end the session early. Requests and browser session updates do not extend the original deadline. The server and route proxy share the same eight-hour cookie lifetime.

### 7.2 Session Revocation Mechanism

The `revoked_sessions` table stores:
- `userId` -- the user whose sessions are revoked
- `revokedAt` -- timestamp of revocation
- `reason` -- one of `logout_all`, `admin_revoked`, `deactivated`

The JWT callback in `src/auth.ts` checks (at most once per 60 seconds per token) whether a revocation record exists for the token's user with a `revokedAt` timestamp after the token's `iat` (issued-at). If found, the token is invalidated.

**Files:** `src/lib/db/schema.ts` (table), `src/auth.ts` (check), `src/app/actions/session.ts` (actions)

---

## 8. Cryptography & Data Protection

| Purpose | Algorithm / Mechanism | Details |
|---------|----------------------|---------|
| Magic link tokens | SHA-256 | Token hashed with `AUTH_SECRET` as salt before storage |
| AUTH_SECRET | Random bytes | Minimum 32 characters enforced by env validation |
| WebAuthn credentials | ECDSA / RSA (authenticator-dependent) | Public key stored; private key never leaves the authenticator device |
| Transport encryption | TLS 1.2+ | Enforced via HSTS with 2-year max-age |
| Database encryption at rest | Infrastructure-level | Delegated to PostgreSQL / hosting provider disk encryption |
| Sensitive field masking | Custom masking function | Applied automatically in audit log service |

### 8.1 Sensitive Field Masking

The audit logging service (`src/lib/audit.ts`) automatically masks sensitive data before persisting to the database:

- **Redacted fields:** Any key matching `token`, `secret`, `password`, `auth_secret`, `pass`, or `credential` is replaced with `[REDACTED]`.
- **Email masking:** Email values are partially masked as `s****@example.com` (first character + `****` + domain).
- **Recursive:** Masking applies to nested objects within the `details` JSONB column.

---

## 9. Security Headers & Transport Security

`next.config.ts` supplies baseline response headers. For rendered pages, `src/proxy.ts` replaces the script policy with a fresh nonce and forwards it to Next.js rendering. The root layout forces dynamic rendering, and page responses are private and non-cacheable so shared caches cannot reuse nonce-bearing HTML. API and static responses retain a `script-src 'self'` baseline without inline-script permission. The production page policy is shown below:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-<random>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'` | Per-response nonce authorizes framework scripts; blocks framing, external forms, and object embeds |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Enforces HTTPS for 2 years across all subdomains |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking (redundant with CSP `frame-ancestors` but provides backward compatibility) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer information in cross-origin requests |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables access to device sensors |
| `X-DNS-Prefetch-Control` | `off` | Prevents DNS prefetching to external domains |

Additionally, `poweredByHeader: false` removes the `X-Powered-By: Next.js` header.

---

## 10. Audit Logging & Monitoring

### 10.1 Audit Log Table

The `audit_logs` table captures all security-relevant events:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `timestamp` | TIMESTAMP | Event time (server clock, defaultNow) |
| `user_id` | TEXT (FK) | Acting user; set to NULL on user deletion (anonymisation) |
| `action` | TEXT | Event type (see Appendix B for full catalogue) |
| `resource` | TEXT | Target resource identifier (e.g., `user:abc123`) |
| `resource_type` | TEXT | Target resource type (e.g., `user`, `indicatorData`, `organization`) |
| `details` | JSONB | Structured metadata (automatically masked for sensitive fields) |
| `ip_address` | TEXT | Client IP from `x-forwarded-for` or `x-real-ip` header |
| `organization_id` | UUID (FK) | Organisation context |
| `severity` | TEXT | `info`, `warning`, or `critical` |

### 10.2 Instrumented Events

Events are logged across 8 server action files and the auth event handler:

| Category | Actions Logged | Severity |
|----------|---------------|----------|
| Authentication | `auth.login`, `auth.login_failed`, `auth.logout` | info / warning |
| User management | `admin.user_create`, `admin.user_update`, `admin.user_delete`, `admin.user_deactivate`, `admin.user_reactivate` | info / warning / critical |
| Role changes | `admin.role_change` | info |
| Impersonation | `admin.impersonate_start`, `admin.impersonate_stop` | **critical** / info |
| Organisation management | `admin.org_create`, `admin.org_delete` | info / warning |
| Data mutations | `data.create`, `data.update` | info |
| Data imports | `data.csv_import` (summary: imported count, total, error count) | info |
| Data freezes | `data.freeze`, `data.unfreeze` | info / warning |
| Data exports | `data.export` | info |
| Invitations | `admin.invite_sent` | info |
| Authorisation failures | `authz.denied` | **warning** |

### 10.3 Audit Log Admin Interface

Admins and super admins can view and filter audit logs at `/admin/audit`:

- Filter by action type, severity level
- Paginated (50 entries per page)
- Displays timestamp, user email, action, resource, severity, and details
- Read-only; no modification or deletion capability

### 10.4 Structured Application Logging

A lightweight JSON logger (`src/lib/logger.ts`) outputs structured log entries to stdout for Docker log collection:

```json
{
  "timestamp": "2026-04-01T12:00:00.000Z",
  "level": "error",
  "message": "saveIndicatorData failed",
  "service": "ave-dashboard",
  "environment": "production",
  "metadata": { "error": "..." }
}
```

Levels: `info`, `warn`, `error`, `security`.

---

## 11. Rate Limiting & Abuse Prevention

Rate limiting is implemented using `rate-limiter-flexible` with in-memory storage.

| Limiter | Limit | Window | Key | Scope |
|---------|-------|--------|-----|-------|
| `authLimiter` | 10 requests | 15 minutes | Client IP | OTP request/verify server actions |
| `otpEmailLimiter` | 5 requests | 15 minutes | Email address | OTP request (email bombing protection) |
| `otpDailyEmailLimiter` | 20 requests | 24 hours | Email address | OTP request; bounds guessing to 20 codes x 5 guesses per address and day |
| `otpVerifyLimiter` | 10 requests | 15 minutes | Login flow (browser) | OTP verification |
| `otpFailureLimiter` | 5 wrong guesses | 15 minutes | Login flow (browser) | Discards the flow's code after the fifth wrong guess |
| `apiLimiter` | 100 requests | 1 minute | User ID | All admin server actions (via `checkAdmin`) |
| `adminLimiter` | 30 requests | 1 minute | User ID | Email-sending admin actions (invites) |

When rate-limited, the login action returns a user-friendly German error message: *"Zu viele Anmeldeversuche. Bitte versuchen Sie es spaeter erneut."*

**File:** `src/lib/rate-limit.ts`, `src/app/actions/auth.ts`

---

## 12. Data Classification

| Level | Definition | Examples | Handling Requirements |
|-------|-----------|----------|----------------------|
| **Restricted** | Disclosure could cause severe harm. Must never appear in code, logs, or exports. | `AUTH_SECRET`, `EMAIL_SERVER_PASSWORD`, `DATABASE_URL`, JWT tokens, verification tokens | Environment variables only. Never logged. Rotated on suspected compromise. |
| **Confidential** | Subject to GDPR. Access restricted by role. | User email addresses, financial data (spend columns in `indicator_data`), qualitative responses, audit log details | Partially masked in logs. Exportable only via GDPR data-portability action. Anonymised on user deletion. |
| **Internal** | Not publicly accessible but not privacy-sensitive. | Organisation names, sub-organisation names, indicator configurations, data freeze records | Role-based access. Cascade-deleted with parent entity. |
| **Public** | Intentionally accessible. | Methodology content (`app_content`), login/signup pages, health-check endpoint | No access restrictions. |

---

## 13. Data Retention & Deletion

### 13.1 Retention Periods

| Data Type | Retention | Configurable |
|-----------|----------|--------------|
| Audit logs | 2 years (730 days) | `AUDIT_LOG_RETENTION_DAYS` env var |
| Revoked sessions | 30 days | `REVOKED_SESSION_RETENTION_DAYS` env var |
| Verification tokens | 7 days | Built into Auth.js token expiry |
| User data | Until deletion request | -- |
| Indicator data | Until organisation deletion (cascade) | -- |

### 13.2 Automated Cleanup

The `cleanupExpiredData()` function in `src/lib/db/retention.ts` deletes records beyond their retention period. It runs without a signed-in user, and the restricted application account may not delete audit logs, so it requires the administrator connection in `MIGRATION_DATABASE_URL`. It can be run manually or scheduled via cron and exits non-zero on failure:

```bash
MIGRATION_DATABASE_URL=postgresql://... npx tsx scripts/data-retention-cleanup.ts
```

### 13.3 User Deletion Process

When an admin deletes a user (`src/app/admin/actions.ts` `deleteUser`):

1. All active sessions are revoked (insert into `revoked_sessions`).
2. Audit log entries are anonymised (`userId` set to `NULL`; the action/resource/details are preserved).
3. Foreign key references in data tables (`createdBy`, `updatedBy`, `frozenBy`) are set to `NULL`.
4. The user record is deleted; cascade deletes remove accounts, sessions, authenticators, role assignments, sub-org memberships, and revoked sessions.
5. The deletion itself is logged as `admin.user_delete` with severity **critical**.

---

## 14. GDPR & Privacy Compliance

| GDPR Article | Requirement | Implementation |
|--------------|-------------|----------------|
| Art. 5(1)(e) | Storage limitation | Data retention policies with automated cleanup |
| Art. 15 | Right of access | User data export via Settings page ("Meine Daten herunterladen") |
| Art. 17 | Right to erasure | Admin user deletion with anonymisation of audit trail |
| Art. 20 | Data portability | JSON export of all user data (`exportUserData()` server action) |
| Art. 25 | Data protection by design | Passwordless auth, tenant isolation, input validation, field masking |
| Art. 30 | Records of processing | Audit log table with structured metadata |
| Art. 32 | Security of processing | Encryption in transit (TLS/HSTS), access controls (RBAC), logging |
| Art. 33 | Breach notification | Incident response procedure with 72-hour authority notification |

### 14.1 User Data Export

The `exportUserData()` action in `src/app/actions/data-export.ts` collects:
- User profile (name, email, status, creation date, last login)
- Role assignments
- Organisation memberships
- Indicator data created by the user
- Qualitative responses created by the user
- Intake responses created by the user
- Audit log entries referencing the user (up to 1,000)

Available to the user themselves (own data) and to admins (any user). The export is a JSON file download.

---

## 15. Infrastructure & Deployment Security

### 15.1 Docker Container

| Property | Value |
|----------|-------|
| Base image | `node:22-alpine` |
| Build | Multi-stage: `deps` -> `builder` -> `runner` |
| Runtime user | `nextjs` (UID 1001, GID 1001) -- **non-root** |
| OS packages | `apk upgrade --no-cache` applied; only `curl` added (Coolify's health check) |
| Exposed port | 3000 |
| Telemetry | Disabled (`NEXT_TELEMETRY_DISABLED=1`) |
| Health check | Node.js `fetch` of `http://127.0.0.1:3000/api/health` (30s interval, 5s timeout, 120s start period, 3 retries); Coolify replaces it with `curl` against `localhost` |
| Startup | `node docker-entrypoint.mjs` (migrations and restricted account setup run before app) |
| `X-Powered-By` | Removed (`poweredByHeader: false`) |

### 15.2 Health Check Endpoint

`GET /api/health` performs a live database connectivity check (`SELECT 1`):
- **200 OK:** `{"status":"ok"}` -- database reachable
- **503 Service Unavailable:** `{"status":"error","detail":"database unreachable"}` -- database unreachable

**File:** `src/app/api/health/route.ts`

### 15.3 Automated Migrations

Database migrations run automatically through `scripts/docker-entrypoint.mjs` and `src/lib/db/startup.ts`. Startup applies migrations, prepares restricted database accounts, verifies isolation, and replaces the setup process with the web server. Administrator credentials are removed from the web process environment. See [Organization isolation](tenant-isolation.md) for the container credential boundary and managed-account setup.

---

## 16. Environment & Secrets Management

### 16.1 Startup Validation

The `validateEnv()` function in `src/lib/env.ts` validates all required environment variables using Zod when the application starts. In production, missing or invalid variables cause a startup failure.

| Variable | Required | Validation | Purpose |
|----------|----------|-----------|---------|
| `DATABASE_URL` | Yes | Non-empty string | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Minimum 32 characters | JWT signing and token hashing |
| `AUTH_URL` | No | Valid URL | Public app URL for auth callbacks |
| `AUTH_TRUST_HOST` | No | String | Trust proxy headers (Coolify/Traefik) |
| `EMAIL_SERVER_HOST` | Yes | Non-empty string | SMTP server hostname |
| `EMAIL_SERVER_PORT` | Yes | Numeric string | SMTP port |
| `EMAIL_SERVER_USER` | Yes | Non-empty string | SMTP username |
| `EMAIL_SERVER_PASSWORD` | Yes | Non-empty string | SMTP password |
| `EMAIL_FROM` | Yes | Non-empty string | Sender email address |
| `NODE_ENV` | No | `development`, `production`, or `test` | Runtime environment |

### 16.2 Secret Handling Rules

- All secrets are stored as environment variables; none are hardcoded.
- `.env*` files are in `.gitignore`.
- The `AUTH_SECRET` fallback to empty string has been removed; a missing secret causes an explicit error.
- Secrets are never logged (redacted by audit log masking and excluded from structured logger metadata).

---

## 17. Database Security

### 17.1 Query Safety

All queries are constructed via Drizzle ORM's type-safe query builder, which generates parameterised SQL. The `sql` tagged template literal is used for custom queries, which also parameterises interpolated values.

**No raw SQL string concatenation exists in the codebase.**

### 17.2 Schema Integrity

- **Foreign keys** enforce referential integrity across all tables.
- **Cascade deletes** on user, organisation, and sub-organisation ensure consistent cleanup.
- **Unique constraints** prevent duplicate records (e.g., `indicator_data` is unique per org + sub-org + year + month).
- **`SET NULL` on delete** for audit logs and data reference columns preserves history while allowing user deletion.

### 17.3 Connection Management

The PostgreSQL connection pool (`pg.Pool`) is:
- Cached globally in development to survive HMR.
- Created fresh per deployment in production.
- Configured via `DATABASE_URL` environment variable.

**File:** `src/lib/db/index.ts`

---

## 18. Secure Development Lifecycle

### 18.1 Testing

| Framework | Configuration | File |
|-----------|--------------|------|
| Vitest | Node environment, `@/` path alias | `vitest.config.ts` |

**Test suites:**

| Suite | Tests | Coverage |
|-------|-------|----------|
| `src/__tests__/lib/roles.test.ts` | 10 | All role helper functions with valid, invalid, empty, and multi-role inputs |
| `src/__tests__/lib/validation.test.ts` | 31 | All Zod schemas: valid/invalid inputs, edge cases, boundary values |
| `src/__tests__/lib/logger.test.ts` | 5 | JSON output structure, level routing, metadata handling |
| **Total** | **50** | |

### 18.2 CI/CD Pipeline

The GitHub Actions [CI workflow](../.github/workflows/ci.yml) runs on pull
requests, pushes to `main`, and on demand. Its four jobs run in parallel with a
read-only repository token and no application secrets:

1. **Dependency audit** -- `npm audit --audit-level=high` against the lockfile.
2. **Checks** -- `npm ci`, generated SQL check, type checking, lint, unit tests, and RSC response cancellation.
3. **Database tests** -- SQL parity and migration tests, then tenant isolation and HTTP authentication tests against a production build. Each suite uses a disposable PostgreSQL 15 container.
4. **Docker deployment** -- Builds the production image and verifies automatic setup, restart, and failed migrations on an internal Docker network.

A repository ruleset on `main` requires all four checks before merging;
administrators can bypass it. The repository allows only GitHub-owned actions,
pinned to full commit SHAs. See the [README](../README.md#cicd) to reproduce CI
locally.

### 18.3 Code Quality

- TypeScript strict mode enabled.
- ESLint with `next/core-web-vitals` and `next/typescript` rulesets.
- Server actions marked with `'use server'` directive; all mutations are server-side only.

---

## 19. Dependency Management

### 19.1 Security-Relevant Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@auth/core` | ^0.41.3 | Authentication framework core |
| `@auth/drizzle-adapter` | ^1.11.3 | Auth.js database adapter |
| `next-auth` | ^5.0.0-beta.32 | Next.js authentication integration |
| `@simplewebauthn/browser` | ^9.0.1 | WebAuthn client-side |
| `@simplewebauthn/server` | ^9.0.3 | WebAuthn server-side verification |
| `drizzle-orm` | ^0.45.2 | Type-safe ORM (SQL injection prevention) |
| `pg` | ^8.16.3 | PostgreSQL driver |
| `zod` | ^4.3.6 | Runtime input validation |
| `rate-limiter-flexible` | ^11.2.0 | Rate limiting |
| `nodemailer` | ^10.0.13 | Email delivery |
| `next` | 16.3.6 | Framework (CSP, CSRF, server actions) |

### 19.2 Automated Vulnerability Scanning

- **Dependabot** (`.github/dependabot.yml`): Checks for npm dependency updates weekly, opening up to 10 PRs at a time, and updates the pinned GitHub Actions weekly.
- **npm audit**: The `Dependency audit` CI job runs `npm run audit` on every pull request and push to `main`, failing on high or critical findings in the complete dependency tree. The `main` ruleset requires it before merging.
- **Lock file**: `package-lock.json` ensures deterministic dependency resolution.

Auth.js currently declares a Nodemailer 7/8 peer range. The explicit `package.json` overrides select patched Nodemailer 10 for both Auth.js packages. The app uses its own SMTP delivery calls, not Auth.js's email provider. Compatibility checks cover OTP and invitation message construction, authentication, and clean installation. Remove these overrides when upstream accepts a patched version.

As of 2026-09-30, two advisory families remain below the CI threshold (eight reported nodes include dependent packages):

- [GHSA-6hxq-p678-4hr2](https://github.com/advisories/GHSA-6hxq-p678-4hr2), low: Auth.js requires SimpleWebAuthn 9, while the attestation trust-anchor fix requires a newer major API. The app uses the default `none` attestation preference and does not use attestation certificate trust to authorize devices. Upgrade when Auth.js supports the fixed API; do not interpret registration as proof of a trusted device manufacturer.
- [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), moderate: Drizzle Kit's legacy loader retains an affected esbuild development server. Drizzle Kit is a development dependency; the app and deployment scripts do not run that server. Revisit when Drizzle removes the legacy loader. Do not run the affected development server against untrusted websites.

---

## 20. Backup & Business Continuity

### 20.1 Backup Strategy

| Asset | Method | Frequency | Retention |
|-------|--------|-----------|-----------|
| PostgreSQL database | `pg_dump` on the server | Daily at 00:15 UTC | 14 days |
| PostgreSQL database | ProjectTogether Backup app (encrypted, off-server) | Daily | Set in the Backup app |
| PostgreSQL WAL | WAL archiving (not set up) | Continuous | - |
| Application code | Git (GitHub) | Every commit | Indefinite |
| Settings | GitHub environment `production`; server settings in pt-infra (Ansible Vault) | On change | Current version |

### 20.2 Recovery Objectives

| Metric | Target |
|--------|--------|
| Recovery Time Objective (RTO) | 4 hours |
| Recovery Point Objective (RPO) | 24 hours (daily backups) or minutes (with WAL archiving) |

### 20.3 Recovery Procedures

**Database recovery:** create the group roles, then restore the dump as the
superuser (`docs/backup-recovery.md`, "Roles first"). Verify `GET /api/health`
returns 200 OK.

**Full application recovery:**
1. Set up a new server with pt-infra's `playbooks/ave-app.yml`.
2. Restore the database from backup (roles first).
3. Point the GitHub environments `production` and `staging` to the new server and run Deploy on the tag of the latest release.
4. Point `app.ave-gastro.org` to the server; run the playbook again for HTTPS.
5. Verify health check, audit log recency, and sample user login.

See `docs/backup-recovery.md` for detailed procedures including manual `pg_dump` / `pg_restore` commands.

---

## 21. Incident Response

### 21.1 Severity Classification

| Severity | Criteria | Response Time |
|----------|----------|---------------|
| **Critical** | Active data breach, production compromise, credential leak | Immediate (within 1 hour) |
| **High** | Actively exploited vulnerability, admin account compromise | Within 4 hours |
| **Medium** | Vulnerability discovered (not exploited), suspicious patterns | Within 24 hours |
| **Low** | Minor misconfiguration, informational findings | Within 1 week |

### 21.2 Detection Sources

- Audit log analysis (Admin > Audit Log)
- Structured application logs (Docker / Coolify log aggregation)
- External reports via `it@projecttogether.org`
- Dependabot / npm audit alerts

### 21.3 Key Indicators to Monitor

- Repeated `auth.login_failed` from the same IP address
- `authz.denied` events from authenticated users
- `admin.impersonate_start` events (always severity critical)
- Unusual volumes of `data.csv_import` or `data.export`

### 21.4 Response Steps

1. **Contain:** Revoke affected sessions via `revokeUserSessions()` or admin panel.
2. **Deactivate:** Set compromised accounts to `deactivated` status.
3. **Isolate:** Rotate `AUTH_SECRET` and redeploy if infrastructure is compromised.
4. **Investigate:** Query audit logs, review structured logs, check for cross-tenant access.
5. **Recover:** Reset credentials, re-enable accounts, deploy patches.
6. **Notify:** Supervisory authority within 72 hours (GDPR Art. 33), affected users without undue delay.
7. **Review:** Root cause analysis within 1 week; update controls as needed.

See `docs/incident-response.md` for the full procedure.

---

## 22. Vulnerability Disclosure

**Responsible disclosure policy** (also published as `SECURITY.md` in the repository root):

- Contact: `it@projecttogether.org`
- Do **not** file a public issue.
- Acknowledgement within 48 hours.
- Resolution timeline within 5 business days.

Include in reports: description, reproduction steps, potential impact, and (optionally) suggested fixes.

---

## Appendix A -- Database Schema Reference

### Auth Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `user` | `id` (PK, text), `email` (unique), `organizationId` (FK), `status`, `lastLogin`, `createdAt` | Status enum: `active`, `pending`, `invited`, `deactivated` |
| `account` | `userId` (FK), `provider` + `providerAccountId` (compound PK) | OAuth provider accounts |
| `session` | `sessionToken` (PK), `userId` (FK), `expires` | JWT session records |
| `verificationToken` | `identifier` + `token` (compound PK), `expires` | Magic link tokens (hashed) |
| `authenticator` | `userId` + `credentialID` (compound PK), `credentialPublicKey`, `counter` | WebAuthn credentials |

### Application Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `roles` | `id` (PK, text) | Static: `basic_user`, `org_view_only`, `global_view_only`, `org_manager`, `admin`, `super_admin` |
| `user_roles` | `userId` + `roleId` (compound PK) | Many-to-many role assignments |
| `organizations` | `id` (PK, UUID), `name`, `type` | Top-level tenants |
| `sub_organizations` | `id` (PK, UUID), `organizationId` (FK), `name`, `foodWasteBaseDate`, `foodWasteBaseAmount` | Child tenants |
| `sub_organization_members` | `userId` + `subOrganizationId` (compound PK) | Basic user sub-org access |
| `indicator_data` | `id` (PK, UUID), `organizationId`, `subOrganizationId`, `reportingYear`, `reportingMonth`, 15+ spend columns, `createdBy`, `updatedBy` | Unique on org + sub-org + year + month |
| `qualitative_responses` | `id` (PK, UUID), `organizationId`, `subOrganizationId`, `indicatorSlug`, `reportingYear`, `questionKey`, response fields | Unique on org + sub-org + slug + year + key |
| `intake_responses` | `id` (PK, UUID), `organizationId`, `indicatorSlug`, `questionKey`, response fields | Unique on org + slug + key |
| `app_content` | `key` (PK), `value`, `updatedBy`, `updatedAt` | CMS content |
| `data_freezes` | `id` (PK, UUID), `year` (unique), `frozenAt`, `frozenBy` | Year-level data locks |

### Security Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `revoked_sessions` | `id` (PK, UUID), `userId` (FK, cascade), `revokedAt`, `reason` | Session revocation denylist; reason: `logout_all`, `admin_revoked`, `deactivated` |
| `audit_logs` | `id` (PK, UUID), `timestamp`, `userId` (FK, set null), `action`, `resource`, `resourceType`, `details` (JSONB), `ipAddress`, `organizationId` (FK, set null), `severity` | Comprehensive audit trail |

---

## Appendix B -- Audit Action Catalogue

| Action | Category | Severity | Trigger |
|--------|----------|----------|---------|
| `auth.login` | Authentication | info | Successful sign-in event |
| `auth.login_failed` | Authentication | warning | Failed sign-in (AuthError or deactivated user) |
| `auth.logout` | Authentication | info | User logout or session revocation |
| `admin.user_create` | User Management | info | `createUser()` |
| `admin.user_update` | User Management | info | `updateUser()`, `bulkUpdateUsers()` |
| `admin.user_delete` | User Management | **critical** | `deleteUser()` |
| `admin.user_deactivate` | User Management | warning | `deactivateUser()` |
| `admin.user_reactivate` | User Management | info | `activateUser()` |
| `admin.role_change` | Access Control | info | `updateUserRolesArray()` |
| `admin.impersonate_start` | Access Control | **critical** | `impersonateUser()` |
| `admin.impersonate_stop` | Access Control | info | `stopImpersonating()` |
| `admin.org_create` | Organisation Mgmt | info | `createOrganization()` |
| `admin.org_delete` | Organisation Mgmt | warning | `deleteOrganization()` |
| `admin.invite_sent` | User Management | info | `sendInviteEmail()` |
| `data.create` | Data Operations | info | `saveIndicatorData()` (insert) |
| `data.update` | Data Operations | info | `saveIndicatorData()` (update), `saveAllQualitativeResponses()` |
| `data.csv_import` | Data Operations | info | `importIndicatorCsv()` |
| `data.freeze` | Data Operations | info | `freezeYear()` |
| `data.unfreeze` | Data Operations | warning | `unfreezeYear()` |
| `data.export` | Data Operations | info | `exportUserData()` |

---

## Appendix C -- Environment Variable Reference

| Variable | Required | Default | Validation | Purpose |
|----------|----------|---------|-----------|---------|
| `DATABASE_URL` | Yes | -- | Non-empty string | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | -- | Min 32 characters | JWT signing, token hashing |
| `AUTH_URL` | No | -- | Valid URL | Auth callback base URL |
| `AUTH_TRUST_HOST` | No | -- | String | Trust proxy headers |
| `EMAIL_SERVER_HOST` | Yes | -- | Non-empty | SMTP host |
| `EMAIL_SERVER_PORT` | Yes | -- | Numeric | SMTP port |
| `EMAIL_SERVER_USER` | Yes | -- | Non-empty | SMTP username |
| `EMAIL_SERVER_PASSWORD` | Yes | -- | Non-empty | SMTP password |
| `EMAIL_FROM` | Yes | -- | Non-empty | Sender address |
| `NODE_ENV` | No | `development` | Enum | Runtime mode |
| `AUDIT_LOG_RETENTION_DAYS` | No | `730` | Number | Audit log retention (days) |
| `REVOKED_SESSION_RETENTION_DAYS` | No | `30` | Number | Revoked session retention (days) |
| `NEXT_TELEMETRY_DISABLED` | No | `1` (Docker) | -- | Disable Next.js telemetry |

---

## Appendix D -- Key File Inventory

| File | Security Relevance |
|------|-------------------|
| `src/auth.ts` | Auth provider config, session timeout, deactivation block, WebAuthn verification, audit logging, revocation check |
| `src/auth.config.ts` | Route protection, JWT callback, shared session configuration, impersonation token handling |
| `src/lib/auth/session-lifetime.ts` | Eight-hour absolute session lifetime check shared by session reads and passkey enrollment |
| `src/proxy.ts` | Edge proxy: route protection matcher |
| `src/lib/db/schema.ts` | Database schema including `audit_logs` and `revoked_sessions` tables |
| `src/lib/audit.ts` | Audit logging service with sensitive field masking |
| `src/lib/rate-limit.ts` | Rate limiting configuration (auth, API, admin) |
| `src/lib/validation.ts` | Zod input validation schemas |
| `src/lib/env.ts` | Environment variable validation at startup |
| `src/lib/logger.ts` | Structured JSON logging |
| `src/lib/roles.ts` | RBAC helper functions |
| `src/lib/db/retention.ts` | Data retention cleanup policies |
| `src/app/actions/auth.ts` | Login/logout with rate limiting and audit logging |
| `src/app/actions/session.ts` | Session revocation actions |
| `src/app/actions/impersonate.ts` | Admin impersonation with critical audit logging |
| `src/app/actions/data-export.ts` | GDPR user data export |
| `src/app/admin/actions.ts` | Admin mutations with validation and audit logging |
| `src/app/admin/audit/` | Audit log viewer (admin and super_admin) |
| `next.config.ts` | Security headers, poweredByHeader removal |
| `Dockerfile` | Non-root user, health check, Alpine base, apk upgrade |
| `.github/workflows/ci.yml` | CI pipeline: audit, formula checks, lint, typecheck, tests, build, deployment checks |
| `.github/dependabot.yml` | Automated dependency vulnerability scanning |
| `SECURITY.md` | Vulnerability disclosure policy |
