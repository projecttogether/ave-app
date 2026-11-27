# Backup and Recovery Procedures

## Backup Strategy

### Database (PostgreSQL)

The AVE Dashboard uses PostgreSQL as its primary data store. All application data, including user accounts, indicator data, audit logs, and session information is stored here.

#### Production (`pt-prd-ave-app`)

1. **Nightly dump**: `pg_dump -Fc` at 00:15 UTC to `/var/backups/ave-app` on
   the server, kept 14 days (pt-infra role `pg_backup`).
2. **Backup app**: the ProjectTogether Backup app's agent runs next to the app
   (pt-infra role `backup_agent`) and stores encrypted, off-server snapshots.
3. **WAL archiving** (point-in-time recovery): not set up.

Coolify, which ran production until November 2026, had no backups configured
for this database.

#### Manual Backup

```bash
# Full database dump
pg_dump -Fc -h <host> -U <user> -d <database> > backup_$(date +%Y%m%d_%H%M%S).dump

# Compressed SQL dump
pg_dump -h <host> -U <user> -d <database> | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Application

- **Code**: Stored in Git (GitHub). No additional backup needed.
- **Docker images**: Rebuilt from source on each deploy. Tagged images stored in container registry.
- **Settings**: the app's own in the GitHub environment `production`, the server's in pt-infra ([Deployment](deployment.md#settings)). GitHub does not show secrets again: keep a copy of `AUTH_SECRET` and the SMTP login in a password manager.

## Recovery Procedures

### Database Recovery

#### Roles first

A database dump holds no roles. Before restoring into a new PostgreSQL
server, create the group roles that own functions and receive grants:

```sql
CREATE ROLE ave_app NOLOGIN; CREATE ROLE ave_auth NOLOGIN;
CREATE ROLE ave_policy NOLOGIN; CREATE ROLE ave_team NOLOGIN;
```

Restore as the superuser so owners stay. On startup, the app creates its
logins (`ave_app_*`, `ave_auth_*`) again from `AUTH_SECRET`.

#### From manual dump:
```bash
# Restore from custom format dump
pg_restore -h <host> -U <user> -d <database> --clean backup.dump

# Restore from SQL dump
gunzip -c backup.sql.gz | psql -h <host> -U <user> -d <database>
```

#### Post-recovery steps:
1. Verify `/api/health` returns `200 OK`
2. Check audit logs for the most recent entry timestamp
3. Verify a sample user can log in
4. Check indicator data integrity for a known organization

### Full Application Recovery

If the entire deployment is lost:

1. **Provision infrastructure**: a new server with pt-infra's
   `playbooks/ave-app.yml` (it starts only PostgreSQL until the first deploy)
2. **Restore database**: roles first (above), then the latest dump or Backup
   app snapshot
3. **Configure settings**: the GitHub environment `production`
   ([Deployment](deployment.md#settings)); `DEPLOY_HOST` and
   `DEPLOY_KNOWN_HOSTS` for the new server
4. **Deploy application**: **Run workflow** on Deploy
5. **Point DNS**: `app.ave-gastro.org` to the new server, then pt-infra's
   playbook again for Caddy's certificate
6. **Verify**: Run through the post-recovery steps above

## Recovery Objectives

| Metric | Target |
|--------|--------|
| **Recovery Time Objective (RTO)** | 4 hours |
| **Recovery Point Objective (RPO)** | 24 hours (daily backups) or minutes (with WAL archiving) |

## Backup Verification

Run the backup verification script monthly:

```bash
# Restore to a test database and verify
npx tsx scripts/backup-verify.sh
```

The script should:
1. Restore the latest backup to a temporary database
2. Run `SELECT 1` to verify connectivity
3. Check row counts in key tables (users, indicator_data, audit_logs)
4. Report results

## Disaster Recovery Contacts

| Role | Responsibility |
|------|---------------|
| DevOps lead | Infrastructure recovery |
| Backend developer | Database restore, data verification |
| Product owner | User communication, incident classification |
