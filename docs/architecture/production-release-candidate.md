# Production Provisioning and Release Candidate

> Task 049 Stage 2 defines repository contracts only. No Production Supabase
> project, Vercel project, domain, secret, migration, user, tenant, SMTP setting,
> Vault entry, Cron job, monitor, or provider configuration exists because of
> this work.

## Environment and customer-data boundary

Production is a separate environment, never an elevated form of STAGING. Every
Supabase project, database credential, API key, Auth URL, SMTP key, Cron secret,
Vault entry, Vercel project, Deploy Hook, GitHub environment value, bootstrap
credential, and tenant row must be Production-specific.

The planned temporary origin is `https://madrasio.vercel.app`, conditional on
Vercel confirming that generated project domain when the separate Production
project is created. `https://madrasio.com` is the future custom origin; it is not
owned or configured yet and must not be treated as available.

The pre-client Release Candidate uses Supabase Free in `eu-central-1`. Free has
no automatic backup or PITR guarantee. It may host only infrastructure acceptance
with no real School/customer data. Infrastructure can be rebuilt from reviewed
code, migrations, and recorded configuration, but lost business data cannot.
The mandatory classification is:

`PRODUCTION_CUSTOMER_DATA_ONBOARDING_BLOCKED_BY_BACKUP`

Before the first real School is created, a paid backup/PITR decision, retention,
RPO/RTO, named recovery owner, and isolated restore rehearsal must be accepted.
The Production bootstrap command enforces this operational gate with exact
confirmation in addition to its exact target and TLS guards.

## Environment contract

Names only—values belong in their future provider scope:

| Location                      | Names                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Vercel public                 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`                                      |
| Vercel server                 | `SUPABASE_URL`, `APP_URL`, `DATABASE_URL`, `DATABASE_SSL_CA`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`                             |
| GitHub `Production` variables | `PRODUCTION_APP_ORIGIN`, `PRODUCTION_EXPECTED_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| GitHub `Production` secrets   | `MIGRATION_DATABASE_URL`, `DATABASE_SSL_CA`, `VERCEL_DEPLOY_HOOK_URL`                                                          |
| Guarded release state         | `DEPLOY_TARGET_ENV`, `DEPLOY_EXPECTED_PROJECT_REF`, `DEPLOY_EXPECTED_SHA`, `PRODUCTION_DEPLOY_CONFIRMATION`                    |

There are no legacy anon/service-role aliases. `MIGRATION_DATABASE_URL` is not
a Vercel runtime variable. The public key remains browser-safe; the Auth Admin,
database, Cron, SMTP, and hook credentials remain server/operator-only.

## Exact project and TLS guards

Production database tools require all of the following before connection:

- explicit `production` target;
- a supplied 20-character Production project ref, distinct from the known
  STAGING ref;
- exact equality between expected deployment and Production refs;
- a connection whose hostname/username resolves to that exact project;
- Session/direct port `5432` for migrations, and Transaction Pooler port `6543`
  for runtime validation;
- the approved `eu-central-1` host shape where a pooler is used;
- an explicit PEM `DATABASE_SSL_CA`.

The shared PostgreSQL connection code retains certificate and hostname
verification. `sslmode=disable`, `ssl=false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`,
plaintext retry, and `rejectUnauthorized:false` are forbidden. Production tools
reject the STAGING ref before mutation; existing STAGING tools continue to
require the exact STAGING ref and modes.

## Manual Production release

`.github/workflows/deploy-production.yml` is `workflow_dispatch` only. It must
be started from `main` with an exact lowercase 40-character candidate SHA and
the exact phrase `DEPLOY_PRODUCTION`. The candidate must exist in the repository,
be an ancestor of `origin/main`, and have a successful exact-SHA `ci.yml` run.
One `production-deployment` concurrency group runs at a time and is never
cancelled automatically.

The future gated sequence is:

1. validate manual inputs and check out the exact candidate;
2. confirm exact-SHA CI and ancestry;
3. frozen install, lint, typecheck, tests, and build;
4. exact Production/TLS guard plus a read-only database connectivity preflight;
5. explicit forward migrations;
6. read-only journal/schema/grants/RLS/function/default-privilege verification;
7. non-force promotion to machine-managed `production-release`;
8. capture the active stable-alias deployment instance and make one
   Production-only secret Deploy Hook invocation;
9. preserve the accepted hook job metadata in a runner-local marker, then use
   bounded polling until the stable origin serves a different deployment
   instance with the exact SHA;
10. liveness, database readiness, unauthenticated API, machine-route, and Data
    API-negative smoke, while confirming the stable alias still serves that
    accepted deployment instance.

Git SHA equality alone is not sufficient evidence of a new deployment when an
environment-only change redeploys the same SHA. The release boundary therefore
combines three independent facts:

- the hook response is a valid current invocation marker;
- `/api/health/deployment` exposes a deployment URL only when Vercel's
  `x-vercel-deployment-url` request header matches the deployment's own
  `VERCEL_URL`; comparing that value with the pre-hook observation proves the
  stable alias moved to a different instance;
- `/api/health/deployment` proves that newly activated instance runs the exact
  approved Git SHA.

The marker is bounded non-secret provider metadata stored only in the GitHub
runner temporary directory. It is updated with the activated deployment URL so
the following smoke step also fails if the stable alias changes. Missing or
malformed baseline, hook, marker, deployment-instance, or SHA evidence fails
closed. An ambiguous hook response never causes an automatic second trigger.
This uses the standard Deploy Hook response and Vercel's documented deployment
request/system metadata, so no Vercel API token or other long-lived provider
credential is required. During the first rollout of this contract, the
currently active legacy endpoint may omit deployment identity; that omission is
recorded only as the pre-hook baseline and can never satisfy post-hook
acceptance. Every deployment built with the new contract must provide a valid
instance identity or fail closed.

The dedicated Vercel Production project must use `production-release` as its
only deployable branch/Deploy Hook source. Direct Git auto-deployment from
`main` must be disconnected or ignored so it cannot bypass this migration gate.

Build, install, and application startup never migrate. Migration/security failure
prevents promotion and deployment. There is no automatic down migration, journal
editing, schema push, destructive repair, or automatic provider rollback. Fix
forward and rerun the reviewed exact SHA. An application rollback is permitted
only to a SHA compatible with the already-applied database.

The existing GitHub `Production` environment is currently empty and unprotected.
Before adding values, enable available required-reviewer and deployment-ref
restrictions and govern administrator bypass. These are defense-in-depth: the
workflow's exact phrase, SHA, target, CI, TLS, migration, security, readiness,
and smoke guards remain mandatory even when plan-level protections are absent.

## Database and pre-tenant smoke

The initial database target is exactly 16 migrations through
`0015_data-api-grants-hardening`, 39 public application tables, canonical User
email constraints, 39/39 RLS-enabled tables, zero application RLS policies, and
no public/anon/authenticated/service-role application object privileges. The
security verifier is read-only after migration.

Pre-tenant smoke deliberately requires no School or Admin. It checks liveness,
readiness, exact deployed SHA, unauthenticated `/me`, POST/GET machine-route
denial, and a normal application-table Data API negative response using the
Production public project URL/key. Role smoke begins only after the separately
approved first tenant exists.

## Auth and SMTP

Production Auth must use only modern publishable/secret keys, with public and
anonymous signup disabled, email/password enabled, minimum password length 8,
the confirmed Site URL, exact `/auth/confirm` allowlist, no wildcard redirect,
and this Invite template:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite
```

Production SMTP uses Brevo Free with a separate SMTP key and preferably a
separate sender identity on the already authenticated organizational domain.
The STAGING key is never reused. `madrasio.vercel.app` is not a sender domain.
After `madrasio.com` is purchased, authenticate it independently, verify DKIM,
DMARC and provider-required SPF state, and migrate the sender through a reviewed
provider checkpoint.

## Cron and Vault

The guarded Production configurator requires the exact phrase
`CONFIGURE_PRODUCTION_CRON`, the exact Production target/TLS contract, the
confirmed stable origin, and a strong `CRON_SECRET` distinct from the Auth Admin
secret. It idempotently manages only:

- Vault names `sms_production_app_origin` and `sms_production_cron_secret`;
- Cron jobs `sms-production-process-scheduled-announcements` and
  `sms-production-process-outbox`;
- one-minute authenticated HTTP invocations of the existing internal routes.

Cron SQL contains only Vault lookups and HTTP invocation. It does not publish,
resolve recipients, mutate Outbox business state, or create Notifications.
The verifier reads extension, Vault-name, job-contract, and latest-run state
without decrypting or printing values.

## First tenant and seed prohibition

`bootstrap:first-tenant:production` is the only planned Production bootstrap.
It requires exact Production project/Auth/database reconciliation, verified TLS,
`BOOTSTRAP_PRODUCTION`, and `BACKUP_AND_RESTORE_ACCEPTED`. It may create only one
real School, the initial Auth identity, canonical application User, and exact
SCHOOL_ADMIN membership. No academic/demo data is implied.

`seed:staging-demo` remains permanently STAGING-only. Production must never
receive demo Students, Teachers, Parents, grades/results, Notifications, Outbox
events, or the preserved 2027 schedule.

## Zero-budget operations and later acceptance

The operator is the initial Production owner, deployment approver, recovery
owner, alert owner, and operator-email escalation recipient. Vercel, GitHub,
Supabase, and Brevo provide native evidence. A later provider stage may configure
UptimeRobot Free against `/api/health` and `/api/health/ready`, with sustained
five-minute readiness failure as the initial alert threshold.

The dependency release gate remains 0 Critical, 4 High, and 2 Moderate. Reassess
before RC if Production introduces dynamic/untrusted SQL identifiers, untrusted
image processing, or user-controlled CSS/PostCSS input.

No provider object is created by this document. Each Production provider-write
stage must stop for review before the next stage.
