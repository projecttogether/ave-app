# AVE Dashboard

The AVE App is a data insights platform enabling catering businesses and cafeteria operators to track, measure, and improve their progress toward implementing the Planetary Health Diet. It is built for the **Allianz fuer Verantwortungsvolle Esskultur (AVE)**.

## Tech Stack

This project uses a fully self-hosted FOSS stack:

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router, Server Actions)
- **Database:** [PostgreSQL 15](https://www.postgresql.org/)
- **ORM:** [Drizzle ORM](https://orm.drizzle.team/)
- **Authentication:** [Auth.js v5](https://authjs.dev/) (Email OTP + WebAuthn Passkeys)
- **Validation:** [Zod](https://zod.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) & [shadcn/ui](https://ui.shadcn.com/)
- **Testing:** [Vitest](https://vitest.dev/)
- **Infrastructure:** Docker on a dedicated server, deployed by GitHub Actions

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd ave-dashboard
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env.local` file in the root directory. See [Environment Variables](#environment-variables) for the full reference.
    ```bash
    # Database (Local Docker)
    MIGRATION_DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/ave_dashboard"
    DATABASE_URL="postgresql://ave_web:YOUR_WEB_PASSWORD@localhost:5432/ave_dashboard"
    AUTH_DATABASE_URL="postgresql://ave_login:YOUR_AUTH_PASSWORD@localhost:5432/ave_dashboard"

    # Auth.js (generate with: openssl rand -base64 33)
    AUTH_SECRET="your-random-secret-at-least-32-chars"
    AUTH_URL="http://localhost:3000"

    # Email (SMTP)
    EMAIL_SERVER_HOST="smtp.mailersend.net"
    EMAIL_SERVER_PORT=587
    EMAIL_SERVER_USER="your-user"
    EMAIL_SERVER_PASSWORD="your-password"
    EMAIL_FROM="noreply@yourdomain.com"
    ```

4.  **Start Local Database:**
    ```bash
    docker-compose up -d
    ```

5.  **Initialize Database:**
    Run the migrations, then provision the restricted login roles as described in [Organization isolation](docs/tenant-isolation.md):
    ```bash
    npm run db:migrate
    ```

6.  **Seed Initial Data:**
    Create the default organization and admin user:
    ```bash
    npm run db:seed -- admin@example.org super_admin
    ```

7.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    Open http://localhost:3000 in your browser.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_DATABASE_URL` | Local development or managed accounts | Restricted authentication connection; Docker creates one automatically when omitted |
| `MIGRATION_DATABASE_URL` | With managed runtime accounts | Administrator connection for migrations; Docker otherwise uses `DATABASE_URL` |
| `DATABASE_URL` | Yes | PostgreSQL connection; Docker accepts the existing administrator URL and prepares restricted runtime accounts |
| `AUTH_SECRET` | Yes | Random secret, minimum 32 characters. Generate with `openssl rand -base64 33` |
| `AUTH_URL` | No | Public app URL for auth callbacks (e.g., `https://app.ave-gastro.org`) |
| `AUTH_TRUST_HOST` | No | Set to `true` when behind a reverse proxy (Caddy) |
| `EMAIL_SERVER_HOST` | Yes | SMTP server hostname |
| `EMAIL_SERVER_PORT` | Yes | SMTP port (e.g., `587`) |
| `EMAIL_SERVER_USER` | Yes | SMTP username |
| `EMAIL_SERVER_PASSWORD` | Yes | SMTP password |
| `EMAIL_FROM` | Yes | Sender email address |
| `NODE_ENV` | No | `development`, `production`, or `test` |
| `AUDIT_LOG_RETENTION_DAYS` | No | Audit log retention in days (default: 730) |
| `REVOKED_SESSION_RETENTION_DAYS` | No | Revoked session retention in days (default: 30) |

All environment variables are validated at startup using Zod. In production, missing or invalid variables cause the application to fail fast.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Run unit tests once |
| `npm run check` | Run generated SQL, type, lint, unit, SQL and isolation checks |
| `npm run test:isolation` | Run isolation tests against disposable PostgreSQL |
| `npm run test:deployment` | Build Docker and verify automatic setup, restart, and failed migrations against disposable PostgreSQL |
| `npm run db:seed` | Seed database with initial roles/user |
| `npm run db:migrate` | Run database migrations manually |

## Database Management

Docker runs migrations automatically before starting the application. For local development or a manual migration, use `MIGRATION_DATABASE_URL`:

```bash
npm run db:migrate
```

Docker startup uses the existing administrator `DATABASE_URL` to migrate and automatically prepare restricted app and authentication accounts. It removes the migration credential from the web process environment and verifies isolation before serving requests. Follow [Organization isolation](docs/tenant-isolation.md) for managed accounts, local setup, and tests. Do not use `drizzle-kit push`, which does not describe the full security configuration.

For schema changes, edit `src/lib/db/schema.ts`, generate and review SQL, include any required policies, and test the migration before deployment. Statistics function definitions are reapplied by the migration runner and secured by migration 0031.

## Security

The application implements security controls aligned with **ISO 27001:2022**. For the full security documentation, see [`docs/security.md`](docs/security.md).

### Authentication

- **Passwordless** -- no passwords stored, no credential-stuffing surface
- **Email OTP** verified inside the credentials provider, with one-time consumption and a 10-minute expiry
- **WebAuthn/FIDO2 Passkeys** with required user verification (biometric/PIN)
- **Rate limiting** on login: 5 attempts per 15 minutes per IP

### Session Management

- JWT-based sessions last 8 hours from sign-in, including during inactivity
- Session revocation via denylist ("log out all devices" in Settings)
- Deactivated users are blocked from login

### Authorization (RBAC)

Five-tier role-based access control:

| Role | Scope |
|------|-------|
| `super_admin` | Unrestricted access, user impersonation |
| `admin` | System-wide configuration, data export |
| `org_manager` | Organisation-level data, kitchen assignments, team invitations and ordinary member suspension |
| `org_view_only` | Read-only dashboard access |
| `basic_user` | Data entry for assigned sub-organisations only |

Roles are enforced server-side in every Server Action. Multi-tenant data isolation ensures organisations cannot access each other's data.

### Input Validation

- **Zod schemas** on all server action inputs (emails, IDs, roles, years, etc.)
- **Drizzle ORM** parameterised queries (SQL injection prevention)
- **CSRF protection** via Next.js Server Actions
- **CSV upload limits**: 5 MB file size, MIME type validation, 10,000 row maximum

### Security Headers

All responses include: Content-Security-Policy, Strict-Transport-Security (HSTS, 2 years), X-Frame-Options (DENY), Referrer-Policy, Permissions-Policy, X-Content-Type-Options, X-DNS-Prefetch-Control.

### Audit Logging

All security-relevant actions are logged to a persistent `audit_logs` database table with severity levels (info/warning/critical), automatic sensitive-field masking, and an admin viewer at `/admin/audit` (super_admin only).

Logged events include: logins, login failures, user CRUD, role changes, impersonation, data mutations, CSV imports, data freezes, authorisation denials, and data exports.

### Data Protection

- GDPR user data export (JSON download in Settings)
- Automated data retention cleanup (configurable via environment variables)
- User deletion with audit log anonymisation and session revocation
- Structured JSON application logging for Docker log collection

### Infrastructure

- Docker container runs as **non-root** user (UID 1001, Alpine base)
- Health check endpoint at `/api/health` with database connectivity verification
- Environment variable validation at startup (fail-fast on missing secrets)
- `X-Powered-By` header removed

### CI/CD

GitHub Actions runs [CI](.github/workflows/ci.yml) on every pull request, on
pushes to `main`, and on demand. Its jobs run in parallel, and a ruleset on
`main` requires all four to pass before merging:

| Check | What it runs |
|-------|--------------|
| Dependency audit | `npm audit --audit-level=high` against the lockfile |
| Checks | Generated SQL check, type checking, lint, unit tests, and RSC response cancellation |
| Database tests | SQL parity and migration tests, then tenant isolation and HTTP authentication tests against a production build |
| Docker deployment | Production image build, automatic database setup, restart, and failed migrations |

Jobs get a read-only repository token and no secrets. Sentry and Next.js
telemetry are disabled. Test databases are disposable: PostgreSQL 15 containers
on the runner, or a temporary cluster inside the Docker build. Workflows may use
only GitHub-owned actions, pinned to full commit SHAs. Dependabot updates those
pins and npm dependencies weekly.

To reproduce CI locally, install Node.js 22 and Docker, then run:

```bash
npm ci
npm run audit
npm run check
npm run test:rsc-abort
npm run test:deployment
```

### Further Reading

| Document | Description |
|----------|-------------|
| [`docs/security.md`](docs/security.md) | Comprehensive security documentation with ISO 27001 control mapping |
| [`docs/incident-response.md`](docs/incident-response.md) | Security incident response procedure |
| [`docs/data-classification.md`](docs/data-classification.md) | Data classification policy (Restricted / Confidential / Internal / Public) |
| [`docs/backup-recovery.md`](docs/backup-recovery.md) | Backup strategy and disaster recovery procedures |
| [`SECURITY.md`](SECURITY.md) | Vulnerability disclosure policy |

## Deployment

Production (`app.ave-gastro.org`) and staging (`staging.ave-gastro.org`) run on
ProjectTogether's server `pt-prd-ave-app`. Through the
[Deploy](.github/workflows/deploy.yml) workflow, every commit on `main` that
passes CI goes to staging, and every published release (`vX.Y.Z`) goes to
production; see [`docs/deployment.md`](docs/deployment.md).

1.  **Build:** The `Dockerfile` creates a standalone Next.js build with the database migrations.
2.  **Startup:** The default command applies migrations and automatically prepares restricted database accounts before starting the web server. No manual migration or account setup is needed. Failures stop startup.
3.  **Env Vars:** The GitHub environments `staging` and `production` and the server provide them (see [Environment Variables](#environment-variables) and [Deployment](docs/deployment.md#settings)).
4.  **Health Check:** `/api/health` -- returns 200 when the database is reachable and the installed formula revision matches, or 503 otherwise.

Until Coolify is switched off, it runs the old dev copy; see [`docs/coolify.md`](docs/coolify.md).

## Project Structure

```
src/
  app/              Next.js App Router pages and layouts
    actions/        Server Actions for business logic
    admin/          Admin panel (users, orgs, audit log, data freeze, export)
    api/            API routes (auth, health check)
  lib/
    db/             Database schema, migrations, client
    indicators/     Indicator calculation engine
    qualitative/    Qualitative scoring logic
    audit.ts        Audit logging service
    rate-limit.ts   Rate limiting configuration
    validation.ts   Zod input validation schemas
    env.ts          Environment variable validation
    logger.ts       Structured JSON logging
    roles.ts        RBAC helper functions
  components/       Reusable UI components
  __tests__/        Unit tests
drizzle/            SQL migration files
scripts/            Utility scripts (seed, migration, data retention cleanup)
docs/               Documentation (security, deployment, incident response)
.github/            CI workflow and Dependabot config
```

## Calculation reliability

See [Formula reliability](docs/formula-reliability.md) for input rules, versioned formulas, calculation exports, immutable reports, and deployment checks. CI runs the complete pipeline on every pull request; `npm run check` runs the TypeScript and PostgreSQL suites locally.

See [Quarterly reporting](docs/quarterly-reporting.md) for shared monthly, quarterly and yearly entry choices, period-specific tasks, annual confirmation, atomic publication, CSV v2 and the release/rollback procedure.

## License

Copyright (C) 2026 ProjectTogether gGmbH. The AVE App is free software under the
[GNU Affero General Public License, version 3](LICENSE) (`AGPL-3.0-only`). If
you modify it and let people use your version over a network, you must
prominently offer them its source code at no charge. Copies you distribute stay
under the same license, with their source code.

The AVE name and logo are not covered by the license; see [NOTICE](NOTICE).
