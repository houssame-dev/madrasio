# Vercel STAGING and CI/CD

> Task 046 defines the dedicated Vercel STAGING release pipeline. The application
> environment is STAGING even though Vercel calls the stable target `production`:
> the entire Vercel project is isolated for STAGING and must never contain
> Production Supabase configuration.

## Dedicated project and origin

The approved project name is `school-management-system-staging`. A Vercel Custom
Environment is not required; a dedicated project works on Hobby and gives STAGING
its own stable production alias. The intended stable origin is
`https://school-management-system-staging.vercel.app`, subject to provider-side
availability confirmation when the project is created.

The Vercel Root Directory is `apps/web`, the only deployable application. The
project must keep **Include source files outside of the Root Directory in the
Build Step** enabled because the Next.js application consumes `packages/*`,
`database`, the root workspace definition, and the root pnpm lockfile. Vercel
documents that this is enabled by default for modern monorepo projects. The
framework is Next.js, pnpm comes from the root `packageManager` field, build is
`pnpm build` from the application root, and framework-default output handling is
used. No workspace content is copied into the application.

`apps/web/vercel.json` disables all Git-triggered Vercel deployments. GitHub
Actions is the only release authority. It also selects the single `fra1`
Frankfurt function region, geographically aligned with Supabase `eu-central-1`;
static assets remain globally distributed. The provider project settings must
be checked after linking to confirm Root Directory, outside-root sources, Node
24, Git deployment disabled, and the stable alias.

## Environment matrix

| Location                     | Classification   | Names/purpose                                                                                           |
| ---------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------- |
| Vercel                       | Public           | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`                      |
| Vercel                       | Server config    | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_URL`                                                          |
| Vercel                       | Server secret    | `DATABASE_URL` (Transaction Pooler `:6543`), `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`                 |
| GitHub `staging` environment | Variable         | `STAGING_APP_ORIGIN`                                                                                    |
| GitHub `staging` environment | Secret           | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `MIGRATION_DATABASE_URL` (Session Pooler `:5432`) |
| Supabase Vault               | Encrypted secret | `sms_staging_app_origin`, `sms_staging_cron_secret`                                                     |

`MIGRATION_DATABASE_URL` is not a Vercel runtime variable. `DATABASE_URL` is not
needed by GitHub's migration stage. `CRON_SECRET` is distinct from the Supabase
service-role key and is never public. Values must not be written to workflows,
logs, documentation, or `.vercel` state; `.vercel` remains ignored.

The repository supports Node `>=20`; Vercel currently resolves that range to
Node 24, so CI explicitly uses Node 24. pnpm is resolved from the committed
`packageManager: pnpm@11.22.0` declaration and cached by `setup-node`.

## Continuous integration

`.github/workflows/ci.yml` runs for pull requests to `main` and pushes to
`main`. It performs a frozen install, lint, typecheck, all unit/integration
tests, build, and canonical Playwright smoke. It has read-only repository
permission and uses only inert build placeholders. PR jobs receive no STAGING
credentials and cannot mutate or deploy STAGING.

## STAGING deployment workflow

`.github/workflows/deploy-staging.yml` runs on a push to `main` or an explicit
dispatch of the `main` workflow. The job declares `environment: staging`, has
read-only repository permission, and refuses non-`main` refs. Concurrency group
`staging-deployment` permits one release at a time and does not cancel an
in-progress migration/deployment.

The exact order is:

1. check out and verify `GITHUB_SHA`;
2. frozen install, lint, typecheck, tests, and ordinary build validation;
3. pull the dedicated project's Vercel Production-target settings;
4. run a production-like `vercel build --prod`;
5. run `pnpm db:migrate` explicitly through `MIGRATION_DATABASE_URL`;
6. run `pnpm verify:staging-migration`;
7. deploy that same `.vercel/output` with `vercel deploy --prebuilt --prod`;
8. wait for readiness and smoke the stable origin.

Vercel CLI is pinned to `59.11.1` in the workflow. Build, application startup,
`postinstall`, and `prebuild` never run migrations. The first pipeline execution
against current STAGING should be a migration no-op: the verifier requires the
exact 15 committed timestamps through `0014_canonical-user-email`, 39 public
application tables, `auth.users`, and the canonical `public.users.email`
column/constraints. Target guards require STAGING ref `cqeaxlttezunirsmkrxz`
and migration port `5432`. A migration or verification failure prevents deploy.

The deployment smoke requires an explicit public HTTPS origin, refuses
localhost/credentials/paths, verifies `/login`, unauthenticated `/me`, GET 405
on both internal job routes, and generic 401 responses for missing and wrong
machine credentials. It never needs the real job credential.

## Failure policy

| Failure                            | Result                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| CI/validation fails                | No migration and no deploy                                                                                 |
| Vercel build fails                 | No migration and no deploy                                                                                 |
| Migration fails                    | No deploy                                                                                                  |
| Migration verification fails       | No deploy                                                                                                  |
| Deploy fails after migration       | Migration may already be applied; retry the same forward-compatible deploy, never roll back schema blindly |
| Smoke fails                        | Deployment remains observable but workflow fails visibly                                                   |
| Cron registration/invocation fails | Application stays deployed; Task 046 is not accepted until corrected                                       |

Future migrations must tolerate the migration-before-deploy interval. Breaking
changes require an expand/contract release, not a reordered gate.

## Supabase Auth deployment contract

After the stable origin exists, STAGING Auth must use it as Site URL. The exact
HTTPS `/auth/confirm` flow must be allowlisted; intentional localhost callbacks
may remain for local development, but no arbitrary Internet wildcard is allowed.
The Invite User template remains:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite
```

Vercel `APP_URL` and `NEXT_PUBLIC_APP_URL` must be the same stable origin, so
Teacher/Parent invitations produce the deployed callback. A public callback
reachability/token-verification smoke is required after provider configuration.
Custom SMTP remains Task 047.

## Supabase Cron deployment contract

The guarded `pnpm configure:staging-cron` command requires explicit
`RUN_STAGING_CRON_CONFIGURATION=1`, the exact STAGING Session Pooler target, a
stable HTTPS origin, and a strong server-only `CRON_SECRET`. It enables/verifies
`pg_cron` and `pg_net`, upserts the two named Vault secrets, rejects ambiguous
duplicate secret/job names, and schedules these named jobs every minute:

| Job                                           | Target                                               |
| --------------------------------------------- | ---------------------------------------------------- |
| `sms-staging-process-scheduled-announcements` | `/api/internal/jobs/process-scheduled-announcements` |
| `sms-staging-process-outbox`                  | `/api/internal/jobs/process-outbox`                  |

The stored Cron commands contain only Vault secret names and route paths. They
perform authenticated `pg_net` POSTs and contain no recipient, publication,
Notification, Result, or Outbox business SQL. Rerunning updates the same named
jobs rather than creating duplicates. `pnpm verify:staging-cron` checks the
extensions, secret names, exact two jobs/schedules, paths, and safe latest run
statuses without decrypting or printing secrets.

Acceptance requires real `cron.job_run_details` and `net._http_response`
evidence that Vercel returned success. Both jobs are independent; database
state, not timing, orders scheduled publication before later Outbox projection.
The preserved `2027-06-15T12:00:00.000Z` publication must remain `SCHEDULED`
after multiple invocations.

## Provider execution checkpoint

Repository changes can be reviewed without provider credentials. Provider
acceptance additionally requires an authenticated Vercel account and GitHub
administration capable of creating the dedicated project, setting its runtime
variables, and populating the GitHub `staging` environment. These values must be
entered directly in provider secret stores, never supplied in chat.

Because Task 046 is under `DO NOT COMMIT`, the new push-triggered workflow cannot
have a real GitHub Actions execution until review and commit. If no already-
committed dispatch workflow can deploy the exact change, the expected checkpoint
is `REAL_CI_EXECUTION_PENDING_COMMIT`. After review, the first `main` run must
prove the complete migration gate, deploy, smoke, Auth configuration, Cron
registration, and scheduler invocation before Task 046 is marked complete.

## Production separation, logs, and handoff

Production receives no project, database, Auth, Vault, Cron, or deployment
change. Logs may contain safe job names, counts, public origin, deployment ID,
and commit SHA, but never connection URLs, passwords, tokens, service-role
credentials, machine secrets, cookies, or Outbox payloads.

Task 047 inherits the stable HTTPS origin, Auth redirect/template configuration,
and Custom SMTP boundary. Task 048 inherits broader deployment/job metrics,
alerts, retention, and log review; Task 046 provides only safe workflow status,
Vercel readiness/log inspection, Cron history, and `pg_net` response evidence.

Useful platform references: [Vercel prebuilt deployment](https://vercel.com/docs/cli/deploy),
[Vercel Git deployment control](https://vercel.com/docs/project-configuration/git-configuration),
[Vercel monorepo outside-root sources](https://vercel.com/docs/monorepos/monorepo-faq),
[Supabase Cron](https://supabase.com/docs/guides/cron),
[Supabase Vault](https://supabase.com/docs/guides/database/vault), and
[Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).
