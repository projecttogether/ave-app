# Security best practices review

Reviewed on 2026-10-21 at commit `c5bf68a`. This report supersedes the 2026-09-25 review of commit `e4a9552`, which remains in git history. The [status of previous findings](#status-of-previous-findings) section tracks its six findings.

## Executive summary

No critical or high-severity issue was found. The authentication fixes from the previous review hold, the tenant-isolation suite passes, and no SQL injection, stored XSS, open redirect, or cross-organization data access through normal reads was found.

Four medium-severity findings need attention:

- **Server stall:** any signed-in user can block the Node.js event loop for tens of seconds per request. The trend chart's `months` argument is unbounded. A value of 1,000,000 took 31 seconds locally with an empty database.
- **Benchmark leak:** the benchmark's five-organization rule can be bypassed by subtracting results for different reporting granularities. This can expose another organization's exact annual food-waste total.
- **Account takeover by admins:** a regular admin can take over other accounts by changing their login email. The change is not audited, and a passkey added this way still works after the admin loses admin access.
- **Secret rotation gap:** rotating `AUTH_SECRET`, the documented incident response, leaves the previous database logins usable.

Twelve low-severity findings cover account enumeration, error disclosure, audit gaps, the open Sentry relay, logging, and hygiene. The local CI gate currently fails because of a high-severity advisory in a development-only dependency.

| ID | Severity | Finding | Recommended urgency |
| --- | --- | --- | --- |
| 1 | Medium | Unbounded trend range blocks the server | Fix first; small change |
| 2 | Medium | Benchmark suppression bypass through granularity differencing | Fix before more organizations adopt quarterly reporting |
| 3 | Medium | Admin email change enables silent account takeover | Fix with finding 6 |
| 4 | Medium | `AUTH_SECRET` rotation leaves old database logins active | Update runbook now; automate later |
| 5 | Low | WebAuthn options endpoint enumerates accounts | Next authentication change |
| 6 | Low | Admin actions have gaps in super-admin protection, validation, and auditing | With finding 3 |
| 7 | Low | Impersonated actions are attributed to the target user | Next audit-log change |
| 8 | Low | Server Actions return raw SQL and parameters to the browser | Next maintenance window |
| 9 | Low | Personal data in application logs and Sentry exception text | With finding 8 |
| 10 | Low | Local CI dependency gate fails on a dev-only advisory | Prompt; blocks `ci:local` |
| 11 | Low | `/monitoring` relays envelopes to any Sentry project | Scheduled hardening |
| 12 | Low | OTP guess handling still allows targeted login denial | Next authentication change |
| 13 | Low | Food-waste baseline can change after a year is frozen | Product decision required |
| 14 | Low | Questionnaire answers and passkey names lack runtime bounds | Next form change |
| 15 | Low | Local tool permissions, a dev log, and code-generation scripts are committed | Housekeeping |
| 16 | Low | Runtime image lets the app user rewrite its own code | Next Dockerfile change |

## Remediation status

All sixteen findings were fixed on 2026-10-21, one commit per finding or related pair. The findings below describe the code as reviewed at `c5bf68a`.

| ID | Fix | Commit |
| --- | --- | --- |
| 1 | Validate slug, 1–36 month range and mode; refuse oversized ranges in the trend calculation | `d73a38d` |
| 2 | One canonical cohort for every benchmark granularity; raw global food-waste total no longer released | `6b56e24` |
| 3 | Email changes end sessions, remove passkeys, are audited as critical and notify the old address; only super admins change another administrator's email; migration 0042 mirrors the rules in the database | `e3890f0` |
| 4 | `PREVIOUS_AUTH_SECRET` disables exactly the logins derived from a leaked secret; runbook updated | `7b1e2ef` |
| 5 | Login options never resolve emails; new passkeys are resident keys | `4ec5bb1` |
| 6 | Shared protected-account guard, validation and auditing for admin actions; content keys allowlisted; links validated on read | `e3890f0` |
| 7 | Audit entries record `impersonatedBy`; passkey and session self-service blocked while impersonating | `aaf6611` |
| 8 | Database errors mapped to fixed messages before leaving Server Actions | `6437944` |
| 9 | Masked logger metadata, query-free error summaries, Sentry `beforeSend` scrubbing | `6437944` |
| 10 | vitest 4.1.12 with vite 8.3.5; `npm audit --audit-level=high` passes | `7b02dae` |
| 11 | Proxy accepts `/monitoring` only for this app's org, project and region, POST up to 1 MB | `fa56ca5` |
| 12 | Codes bound to the requesting browser; per-flow guess limits; 20 codes per address per day | `c16e71f`, `539762c` |
| 13 | Report archived at freeze time is authoritative; trigger in 0043 blocks later archives for frozen years | `d1b5392` |
| 14 | Questionnaire answers validated against question definitions; passkey names bounded | `8eb6870` |
| 15 | Local agent permissions and dev log untracked; unused code generators removed | `2bc346f` |
| 16 | Application files owned by root, only `.next/cache` writable; Node-based health check without curl | `79b469c` |

Known limits after these fixes:

- Revision history written by database triggers still names the impersonated user; the audit log names the super admin.
- Older non-discoverable security-key passkeys cannot be selected at login and must be registered again.
- Per-address code request limits still let a sender delay a user's next login code; passkeys remain available.
- The benchmark suppression does not protect against comparing the same metric across years.

## Scope and validation

The application is a TypeScript Next.js 16.4.2 App Router application using Server Actions and React 19.3.0, as shown in [package.json](package.json#L47). Authentication uses Auth.js 5.0.0-beta.32 (`@auth/core` 0.41.3) with JWT sessions, email OTP, and WebAuthn ([src/auth.ts](src/auth.ts#L37)). Data is stored in PostgreSQL 15 through Drizzle ORM 0.45.3 with row-level security ([docs/tenant-isolation.md](docs/tenant-isolation.md)). The app runs as a standalone Docker image on Coolify ([Dockerfile](Dockerfile#L55)) and reports errors to Sentry 11.

The review applied the skill's Next.js server, React frontend, and general browser JavaScript guidance. The skill has no dedicated Auth.js or PostgreSQL reference. Those parts rely on the installed library source, the project's security documentation, and local tests.

Validation completed:

- **Install:** `npm ci --ignore-scripts` installed the locked dependencies without changing tracked files.
- **Unit tests:** `npx vitest run` passed 611 tests, with 64 skipped.
- **Isolation tests:** `npm run test:isolation` built the production application and passed all 98 integration tests against a disposable PostgreSQL 15 container.
- **WebAuthn reproduction (finding 5):** a temporary test sent requests through the real Auth.js router and WebAuthn provider configuration, with only storage mocked. It confirmed the enumeration oracle. A copy is at `/tmp/ave-security-review-2026-10/webauthn-enumeration.test.ts`.
- **Trend benchmark (finding 1):** a local benchmark of `calculateFoodWasteTrend` with no records measured:

  | Months | Time | Heap |
  | --- | --- | --- |
  | 1,000 | 45 ms | 15 MB |
  | 100,000 | 3.1 s | 70 MB |
  | 1,000,000 | 30.8 s | 603 MB |

  The script is at `/tmp/ave-security-review-2026-10/trend-bench.ts`.
- **Dependency audit:** `npm audit --omit=dev` reports four low advisories. `npm audit --audit-level=high` exits with status 1 because of a high advisory in a development-only package (finding 10).
- **Code review:** all 31 Server Action modules, the three route handlers, `src/proxy.ts`, RLS and `SECURITY DEFINER` migrations, startup credential provisioning, the Dockerfile, and the Sentry configuration.

Temporary test files were removed from the checkout after use.

Outside this review:

- live response headers;
- production data distribution, which determines how exploitable finding 2 is;
- Coolify settings, including whether build secrets are enabled and whether PostgreSQL is reachable from outside the Docker network;
- actual Sentry event contents;
- the Docker deployment test suite.

## Status of previous findings

| Previous ID | Finding | Status |
| --- | --- | --- |
| 1 | Passkey enrollment accepted revoked or inactive cookies | **Fixed.** [requireEnrollmentSession](src/lib/auth/passkey-enrollment.ts#L7) runs before registration options and again before verification ([src/auth.ts](src/auth.ts#L148), lines 148–155). It requires a sign-in within the last 10 minutes and rejects impersonation. The `signIn` callback rebinds the result to the session (lines 46–50). Regression tests cover these cases. |
| 2 | Public OTP request reached Nodemailer's quadratic parser | **Fixed.** The bounded single-mailbox [emailSchema](src/lib/validation.ts#L4) runs before database and mail access. Nodemailer is 10.0.13. |
| 3 | One wrong OTP deleted the valid code | **Fixed for single guesses.** Matching and consumption are atomic ([src/lib/auth/verify-otp.ts](src/lib/auth/verify-otp.ts#L14), lines 14–21). Five wrong guesses still discard the code (finding 12). |
| 4 | Next.js and sharp on affected versions | **Fixed.** The lockfile pins `next@16.4.2` and `sharp@0.35.5`. |
| 5 | Production CSP allowed inline scripts | **Fixed.** [src/proxy.ts](src/proxy.ts#L6) issues a per-request nonce with `'strict-dynamic'` ([src/lib/security/csp.ts](src/lib/security/csp.ts#L4)). |
| 6 | CI lacked a dependency-audit gate | **Fixed, currently failing.** `ci:local` runs `npm audit --audit-level=high`, which now fails (finding 10). |

## Critical severity

No critical finding.

## High severity

No high-severity finding.

## Medium severity

### 1. Unbounded trend range lets any signed-in user stall the server

Rules: `NEXT-INPUT-001`, `NEXT-DOS-001`, `NEXT-ACTION-001`.

Locations:

- [src/app/actions/indicators.ts](src/app/actions/indicators.ts#L309), line 309: `months: number = 12` is never validated. `mode` is not checked at runtime either.
- [src/app/actions/indicators.ts](src/app/actions/indicators.ts#L352), line 352: `new Date(endYear, endMonth - months, 1)` moves the start date back without limit.
- [src/lib/indicators/food-waste.ts](src/lib/indicators/food-waste.ts#L132), lines 132–146: creates one bucket per month, formats each with `toLocaleString`, then filters all records for every bucket.

```ts
export async function getIndicatorTrendData(slug: string, months: number = 12, ...)
// ...
const startDate = new Date(endYear, endMonth - months, 1)
// ...
for (let index = start.year * 12 + start.month - 1; index <= end.year * 12 + end.month - 1; index++) {
```

The action is called from a client component ([src/components/dashboard/indicator-detail-client.tsx](src/components/dashboard/indicator-detail-client.tsx#L64)), so its action ID ships in the browser bundle. Any user who passes `getDataScope` can send `getIndicatorTrendData('food_waste', 1000000)`, including a `basic_user` with one kitchen.

Impact: each request blocks the single-threaded Node.js server for about 30 seconds and allocates about 600 MB, measured with an empty database. Real records add a filter pass per bucket. A few concurrent requests can make the application unavailable to everyone or exhaust the container's memory. No data is exposed.

Fix: validate the arguments at the action boundary. Use `z.number().int().min(1).max(36)` for `months` and `z.enum(['monthly','quarterly'])` for `mode`. Also clamp the range inside `calculateFoodWasteTrend` so other callers cannot reintroduce the problem.

Mitigation: a per-user rate limit on non-admin Server Actions would reduce the impact of similar issues.

### 2. Benchmark small-cohort suppression can be bypassed by comparing granularities

Rules: `NEXT-AUTH-001` (authorization of aggregated data), `NEXT-CACHE-001` (cross-tenant disclosure).

Locations:

- [drizzle/0038_quarterly_statistics.sql](drizzle/0038_quarterly_statistics.sql#L68), line 68: the caller chooses `p_granularity` from `yearly`, `monthly`, `quarterly`, or `auto`.
- [drizzle/0034_generated_indicator_formulas.sql](drizzle/0034_generated_indicator_formulas.sql#L36), lines 36–41: each granularity selects a different set of kitchens.
- [drizzle/0038_quarterly_statistics.sql](drizzle/0038_quarterly_statistics.sql#L107), line 107: releases the raw summed amount whenever that single call has at least five organizations.
- [src/app/actions/comparison.ts](src/app/actions/comparison.ts#L37), lines 37–47: `getComparisonData` is a callable Server Action that returns `benchmark.overview` unfiltered. `overview` includes `food_waste`.

```sql
WHEN 'monthly' THEN reporting_month > 0
WHEN 'quarterly' THEN reporting_month > 0 OR period_kind='quarter'
ELSE reporting_month > 0 OR period_kind='quarter' OR NOT has_monthly
-- ...
stats := stats || jsonb_build_object('food_waste', CASE WHEN fw.contributors >= 5 THEN fw.amount END);
```

A kitchen cannot mix quarterly with monthly or yearly rows in one year. The monthly cohort is therefore a subset of the quarterly cohort, which is a subset of the `auto` cohort. Two cases follow:

- **Quarterly reporters:** `getComparisonData(Y, 'quarterly')` minus `getComparisonData(Y, 'monthly')` gives the exact total for kitchens that report quarterly.
- **Yearly-only reporters:** `auto` minus `quarterly` gives the total for kitchens that report only yearly.

Each call passes the five-organization threshold on its own. The function already avoids releasing matched amounts for this reason (comment at lines 116–117), but the granularity choice reopens the same subtraction attack.

Impact: any member of a participating organization can obtain another organization's exact annual food-waste amount. This happens when that organization is the only one, or the only one besides the attacker's own organization, using a given reporting rhythm. This breaks the five-contributor promise in [docs/tenant-isolation.md](docs/tenant-isolation.md#L9). Quarterly reporting is new, so a single early adopter is a realistic case.

Fix: compute all benchmark outputs over one fixed cohort, whatever granularity is requested, for example complete-year kitchens under a single canonical rule. Alternatively, suppress a value when its cohort differs from another granularity's cohort by fewer than five organizations.

Mitigation: publish averages instead of raw sums, stop publishing kitchen counts (`reportingSubOrganizations`), and consider a dominance rule.

Limits: whether this is exploitable today depends on how many organizations use each reporting rhythm in production. The percentage metrics also vary by cohort, but they are ratios and cannot be inverted directly.

### 3. Admin email change enables silent takeover of other accounts

Rules: `NEXT-AUTH-001`, `NEXT-ACTION-001`, `NEXT-LOG-001` (audit).

Locations:

- [src/app/admin/actions.ts](src/app/admin/actions.ts#L260), lines 260–275: `updateUserEmail` checks `checkAdmin()` and `assertCanManageUsers()`, then writes the new email. It writes no audit entry, revokes no sessions or passkeys, and sends no notice to the old address.
- [src/app/admin/actions.ts](src/app/admin/actions.ts#L71), lines 71–95: regular admins are blocked only from modifying super admins and themselves. Peer admins and all other users can be modified.
- [src/auth.ts](src/auth.ts#L101), lines 101–117: OTP login resolves the account by its current email.
- [src/lib/auth/passkey-enrollment.ts](src/lib/auth/passkey-enrollment.ts#L21), lines 20–24: a fresh, non-impersonated OTP session may enroll a passkey.

```ts
export async function updateUserEmail(userId: string, newEmail: string) {
    const session = await checkAdmin()
    newEmail = emailSchema.parse(newEmail)
    await assertCanManageUsers(session, [userId], {})
    // ...
    await db.update(users).set({ email: newEmail }).where(eq(users.id, userId))
```

Impact: admin A sets user B's email to an address A controls, signs in as B with an OTP, enrolls a passkey, and restores B's email. Nothing in the audit log records the email change. The only trace is an ordinary `auth.login` for B. A keeps passkey access to B's account after A's own admin role is removed. This bypasses the rule that only super admins may impersonate, and that impersonation is logged as critical. It also undermines the attribution of B's actions.

Fix:

- Audit email changes with `warning` or `critical` severity, including old and new addresses.
- On an email change, revoke the target's sessions, remove or require re-confirmation of their passkeys, and notify the old address.
- Restrict email changes on admin accounts to super admins.

Related defense in depth: the database `user` UPDATE policy ([drizzle/0030_tenant_isolation.sql](drizzle/0030_tenant_isolation.sql#L155), line 155) allows any admin to update any row. The `protect_user` trigger does not restrict admins either. The super-admin protection exists only in the application. Migration [0040](drizzle/0040_user_deletion.sql#L123) already mirrors it for deletes (lines 123–129); the UPDATE policy should do the same.

Limits: this requires a malicious or compromised regular admin account.

### 4. Rotating `AUTH_SECRET` leaves the previous database logins active

Rules: `NEXT-SECRETS-001`.

Locations:

- [src/lib/db/startup.ts](src/lib/db/startup.ts#L7), lines 7–19: derives the runtime database login name and password from `AUTH_SECRET` and creates the role without an expiry.
- [docs/tenant-isolation.md](docs/tenant-isolation.md#L23), line 23: "Older generated logins remain until an administrator removes them… Startup never drops existing roles."
- [docs/incident-response.md](docs/incident-response.md#L31), lines 31 and 41: the procedure only says to rotate `AUTH_SECRET` and redeploy.

```ts
const password = createHmac('sha256', secret).update(JSON.stringify(['ave-runtime-v1', database, group])).digest('hex')
const name = `${group}_${createHash('sha256').update(password).digest('hex').slice(0, 24)}`
```

Impact: after an `AUTH_SECRET` leak, the documented response stops forged session cookies but not database access. Anyone holding the old secret can still compute the old `ave_app_*` and `ave_auth_*` credentials. With `ave_app`, they can set `app.user_id` to any account and read every tenant's data through RLS. With `ave_auth`, they can read authentication tables.

Fix: add a step to the incident runbook to run `ALTER ROLE … NOLOGIN` or `DROP ROLE` on logins derived from the old secret once old containers stop. Preferably, have startup disable generated logins that do not match the current derivation after a grace period. Consider deriving database passwords from a dedicated secret rather than `AUTH_SECRET`.

Limits: exploitation requires network access to PostgreSQL. Coolify normally keeps the database on an internal network, but this was not verified. If PostgreSQL is not reachable from outside, treat this as low severity.

## Low severity

### 5. The WebAuthn options endpoint enumerates accounts and their passkeys

Rules: `NEXT-AUTH-001`, `NEXT-DOS-001`.

Locations: [src/auth.ts](src/auth.ts#L137), lines 137–145 (`getUserInfo`); `node_modules/@auth/core/lib/actions/webauthn-options.js:30–44`; `node_modules/@auth/core/lib/utils/webauthn-utils.js:256–272`.

`GET /api/auth/webauthn-options/webauthn?action=authenticate&email=…` resolves the email through `getUserInfo` without a session. The response differs by account state:

- **Existing account:** `allowCredentials` lists the account's credential IDs and transports, or is an empty array if it has no passkeys.
- **Unknown email:** the field is absent.

The temporary test reproduced all three cases. `/api/*` bypasses `src/proxy.ts`, and this endpoint has no rate limit.

Impact: an unauthenticated caller can confirm which email addresses have accounts on this invite-only platform. The OTP request flow deliberately avoids this. The leaked credential IDs do not enable login.

Fix: ignore the email for `action=authenticate` and always return options without `allowCredentials`. Discoverable credentials and the browser's account picker still work, and the login form's passkey button already sends no email when the field is empty. Alternatively, return `null` from `getUserInfo` unless the request is a registration.

### 6. Admin actions have gaps in super-admin protection, validation, and auditing

Rules: `NEXT-AUTH-001`, `NEXT-INPUT-001`.

- **Session revocation:** [src/app/actions/session.ts](src/app/actions/session.ts#L30), lines 30–43. `revokeUserSessions` checks only `isAdmin`. It does not call `assertCanManageUsers`, so a regular admin can sign out super admins. `targetUserId` is not validated.
- **Kitchen memberships:** [src/app/admin/actions.ts](src/app/admin/actions.ts#L311), lines 311–344. `updateUserSubOrganizations` has no UUID or array validation, no super-admin protection, and no audit entry. A database trigger still prevents cross-organization memberships.
- **Unaudited changes:** `updateUserOrganization` (line 181), `updateOrganization` (line 247), and `updateUserEmail` (finding 3) write no audit entry. The `admin.org_update` action type is defined but never used.
- **Content keys:** [src/app/admin/actions/content.ts](src/app/admin/actions/content.ts#L9), lines 9–25. `updateAppContent` accepts any key and value without an allowlist, size limit, or audit entry. Writing `dashboard_links` this way skips the URL validation in `saveDashboardLinks`. [src/app/actions/links.ts](src/app/actions/links.ts#L27) parses the stored value without a schema, so a value such as `{}` breaks the dashboard for every user. React 19 and the nonce-based CSP both block `javascript:` URLs, so this is an integrity and availability issue, not XSS.
- **Audit-log paging:** [src/app/admin/audit/actions.ts](src/app/admin/audit/actions.ts#L41), lines 41–43 and 84. `pageSize` is unbounded and a negative `page` causes a database error. The existing `paginationSchema` is unused.

Fix: call `assertCanManageUsers` in every action that changes another account, validate all arguments with the existing zod schemas, audit organization, membership, and email changes, allowlist content keys, and validate `dashboard_links` when reading it.

### 7. Impersonated actions are attributed to the target user

Rules: `NEXT-LOG-001`.

Locations:

- [src/auth.config.ts](src/auth.config.ts#L44), line 44: `session.user.id` is the impersonated user.
- [src/lib/audit.ts](src/lib/audit.ts#L70), lines 70–91: the audit entry has no real-actor field.
- [src/app/actions/passkeys.ts](src/app/actions/passkeys.ts#L28), lines 28–57: passkey rename and delete do not check for impersonation. Neither does `revokeAllMySessions` in [src/app/actions/session.ts](src/app/actions/session.ts#L13).

During impersonation, audit entries, `app_private.actor_id()`, and revision history all name the target user. A super admin can also delete the target's passkeys or revoke the target's sessions as that user. The stop-impersonation entry ([src/auth.ts](src/auth.ts#L67), lines 67–70) records the admin rather than the user who was impersonated.

Fix: record `realUserId` in audit entries and as a separate transaction setting for database triggers. Block passkey and session self-service while impersonating. Log the target user when impersonation stops.

### 8. Server Actions return raw SQL and parameters to the browser

Rules: `NEXT-ERROR-001`.

Locations:

- [qualitative.ts:222](src/app/actions/qualitative.ts#L222)
- [reflection.ts:301](src/app/actions/reflection.ts#L301)
- [operating-data.ts:56](src/app/actions/operating-data.ts#L56)
- [indicators.ts:132](src/app/actions/indicators.ts#L132) and [indicators.ts:147](src/app/actions/indicators.ts#L147)
- [csv-import.ts:96](src/app/actions/csv-import.ts#L96)

```ts
} catch (err: any) {
    return { error: err.message || 'Ein unerwarteter Fehler ist aufgetreten' }
}
```

Drizzle's `DrizzleQueryError` message contains `Failed query: <SQL>` followed by the bound parameters (`node_modules/drizzle-orm/errors.js:10–13`). Because these handlers return the message as data rather than throwing, Next.js does not redact it. For example, an RLS denial or a malformed ID shows the full statement in the UI.

Impact: exposes schema, table, column and function names, and query structure to signed-in users. The parameters are the caller's own input; no other tenant's data was found in these messages.

Fix: map errors the way [src/lib/operating-data/result.ts](src/lib/operating-data/result.ts) already does. Keep the intentional German validation messages and return a generic message for everything else.

### 9. Personal data in application logs and Sentry exception text

Rules: `NEXT-LOG-001`.

Locations:

- [src/app/actions/auth.ts](src/app/actions/auth.ts#L91), line 91: logs the full email address on mail failure. `src/lib/logger.ts` does not mask fields, unlike `src/lib/audit.ts`.
- [src/app/actions/reflection.ts](src/app/actions/reflection.ts#L300), line 300, and [src/app/actions/dashboard.ts](src/app/actions/dashboard.ts#L189), line 189: log whole Drizzle errors, including bound parameters such as questionnaire answers.
- [src/lib/sentry-options.ts](src/lib/sentry-options.ts#L9): `dataCollection` disables request data, but there is no `beforeSend`. Exception messages that carry SQL parameters are still sent to Sentry.

Fix: mask emails in `logger`, log `error.cause?.code` rather than whole query errors, and add a Sentry `beforeSend` hook that strips `params:` from exception values.

### 10. Local CI dependency gate fails on a dev-only advisory

Rules: `REACT-SUPPLY-001`, `NEXT-SUPPLY-001`.

Locations: [package.json](package.json#L10), lines 10 and 22; `package-lock.json` entry `node_modules/vitest/node_modules/vite` (8.2.2).

`npm audit --audit-level=high` exits with status 1. The cause is a high advisory in the copy of vite nested under vitest, which includes launch-editor command-execution issues GHSA-r825-w8mm-5pxw and GHSA-698v-4r3x-3vcv. Because the audit runs first in `ci:checks`, `npm run ci:local`, which AGENTS.md requires before merging or deploying, fails at the moment. The advisories affect only development tooling. The four low production advisories come from `@simplewebauthn/server` 9.0.3 (GHSA-6hxq-p678-4hr2, attestation trust anchors). They do not apply here because the app uses the default `none` attestation.

Fix: update vitest so the nested vite is outside 8.2.0–8.2.2, and rerun the audit. Plan the `@simplewebauthn/server` upgrade together with Auth.js. Avoid `npm audit fix --force`.

### 11. `/monitoring` relays envelopes to any Sentry project

Rules: `NEXT-SSRF-001` (restricted variant), `NEXT-DOS-001`.

Locations: [next.config.ts](next.config.ts#L63), line 63, `tunnelRoute: "/monitoring"`; [src/proxy.ts](src/proxy.ts#L27), line 27, which excludes `monitoring` from the proxy; `node_modules/@sentry/nextjs/build/cjs/config/withSentryConfig/tunnel.js:19–60`.

The SDK rewrite forwards `/monitoring?o=<digits>&p=<digits>[&r=<region>]` to `https://o<org>.ingest[.<region>].sentry.io/api/<project>/envelope/`. It does not compare the org or project with the app's DSN.

Impact: anyone can relay arbitrary envelopes to any Sentry project through the server, costing egress and attributing traffic to the server's IP. Destinations are limited to `*.sentry.io`, so this is not a general SSRF.

Fix: replace the generated rewrite with a small route handler that accepts only this DSN's org and project and limits the body size. Alternatively, rate-limit `/monitoring` at Traefik.

### 12. OTP guess handling still allows targeted login denial

Rules: `NEXT-AUTH-001`, `NEXT-DOS-001`.

Locations:

- [src/lib/auth/verify-otp.ts](src/lib/auth/verify-otp.ts#L26), lines 26–30: the fifth wrong guess for an email deletes that email's pending code.
- [src/lib/rate-limit.ts](src/lib/rate-limit.ts#L3), lines 3–6: all limiters are in memory, per process.
- [src/lib/rate-limit.ts](src/lib/rate-limit.ts#L23), lines 23–28: 10 verification attempts per email per 15 minutes.

Anyone who knows an address can repeatedly cancel that user's pending codes or exhaust their 15-minute attempt budget. The guess budget renews every 15 minutes with no long-term lockout or alerting. Brute force therefore remains improbable but unbounded over time, about 960 guesses a day against a space of one million. Limits reset on every deploy and multiply if the app is scaled out.

Fix: count failures against an unguessable login-flow identifier bound to the browser that requested the code. Add a longer-window cap or alert on repeated failures per account. Move limiters to a shared store before running more than one instance.

### 13. Food-waste baseline can change after a year is frozen

Rules: `NEXT-AUTH-001` (integrity).

Locations:

- [src/lib/operating-data/write.ts](src/lib/operating-data/write.ts#L38), line 38: the freeze check uses the year the caller supplies.
- [src/lib/operating-data/write.ts](src/lib/operating-data/write.ts#L102), lines 102–106: writes the kitchen-level baseline.
- [drizzle/0037_quarterly_periods.sql](drizzle/0037_quarterly_periods.sql#L245), lines 245–254: `set_operating_baseline` checks write permission but not freezes.
- [src/lib/indicators/food-waste-reader.ts](src/lib/indicators/food-waste-reader.ts#L21), line 21: every year's live figures read the current baseline.

A kitchen writer can save a draft for an unfrozen year with a new baseline. That changes the live food-waste reduction and benchmark for frozen years. They can then archive a new calculation report for the frozen year.

Fix: if frozen years must be immutable, block baseline changes while any year that uses the baseline is frozen, or store baselines per year. If later baseline corrections are intended, document that frozen-year live figures can change and that the snapshot taken at freeze time is authoritative.

### 14. Questionnaire answers and passkey names lack runtime bounds

Rules: `NEXT-INPUT-001`.

Locations:

- [src/app/actions/qualitative.ts](src/app/actions/qualitative.ts#L159), lines 159–182: validates only single-select values against the allowed options. Text length, multi-select values, and value types are not checked.
- [src/app/actions/reflection.ts](src/app/actions/reflection.ts#L248), lines 248–268: performs no value validation.
- [src/app/actions/passkeys.ts](src/app/actions/passkeys.ts#L28), line 28: `renamePasskey` stores `newName` unchecked.

Output is escaped and scoring uses only allowed options, so the impact is oversized or malformed stored data, up to the 1 MB Server Action body limit per request.

Fix: build zod schemas from the question definitions, with length limits on text and passkey names.

### 15. Local tool permissions, a dev log, and code-generation scripts are committed

Rules: `NEXT-SECRETS-001` (hygiene), `REACT-SUPPLY-001`.

Locations:

- [.claude/settings.local.json](.claude/settings.local.json#L14): automatically approves `git push *` (line 14), `python3 -c ' *` (line 31), `rm -rf node_modules package-lock.json` (line 35), and `gh api *` (line 37). The `*.local` pattern in [.gitignore](.gitignore#L43) does not match `settings.local.json`.
- [.dev_server.log](.dev_server.log): a stale `next dev` log containing a LAN IP address.
- [scripts/parse_csv.js](scripts/parse_csv.js) and [scripts/inject.js](scripts/inject.js): one-off code generators that build TypeScript from CSV text with incomplete escaping and use a shared `/tmp` path. Nothing references them.

Impact: every collaborator who runs Claude Code in this repository inherits those automatic approvals. A prompt injection, for example from imported CSV text or PR content, could then run Python or GitHub API calls without a confirmation prompt.

Fix: `git rm --cached` the settings file and the log, add both to `.gitignore`, and delete the unused scripts.

### 16. Runtime image lets the app user rewrite its own code

Rules: `NEXT-DEPLOY-001` (hardening).

Locations: [Dockerfile](Dockerfile#L70), lines 70–75, copy the server, `.next`, migrations and entrypoint with `--chown=nextjs:nodejs`. [Dockerfile](Dockerfile#L59), line 59, installs `curl` only for the health check.

Impact: if a later file-write or code-execution bug appears, the attacker can modify server code and keep access across restarts.

Fix: keep application files owned by root and readable by `nextjs`, give `nextjs` write access only to `.next/cache`, and replace the `curl` health check with `node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"`.

## Informational observations

- **Admin-created accounts never expire:** `createUser` sets `pending` without `invitationExpiresAt` ([src/app/admin/actions.ts](src/app/admin/actions.ts#L371)), so these accounts never expire. Manager invitations expire after seven days.
- **Impersonation switching fails:** `impersonateUser` reads `session.user.realUserRoles`, which the session callback never sets. Switching targets while impersonating therefore fails. It fails closed.
- **Session revocation docs:** [docs/security.md](docs/security.md#L289) and [docs/security-architecture.md](docs/security-architecture.md#L23) say session revocation checks are cached for up to 60 seconds. The code checks on every `auth()` call, which is stricter.
- **Health endpoint:** `/api/health` is unauthenticated and runs one cheap query on the public pool. It is acceptable; consider rate-limiting it at Traefik.
- **HSTS:** `next.config.ts` sends `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. This is recorded as an observation only. Make sure `preload` is intentional, because removing a domain from preload lists is slow.

## Controls that held in this review

- **Authentication:**
  - Every `auth()` call reloads roles and account status from storage.
  - Every `auth()` call also checks revocation against the original sign-in time and enforces an eight-hour absolute lifetime.
  - Session updates from the browser accept only the two impersonation commands, and only for current super admins.
  - Callback URLs are reduced to same-origin paths. Bypass inputs such as `//evil`, `/\evil`, `/.//evil` and `javascript:` all fall back safely.
  - OTP codes are hashed with `AUTH_SECRET`, and matching, expiry and single use happen in one atomic operation.
  - OTP requests do not reveal whether an account exists.
- **Tenant isolation:**
  - All Server Actions use the RLS-scoped `db`, which sets `app.user_id` per transaction with `set_config(..., true)`.
  - Connections with an open or failed transaction are discarded.
  - All 23 tenant tables enable and force RLS.
  - An empty setting resolves to `NULL` and denies access.
  - `SECURITY DEFINER` functions pin `search_path`, revoke `PUBLIC`, and are owned by `NOLOGIN` roles.
  - The privileged connection is limited to migrations and scripts.
  - The 98 isolation tests passed.
- **Injection:** no `sql.raw` in application code, no shell execution, no `eval`, and no request-controlled outbound fetch were found. Role creation uses `format(%I, %L)`.
- **Browser:**
  - The CSP uses per-request nonces with `'strict-dynamic'` and `frame-ancestors 'none'`.
  - The only `dangerouslySetInnerHTML` is the chart's CSS, built from static configuration.
  - All `target="_blank"` links set `rel="noopener noreferrer"`.
  - Browser storage holds only filter and onboarding state.
- **Exports and imports:**
  - `csvEscape` neutralizes formula prefixes on every export path.
  - CSV import is limited to 750 KB and 1,000 rows, uses an HMAC-signed preview bound to the user, and rechecks write permissions on commit.
- **Deployment:**
  - The image runs as a non-root user with `NODE_ENV=production`.
  - The Sentry auth token is a BuildKit secret mount.
  - `.env*` files are excluded from the build context.
  - The migration credential is removed before the web server starts.
  - Sentry request-data collection is disabled.
  - No real credentials were found in tracked files or history.

These results describe the paths exercised and inspected. They do not guarantee that the application has no other vulnerabilities.
