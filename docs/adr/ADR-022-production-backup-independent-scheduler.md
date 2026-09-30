# ADR-022: Production Backup Independent Scheduler

- Status: Accepted
- Date: 2026-09-29

## Context

Task 050 requires a Production recovery-point objective of at most six hours.

Cronitor continues to require one verified Production recovery point every four
hours with one hour of grace, producing a five-hour monitoring/freshness failure
window.

ADR-021 hardened the GitHub-native frequent backup-attempt cadence to every two
hours:

`23 1,3,5,7,9,11,13,15,17,19,21,23 * * *`

The weekly Sunday schedule remains:

`47 2 * * 0`

Post-remediation natural operating evidence showed healthy backup execution but
insufficient GitHub scheduled-event delivery/workflow-run creation.

Observed evidence:

- three natural Production backups completed successfully;
- zero natural backup execution failures;
- nine nominal two-hour windows fully elapsed;
- seven windows contained no Backup Production workflow run;
- maximum workflow-run creation gap:
  `7.177 hours`;
- maximum verified recovery-point gap:
  `7.174 hours`;
- maximum success-heartbeat evidence gap:
  `7.171 hours`.

This exceeded both the six-hour Production RPO and five-hour monitoring window.

Failure boundary:

`HOSTED_SCHEDULE_DELIVERY_OR_WORKFLOW_RUN_CREATION_GAPS_PERSIST_UNDER_TWO_HOUR_CADENCE`

The available GitHub run metadata cannot prove whether an individual absent
opportunity was dropped or delivered too late.

The operational conclusion is nevertheless sufficient: the GitHub scheduler
fault domain alone has empirically failed the Production timing contract.

## Decision

Retain the GitHub-native two-hour Production backup schedule.

Add a second independent automatic scheduler using Cloudflare Workers Cron.

Cloudflare cadence:

`23 0,2,4,6,8,10,12,14,16,18,20,22 * * *`

GitHub uses odd UTC hours and Cloudflare uses even UTC hours.

Combined nominal recovery-opportunity spacing is one hour.

Cloudflare does not implement backup logic.

The Worker invokes:

`.github/workflows/backup-production.yml`

through GitHub Actions `workflow_dispatch`.

The repository-owned workflow remains authoritative for exact-SHA validation,
CI validation, Production environment access, backup creation, age encryption,
R2 persistence/readback, cleanup, heartbeat behavior, and
`production_backup_verified` evidence.

## Authentication and least privilege

The Worker authenticates through a GitHub App installation token.

The GitHub App must:

- be installed only for the Madrasio repository;
- have repository Actions permission:
  `write`;
- have no Contents write permission;
- have no Administration permission;
- have no unrelated repository permissions.

A long-lived PAT is not accepted.

The GitHub App private key is stored only as the Cloudflare Worker secret:

`GITHUB_APP_PRIVATE_KEY`

Allowed non-secret Worker configuration:

- `GITHUB_APP_ID`;
- `GITHUB_INSTALLATION_ID`;
- `GITHUB_OWNER`;
- `GITHUB_REPOSITORY`;
- `GITHUB_WORKFLOW`;
- `BACKUP_CANDIDATE_SHA`.

A short-lived installation token is minted for each scheduled invocation.

Neither the private key nor installation token may be logged, returned,
persisted, committed, or transported through workflow inputs.

## Workflow dispatch contract

The existing intentional manual dispatch remains supported.

The workflow is extended with safe metadata inputs:

- `trigger_source`;
- `scheduled_for_utc`.

Accepted external/manual workflow-dispatch sources:

- `manual`;
- `cloudflare-cron-v1`.

Native GitHub schedule execution is represented safely as:

`github-schedule`

Cloudflare automatic dispatch supplies:

- pinned `candidate_sha`;
- `BACKUP_PRODUCTION`;
- `frequent`;
- `cloudflare-cron-v1`;
- scheduled UTC timestamp.

Trigger-source/timestamp values are observability metadata, not authentication.

The GitHub App installation token is the external authentication boundary.

## Fail-closed automation gate

The existing Production kill switch remains:

`PRODUCTION_BACKUP_AUTOMATION_ENABLED`

GitHub-native scheduled execution continues to fail closed unless its value is
exact lowercase `true`.

Cloudflare-originated automatic workflow dispatch must use the same fail-closed
automatic gate.

Explicit intentional manual operator dispatch remains separately available under
its existing confirmation and exact-SHA contract.

Disabling the Production automation variable must therefore stop both automatic
scheduler paths while preserving the explicit manual recovery path.

## Candidate SHA

The Worker does not follow arbitrary repository HEAD.

`BACKUP_CANDIDATE_SHA` is pinned.

Its first accepted value must be the exact independent-scheduler implementation
commit after successful repository CI and hosted exact-SHA workflow verification.

Later SHA rotation is a separately reviewed operational change.

## Retry and ambiguity policy

Each Cloudflare scheduled invocation issues at most one GitHub workflow-dispatch
request.

Immediate blind retry is prohibited.

The scheduled handler disables Cloudflare automatic retry for that invocation.

A GitHub 2xx/204 response proves dispatch acceptance only, not backup success.

Ambiguous dispatch acceptance must not cause an immediate duplicate dispatch.

The next independent scheduled opportunity is the recovery mechanism.

## Concurrency and overlap

Existing concurrency remains:

`group: production-backup`

and:

`cancel-in-progress: false`

Overlapping accepted automatic attempts queue instead of cancelling one another.

## Observability

Safe Production evidence must distinguish:

- `github-schedule`;
- `manual`;
- `cloudflare-cron-v1`.

No private key, installation token, or other credential may be emitted.

The Cloudflare scheduled timestamp may be recorded as safe metadata.

Manual dispatches are never automatic recurring-cadence evidence.

## Operational consequences

Nominal frequent opportunities become:

- GitHub:
  `12/day`;
- Cloudflare:
  `12/day`;
- combined:
  `24/day`.

Across the existing eight-day frequent retention period, theoretical nominal
frequent-object population becomes approximately:

`192`

before normal retention deletion timing.

## Implementation boundary

Repository implementation must be completed and verified before either external
provider resource is activated.

Implementation must:

1. extend workflow source/timestamp metadata;
2. apply the automatic kill switch to Cloudflare dispatches;
3. preserve manual dispatch semantics;
4. preserve GitHub's two-hour schedule;
5. preserve the weekly schedule;
6. preserve Production environment, permissions, concurrency, timeout, backup,
   encryption, storage, cleanup, heartbeat, and restore contracts;
7. add a repository-owned Cloudflare Worker without duplicating backup logic;
8. add workflow and Worker security/dispatch tests;
9. update Production backup architecture documentation.

Provider activation remains a later gate.

## Provider activation order

After the implementation commit passes repository CI and exact-SHA hosted
verification:

1. create the repository-scoped GitHub App;
2. install it only for Madrasio;
3. create/configure the Cloudflare Worker;
4. store the private key only as a Worker secret;
5. configure non-secret variables;
6. pin `BACKUP_CANDIDATE_SHA` to the accepted implementation SHA;
7. verify provider configuration without dispatch;
8. enable the Cloudflare Cron Trigger as the final activation mutation.

No external automatic path may be activated before the repository workflow
understands and fail-closes that source.

## Acceptance evidence

Implementation and provider configuration do not accept Production RPO.

Final RPO acceptance requires natural automatic evidence including:

- at least two successful Cloudflare-originated verified recovery points;
- the GitHub-native schedule remains active;
- combined recovery-point intervals <= 6 hours;
- combined success-heartbeat intervals <= 5 hours;
- latest recovery point <= 6 hours old;
- latest success-heartbeat evidence <= 5 hours old;
- no relevant failed automatic backup in the acceptance window;
- no manual dispatch counted as cadence evidence;
- accepted Production RTO remains preserved.

## Rollback

Before external activation, rollback is repository-only.

After activation, disable/remove the Cloudflare Cron Trigger first.

The retained GitHub two-hour schedule remains available during rollback.

If needed, revoke the GitHub App installation/private key after the external
Cron Trigger is disabled.

Rollback never restores Production RPO acceptance automatically.

## Consequences

This decision introduces:

- a second scheduler fault domain;
- one Cloudflare Worker;
- one repository-scoped GitHub App;
- one Cloudflare secret containing the App private key;
- short-lived GitHub installation tokens;
- up to approximately 24 nominal frequent opportunities per day.

It avoids:

- duplicated backup logic;
- long-lived PATs;
- broader GitHub Contents/Admin permissions;
- replacement of the GitHub scheduler;
- manual dispatch being treated as cadence evidence.

Production RPO remains:

`NOT ACCEPTED`

Production customer onboarding remains blocked until explicit RPO acceptance.
