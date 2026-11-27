# Security Incident Response Procedure

## 1. Detection

Security incidents may be detected through:
- **Audit logs**: Review via Admin > Audit Log (super_admin only)
- **Monitoring**: Structured JSON logs in Docker/Coolify log aggregation
- **External reports**: Via security@ave-gastro.org
- **Automated alerts**: Failed login spikes, authorization denials

### Key indicators to monitor:
- Repeated `auth.login_failed` events from same IP
- `authz.denied` events from authenticated users
- `admin.impersonate_start` events (always critical severity)
- Unusual data export volumes (`data.csv_import`, `data.export`)

## 2. Classification

| Severity | Criteria | Response Time |
|----------|----------|---------------|
| **Critical** | Data breach, unauthorized access to production, credential compromise | Immediate (within 1 hour) |
| **High** | Vulnerability actively exploited, admin account compromise | Within 4 hours |
| **Medium** | Vulnerability discovered (not exploited), suspicious activity patterns | Within 24 hours |
| **Low** | Minor security misconfiguration, informational findings | Within 1 week |

## 3. Response Steps

### Immediate (Critical/High)
1. **Contain**: Revoke affected user sessions via admin panel or `revokeUserSessions()` action
2. **Deactivate**: Set compromised accounts to `deactivated` status
3. **Isolate**: If infrastructure is compromised, rotate AUTH_SECRET and redeploy with `PREVIOUS_AUTH_SECRET` set to the old value (see [Rotating a leaked AUTH_SECRET](#rotating-a-leaked-auth_secret))
4. **Document**: Record all actions taken with timestamps

### Investigation
1. Query audit logs for the affected time period and user(s)
2. Review structured logs in deployment platform
3. Check for unauthorized data modifications (`data.create`, `data.update`)
4. Verify multi-tenant isolation (check if cross-org access occurred)

### Recovery
1. Reset affected credentials (rotate AUTH_SECRET if compromised, together with the database logins derived from it)
2. Re-enable accounts after verification
3. Notify affected users if personal data was exposed
4. Deploy patches for any identified vulnerabilities

### Rotating a leaked AUTH_SECRET

`AUTH_SECRET` signs sessions and also derives the passwords of the generated database logins (`ave_app_*`, `ave_auth_*`). Rotating it alone stops forged sessions, but anyone holding the old secret can still compute the old database credentials. With database access, `ave_app` can read every organization's data by choosing its own `app.user_id`.

1. Set `AUTH_SECRET` to a new value and `PREVIOUS_AUTH_SECRET` to the leaked value in the GitHub environment `production`, then run Deploy on the tag of the deployed release ([Deployment](deployment.md#going-back-and-deploying-again)). Staging has an `AUTH_SECRET` of its own (environment `staging`). Startup creates the new logins, disables exactly the two logins derived from `PREVIOUS_AUTH_SECRET`, ends their open sessions and logs `Disabled N database login(s)`. The previous container loses database access during the rollout; accept this during an incident.
2. Remove `PREVIOUS_AUTH_SECRET` from the configuration once the deployment is healthy. It is never passed to the web process.
3. If the administrator `DATABASE_URL` may also have leaked, change that password at the database first.

Roles are shared by every database on the PostgreSQL server, so startup never guesses which old logins to disable. To clean up manually, list `SELECT rolname FROM pg_roles WHERE rolname ~ '^ave_(app|auth)_' AND rolcanlogin` and run `ALTER ROLE <name> NOLOGIN` only for logins of this deployment that are no longer in use.

## 4. Communication

### Internal
- Notify development team immediately for Critical/High
- Document in incident tracking system

### External
- **Data breach (GDPR)**: Notify supervisory authority within 72 hours
- **Affected users**: Notify without undue delay if high risk to rights/freedoms
- **Responsible disclosure**: Acknowledge reporter within 48 hours

## 5. Post-Incident Review

Within 1 week of resolution:
1. Root cause analysis
2. Timeline reconstruction from audit logs
3. Identify prevention measures
4. Update security controls if needed
5. Document lessons learned
