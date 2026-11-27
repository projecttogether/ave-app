# Data Classification Policy

## Classification Levels

### Restricted
Data that, if disclosed, could cause severe harm. Must never be stored in code or logs.

| Data | Storage | Access |
|------|---------|--------|
| AUTH_SECRET | Environment variable only | Runtime only |
| EMAIL_SERVER_PASSWORD | Environment variable only | Runtime only |
| DATABASE_URL | Environment variable only | Runtime only |
| JWT tokens | Client-side cookie (httpOnly) | Automatic via Auth.js |
| Verification tokens | Hashed (SHA256) in database | Auth.js internal |
| WebAuthn credentials | `authenticator` table | Auth.js internal |

### Confidential
Data subject to privacy regulations (GDPR). Access restricted by role.

| Data | Storage | Access |
|------|---------|--------|
| User email addresses | `user.email` column | Admin, own user |
| Financial data (food spend) | `indicator_data` columns | Org-scoped roles |
| Qualitative responses | `qualitative_responses` table | Org-scoped roles |
| Audit log details | `audit_logs.details` (JSONB) | Super admin only |
| User roles & permissions | `user_roles` table | Admin |

### Internal
Operational data not publicly accessible but not privacy-sensitive.

| Data | Storage | Access |
|------|---------|--------|
| Organization names | `organizations` table | Org-scoped roles |
| Sub-organization names | `sub_organizations` table | Org-scoped roles |
| Indicator configurations | Code (`lib/indicators/`) | All authenticated |
| Data freeze records | `data_freezes` table | All authenticated (read) |

### Public
Data that is intentionally accessible.

| Data | Storage | Access |
|------|---------|--------|
| Methodology content | `app_content` table | All users |
| Login/signup pages | Next.js pages | Unauthenticated |
| Health check endpoint | `/api/health` | Unauthenticated |

## Handling Requirements

| Classification | Logging | Export | Deletion | Encryption |
|---------------|---------|--------|----------|------------|
| Restricted | Never log values | Never export | Rotate, don't delete | Environment-level |
| Confidential | Mask in audit logs | Via GDPR export | Anonymize on user deletion | TLS in transit |
| Internal | Log freely | Included in admin exports | Cascade delete | TLS in transit |
| Public | Log freely | N/A | N/A | Optional |

## Data Retention

| Data Type | Retention Period |
|-----------|-----------------|
| Audit logs | 2 years (configurable) |
| Revoked sessions | 30 days |
| Verification tokens | 7 days (auto-expiry) |
| User data | Until deletion request |
| Indicator data | Until organization deletion |
