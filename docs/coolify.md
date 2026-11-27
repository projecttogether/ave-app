# Deployment Guide: Coolify

> Production moved to its own server in November 2026, and the staging copy
> (`staging.ave-gastro.org`) replaces the dev copy ([Deployment](deployment.md)).
> Until Coolify is switched off, it still runs the old dev copy
> (`dev.ave-gastro.org`) and the old production installation as the way back.

This guide details how to deploy the AVE Dashboard to a self-hosted Hetzner server using [Coolify](https://coolify.io/).

## Overview

The application is a Next.js Full Stack app using:
- **Runtime**: Docker (Node.js)
- **Database**: PostgreSQL (managed by Coolify or external)
- **ORM**: Drizzle ORM
- **Auth**: Auth.js (v5)

## Prerequisites

*   A Coolify instance set up on your server.
*   This repository pushed to a Git provider (GitHub/GitLab) connected to Coolify.

## 1. Database Resource

1.  In your Coolify Project, click **+ New** -> **Database** -> **PostgreSQL**.
2.  Configure the database (Name, Version 15+).
3.  **Start** the database.
4.  Copy the **Connection String**.
    *   If deploying the App in the *same* Coolify stack/server, use the **Internal Connection String** (usually starts with `postgresql://postgres:...@<uuid>:5432/...`).
    *   Use this connection as `DATABASE_URL`. Container startup uses it to update the database and automatically prepares the accounts used by the web process.

## 2. Application Resource

1.  In your Coolify Project, click **+ New** -> **Application** -> **Public Repository** (or Private if configured).
2.  Select this repository and branch (e.g., `main`).
3.  **Configuration**:
    *   **Build Pack**: `Dockerfile` (Coolify should auto-detect this, but verify).
    *   **Docker Path**: `/Dockerfile`
    *   **Ports Exposes**: `3000`
4.  **Health Check**:
    *   Path: `/api/health`
    *   Port: `3000`
    *   Host: `localhost` (the default). Coolify's check runs `curl` inside the container. Keep `curl` in the image: BusyBox `wget` resolves `localhost` only to `::1`, where Next.js does not listen. The image's own `HEALTHCHECK` uses Node.js.

## 3. Environment Variables

Go to the **Environment Variables** tab of your Application and add the following.

### Database connection

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | The internal PostgreSQL administrator connection from Step 1. Existing installations can keep their current value. |

Set this as a runtime variable with **Build Variable** disabled. Container startup runs migrations and creates separate restricted database logins automatically. You do not need to create accounts or add `AUTH_DATABASE_URL` for the default deployment. See [Coolify environment variables](https://coolify.io/docs/applications/configuration/environment-variables).

If you already manage separate database accounts, provide `MIGRATION_DATABASE_URL` for migrations, `DATABASE_URL` for the restricted app account, and `AUTH_DATABASE_URL` for the restricted authentication account. Startup migrates and verifies those accounts without changing their passwords.

### Authentication (Auth.js)
| Variable | Description | Value / Example |
| :--- | :--- | :--- |
| `AUTH_SECRET` | A random 32+ char string used to sign tokens. | Generate with `openssl rand -base64 33` |
| `AUTH_URL` | The public URL of your app. | `https://ave-dashboard.example.com` |
| `AUTH_TRUST_HOST` | Trust the proxy (needed for Coolify/Traefik). | `true` |

### Email (SMTP via MailerSend)
Required for Magic Link login.

| Variable | Description | Example |
| :--- | :--- | :--- |
| `EMAIL_SERVER_HOST` | SMTP Host | `smtp.mailersend.net` |
| `EMAIL_SERVER_PORT` | SMTP Port | `587` |
| `EMAIL_SERVER_USER` | SMTP Username | `MS_...` |
| `EMAIL_SERVER_PASSWORD` | SMTP Password | `...` |
| `EMAIL_FROM` | Sender Address | `noreply@yourdomain.com` |

### Sentry

The SDK reports to [projecttogether / ave-app](https://projecttogether.sentry.io/projects/ave-app/).
The public DSN is in `src/lib/sentry-options.ts`. Browser events use `/monitoring`,
which works with the same-origin CSP. The proxy skips authentication for this
path but forwards only POST envelopes up to 1 MB for this DSN's org, project,
and region. It rejects all tunnel requests when Sentry is disabled.
Errors are captured in the browser, Node.js, and edge runtimes. Traces are sampled
at 100% in development and 10% in production. Session Replay is disabled.
Automatic identity, request payload, query-value, database-value, and console
breadcrumb collection is disabled to match the application's data policy.

For readable production stack traces, configure the build before deploying:

1. Add `SENTRY_AUTH_TOKEN` as a **Build Variable** with **Runtime Variable** disabled.
   Use the token from the local, git-ignored `.env.sentry-build-plugin` created by
   the Sentry wizard, or a Sentry organization token with source-map upload access.
2. Enable **Use Docker Build Secrets** on a BuildKit-enabled server. The Dockerfile
   mounts `SENTRY_AUTH_TOKEN` only for `npm run build`; it must not be passed as a
   Docker `ARG` or copied into the image.
3. Enable **Include Source Commit in Build** so `SOURCE_COMMIT` identifies the
   release. Other builders can pass `SENTRY_RELEASE` as a build argument instead.
   Sentry injects the same release into the browser and server bundles.
4. For staging, set `NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging` at build time.
   Docker defaults to `production`. Rebuild after changing this value.

With Docker Build Secrets enabled, Coolify supplies the release and public SDK
settings as secrets too. The Dockerfile mounts all of them for the Next.js build;
ordinary Docker builds can continue using build arguments for those public values.
Coolify adds every build variable to each `RUN` instruction that does not mount a
secret itself. The test steps mount an unused placeholder secret, so they run with
the same environment as CI and never see production credentials.
After changing only build-time settings or the upload token, choose **Force deploy
(without cache)**. Docker does not invalidate cached build steps when secret values
change.

See [Coolify environment variables](https://coolify.io/docs/applications/configuration/environment-variables)
and [Dockerfile build arguments](https://coolify.io/docs/applications/builds/dockerfile).
Without the upload token, event capture still works, but source maps are not uploaded.
The local `.env.sentry-build-plugin` is excluded from the Docker build context.

For local tests that must not send events, set `NEXT_PUBLIC_SENTRY_ENABLED=false`
before building or running Next.js. Unit tests disable the SDK automatically.
Deployment tests use an internal Docker network without internet access, including
when `DEPLOYMENT_TEST_IMAGE` points to a prebuilt image with Sentry enabled.

## 4. Automatic database setup

The default Docker command runs `docker-entrypoint.mjs`. Before starting the web server, it:

1. Applies the SQL migrations bundled with the new application version, using `MIGRATION_DATABASE_URL` when provided, otherwise `DATABASE_URL`.
2. Creates and reuses restricted app and authentication database logins when `AUTH_DATABASE_URL` is not configured.
3. Verifies database permissions and the installed formula revision.
4. Replaces the setup process with the web server, passing the restricted connection strings and removing the migration credential from its environment.

A failed migration or permission check stops startup. The web server starts only after setup succeeds. Concurrent deployments serialize migrations and account creation. Existing records remain in place, subject to the migration's data-integrity checks.

For the failed PR #57 rollout, deploy this version with the existing `DATABASE_URL` and `AUTH_SECRET`. No manual SQL, account creation, migration command, or additional environment variable is needed. Leave Coolify's custom start command unset so it uses the Dockerfile command. Remove any manually configured migration pre-deployment command; the new container handles migrations itself.

The database connection needs permission to migrate the schema and create roles. The existing Coolify PostgreSQL administrator connection supports this. Keep database backups as part of normal operations. If old data violates the tenant constraints, the migration reports the error and stops instead of discarding records.

Docker allows a 120-second health-check start period for database setup. If Coolify overrides the image health check, allow the same startup time there. `/api/health` must succeed before the replacement container receives traffic.

See [Organization isolation](tenant-isolation.md) for account handling and [Formula reliability](formula-reliability.md) for migration checks. `node migrate-bundle.cjs` remains available for operators who explicitly run migrations separately.

## 5. Deployment

1.  Click **Deploy** in Coolify.
2.  Wait for the build to complete.
3.  Check the "Logs" tab. You should see:
    ```
    Ready in 123ms
    ```
4.  Open your **Public Domain** (configure it in the "General" tab if you haven't yet).

## Troubleshooting

* **Database setup fails**: Check the startup log and `DATABASE_URL`, or `MIGRATION_DATABASE_URL` when using separate accounts. The migration connection must reach PostgreSQL and have schema and role creation permissions.
* **Quarterly migration 0037 fails on historical amounts**: Earlier versions rechecked historical values while backfilling period metadata. Deploy the corrected migration, which preserves those values and restores the existing validation checks in the same transaction. Failed attempts roll back, so startup can retry without manual SQL. Startup now prints the underlying database error instead of the full migration query.
* **Startup says `role "ave_app" does not exist`**: Check that the deployed image includes `docker-entrypoint.mjs` and that no custom start command bypasses it. The default command creates the required roles automatically.
* **Startup requires `MIGRATION_DATABASE_URL`**: You configured `AUTH_DATABASE_URL`, selecting separate runtime accounts. Supply an administrator migration connection for this mode. For the default setup, use the administrator `DATABASE_URL` and leave `AUTH_DATABASE_URL` unset.
* **Health check times out during migrations**: Allow at least 120 seconds for startup in any Coolify health-check override.
* **Login fails**: Check `EMAIL_SERVER_*` settings and ensure your domain is verified in MailerSend.

## 6. Database Access

Do **not** deploy Drizzle Studio (or any other database admin UI) as a public service — Studio has no authentication, so anyone reaching its domain gets full read/write access to the database. If a previous deployment of the former `Dockerfile.studio` service still exists in Coolify, delete it.

To inspect the production database, open an SSH tunnel to the server and run Studio locally against the tunneled port:

```bash
ssh -L 5432:localhost:5432 <server>
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<db> npx drizzle-kit studio
```

Studio then runs on your machine only (http://local.drizzle.studio) and is never exposed publicly.
