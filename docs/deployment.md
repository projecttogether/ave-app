# Deployment

Two copies of the app run on ProjectTogether's server `pt-prd-ave-app`, each
with its own PostgreSQL, settings and image, and Caddy in front for HTTPS:

| | Production | Staging |
|---|---|---|
| Address | `https://app.ave-gastro.org` | `https://staging.ave-gastro.org` |
| Gets | each published release `vX.Y.Z` | each commit on `main` that passes CI |
| GitHub environment | `production` (tags `v*` only) | `staging` (`main` only) |
| Image | `ghcr.io/projecttogether/ave-app` | `ghcr.io/projecttogether/ave-app-staging` |
| On the server | `/srv/ave-app`, `deploy-ave-app` | `/srv/ave-app-staging`, `deploy-ave-app-staging` |
| Data | the real data, with backups | an anonymized copy of production's |

The repository
[projecttogether/pt-infra](https://github.com/projecttogether/pt-infra) sets
up the server (`ansible/playbooks/ave-app.yml`, role `team_app`). Staging
tells search engines not to index it.

Until Coolify is switched off, [Coolify](coolify.md) still runs the old dev
copy (`dev.ave-gastro.org`) and the old production installation as the way
back.

## Releasing to production

1. Merge to `main`; staging gets it once CI passes. Check it on staging.
2. Raise `version` in `package.json` and `package-lock.json`
   (`npm version <x.y.z> --no-git-tag-version`) in a pull request
   `chore: release vX.Y.Z`, and merge it.
3. Publish a GitHub release for it: tag `vX.Y.Z` on `main`, generated notes
   (`gh release create vX.Y.Z --target main --generate-notes`).

Deploy then checks that the tag is a commit on `main` that passed CI there
and that it is the highest release, builds that commit for production, and
deploys it. [Sentry release](sentry-releases.md) confirms the deployed
commit and records the release in Sentry. A pre-release deploys nowhere.

## How a deploy works

1. [Deploy](../.github/workflows/deploy.yml) starts after CI passes on a push
   to `main` (staging) or when a release is published (production). For
   staging it goes on only if the commit is still the newest on `main`, so a
   rerun of CI for an older commit never puts an older version back.
2. It builds the image from the `Dockerfile` (its build runs the checks
   again), with the Sentry environment `staging` or `production` built into
   the browser bundle, uploads the source maps to Sentry, and pushes
   `<image>:sha-<commit>` (a release also as `<image>:vX.Y.Z`). A commit
   built before for the same environment is not built again.
3. Its `deploy` job (GitHub environment `staging` or `production`) sends the
   image name, a registry token that expires with the job, and the
   environment's settings over SSH to the server's deploy script. Each
   environment's deploy key can run nothing but its own script.
4. The server pulls the image, writes the settings to `app.env` and starts the
   new container. Startup migrates the database
   ([Automatic database setup](coolify.md#4-automatic-database-setup)). If the
   container is not healthy within 180 seconds, the previous image and
   settings run again and the job fails.

## Going back and deploying again

**Run workflow** on Deploy:

- with `main` deploys the current `main` to staging again, for example after
  changing a staging setting;
- with a release tag (`vX.Y.Z`) deploys that release to production, for
  example after changing a production setting, or to go back to an older
  release. Going back does not undo database migrations of the newer version.

On the server, `deploy-ave-app rollback` puts the previous image and settings
back at once (below).

## Settings

Each environment (repository settings, Environments) holds the app's own
settings; staging's are separate from production's, with an `AUTH_SECRET` of
its own:

| Name | Kind | Purpose |
|---|---|---|
| `AUTH_SECRET` | secret | Signs sessions, hashes sign-in codes, derives the database logins |
| `PREVIOUS_AUTH_SECRET` | secret | Only while rotating a leaked `AUTH_SECRET` ([Incident response](incident-response.md)) |
| `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD` | secret | MailerSend SMTP login |
| `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_FROM` | variable | MailerSend SMTP server and sender |
| `DEPLOY_SSH_KEY` | secret | Private deploy key; pt-infra holds the public half |
| `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS` | variable | The server's address and SSH host keys |

The server's own settings come from pt-infra (production:
`ansible/host_vars/pt-prd-ave-app.yml`; staging: the play "AVE app staging" in
`ansible/playbooks/ave-app.yml`) and win over the app's: `DATABASE_URL`,
`AUTH_URL` and `AUTH_TRUST_HOST`. A deploy that sends one of them fails. A new
app setting needs a line in the workflow's `SETTINGS` list and its `env`, and
a value in both environments. Values must not contain line breaks or `'`.

The repository secret `SENTRY_RELEASE_AUTH_TOKEN` also uploads the source
maps during the build ([Sentry releases](sentry-releases.md)).

## Staging data

Staging holds an anonymized copy of production's database, made on the server
itself, so the real data never leaves it:

```bash
scripts/staging/copy-production.sh <ssh host> <address of the account to keep>
```

It stops the staging app, replaces staging's database with a copy of
production's, runs [`scripts/staging/anonymize.sql`](../scripts/staging/anonymize.sql)
and starts the app again. The anonymizing:

- gives every person a numbered name and an address
  `person-<n>@staging.invalid` that no mail server accepts, except the one
  account named on the command line, which keeps its address for signing in;
- names organizations `Organisation <n>` and sites `Standort <n>`, also in the
  operating history;
- deletes sessions, sign-in codes and passkeys (sign in with an email code
  and add a new passkey on staging), drafts and archived reports;
- removes IP addresses from the audit log and every field there whose name
  holds `mail` or `name`, and email addresses and phone numbers from
  free-text answers;
- keeps the figures, answers, roles and memberships.

To test as someone else, impersonate them as an admin. The script stops when
the database has a table it does not cover: a migration that adds a table
also needs a line in `anonymize.sql`. Staging must have been deployed once
before the first copy (its first start creates the database roles).

## On the server

Production; for staging, use `deploy-ave-app-staging` and
`/srv/ave-app-staging`:

```bash
sudo deploy-ave-app status      # the deployed and the previous image
sudo deploy-ave-app rollback    # back to the previous image and settings
journalctl -t deploy-ave-app    # deploy history
cd /srv/ave-app && sudo docker compose logs --tail 100 app
```

A rollback does not undo database migrations of the newer version.

## Database

PostgreSQL 18 runs next to each copy (Compose service `postgres`, volume
`ave-app_postgres` or `ave-app-staging_postgres`), with the superuser
`postgres` and the database `postgres`, as on Coolify. It publishes no port.
For a SQL shell:

```bash
cd /srv/ave-app && sudo docker compose exec postgres psql -U postgres -d postgres
```

Backups of production: a dump every night at 00:15 UTC to
`/var/backups/ave-app` (kept 14 days), and the ProjectTogether Backup app's
agent next to the app (pt-infra). See [Backup and recovery](backup-recovery.md).
Staging is not backed up beyond a nightly dump kept 3 days: its data comes
from production.
