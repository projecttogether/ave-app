# Organization isolation

Application queries use `src/lib/db/index.ts`. The database module obtains identity from Auth.js and sets user ID and optional dashboard filters with transaction-local PostgreSQL settings. Every query runs in a transaction, including queries that omit an organization predicate. Drizzle transactions keep the same identity through commit, rollback, and savepoints. `withDataScope` awaits lazy queries inside their request context.

PostgreSQL policies derive roles, organization, and sub-organization membership from stored records. Missing identity or membership denies tenant data access. Application roles have no schema ownership, superuser, or RLS bypass privileges. Startup validates these restrictions and the isolation migration. Browser filters cannot establish identity or grant permissions. The settings protect against missing application filters; they are not a substitute for preventing arbitrary SQL execution or protecting server credentials.

Admins and super admins can select an organization on the dashboard and indicators pages, including when their account has a home organization. Organization selection does not change their account assignment or impersonate a user. Organization managers and viewers remain in their organization; basic users see their assigned sub-organizations. The existing global viewer remains read-only and does not receive the new organization selector. Data-entry permissions remain subject to each action's existing checks as well as database policies.

`get_dashboard_stats` and `get_org_percentiles` run as the caller and obey RLS. Global comparisons use `get_benchmark_stats`, whose only inputs are year and granularity. Its NOLOGIN owner can read the source tables, but the function returns only approved aggregates. Each published metric requires five contributing organizations. The contributing cohort is the same for every requested granularity: each kitchen's complete year in its own reporting rhythm. Granularity-specific cohorts would let callers subtract two released results and isolate fewer than five organizations. Raw global food-waste totals are not published; comparisons use the matched reduction. Missing metrics stay absent in the comparison chart. This suppression reduces small-cohort disclosure; it does not claim formal differential privacy against repeated observations over time. Questionnaire scoring metadata is versioned in migration 0031 and must be updated with the scoring questions.

Authentication has a separate database account with access to auth tables and audit insertion, but no access to tenant metrics or benchmark execution. OTPs are checked and consumed inside the credentials provider. Session updates cannot set identity or roles; impersonation requires a current super-admin assignment and loads the target from the database. Roles and account status are refreshed from storage. Revocation uses the original authentication time, independent of JWT renewal.

Organization team management uses `app_private.create_org_invitation` and `app_private.manage_org_member`, owned by the separate `ave_team` NOLOGIN role. Never grant this role to a login. The functions derive the manager's organization from storage, protect privileged accounts, and commit account creation, kitchen assignments, revocations, and audit records together. Managers still cannot write user accounts or roles directly. Role changes lock the associated account to serialize promotions with team operations. Existing membership endpoints share the protected-account restriction.

Migration 0036 normalizes email addresses and enforces global uniqueness. It stops on legacy normalized-email collisions; resolve those explicitly without merging accounts or transferring organizations automatically. Invitations reserve the email immediately and expire after seven days until verified sign-in. Cancelled accounts remain reserved and disabled. See the root `SECURITY.md` for the invitation and identity decisions.

## Deployment

Docker runs migrations and provisions the restricted accounts automatically before starting the web server. Existing Coolify deployments can keep their administrator `DATABASE_URL` and existing `AUTH_SECRET`. Leave `AUTH_DATABASE_URL` unset to use automatic account setup. The initial migration requires an administrator connection that can create roles and change ownership.

The startup process applies migrations, creates one login with only `ave_app` membership and another with only `ave_auth` membership, and checks the resulting permissions. It then replaces itself with Next.js, passing those restricted connection strings. `MIGRATION_DATABASE_URL` and PostgreSQL credential overrides are removed from the web process environment. A failed migration or permission check prevents web startup.

Generated passwords use HMAC-SHA-256 with `AUTH_SECRET` and a context containing the database name and role purpose. Login names include a hash of the derived password. Repeated deployments reuse the same accounts without resetting passwords. Rotating `AUTH_SECRET` creates new accounts so the previous container can keep working during a rolling deployment. Older generated logins remain until an administrator removes them after all old containers have stopped. Startup never drops existing roles. After a leak, set `PREVIOUS_AUTH_SECRET` to the old value for one deployment: startup then disables the two logins derived from it and ends their sessions (see `docs/incident-response.md`).

Automatic migrations require the administrator credential in the container's deployment configuration. The web process receives only restricted database credentials, but this is not a separate-container credential boundary: operators with access to Docker configuration can still retrieve the configured administrator connection. If a separate migration container is required, run `node migrate-bundle.cjs` with `MIGRATION_DATABASE_URL`, provision the runtime logins, and explicitly start the web container with `node server.js` and only the restricted credentials.

### Existing managed database accounts

To retain manually provisioned accounts while running automatic migrations, configure all three connections:

- `MIGRATION_DATABASE_URL`: administrator connection used during startup.
- `DATABASE_URL`: restricted app login with only `ave_app` membership.
- `AUTH_DATABASE_URL`: restricted authentication login with only `ave_auth` membership.

Both runtime connections must use the migrated database. Startup verifies their permissions and does not change their passwords. Never grant `ave_policy` to a login.

Local `npm run dev` and `npm start` run Next.js directly. For local development, run `npm run db:migrate` with `MIGRATION_DATABASE_URL`, then create the restricted logins and set their passwords through psql's hidden prompts:

```sql
CREATE ROLE ave_web LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE ave_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT ave_app TO ave_web;
GRANT ave_auth TO ave_login;
\password ave_web
\password ave_login
```

Set local `DATABASE_URL` and `AUTH_DATABASE_URL` to these accounts. `npm run db:seed -- email@example.org super_admin` uses the migration credential to provision the first account.

The isolation migration rejects records whose organization does not match their sub-organization, or memberships assigned across organizations. Repair those records explicitly; it does not discard them. Keep backups and test migrations against restored data before production rollout. Do not disable RLS or give the web account owner privileges to make startup pass.

## Verification and maintenance

- `npm run test:run` runs unit tests, including browser-supplied identity and scope validation.
- `npm run test:deployment` builds the production Docker image and verifies automatic database setup from the legacy configuration, restricted credentials in the web process, repeated startup, and failure before web startup when a migration fails. It uses an isolated PostgreSQL container and network.
- `npm run test:isolation` creates a disposable PostgreSQL 15 Docker container, applies real migrations, and checks database policies, action access, exports, benchmark suppression, pooled connection reuse, and authentication. It also builds and starts the production application to exercise login, session tampering, and dashboard selector visibility over HTTP. It never accepts a production database URL.
- CI runs both suites on every pull request and push to `main`, and a ruleset on `main` requires them to pass before merging. Each suite uses its own disposable PostgreSQL 15 container.
- New tenant tables must have explicit grants and RLS policies. Do not grant all future tables to the runtime role. Add an unfiltered-query test for each new tenant table.
- Use reviewed SQL migrations for policies, functions, grants, and triggers. Do not use `drizzle-kit push` on an application database: the Drizzle schema does not describe the complete security configuration. Rerunning migrations re-secures the legacy statistics functions after their definitions are reapplied.
- Public content caching uses the restricted account without an authenticated context. Tenant data is not stored in a shared cache. Any new tenant cache must include user permissions, organization, and sub-organization scope in its key and handle permission revocation.
