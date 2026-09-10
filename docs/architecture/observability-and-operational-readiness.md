# Observability, Backups, and Operational Readiness

> Task 048 establishes a small V1 operations contract for the dedicated
> STAGING application. It adds no APM vendor, telemetry stack, queue, migration,
> dependency, provider write, or Production resource.

## Principles and current inventory

Logs are diagnostic evidence; PostgreSQL remains authoritative for publications,
Outbox lifecycle, Notifications, migrations, and schedules. Logs must never carry
passwords, tokens, cookies, authorization headers, SMTP credentials, database
URLs, CA contents, invitation token hashes, or full business/request payloads.
Prefer safe IDs only when necessary, bounded counts, durations, and stable error
classes over names, emails, phone numbers, grades, comments, announcement text,
or Notification bodies.

Existing platform visibility is intentionally reused:

- Vercel supplies deployment/build/function logs and `VERCEL_GIT_COMMIT_SHA`;
- Supabase exposes PostgreSQL/Auth/platform logs, database metrics,
  `cron.job_run_details`, and `net._http_response` history;
- GitHub Actions visibly gates install, lint, typecheck, test, build, migration,
  migration verification, exact-SHA promotion, deployment, and smoke;
- durable database fields (`status`, `attempt_count`, `last_error`, timestamps)
  expose Outbox and scheduled-publication truth.

Task 048 closes the repository gaps with a small structured logger, explicit
liveness/readiness/deployment endpoints, safer job outcome logging, and a guarded
aggregate-only operator report. Sentry/OpenTelemetry/Datadog/Prometheus/Grafana/
ELK are not required for V1.

## Structured logging and error classes

`lib/observability/logger.ts` emits one-line JSON with `timestamp`, `level`, a
stable `event`, and bounded metadata. Nested objects/arrays and strings are
limited; sensitive or personal-data-shaped keys are redacted. `Error` values
emit only their class name, not message, stack, or cause. This deliberately
trades debugging detail for safe default logs.

Operational categories are:

- `authentication_failure`;
- `authorization_denial`;
- `validation_failure`;
- `database_unavailable`;
- `provider_failure`;
- `background_job_failure`;
- `unexpected_internal_error`.

Client errors retain the existing controlled API envelopes. The mapper logs a
safe class/status/code but never changes authorization behavior or exposes an
internal error. Internal-job failures are explicitly classified as background
job failures.

## Health contract

| Endpoint | Meaning | Dependency work | Public response |
| --- | --- | --- | --- |
| `GET /api/health` | liveness | none | service/status/version/time |
| `GET /api/health/ready` | runtime readiness | one read-only `select 1` through the normal verified-TLS runtime pool | only `ready` (200) or `unavailable` (503) |
| `GET /api/health/deployment` | release identity | none | status, validated 40-character deployed SHA, and validated Vercel deployment URL |

All are uncached. The deployment URL is non-secret instance metadata and is
returned only when Vercel's routed-deployment header matches its deployment
system environment. Readiness does not expose a host, URL, schema, table, error,
key, or connection detail and never mutates state. A deployment can be live but
not ready; operators must not conflate those conditions.

## Background-job visibility

Both machine routes emit `internal_job_completed` with job name, correlation
ID, duration, aggregate result counts, `success`, and `zeroWork`. A zero-work
success is therefore distinguishable from a failure. A nonzero processor
`failed` count logs at warning level; an invocation exception logs the stable
`background_job_failure` category. Responses and logs never contain event
payloads or recipients.

The database answers the durable questions:

- retryable work: `PENDING` plus explicitly retryable `FAILED`;
- permanent failure: **none exists in V1**—`FAILED` is deterministic and
  operator-retryable after repair;
- oldest pending age: oldest `created_at` among `PENDING`/`FAILED`;
- stuck processing: `PROCESSING` whose `updated_at` is older than five minutes;
- repeat attempts: `attempt_count > 1`;
- most recent success: maximum `processed_at`;
- overdue schedules: `SCHEDULED` whose instant is more than five minutes due.

The normal processor still ignores `FAILED` to avoid a poison-event hot loop.
No lifecycle or retry semantics changed.

## Read-only STAGING status command

Run `pnpm operational-status:staging` only from the existing ignored operator
environment. It reuses the exact STAGING/project/Session-Pooler guard, starts a
read-only transaction, and reports:

- deployed SHA and expected migration name;
- migration/table counts;
- Outbox counts, retryable age, attempts, and latest success;
- Notification total/unread counts;
- scheduled/overdue/next-publication aggregates;
- the two intended Cron names, active state, and latest run status/time.

It emits no payload, person, email, body, Vault value, connection string, or
credential. It exits nonzero for schema mismatch, failed/stuck Outbox work,
overdue schedules, missing/unhealthy Cron, or an unavailable dependency. The
five-minute threshold allows several one-minute Cron cycles without hiding a
stuck workflow. The preserved `2027-06-15T12:00:00.000Z` publication is future
work, not overdue.

Remote operator execution also requires the approved `DATABASE_SSL_CA` in the
ignored process environment. Missing/untrusted CA fails closed at the safe
`database_connectivity` stage; the command never downgrades TLS.

## Alerting contract

Before Production, assign an on-call owner and delivery channel for these
signals. No paid alerting platform is introduced here.

| Signal | Initial V1 trigger | Action |
| --- | --- | --- |
| CI/deployment/migration gate | any failed run | immediate owner notification; no bypass |
| readiness | unavailable for 5 minutes / repeated probes | investigate Vercel and DB/TLS |
| Outbox deterministic failure | any `FAILED` | inspect controlled class, repair, explicit retry |
| Outbox age | retryable work older than 5 minutes | verify Cron/runtime and backlog |
| Cron | missing/disabled, latest failed, or no success for 3 expected cycles | inspect Cron, pg_net, endpoint auth |
| scheduled publication | due by more than 5 minutes | verify scheduled job, then Outbox stage |
| Supabase Auth/Brevo SMTP | provider failures/bounces or repeated login/invite failure | provider-specific diagnosis; do not expose links |

GitHub failure notifications, Vercel project alerts/logs, Supabase logs/status,
and Brevo transactional reporting are the current channels. Task 049 must record
the human owner, escalation contact, log-retention requirement, and enabled
provider notifications for Production.

## Actual STAGING backup posture

Read-only Dashboard verification on 2026-09-06 showed the organization/project
on **Free**, `LAST BACKUP: No backups`, and the Backups page explicitly states
that Free does not include project backups. Therefore:

- automatic backup availability: **none**;
- backup frequency: **none**;
- provider retention: **none**;
- PITR: **not enabled/not available on the current plan**;
- provider restore/restore-to-new-project from an automatic backup: **not
  available for this project**.

Supabase currently documents daily automatic backups for Pro/Team/Enterprise,
with 7/14/up-to-30-day retention respectively, and PITR as a paid add-on. A
provider restore makes the project unavailable during recovery; database backup
does not restore deleted Storage objects. See [Database Backups](https://supabase.com/docs/guides/platform/backups)
and the [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

Classifications:

- `STAGING_BACKUP_LIMITATION_DOCUMENTED`: STAGING has no automatic recovery
  point and no claim of recoverability is made.
- `PRODUCTION_BACKUP_CONFIGURATION_REQUIRED_TASK_049`: Production must not
  launch until its paid backup/PITR decision, RPO/RTO, retention, owner, and
  restore test are approved.

### Logical export decision

Supabase recommends regular CLI logical exports for Free projects. Task 048 does
not create, upload, or schedule a dump because it would copy personal and Auth
data into a new high-risk artifact without an approved encrypted destination,
retention/deletion policy, access owner, or restore-test environment.

Before Production, Task 049 must choose one of these reviewed controls:

1. provider automatic backups (at minimum Pro daily/7-day retention), with a
   separate-project restore rehearsal; and/or
2. an encrypted logical export using `supabase db dump`/`pg_dump`, held outside
   the live project under least privilege, retention/deletion rules, integrity
   checks, and a tested restore procedure.

Never place dumps in Git, Vercel artifacts, ordinary CI logs, public buckets, or
unmanaged operator desktops. Do not treat schema migrations as data backups.

## Incident and recovery runbook

For every incident: record UTC start time, environment/project/ref, deployed
SHA, safe symptom/classification, incident owner, and containment decision.
Never paste credentials or payloads into tickets/logs.

### Vercel deployment failure

- Symptoms: gated workflow, deployment-instance/exact-SHA/smoke failure, or the
  stable alias remaining on its pre-hook deployment instance.
- Diagnose: GitHub run, runner-local release marker classification, release
  ref, Vercel build/runtime logs, unique deployment URL, deployment metadata,
  stable-alias activation, and readiness.
- Contain/recover: keep prior healthy release; fix forward and rerun the same
  gated workflow. If migration already ran, prove old/new code compatibility.
- Do not: invoke the Deploy Hook manually, enable auto-deploy, or assume a code
  rollback can reverse schema.
- Verify: current-release deployment instance at the stable alias, exact SHA,
  liveness, readiness, role smokes, and machine routes. SHA equality by itself
  is insufficient for a same-SHA environment-only redeployment.

### Database unavailable or TLS/certificate failure

- Symptoms: readiness 503, connection errors, TLS verification failures.
- Diagnose: Supabase status/metrics/logs, pooler mode/port, SSL enforcement,
  approved CA presence/expiry/hostname—not connection values.
- Contain/recover: stop writes/deployments; correct provider/network/trust
  configuration through review; restore verified TLS to both runtime and
  migration paths.
- Do not: disable SSL enforcement, set `rejectUnauthorized:false`, switch runtime
  to a migration credential, or print URLs/CA.
- Verify: authorized encrypted session, readiness, representative read, migration
  verifier in read-only mode.

### Migration failure

- Symptoms: `db:migrate` or security/schema verification fails; deployment is
  gated.
- Source of truth: committed migrations plus `drizzle.__drizzle_migrations`.
- Recover: STOP, preserve evidence, inspect the exact migration/code, correct
  forward in review, retest fresh replay and hosted preflight, rerun the gate.
- Do not: edit the journal, use `drizzle-kit push`, Dashboard SQL, automatic
  destructive rollback, or deploy anyway.

### Outbox processing failure

- Symptoms: `FAILED`, retryable age over five minutes, warning/error job log.
- Diagnose: aggregate status, safe event ID/type if an operator tool is extended,
  Vercel invocation, source publication existence; frozen recipients remain
  authoritative.
- Recover: repair deterministic cause, then explicitly retry/include failed;
  transient failures remain pending for the next run.
- Do not: mark processed manually, recreate publication, re-resolve recipients,
  edit payload, or insert Notifications directly.
- Verify: event `PROCESSED`, one notification per event/recipient, no duplicates.

### Scheduled-publication/Cron/authentication failure

- Symptoms: schedule overdue, Cron latest status failed/missing, pg_net 401/5xx.
- Diagnose: both named jobs, active schedule, latest run/HTTP response, Vercel
  route log, Vault names (never decrypted values), endpoint 401/405 contract.
- Recover: correct the existing job/endpoint/Vault configuration through the
  guarded operator path; the next run discovers due database work.
- Do not: change `scheduled_at`, publish with SQL, create Notifications directly,
  expose/inline `CRON_SECRET`, or touch the future 2027 fixture.
- Verify: one publication/snapshot/Outbox event, then one Notification projection.

### Supabase Auth failure

- Symptoms: login/invite/OTP failure or identity mismatch.
- Diagnose: Supabase Auth logs/status, exact application/Auth UUID and canonical
  email invariant through privileged read-only tooling, Site URL/allowlist.
- Recover: provider recovery or controlled identity reconciliation; fail closed.
- Do not: modify `auth.users` with SQL, scan Auth users, expose token hashes, or
  infer authority from metadata.
- Verify: password login, `/me`, exact School/role/scope, Student/Auth count zero.

### Brevo SMTP failure

- `535`: validate the Supabase SMTP login uses the Brevo SMTP login and a valid
  SMTP key—not account password/API key; rotate only if compromised.
- Unauthorized-IP policy: Supabase egress may not have a stable operator-known
  range; review Brevo SMTP-key policy rather than inventing/allowlisting the SMTP
  status code as an IP.
- Accepted but undelivered/bounced: inspect Brevo accepted/sent/delivered/bounce
  status, verified sender/domain/DKIM/DMARC and mailbox; never log the invite URL.
- Verify with exactly one controlled invite after correction. Do not auto-retry
  mail sends or weaken signup controls.

### Compromised secret

Contain access first, identify the exact secret and consumers, rotate narrowly,
revoke the old value, redeploy/reconfigure in dependency order, and verify logs
for misuse without printing values:

| Secret | Coordinated consumers/verification |
| --- | --- |
| Supabase secret key | Vercel Auth Admin; verify exact-ID admin read/invite, then retire old key |
| publishable key | Vercel browser/SSR; deploy new value, verify sessions, then retire old key |
| database password | both pooler URLs/GitHub migration/Vercel runtime; update and verify TLS paths/gate |
| `CRON_SECRET` | Vercel plus matching Vault; coordinate cutover, verify 401 old/200 scheduled jobs |
| Vercel Deploy Hook | GitHub staging secret plus hook; replace/revoke, then exact-SHA gated release |
| Brevo SMTP key | Brevo plus Supabase SMTP; revoke old, verify one controlled delivery |
| fixture/Admin password | Supabase Auth Admin rotation plus ignored operator env; revoke sessions, verify login/scope |

### Accidental configuration drift

- Diagnose against the documented Vercel env-name matrix, Supabase Auth/Data
  API/TLS/grant state, two Cron jobs, two Vault names, and GitHub environment
  names. Provider state, not screenshots alone, is authoritative.
- Contain unexpected access immediately; use reviewed guarded tools to converge
  exact intended state. Do not manually repair domain rows.
- Verify full security/migration/status checks and record the changed provider
  object without its value.

### Restore/recovery escalation

For current Free STAGING there is no provider backup to restore. Stop and state
data-loss scope; do not fabricate a recovery point. If an approved logical dump
exists, restore only into a new isolated project first and verify schema, Auth,
identity, grants, RLS, extensions, Vault/Cron, and application smokes before any
cutover.

For future paid Production, only an authorized incident owner starts provider
restore after selecting a recovery point consistent with the approved RPO.
Expect downtime. Restore Storage objects separately. Reapply/verify environment
settings not contained in a database-only clone, then run migration/security,
identity, job, and application acceptance before reopening traffic.

## Deployment rollback and compatibility

Application rollback may redeploy an earlier reviewed SHA only when that code is
compatible with the already-applied database. Database rollback is never implied.
Future migrations must use expand/contract for breaking changes because the
migration-before-deploy window temporarily runs old code on the new schema.
When compatibility is uncertain, stop traffic-changing actions and fix forward.

## Dependency advisory carry-forward

The accepted inventory remains 0 Critical, 4 High, 2 Moderate. Present usage
does not expose the affected paths, but this is not a patched-version claim.
Reassess immediately before adding dynamic/untrusted SQL identifiers, untrusted
image processing/remote image inputs, or user-supplied CSS/PostCSS processing.
Dependency updates remain a separate narrow review.

## Task 049 Production gate

Production provisioning must define and verify:

- paid backup/PITR decision, RPO/RTO, retention, restore owner, and isolated
  restore rehearsal;
- alert ownership/channels and Vercel/Supabase/GitHub/Brevo log visibility and
  retention;
- liveness/readiness external monitoring and escalation;
- migration failure and code/schema rollback procedure;
- Outbox/Cron overdue thresholds and response owner;
- Auth/SMTP delivery/bounce monitoring;
- incident contacts, privacy-safe log access, and rotation custody;
- environment-specific secrets, Cron/Vault, TLS, grants/RLS/Data API, and exact
  project isolation.

No STAGING credential, backup artifact, Vault value, or notification recipient
may be reused as Production configuration.
