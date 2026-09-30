# Independent Production backup scheduler (ADR-022)

Local implementation only. No Worker, App, credential, dispatch or Cron activation
is authorized by this configuration. `wrangler.jsonc` has no active triggers,
routes, preview URL or workers.dev endpoint. There is no public fetch handler.

Intended cadence: `23 0,2,4,6,8,10,12,14,16,18,20,22 * * *` (UTC).
GitHub retains odd UTC hours and the unchanged weekly Sunday cadence. Combined
nominal frequent opportunity spacing is one hour; this is not RPO proof.

## Later, separately approved provider setup

1. After implementation CI/exact-SHA acceptance, create a GitHub App installed
   **only** on the Madrasio repository, with repository Actions write (and
   GitHub's inherent Metadata read). No Contents write, Administration, unrelated
   permissions or PAT. The Worker additionally narrows each installation-token
   request to the configured repository and Actions write.
2. Configure the non-secret variables `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`,
   `GITHUB_OWNER`, `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW` (`backup-production.yml`),
   and `BACKUP_CANDIDATE_SHA`. Replace placeholders only at the reviewed provider
   gate. Pin the SHA to the accepted implementation commit, never arbitrary HEAD.
3. Store `GITHUB_APP_PRIVATE_KEY` only as a Worker secret. PKCS#1 RSA PEM as
   downloaded by GitHub and unencrypted PKCS#8 PEM are supported. Web Crypto
   performs RS256 signing; the PKCS#1 DER is wrapped in a PKCS#8 envelope in memory.
   There are no SDK/CLI runtime dependencies. No real keys belong in this repo.
4. Verify repository ownership, installation, permission and candidate settings
   without dispatch. Activate the Cron Trigger **last**, under fresh approval.

Every invocation validates the exact Cron and pinned configuration, calls
`controller.noRetry()`, signs a clock-skew-tolerant short-lived App JWT, requests
an installation token, then issues at most one workflow dispatch on `main`.
The pinned candidate remains the workflow input and the workflow checks its main
ancestry and successful exact-SHA CI before accessing backup credentials.

POSTs have a 20-second timeout and reject redirects. No immediate retry occurs,
including when acceptance is ambiguous. A 2xx response is **dispatch acceptance
only**, never evidence that a backup succeeded. A fixed sanitized failure is
thrown; no provider body, exception, private key or token is logged. The next
natural scheduler opportunity is the recovery mechanism.

Cloudflare inputs are `BACKUP_PRODUCTION`, `frequent`, `cloudflare-cron-v1`, the
pinned SHA, and the controller's UTC scheduled instant. Source/timestamp are
metadata, not authentication. GitHub App permissions provide authentication.
The workflow requires `PRODUCTION_BACKUP_AUTOMATION_ENABLED=true` for both
automatic paths; manual confirmed dispatch remains independent. External weekly
dispatch and malformed/nonexistent UTC dates are rejected before backup work.

No database, R2, age, restore or Cronitor credentials belong in this Worker.
`production_backup_verified` in GitHub remains the authoritative verified-point
event and includes allowlisted `triggerSource` / `scheduledForUtc`. Native GitHub
schedule and manual execution have a null scheduled instant: no nominal time is
invented when GitHub does not supply it.

Rollback: disable the Cloudflare Cron first; retain GitHub's schedule. Revoke the
App installation/key only after dispatch is disabled. Rollback does not accept
RPO. Production RTO remains 997.767 seconds; RPO remains NOT ACCEPTED and
`PRODUCTION_CUSTOMER_DATA_ONBOARDING_BLOCKED_BY_BACKUP` remains in force.
