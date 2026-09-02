# Vercel STAGING and CI/CD

> Task 046 defines the dedicated Vercel STAGING release pipeline. The application
> environment is STAGING even though Vercel calls the stable target `production`:
> the entire Vercel project is isolated for STAGING and must never contain
> Production Supabase configuration.

## Dedicated project and origin

The approved project name is `school-management-system-staging`. A Vercel Custom
Environment is not required; a dedicated project works on Hobby and gives STAGING
its own stable production alias. The provider project exists and its stable
origin is `https://school-management-system-staging.vercel.app`. Public deployment
acceptance is still pending; project existence does not prove a working release.

The Vercel Root Directory is `apps/web`, the only deployable application. The
project must keep **Include source files outside of the Root Directory in the
Build Step** enabled because the Next.js application consumes `packages/*`,
`database`, the root workspace definition, and the root pnpm lockfile. Vercel
documents that this is enabled by default for modern monorepo projects. The
framework is Next.js, pnpm comes from the root `packageManager` field, build is
`pnpm build` from the application root, and framework-default output handling is
used. No workspace content is copied into the application.

`apps/web/vercel.json` keeps `git.deploymentEnabled: false`: ordinary pushes to
`main` and `staging-release` must not auto-deploy. Do not use deprecated
`github.enabled: false`, which can disable Deploy Hooks as well. GitHub Actions
is the only release authority, via the secret hook after its migration gate.
The config also selects the single `fra1`
Frankfurt function region, geographically aligned with Supabase `eu-central-1`;
static assets remain globally distributed. The provider project settings must
be checked after linking to confirm Root Directory, outside-root sources, Node
24, Git deployment disabled, and the stable alias.

## Environment matrix

| Location                     | Classification     | Names/purpose                                                                                        |
| ---------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| Vercel                       | Public             | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`                   |
| Vercel                       | Server config      | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_URL`                                                       |
| Vercel                       | Server secret      | `DATABASE_URL` (Transaction Pooler `:6543`), `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`              |
| GitHub `staging` environment | Variable           | `STAGING_APP_ORIGIN`                                                                                 |
| GitHub `staging` environment | Secret             | `VERCEL_DEPLOY_HOOK_URL`, `MIGRATION_DATABASE_URL` (Session Pooler `:5432`)                          |
| GitHub Actions               | Built-in authority | `GITHUB_TOKEN` / GitHub Script token, `contents: write` for the deployment job only                  |
| GitHub Actions               | Derived config     | `DEPLOY_EXPECTED_SHA` from `github.sha`; fixed `DEPLOY_TARGET_ENV` and `DEPLOY_EXPECTED_PROJECT_REF` |
| Vercel                       | System metadata    | `VERCEL_GIT_COMMIT_SHA`, available to server build/runtime; not a manually entered SHA               |
| Supabase Vault               | Encrypted secret   | `sms_staging_app_origin`, `sms_staging_cron_secret`                                                  |

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
`contents: write` solely to promote the release ref, and refuses non-`main` refs.
The workflow default and normal PR CI remain read-only. Concurrency group
`staging-deployment` permits one release at a time and does not cancel an
in-progress migration/deployment.

The exact order is:

1. check out and verify `GITHUB_SHA`;
2. frozen install, lint, typecheck, tests, and ordinary build validation;
3. run `pnpm db:migrate` explicitly through `MIGRATION_DATABASE_URL`;
4. run `pnpm verify:staging-migration`;
5. create/update `refs/heads/staging-release` to the exact tested `github.sha`
   using GitHub's ref API, then verify the returned ref SHA;
6. `pnpm deploy:staging-hook`: one secret-authenticated-by-URL POST to the hook
   tied only to `staging-release` (not `main`);
7. Vercel independently builds that verified Git commit and deploys it;
8. `pnpm verify:staging-release` waits for exact-SHA readiness, then
   `pnpm verify:staging-smoke` verifies the stable origin.

This replaces GitHub Vercel CLI build/prebuilt upload with ordinary GitHub
application build validation before migration and a Vercel Git build afterward.
**Commit identity is preserved; artifact identity is not claimed.** No Vercel
PAT, CLI, CLI dependency, or release-age exceptions are required by the final
deployment path. Build, application startup, `postinstall`, and `prebuild` never
run migrations or seed/provision/process hosted work. The first pipeline execution
against current STAGING should be a migration no-op: the verifier requires the
exact 15 committed timestamps through `0014_canonical-user-email`, 39 public
application tables, `auth.users`, and the canonical `public.users.email`
column/constraints. Target guards require STAGING ref `cqeaxlttezunirsmkrxz`
and migration port `5432`. A migration or verification failure prevents deploy.

The deployment smoke requires an explicit public HTTPS origin, refuses
localhost/credentials/paths, verifies `/login`, unauthenticated `/me`, GET 405
on both internal job routes, and generic 401 responses for missing and wrong
machine credentials. It never needs the real job credential. It requires the
exact approved STAGING origin and `DEPLOY_EXPECTED_SHA`, checking that SHA both
before and after smoke; it cannot pass against a previous deployment.

### Release branch, hook, and exact-SHA readiness

`staging-release` is machine-managed transport, not a development branch. The
workflow creates it only after migration verification if absent. Updates use
`force: false`; an older queued main commit cannot move it backward. No merge,
cherry-pick, or squash commit is generated. Protect direct human pushes where
the GitHub plan permits; this is defense-in-depth, not a substitute for disabling
Vercel Git auto-deployments. Only the hook may start the release.

The deployment job holds its concurrency slot through polling and smoke. Later
main pushes do not move the release ref during that wait. On a hook timeout or
ambiguous failure, inspect/cancel pending Vercel work before another promotion:
the provider may still have queued work even though Actions failed. GitHub
concurrency does not guarantee FIFO ordering; non-fast-forward promotion fails
closed. Never bypass the gate with a manual hook invocation.

The hook URL is a bearer-equivalent credential stored only in GitHub environment
`staging` as `VERCEL_DEPLOY_HOOK_URL`. It must target the exact STAGING project
and `staging-release`. The trigger validates the HTTPS Vercel hook URL shape,
refuses redirects, sends one POST with a 15-second timeout, and discards the
response body. A 2xx means accepted, not READY. No hook URL, token, provider body,
or private metadata is logged. Ambiguous failures are not automatically retried.

`GET /api/health/deployment` is public and returns only `{ status: "ok", commitSha }`.
It is force-dynamic and `Cache-Control: no-store`; `commitSha` comes only from a
valid 40-character `VERCEL_GIT_COMMIT_SHA`, otherwise `null`. It does not access
the database or expose other environment variables. System Git metadata is not
authorization authority. Polling makes at most 60 requests, each with a 5-second
timeout, separated by 10 seconds (under 15 minutes excluding scheduler overhead).
Missing metadata, redirects, unavailable health, and wrong SHA never count as
success. Final timeout fails visibly rather than accepting an old release.

## Failure policy

| Failure                            | Result                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| CI/validation fails                | No migration and no deploy                                                                                 |
| GitHub application build fails     | No migration, promotion, or hook                                                                           |
| Migration fails                    | No deploy                                                                                                  |
| Migration verification fails       | No deploy                                                                                                  |
| Release promotion fails            | No hook; never force-update to bypass a newer release or protection rule                                   |
| Hook fails or times out            | No blind retry; inspect queued provider work before another promotion                                      |
| Vercel Git build fails             | Migration may already be applied; previous release may remain live; exact-SHA wait fails                   |
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

Read-only preflight confirmed the existing dedicated STAGING project is not Git
connected, Root Directory is `apps/web`, and access to system environment
variables is enabled. No provider writes are included in this repository change.
After review/commit, an operator must coordinate these steps before enabling the
new release run (a failed missing-hook run must not be bypassed):

1. Create `staging-release` from the reviewed main commit if it does not exist,
   or let the gated workflow create it after migration verification. Do not
   point it to unverified feature code. Apply available machine-only push rules.
2. Confirm `git.deploymentEnabled: false` is committed on main and the release
   ref. Connect only `houssame-dev/school_management_system` to the dedicated
   `school-management-system-staging` Vercel project, not a Production project.
   Verify connection itself and ordinary main/release pushes create no deployment.
3. Set the Vercel Production Branch to `staging-release`. Keep Root Directory
   `apps/web`, outside-root sources enabled, and existing STAGING-only env values.
4. Create exactly one hook named `sms-staging-github-actions` for `staging-release`.
   Store its URL directly as GitHub `staging` secret `VERCEL_DEPLOY_HOOK_URL`;
   never paste it into logs, files, or chat. Do not manually trigger it.
5. Verify **Enable access to System Environment Variables** remains enabled,
   so Vercel supplies `VERCEL_GIT_COMMIT_SHA` to the server. Do not hardcode it.
6. Run the reviewed main workflow; prove migration gate, hook, exact deployed
   SHA, and smoke. Test ordinary push non-deployment with provider history.
   Keep Auth/Cron provider work as subsequent Task 046 checkpoints.

Real Deploy Hook compatibility and disabled-auto-deploy behavior still require
provider acceptance; repository tests cannot establish provider behavior. If
hooks are blocked, stop and review the narrowest configuration adjustment rather
than enabling ordinary Git auto-deployments. Until committed, the new transport
has `REAL_CI_EXECUTION_PENDING_COMMIT` status.

### Abandoned PAT/CLI transport

The project-scoped PAT, team-scoped PAT, and temporarily approved Full Account
PAT all failed Vercel CLI project-settings retrieval (`Could not retrieve Project
Settings`). Authoritative team/project identifiers were verified and re-saved;
interactive provider access succeeded. This is recorded as
`VERCEL_PAT_CLI_ACCOUNT_LEVEL_BLOCKER`, not proof of incorrect project identifiers.
No additional PAT experiments or broader credentials are approved. The STAGING
CI path now uses a Deploy Hook and controlled release branch instead.

`VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` are unused by the new
workflow. Existing GitHub secrets must not be deleted before operator review of
the transition. After successful Deploy Hook acceptance, remove the obsolete
secrets and revoke obsolete PATs, especially the Full Account token. Re-evaluate
provider compatibility later; no PAT is needed for this transport. Task 047
inherits review of hook rotation and obsolete-token revocation, not permission
to retain a broad PAT indefinitely.

## Production separation, logs, and handoff

Production receives no project, database, Auth, Vault, Cron, or deployment
change. Logs may contain safe job names, counts, public origin, deployment ID,
and commit SHA, but never connection URLs, passwords, tokens, service-role
credentials, machine secrets, cookies, or Outbox payloads.

Task 047 inherits the stable HTTPS origin, Auth redirect/template configuration,
and Custom SMTP boundary. Task 048 inherits broader deployment/job metrics,
alerts, retention, and log review; Task 046 provides only safe workflow status,
Vercel readiness/log inspection, Cron history, and `pg_net` response evidence.

Useful platform references: [Vercel Deploy Hooks](https://vercel.com/docs/deploy-hooks),
[Vercel system Git metadata](https://vercel.com/docs/environment-variables/system-environment-variables),
[Vercel Git deployment control](https://vercel.com/docs/project-configuration/git-configuration),
[Vercel monorepo outside-root sources](https://vercel.com/docs/monorepos/monorepo-faq),
[Supabase Cron](https://supabase.com/docs/guides/cron),
[Supabase Vault](https://supabase.com/docs/guides/database/vault), and
[Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).
