# Sentry release reporting

GitHub Actions runs `Sentry release` when a release is published (production
deploys releases; [Deployment](deployment.md)). It waits up to 30 minutes for three consecutive healthy responses from every configured
production endpoint. `X-Deployment-Id` is the SHA-256 digest of `SOURCE_COMMIT`;
the workflow compares it with the expected GitHub commit. Public responses
keep their existing bodies and do not reveal the raw commit.

After confirmation, the workflow associates the release with its GitHub commit
range and records a `production` deployment in Sentry. The range starts at the
last deployment reported by this workflow, so a superseded build cannot skip
fixes. The configured initial baseline is used only before the first report.
The probes confirm the web services; they do not establish the release of
independently deployed background workers.

The repository secret `SENTRY_RELEASE_AUTH_TOKEN` holds a Sentry organization
token with `org:ci`. The same token covers the four ProjectTogether projects.
No Coolify API credential is required. The token is supplied only to the
reporting step of a release, never to pull request code or health probes.
Staging builds report their errors to Sentry with the environment `staging`;
this workflow records no staging deployments.

For each future fix, include `Fixes <SENTRY-ISSUE-ID>` in the commit message
that reaches `main`, for example `Fixes PT-APP-123`; the issue resolves with
the release that contains it. Sentry's existing GitHub
integration links the issue to that commit. Importing it into the verified
production release completes release-based resolution. SDK events must use
the same commit SHA as their release; leave custom release overrides unset.

A deployment timeout or unhealthy endpoint leaves Sentry unchanged. After
recovery, rerun the workflow on the release tag using Actions. Repeated reports of the
same commit are idempotent. Sentry API failures fail the job for investigation;
the workflow never applies inactivity-based resolution or resolves all issues.
