# Madrasio ΓÇö Current Project State

Last updated: 2026-09-30
## Current Task

Task 050 ΓÇö Production Backup & Recovery

## Current Stage

Task 050 independent-scheduler local repository implementation: PASS.

Local repository blockers for this implementation: NONE.

Accepted Production RTO remains `997.767` seconds.

Production RPO remains NOT ACCEPTED. The accepted ADR-022 implementation does
not establish natural automatic recovery-point cadence.

Production customer onboarding remains blocked:

`PRODUCTION_CUSTOMER_DATA_ONBOARDING_BLOCKED_BY_BACKUP`

The GitHub two-hour and weekly schedules are preserved. The independent
Cloudflare scheduled-only Worker is implemented locally but is not deployed;
its Cron Trigger is not activated. Both automatic paths use the existing
Production automation kill switch. Provider setup is NOT yet authorized.

Immediate gate: pre-commit acceptance of the exact 11-file repository surface:
PASS (local verification only; commit/push remain unauthorized).

`PROJECT_STATE_SYNC_AND_PRECOMMIT_AFTER_INDEPENDENT_SCHEDULER_LOCAL_IMPLEMENTATION_PASS`

After that acceptance, the next gate requires separate authorization:

`PRODUCTION_RPO_INDEPENDENT_SCHEDULER_IMPLEMENTATION_COMMIT_AND_PUSH_ONLY`

No staging, commit, push, provider setup or Production operation is authorized
during this synchronization/pre-commit gate. The historical implementation-only
plan retained under Exact next step does not authorize another implementation.

## Current branch

main

## Latest relevant commit

`1db366dae0c6328bb00ec639c3d5d11de9cc6de6`

Commit:

`feat: add encrypted production age escrow custody`

Accepted release evidence:

- CI run `36093677963`: completed / success;
- Deploy STAGING run `36093677982`: completed / success;
- both runs used exact repository SHA
  `1db366dae0c6328bb00ec639c3d5d11de9cc6de6`;
- both were automatically triggered by `push`;
- no manual CI or STAGING deployment trigger was used.

Historical earlier repository/release milestones remain valid historical evidence
and are not rewritten by this current metadata section.

## Completed work

### Task 050 recovery implementation

Task 050 recovery stage status:

- Stage 1: complete.
- Stage 2: complete.
- Stage 3: complete.
- Stage 4.1: complete ΓÇö repository implementation and provider infrastructure.
- Stage 4.2: pending ΓÇö no accepted real Production recovery point exists yet.
- Stage 5: pending ΓÇö no accepted timed Production-to-isolated-local restore has been completed.
- Stage 6: complete through the documented STAGING/local reconstructed acceptance evidence.

Production customer onboarding remains blocked until the remaining Production
backup/recovery evidence is accepted.

The recovery architecture uses the `madrasio-recovery-v1` format and an explicit
41-table recovery inventory:

- 39 public application tables
- auth.users
- auth.identities

The isolated restore contract requires:

- RESTORE_TARGET_ENV=isolated-local
- RESTORE_CONFIRMATION=RESTORE_ISOLATED_LOCAL
- loopback-only RESTORE_DATABASE_URL
- external age identity
- expected source project ref
- repository Git SHA
- pinned PostgreSQL recovery tooling

Local recovery targets use repository-owned Docker orchestration with loopback
bindings. The restore is fail-closed and performs manifest, data, identity,
relationship, migration, and application-security reconciliation.

### Stage 6 authorization and rehearsal

The deterministic local-target rehearsal passed.

Verified characteristics included:

- database healthy
- Auth healthy
- PostgreSQL 17.6
- empty Auth foundation
- 39 application tables
- 16 migrations
- 39 RLS-enabled application tables
- 0 application RLS policies
- loopback-only bindings
- no non-loopback bindings
- LAN connectivity rejected
- cleanup complete

A synthetic non-empty local round-trip integration also passed, including Auth
and relational application data.

The Stage 6 final authorization gate passed with:

- repository HEAD/origin validation
- recovery resource cleanup
- pnpm launcher validation using pnpm.cjs
- age 1.3.1
- age-keygen 1.3.1
- PostgreSQL pg_restore 17.6
- local non-empty restore proof

### Stage 6 real STAGING recovery evidence

The original Stage 6 manual lifecycle successfully created and verified the
source fixture and encrypted recovery bundle but was interrupted before its
normal final verification/cleanup sequence completed.

The original runner therefore did NOT itself emit a final
`STAGE_6_RESULT: PASS`.

Stage 6 acceptance was subsequently reconstructed/completed through preserved
artifact restore plus independent cleanup and verification.

Source repository SHA used for the recovery evidence:

d499d1996151fff789d50ca8bf638d6a0a66ca44

Recovery backup ID:

20260922T030909Z-d499d1996151-a7ec79b36fa64be5

Preserved encrypted bundle evidence:

- size: 55,290 bytes
- SHA-256:
  5d5afe2b0952c2aaed1761d1a217dc576ec8d4f7a11e06a59d68a8ed25781d3d
- matching external age identity confirmed
- age version: v1.3.1

The exact preserved STAGING bundle was restored once into a fresh isolated,
loopback-only local recovery target.

The restore completed with:

`isolated_restore_verified`

and reported:

- backup ID matched
- 41 recovered tables

The restore reconciliation covered all manifest fingerprints/counts and the
application security audit.

### Stage 6 restored-state semantic verification

Independent read-only verification of the restored target passed:

- auth.users = 8
- auth.identities = 8
- public application tables = 39
- Drizzle migrations = 16
- RLS-enabled application tables = 39
- application RLS policies = 0
- Teacher Auth/application UUID identity invariant = PASS
- Parent Auth/application UUID identity invariant = PASS
- tenant relationships = PASS
- academic relationships = PASS

The full auth.users table fingerprint reconciliation also proves source/restored
Auth row contents, including encrypted password hashes, matched at the table
fingerprint level.

No second real restore is required.

### Stage 6 cleanup

All Stage 6 temporary state has been cleaned and independently verified.

Completed cleanup:

- interrupted local recovery target removed
- successful restored local target removed
- STAGING fixture application rows removed
- exact temporary STAGING Auth users removed
- STAGING returned to its accepted baseline
- preserved encrypted recovery bundle removed
- matching ephemeral age identity removed
- temporary recovery workspaces removed
- temporary Stage 6 operator scripts removed

No Stage 6 recovery artifact requiring cleanup remains.

## PRD migration

The repository project-rules document was intentionally migrated from:

CLAUDE.md

to:

PRD.md

References across source comments, tests, README files, architecture documents,
schema comments, and domain documentation were updated.

Git recognized the document transition as:

CLAUDE.md => PRD.md (99%)

The migration was committed as:

a1e394530483d9f1c33fc6469feaab9469306a18

CI passed.

## STAGING deploy-hook incident and fix

The PRD migration deployment exposed an ambiguous STAGING Deploy Hook result.

GitHub Deploy STAGING #35 reported:

DEPLOY_HOOK_FAILED

However provider inspection proved that the hook had actually executed:

- Vercel created the deployment
- branch was staging-release
- commit was exactly a1e394530483d9f1c33fc6469feaab9469306a18
- deployment reached Ready
- the stable STAGING alias served that exact commit SHA

The deployment was therefore NOT retried.

Inspection found a correctness issue in the STAGING release transport:
after receiving an HTTP response, the implementation awaited
`response.body.cancel()` inside the same failure boundary used for the Deploy
Hook request.

This allowed failure to dispose an already-received provider body to downgrade
an otherwise confirmed successful 2xx hook response to DEPLOY_HOOK_FAILED.

The fix made response-body disposal best-effort after HTTP acceptance while
preserving all existing safety properties:

- exactly one POST
- no automatic retry
- HTTPS Vercel hook validation
- redirects refused
- 15-second request timeout
- network/timeout ambiguity remains fail-closed
- non-2xx remains fail-closed
- response body remains unused and unlogged
- hook secret remains unlogged

Regression test added:

`does not downgrade a confirmed 2xx when discarding the response body fails`

Verification:

- release-transport focused suite: 17/17 PASS
- complete deployment test suite: 49/49 PASS
- TypeScript typecheck: PASS
- git diff --check: PASS
- CI #93: PASS
- Deploy STAGING #36: PASS

Fix commit:

5d9dd3e84cbd87cf2afe9f81cf5abfd1b1e7b17d

This deployment incident is closed.

## Stage 6 documentation milestone

The completed Task 050 Stage 6 recovery evidence and Production-gate status were
committed to `main` as:

637071611749dd8b190430e09f694ab6a41f7b88

Commit:

docs: record Task 050 Stage 6 recovery acceptance

Remote verification:

- CI: PASS
- Deploy STAGING: PASS

The repository working tree was clean immediately after that commit and push.

The recovery architecture now records:

- Stage 6 STAGING/local recovery acceptance;
- the interrupted original manual lifecycle accurately;
- reconstructed acceptance through the preserved real bundle;
- 41-table manifest reconciliation;
- restored Auth/application UUID invariants;
- tenant and academic relationship verification;
- application-security verification;
- complete Stage 6 cleanup;
- Production RPO as still unproven;
- Production RTO as not yet accepted as a Production operational objective;
- the continuing Production customer-data onboarding block.

## Current recovery engineering follow-up

The Windows pnpm-launcher portability issue exposed by the real Stage 6 restore
has been resolved by the currently staged repository hardening.

Root cause:

- recovery intentionally avoids shell-based package-manager execution;
- pnpm 11.22.0 on the Windows operator workstation did not populate
  `npm_execpath`;
- the real Stage 6 restore succeeded only after the operator supplied an
  absolute pnpm JavaScript launcher manually;
- that manual environment workaround proved the restore implementation but was
  not acceptable as the permanent repository contract.

Permanent repository fix committed locally:

- an existing valid absolute `npm_execpath` remains authoritative;
- when it is absent on Windows, recovery verifies only the npm-global pnpm
  package under `%APPDATA%\npm\node_modules\pnpm`;
- package name and version must match `pnpm` `11.22.0`;
- the launcher comes from the package's own `bin.pnpm` declaration;
- the launcher must remain inside the verified package root;
- only `pnpm.js`, `pnpm.cjs`, or `pnpm.mjs` is accepted;
- execution remains direct through Node with no shell or `.cmd` fallback;
- invalid or unavailable metadata remains fail-closed.

Verification is complete:

- focused recovery contracts: 83/83 PASS;
- broader recovery suite: 147 PASS / 8 intentional opt-in skips;
- real Windows fallback smoke with `npm_execpath` ignored: PASS;
- disposable synthetic local recovery round-trip with `npm_execpath` unset:
  PASS;
- TypeScript: PASS;
- final diff checks: PASS;
- recovery-target cleanup: zero containers, volumes, and networks remain;
- pinned PostgreSQL 17.6 tool image and runtimes verified.

Do not reintroduce the earlier temporary `restore-local.ts` environment-spread
experiment. It was not required for the successful real restore and is not
part of this fix.

The launcher hardening was committed locally as:

b6b10389312842954779f9fe721ce586b18d4259

Commit:

fix: harden Windows recovery pnpm launcher

The substantive commit has been pushed to origin/main.

Remote branch verification:

b6b10389312842954779f9fe721ce586b18d4259

origin/main matches the substantive launcher commit exactly.

Remote verification for the substantive launcher commit is complete:

- CI run 35818717476: PASS
- Deploy STAGING run 35818717473: PASS
- both workflow runs report exact head SHA b6b10389312842954779f9fe721ce586b18d4259
- deployment wait gate emitted `staging_exact_sha_ready` for that exact SHA
  after 8 attempts;
- STAGING smoke verification emitted `staging_deployment_smoke_passed`;
- smoke origin: `https://madrasio-staging.vercel.app`;
- smoke commit SHA: b6b10389312842954779f9fe721ce586b18d4259;
- smoke checks: 11.

The launcher deployment therefore has exact-SHA and live STAGING smoke proof.
No further provider inspection or redeployment is required.
## Current blockers

### Task 050 engineering closeout

No Stage 6 restore execution blocker remains.

The Windows `resolvePnpmInvocation()` hardening and its local verification are
complete.

The substantive launcher fix is committed locally as:

b6b10389312842954779f9fe721ce586b18d4259

`fix: harden Windows recovery pnpm launcher`

Task 050 launcher engineering follow-up is complete:

- CI 35818717476 is complete and successful for
  b6b10389312842954779f9fe721ce586b18d4259;
- Deploy STAGING 35818717473 is complete and successful for
  b6b10389312842954779f9fe721ce586b18d4259;
- the deployment exact-SHA wait gate passed for that same SHA;
- the live STAGING smoke verification passed for that same SHA with 11 checks;
- no additional launcher implementation, restore execution, provider inspection,
  or redeployment is required.

The remaining blocker is separate from this engineering fix: Production
customer onboarding remains blocked by the Production backup/recovery gate.

No additional Stage 6 restore execution is required.

### Production/customer-data gate

Production customer onboarding remains blocked.

Stage 6 STAGING/local recovery acceptance does NOT establish a real Production
recovery point or Production backup automation.

The Production backup/recovery gate must be completed before real customer data
is onboarded.

## Files currently involved

Primary current files:

- docs/PROJECT-STATE.md
- docs/architecture/production-backup-and-recovery.md
- apps/web/scripts/recovery/tools.ts
- apps/web/__tests__/recovery/*
- apps/web/scripts/recovery/restore-local.ts
- apps/web/scripts/recovery/local-target.ts

Recently completed deployment-fix files:

- apps/web/scripts/deployment/release-transport.ts
- apps/web/__tests__/deployment/release-transport.test.ts

The deployment-fix files are committed and no longer active work unless a new
failure is observed.

## Windows pnpm launcher hardening milestone

The Windows `resolvePnpmInvocation()` portability issue exposed by the real
Task 050 Stage 6 restore is now fixed and locally verified.

Implementation:

- existing valid absolute `npm_execpath` remains the first-choice launcher;
- Linux/non-Windows behavior remains unchanged;
- when `npm_execpath` is absent on Windows, recovery checks only the bounded
  npm-global pnpm package under `%APPDATA%\npm\node_modules\pnpm`;
- package metadata must identify exactly `pnpm` version `11.22.0`;
- the launcher must come from the package's own `bin.pnpm` declaration;
- the declared launcher must remain inside that pnpm package root;
- only an actual `pnpm.js`, `pnpm.cjs`, or `pnpm.mjs` launcher is accepted;
- the JavaScript launcher is executed directly with Node through
  `process.execPath`;
- `.cmd`, `.bat`, `.ps1`, shell execution, and arbitrary PATH discovery remain
  disallowed;
- unverified or unavailable launchers fail closed as
  `RESTORE_PACKAGE_MANAGER_LAUNCH_FAILED`.

Files changed:

- `apps/web/scripts/recovery/tools.ts`
- `apps/web/__tests__/recovery/recovery-contracts.test.ts`
- `docs/PROJECT-STATE.md`

Verification completed:

- focused `recovery-contracts.test.ts`: PASS, 83/83 tests;
- verified Windows APPDATA fallback regression: PASS;
- invalid package/version/path/launcher fail-closed regressions: PASS;
- existing explicit `npm_execpath` behavior: PASS;
- existing Linux fallback behavior: PASS;
- real Windows launcher smoke with `npm_execpath` deliberately ignored:
  PASS;
- smoke resolved `pnpm.mjs` from the verified APPDATA package and executed
  pnpm `11.22.0` through Node with `shell: false`;
- broader recovery regression suite: PASS, 147 passed / 8 intentionally
  skipped with all live integration gates disabled;
- disposable local synthetic recovery round-trip: PASS, 1/1;
- that integration ran with `npm_execpath` unset, exercising the new Windows
  fallback through the actual database migration and local restore path;
- synthetic round-trip restored and verified non-empty Auth/application data;
- post-integration cleanup: PASS, zero labeled recovery containers, volumes,
  and networks remain;
- exact pinned PostgreSQL tools image is available locally;
- `pg_dump` runtime: PostgreSQL 17.6 PASS;
- `pg_restore` runtime: PostgreSQL 17.6 PASS;
- final `pnpm --filter @school/web typecheck`: PASS;
- final `git diff --check`: PASS.

No hosted STAGING or Production mutation was performed during this launcher
hardening work. The integration used only disposable loopback-local recovery
targets and synthetic data.

The previous real Task 050 Stage 6 restore must not be repeated. Its acceptance
remains the previously documented reconstructed/completed Stage 6 evidence.

Production customer onboarding remains blocked by the Production backup gate;
this launcher fix does not change that gate.

The verified launcher hardening was committed locally as:

b6b10389312842954779f9fe721ce586b18d4259

Commit:

fix: harden Windows recovery pnpm launcher

It has been pushed successfully to origin/main, and the remote branch resolves
exactly to:

b6b10389312842954779f9fe721ce586b18d4259

GitHub Actions and STAGING verification are complete:

- CI 35818717476: completed / success
- Deploy STAGING 35818717473: completed / success
- workflow head SHA: b6b10389312842954779f9fe721ce586b18d4259
- `staging_exact_sha_ready`:
  b6b10389312842954779f9fe721ce586b18d4259
- `staging_deployment_smoke_passed`:
  b6b10389312842954779f9fe721ce586b18d4259
- smoke origin: `https://madrasio-staging.vercel.app`
- smoke checks: 11

Exact deployed-SHA verification is accepted from the existing successful
workflow evidence. No additional provider-state inspection is required.
## Cronitor credential rotation milestone

The previously exposed Task 050 Production-backup Cronitor telemetry credential
was rotated by the operator before another Production backup attempt.

The GitHub Production environment secret replacement was verified using secret
metadata only:

- secret: `BACKUP_HEARTBEAT_URL`;
- updated at: `2026-09-23T17:52:33Z`;
- freshness verification: PASS;
- secret/telemetry URL value retrieved: NO;
- heartbeat emitted during verification: NO;
- R2 write performed: NO;
- Production database access performed: NO;
- Production backup workflow dispatched: NO;
- Production backup automation enabled: NO;
- deployment triggered: NO;
- repository mutation during verification: NONE.

The earlier PowerShell metadata-verification attempts that failed because of
array parsing and `gh --jq` quoting did not perform any hosted mutation and are
not recovery failures.

The Cronitor rotation prerequisite for the next Production backup attempt is
accepted.
## Production backup automation safety correction milestone

The first final hosted Stage 4.2 readiness preflight discovered that the
GitHub Production environment variable
`PRODUCTION_BACKUP_AUTOMATION_ENABLED` was exactly `true`.

The readiness preflight therefore stopped and did not authorize or dispatch a
Production backup.

A separate bounded safety correction then:

- confirmed the activation variable was exactly `true`;
- deleted only `PRODUCTION_BACKUP_AUTOMATION_ENABLED`;
- verified the variable was absent afterward;
- restored the intended fail-closed state:
  absent activation variable => recurring automation disabled;
- verified no active or conflicting Backup Production workflow run existed.

Safety classification of the correction:

- Production database access: NO;
- R2 access/write: NO;
- Cronitor heartbeat: NO;
- Production backup workflow dispatch: NO;
- deployment trigger: NO;
- secret values accessed: NO;
- local repository mutation: NONE.

The unsafe recurring-automation state is resolved.

A fresh final read-only hosted readiness preflight must pass before the first
manual Production recovery-point attempt can receive explicit authorization.
## Final hosted readiness preflight milestone

The fresh final Stage 4.2 hosted readiness preflight passed from beginning to
end after the Production automation safety correction.

Accepted evidence:

- candidate SHA:
  `b6b10389312842954779f9fe721ce586b18d4259`;
- candidate remains identical to current `main`;
- exact-SHA CI run `35818717476`: success;
- hosted workflow `.github/workflows/backup-production.yml`: active;
- manual workflow-dispatch contract: PASS;
- required Production secret names: PASS;
- rotated `BACKUP_HEARTBEAT_URL` metadata: PASS;
- required Production variable names: PASS;
- `PRODUCTION_BACKUP_AUTOMATION_ENABLED`: ABSENT;
- recurring Production backup automation: DISABLED;
- active/conflicting Production backup runs: NONE;
- `production-backup` concurrency: clear;
- local repository mutation: NONE.

The preflight did not access Production data, access or write R2, emit a
Cronitor heartbeat, retrieve secret values, dispatch a backup workflow,
mutate automation state, or trigger a deployment.

The hosted readiness gate for one separately authorized manual Production
recovery-point attempt is accepted.
## First Production recovery-point dispatch milestone

The first separately authorized Task 050 Stage 4.2 Production recovery-point
attempt was dispatched exactly once.

Dispatch evidence:

- workflow: `.github/workflows/backup-production.yml`;
- GitHub Actions run ID: `35904888145`;
- candidate SHA:
  `b6b10389312842954779f9fe721ce586b18d4259`;
- confirmation: `BACKUP_PRODUCTION`;
- retention class: `frequent`;
- event: `workflow_dispatch`;
- created at: `2026-09-23T18:47:22Z`;
- initial captured status: `queued`;
- dispatch CLI exit code: `0`;
- dispatch attempts issued: EXACTLY ONE;
- second dispatch authorized: NO;
- blind retry authorized: NO;
- recurring automation enabled: NO;
- local repository mutation during dispatch: NONE.

This milestone records only dispatch acceptance.

It does NOT establish that a Production recovery point was successfully
created or accepted.

The exact run must be inspected before any further hosted mutation.
## First Production recovery-point run execution milestone

GitHub Actions run `35904888145` completed successfully on attempt `1`.

Execution evidence:

- workflow: `Backup Production`;
- head SHA:
  `b6b10389312842954779f9fe721ce586b18d4259`;
- event: `workflow_dispatch`;
- run conclusion: `success`;
- activation-gate job conclusion: `success`;
- Production recovery-point job ID: `107330024195`;
- Production recovery-point job conclusion: `success`;
- `Create, upload, read back, and verify recovery point`: `success`;
- `Verify temporary recovery cleanup`: `success`.

The successful job metadata establishes that the repository-defined backup path
ran through recovery-point creation/verification and cleanup without a workflow
failure.

It does not yet independently establish the exact recovery-point evidence
needed for Stage 4.2 acceptance because raw job logs have not yet been reviewed.

No second dispatch, rerun, manual Production database action, manual R2 action,
manual Cronitor action, automation mutation, or deployment occurred during the
metadata inspection.
## Production recovery-contract log review milestone

The bounded read-only log review of Production backup job `107330024195`
completed successfully.

A structured runtime event was emitted:

- event: `production_backup_verified`;
- backup ID:
  `20260923T184801Z-b6b103893128-1c8113bc7dcfd798`;
- retention class: `frequent`;
- object key:
  `frequent/2026/09/23/20260923T184801Z-b6b103893128-1c8113bc7dcfd798.age`;
- encrypted object bytes: `34729`.

Additional review results:

- backup execution: FOUND;
- encrypted bundle: FOUND;
- upload: FOUND;
- readback: FOUND;
- recovery-point verification: FOUND;
- heartbeat: FOUND;
- cleanup: FOUND;
- classified backup failure: NOT FOUND;
- `Verify temporary recovery cleanup`: SUCCESS.

No workflow rerun, second dispatch, manual Production database action, manual R2
action, manual Cronitor action, automation mutation, or local repository
mutation occurred.

The generic log-pattern ordering scan is retained only as a diagnostic hint,
not as acceptance proof, because echoed source/command text can produce false
first-occurrence matches.
## Stage 4.2 Production recovery-point acceptance milestone

Task 050 Stage 4.2 is accepted.

One manually authorized real Production recovery point was created and verified
by GitHub Actions run `35904888145`.

Accepted artifact identity:

- backup ID:
  `20260923T184801Z-b6b103893128-1c8113bc7dcfd798`;
- retention class: `frequent`;
- R2 object:
  `frequent/2026/09/23/20260923T184801Z-b6b103893128-1c8113bc7dcfd798.age`;
- encrypted bytes: `34729`;
- recovery-contract SHA:
  `b6b10389312842954779f9fe721ce586b18d4259`.

Acceptance evidence combines:

- exact-SHA CI acceptance;
- final hosted readiness preflight;
- exactly one authorized manual Production dispatch;
- successful attempt-1 workflow execution;
- successful Production recovery-point job;
- runtime `production_backup_verified` event;
- exact-SHA source correlation;
- immutable R2 upload contract;
- remote bytes/SHA verification;
- independent ciphertext download/readback;
- downloaded bytes/SHA verification;
- verified-before-success-heartbeat ordering;
- successful temporary recovery cleanup;
- no classified backup failure.

The broad log first-occurrence scan that previously produced misleading
ordering ordinals is NOT used as acceptance evidence.

The authoritative ordering comes from the exact implementation plus the
successful structured runtime event.

No additional Production backup is required for this Stage 4.2 acceptance.

Recurring automation remains disabled.

The next recovery gate is Stage 5: a timed restore of the accepted Production
recovery point into an explicitly isolated local target.
## Stage 5 restore-readiness preflight milestone

The Stage 5 read-only restore-readiness preflight completed.

Result:

`BLOCKED`

Exactly four readiness blockers were identified:

- `STAGE5_EXTERNAL_AGE_IDENTITY_PATH_NOT_CONFIGURED`
- `STAGE5_PINNED_POSTGRES_IMAGE_NOT_LOCALLY_AVAILABLE`
- `STAGE5_R2_RETRIEVAL_ORCHESTRATION_NOT_YET_DEFINED`
- `STAGE5_RECOVERY_DOCUMENTATION_RECONCILIATION_REQUIRED`

Positive readiness evidence:

- Docker daemon available;
- no existing local recovery targets;
- Production expected project ref available;
- reviewed R2 download primitive present;
- accepted local restore entrypoint present;
- loopback/non-loopback guards intact;
- recovery tool/version contracts intact;
- Stage 4.2 accepted Production recovery point unchanged;
- Production backup automation still disabled.

No recovery-side effects occurred during the preflight:

- Production object download: NO;
- Production object decryption: NO;
- local recovery target creation: NO;
- restore execution: NO;
- Production database manual access: NO;
- STAGING mutation: NO;
- R2 access/write: NO;
- Cronitor telemetry: NO;
- backup dispatch/rerun: NO;
- Docker image pull: NO;
- automation mutation: NO;
- deployment trigger: NO;
- Stage 6 rerun: NO.

The Stage 5 timing boundary remains:

- start immediately before the first recovery-side action;
- stop only after restore plus the required reconciliation/security verification;
- cleanup is mandatory separate post-timing acceptance evidence;
- RTO target remains <= 8 hours.
## Stage 5 repository-blocker design inspection milestone

The bounded read-only inspection of the two repository-owned Stage 5 blockers
completed successfully.

Result:

`PASS`

R2 retrieval findings:

- `R2RecoveryObjectStore.download(key, destination)` already exists;
- it uses a signed HTTPS GET against the reviewed private R2 target;
- required provider configuration remains environment-only:
  - `R2_ENDPOINT`
  - `R2_BUCKET_NAME`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
- ciphertext output is created with mode `0600`;
- no credential value needs to be printed or persisted by the operator entrypoint.

Workspace findings:

- `createRecoveryWorkDirectory()` already creates a generated operating-system
  temporary `madrasio-recovery-*` directory;
- the directory is hardened to mode `0700` where supported;
- `cleanupRecoveryWorkDirectory()` refuses cleanup outside the generated
  recovery-workspace namespace;
- cleanup removes the entire generated workspace;
- no new workspace or cleanup primitive is required.

Entrypoint findings:

- current recovery entrypoints cover Production backup, STAGING bundle creation,
  local restore, and local target creation;
- no Production ciphertext retrieval entrypoint exists;
- the minimum implementation is a thin wrapper around the existing R2 download
  primitive;
- the wrapper must retrieve exactly one explicit accepted object;
- expected encrypted byte count and expected SHA-256 must be explicit inputs;
- downloaded ciphertext must be verified before restore use;
- provider credentials must remain environment-only;
- generated temporary workspace cleanup must occur on both success and failure;
- focused retrieval tests and package-script wiring are required.

Documentation findings:

- obsolete Production/Stage 4.2 wording remains in
  `docs/architecture/production-backup-and-recovery.md`;
- four distinct source locations contain stale state;
- the inspection produced five phrase matches because one source line matched two
  stale-pattern checks;
- the document must be updated to reflect the accepted real Production recovery
  point and the current Stage 5 timed-restore gate.

No implementation or provider-side effect occurred during this inspection.

An implementation commit is required before the timed Stage 5 restore.
## Stage 5 repository readiness implementation milestone

The bounded Stage 5 repository implementation completed locally.

Result:

`IMPLEMENTED ΓÇö VERIFICATION PENDING`

Files introduced:

- `apps/web/scripts/recovery/retrieve-production-recovery.ts`
- `apps/web/__tests__/recovery/retrieve-production-recovery.test.ts`

Files modified:

- `apps/web/package.json`
- `package.json`
- `docs/architecture/production-backup-and-recovery.md`
- `docs/PROJECT-STATE.md`

Static implementation guards passed:

- required retrieval anchors present;
- no hard-coded R2 credential detected;
- targeted obsolete recovery-architecture wording removed;
- `git diff --check` passed.

No runtime verification has yet been accepted for this implementation.

No real Production recovery/provider operation occurred:

- Production R2 access: NO;
- Production object download: NO;
- Production object decryption: NO;
- local recovery-target creation: NO;
- restore execution: NO;
- Production database access: NO;
- PostgreSQL image pull: NO;
- Production age-identity access: NO;
- Cronitor telemetry: NO;
- backup dispatch/rerun: NO;
- automation mutation: NO;
- deployment trigger: NO;
- commit: NO;
- Stage 6 rerun: NO.
## Stage 5 focused Production retrieval test milestone

The focused local verification for
`retrieve-production-recovery.test.ts` completed successfully.

Result:

`PASS ΓÇö 5/5 TESTS`

Verified behavior:

- explicit accepted object identity is required before workspace creation;
- remote metadata verification precedes download;
- expected key, bytes, and SHA-256 are enforced;
- downloaded ciphertext is independently verified;
- metadata mismatch fails closed with cleanup;
- downloaded-ciphertext mismatch fails closed with cleanup;
- invalid successful-cleanup paths are rejected.

The test process had no real R2 provider configuration.

No Production/provider recovery side effect occurred.
## Stage 5 repository typecheck failure milestone

Repository typecheck result:

`FAILED ΓÇö BOUNDED TEST-TYPING DEFECT`

Successful workspace checks before failure:

- `database`: PASS;
- `packages/config`: PASS;
- `packages/shared`: PASS;
- `packages/ui`: PASS.

Failure:

`apps/web/__tests__/recovery/retrieve-production-recovery.test.ts`

TypeScript reported that the object returned by
`environment(): NodeJS.ProcessEnv` does not contain required `NODE_ENV`.

Root cause is bounded to the new test fixture.

Required correction:

- add `NODE_ENV: 'test'` to that helper;
- do not weaken the `NodeJS.ProcessEnv` type;
- do not change the Production retrieval implementation to resolve this test-only
  typing failure.

No provider/recovery side effect occurred.
## Stage 5 repository typecheck pass milestone

Repository typecheck retry result:

`PASS`

Workspace results:

- `database`: PASS;
- `packages/config`: PASS;
- `packages/shared`: PASS;
- `packages/ui`: PASS;
- `apps/web`: PASS.

The prior test-only `NODE_ENV` typing defect is resolved.

Repository mutation from typecheck:

`NONE`

No provider/recovery side effect occurred.
## Stage 5 repository verification completion milestone

The repository-owned Stage 5 readiness implementation completed its full local
verification cycle.

Result:

`PASS ΓÇö REPOSITORY IMPLEMENTATION VERIFIED`

Verification:

- focused retrieval tests: 5/5 PASS;
- repository typecheck: PASS;
- broader recovery suite: 152 passed / 8 skipped;
- final diff/static review: PASS;
- `git diff --check`: PASS.

Resolved repository blockers:

- `STAGE5_R2_RETRIEVAL_ORCHESTRATION_NOT_YET_DEFINED`
- `STAGE5_RECOVERY_DOCUMENTATION_RECONCILIATION_REQUIRED`

Remaining operational blockers:

- `STAGE5_EXTERNAL_AGE_IDENTITY_PATH_NOT_CONFIGURED`
- `STAGE5_PINNED_POSTGRES_IMAGE_NOT_LOCALLY_AVAILABLE`

No real Production/provider recovery action occurred during repository
implementation or verification.

The implementation remains uncommitted at this milestone so the canonical state
can be included in the same substantive implementation/documentation commit.
## Stage 5 pinned PostgreSQL image availability milestone

Result:

`PASS ΓÇö EXACT PINNED POSTGRESQL 17.6 IMAGE AVAILABLE`

Reviewed immutable image:

`postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3`

Evidence:

- image was absent at the initial availability probe;
- exact immutable digest pull completed successfully;
- local image digest matches the reviewed digest exactly;
- `psql (PostgreSQL) 17.6`: PASS;
- `pg_dump (PostgreSQL) 17.6`: PASS;
- `pg_restore (PostgreSQL) 17.6`: PASS;
- version-check containers used `--rm`;
- no persistent recovery container was created;
- no local recovery target was created;
- no Production R2, database, decryption, or restore action occurred.

Blocker status:

`STAGE5_PINNED_POSTGRES_IMAGE_NOT_LOCALLY_AVAILABLE` ΓÇö RESOLVED

Remaining operational blocker:

`STAGE5_EXTERNAL_AGE_IDENTITY_PATH_NOT_CONFIGURED`
## Stage 5 Production age identity investigation milestone

Result:

`BLOCKED ΓÇö MATCHING EXTERNAL PRODUCTION AGE IDENTITY NOT CURRENTLY AVAILABLE`

Evidence:

- Production public age recipient is available;
- reviewed `age-keygen` v1.3.1 is available;
- explicitly configured Process/User/Machine identity paths: 0;
- controlled workstation recovery-location candidates: 0;
- discovered age private-identity-shaped files: 0;
- matching Production identities: 0;
- retained Stage 5 evidence contains no authoritative usable Production identity
  path;
- private key contents were never printed;
- identity paths were never printed;
- no new age identity was generated;
- no Production R2 object was accessed or downloaded;
- no decryption occurred;
- no recovery target was created;
- timed restore did not start.

Blocker remains:

`STAGE5_EXTERNAL_AGE_IDENTITY_PATH_NOT_CONFIGURED`

Interpretation:

The accepted Production recovery point is not currently decryptable on this
workstation. This is not proof that the external identity is permanently lost;
an operator-controlled offline copy may still exist elsewhere.
## Stage 5 Production age identity custody remediation implementation milestone

Result:

`IMPLEMENTED AND SYNTHETICALLY VERIFIED ΓÇö REAL PRODUCTION CUSTODY NOT YET ESTABLISHED`

ADR-020 now records the accepted Production age identity custody and
recovery-point supersession architecture.

Repository implementation:

- `apps/web/scripts/recovery/production-age-custody.ts`;
- `apps/web/__tests__/recovery/production-age-custody.test.ts`;
- two explicit external identity-file inputs;
- absolute-path enforcement;
- repository-containment rejection;
- regular-file existence enforcement;
- distinct canonical-copy enforcement;
- reviewed age 1.3.1 runtime enforcement;
- independent `age-keygen -y` recipient derivation from both copies;
- identical-recipient enforcement;
- explicit expected-public-recipient enforcement;
- bounded non-secret readiness output;
- fail-closed error handling without identity contents or paths.

Verification:

- focused custody tests: PASS, 10/10;
- repository TypeScript: PASS;
- broader recovery regression: PASS, 162 passed / 8 intentionally skipped;
- all live recovery integration gates were disabled during the broader suite;
- `git diff --check`: PASS.

Documentation authority:

- ADR-020: Accepted;
- ADR index: updated;
- PRD ┬º55: Production recovery custody rules added;
- recovery architecture: ADR-020 cross-reference added.

No real Production identity has been generated.

No Production public recipient has been changed.

No Production provider configuration has been mutated.

No Production R2 object has been accessed or downloaded.

No replacement Production recovery point has been created.

No timed Production restore has started.

Recurring Production backup automation remains disabled.

Production RPO and RTO remain unproven.

Production customer onboarding remains blocked.
## Stage 5 Production age custody gate repository/release acceptance milestone

Result:

`PASS ΓÇö CUSTODY GATE REPOSITORY/RELEASE ACCEPTED; REAL PRODUCTION CUSTODY NOT YET ESTABLISHED`

Accepted repository SHA:

`670a6c502a7ea1442b238c7404752548c8822e9e`

Evidence:

- substantive custody-gate commit: PASS;
- exact seven-file commit surface: PASS;
- push to `main`: PASS;
- local / `origin/main` / remote `main` exact SHA: PASS;
- CI run `36042621930`: completed / success;
- CI workflow/event: `CI` / `push`;
- CI exact head SHA: PASS;
- Deploy STAGING run `36042621963`: completed / success;
- deployment workflow/event: `Deploy STAGING` / `push`;
- deployment exact head SHA: PASS;
- automatic push-trigger evidence: PASS;
- manual workflow dispatch: NOT USED;
- manual deployment trigger: NOT USED.

This milestone accepts the repository-owned custody gate only.

It does NOT establish real Production private-key custody.

It does NOT make the historical accepted ciphertext decryptable.

It does NOT authorize a Production recipient change.

It does NOT authorize a replacement Production recovery point.

It does NOT authorize recurring Production backup automation.

It does NOT prove Production RPO or RTO.

Production customer onboarding remains blocked.
## Stage 5 Production age custody storage topology milestone

Result:

`BLOCKED ΓÇö SECOND INDEPENDENT STORAGE DEVICE REQUIRED`

Read-only topology inspection evidence:

- repository authority: PASS;
- custody-gate release acceptance remains valid;
- reviewed age 1.3.1 tooling remains valid;
- recurring Production backup automation remains disabled;
- eligible local/removable filesystem volumes discovered: 1;
- available eligible volume: `C:`;
- no second independent storage volume was available;
- real Production age identity generation therefore remains unauthorized.

ADR-020 requires two operator-controlled custody copies with independent storage.

A second directory on `C:` does not satisfy this blocker.

A second partition on the same underlying physical disk must not be treated as
an independent custody failure domain.

The preferred secondary custody destination is a separate operator-controlled
physical device such as an external USB flash drive, external SSD, or separate
physical internal disk.

No custody directory was created.

No Production identity was generated.

No private identity material was written.

No Production public recipient was changed.

No replacement Production recovery point was created.

Production customer onboarding remains blocked.
## Stage 5 encrypted off-device escrow architecture amendment milestone

Result:

`APPROVED ΓÇö HARDWARE-ONLY SECONDARY CUSTODY SUPERSEDED BY ENCRYPTED OFF-DEVICE ESCROW; IMPLEMENTATION NOT YET COMPLETE`

Decision date:

`2026-09-25`

Reason:

The reviewed workstation exposes only one eligible filesystem volume. Requiring
purchase of dedicated removable hardware is not necessary to achieve independent
recoverability.

Approved custody model:

- primary: one plaintext Production age identity outside the repository;
- secondary: passphrase-encrypted age escrow containing the same identity;
- secondary ciphertext: independently stored off-device;
- passphrase: independently held and never stored beside the ciphertext;
- passphrase interaction: terminal/operator only;
- automated readiness: non-secret artifact-bound evidence only.

Tool-runner audit:

- current `CommandRunner` has no secret/input channel;
- current `runCommand` closes stdin immediately;
- no Production passphrase transport will be added through command arguments,
  environment variables, logs, or chat;
- reviewed age passphrase interaction remains an explicit operator ceremony.

The earlier:

`BLOCKED ΓÇö SECOND INDEPENDENT STORAGE DEVICE REQUIRED`

milestone remains preserved as historical evidence for the superseded
two-plaintext-copy design.

It no longer means a USB flash drive, external SSD, or second physical disk must
be purchased.

This architecture amendment alone does NOT authorize:

- Production identity generation;
- Production escrow creation;
- passphrase creation or entry;
- cloud/off-device upload;
- Production recipient mutation;
- replacement Production backup creation;
- recurring Production backup activation;
- Production R2 access;
- timed Production restore.

Production customer onboarding remains blocked.
## Stage 5 encrypted off-device escrow synthetic implementation milestone

Result:

`PASS ΓÇö ENCRYPTED OFF-DEVICE ESCROW IMPLEMENTATION SYNTHETICALLY VERIFIED LOCALLY; NOT YET COMMITTED OR RELEASE-ACCEPTED`

Repository base:

`670a6c502a7ea1442b238c7404752548c8822e9e`

Substantive working-tree surface:

- `PRD.md`;
- `apps/web/__tests__/recovery/production-age-custody.test.ts`;
- `apps/web/__tests__/recovery/production-age-escrow.test.ts`;
- `apps/web/package.json`;
- `apps/web/scripts/recovery/production-age-custody.ts`;
- `apps/web/scripts/recovery/production-age-escrow.ts`;
- `apps/web/scripts/recovery/run-production-age-escrow.ts`;
- `docs/PROJECT-STATE.md`;
- `docs/adr/ADR-020-production-age-identity-custody-and-recovery-point-supersession.md`;
- `docs/architecture/production-backup-and-recovery.md`.

Implemented custody model:

- one plaintext primary Production age identity outside the repository;
- one passphrase-encrypted escrow artifact for the same identity;
- operator-interactive age passphrase handling through inherited terminal I/O;
- no passphrase transport through command arguments, environment variables,
  repository configuration, logs, or chat;
- explicit off-device retrieval confirmation;
- SHA-256 binding of the encrypted escrow artifact;
- non-secret escrow verification receipt;
- receipt binding to reviewed age runtime, expected Production recipient,
  ciphertext SHA-256, recovery proof, and off-device retrieval evidence;
- non-interactive fail-closed custody gate;
- dedicated operator command surface for later escrow creation/verification.

Local verification:

- focused encrypted escrow suites: PASS;
- focused tests: 17 / 17 PASS;
- web TypeScript check: PASS;
- broader recovery regression: PASS;
- targeted encrypted escrow ESLint: PASS;
- web TypeScript regression: PASS;
- `git diff --check`: PASS.

The implementation remains entirely synthetic.

No real Production identity was generated.

No real Production escrow artifact was created.

No Production passphrase was requested or entered.

No interactive real Production custody ceremony was executed.

No cloud or off-device storage was accessed.

No Production public recipient was changed.

No Production R2 or Production database access occurred.

No Production backup was dispatched or rerun.

Recurring Production backup automation remains disabled.

No timed Production restore started.

Historical Stage 6 was not rerun.

This implementation is not yet committed and has not yet received exact-SHA CI
or STAGING release acceptance.

Production customer onboarding remains blocked.
## Stage 5 encrypted off-device escrow release acceptance milestone

Result:

`PASS ΓÇö ENCRYPTED OFF-DEVICE ESCROW REPOSITORY/RELEASE ACCEPTED; REAL PRODUCTION CUSTODY NOT YET ESTABLISHED`

Accepted repository SHA:

`1db366dae0c6328bb00ec639c3d5d11de9cc6de6`

Commit:

`feat: add encrypted production age escrow custody`

Substantive commit surface:

- 10 files;
- 3 new encrypted-escrow implementation/test files;
- ADR-020, PRD, architecture, package command, implementation, tests, and
  PROJECT-STATE committed together.

Local verification before commit:

- focused encrypted escrow tests: 17 / 17 PASS;
- broader recovery regression: 169 PASS / 8 intentionally skipped;
- targeted encrypted escrow ESLint: PASS;
- web TypeScript regression: PASS;
- `git diff --check`: PASS.

Remote release evidence:

- CI run `36093677963`;
- workflow: `CI`;
- event: `push`;
- branch: `main`;
- head SHA:
  `1db366dae0c6328bb00ec639c3d5d11de9cc6de6`;
- status: `completed`;
- conclusion: `success`.

- Deploy STAGING run `36093677982`;
- workflow: `Deploy STAGING`;
- event: `push`;
- branch: `main`;
- head SHA:
  `1db366dae0c6328bb00ec639c3d5d11de9cc6de6`;
- status: `completed`;
- conclusion: `success`.

No manual CI or STAGING workflow dispatch occurred.

Release acceptance does NOT establish real Production custody.

No Production private identity, real escrow artifact, passphrase, off-device
custody, recipient mutation, replacement backup, or timed Production restore has
yet occurred.

Recurring Production backup automation remains disabled.

Production customer onboarding remains blocked.
## Stage 5 real Production encrypted escrow custody acceptance milestone

Result:

`PASS ΓÇö NEW PRODUCTION AGE IDENTITY CUSTODY ACCEPTED`

Repository/release authority:

- repository SHA:
  `1db366dae0c6328bb00ec639c3d5d11de9cc6de6`;
- CI run `36093677963`: accepted;
- Deploy STAGING run `36093677982`: accepted;
- custody implementation repository/release acceptance remains valid.

Accepted Production public recipient:

`age1w50x9ahjqfngv3adq6j6az6stqhmw5nq2e4mqz93lenh6rzcs5mq3j9m83`

Accepted encrypted escrow SHA-256:

`0bed715193c7d7c01b6b1632de1ed5e4c2f164e0d48f09d48416cfa28191be54`

Recovery-proof probe SHA-256:

`0851c5e401b091258cdb66bc83e228011bd814b4c22d9416e3a04cd73724f8f2`

Accepted custody evidence:

- one non-empty plaintext primary Production age identity exists outside the
  repository on the operator-controlled workstation;
- primary identity ACL was restricted to the reviewed Windows principals;
- `age-keygen -y` derives the accepted Production public recipient;
- one passphrase-encrypted escrow artifact was created with reviewed age 1.3.1;
- escrow contains no plaintext private-identity marker;
- escrow SHA-256 is bound to the accepted ciphertext;
- escrow passphrase was handled only through age interactive terminal I/O;
- passphrase is held separately on an offline written recovery record;
- passphrase value was not placed in repository configuration, environment
  variables, command arguments, logs, or chat;
- encrypted escrow was manually uploaded through the OneDrive web interface;
- OneDrive desktop synchronization was not relied upon for remote acceptance;
- the remote OneDrive ciphertext was independently downloaded through the web
  interface;
- independently retrieved ciphertext matched the accepted escrow SHA-256 and
  byte length;
- the independently retrieved ciphertext successfully decrypted a non-secret
  probe encrypted to the accepted Production recipient;
- non-secret escrow verification receipt was generated;
- receipt uses
  `madrasio-production-age-escrow-receipt-v1`;
- receipt records reviewed age `v1.3.1`;
- receipt recipient matches the accepted Production recipient;
- receipt escrow SHA-256 matches the independently retrieved ciphertext;
- receipt recovery proof is `PASS`;
- receipt off-device retrieval flag is `true`;
- repository-owned non-interactive Production custody readiness gate: PASS;
- primary-outside-repository gate: PASS;
- primary-recipient-match gate: PASS;
- encrypted-escrow-outside-repository gate: PASS;
- escrow/receipt SHA-256 binding gate: PASS;
- recovery-proof-verification gate: PASS;
- off-device-retrieval-verification gate: PASS.

The earlier physical-secondary-device blocker remains historical evidence.

That earlier blocker was superseded by the accepted ADR-020 encrypted
off-device escrow architecture and is not a current custody requirement.

The historical accepted Production recovery point remains unchanged and remains
blocked for restore because its matching historical private identity is not
available on the reviewed workstation.

The newly accepted identity does not decrypt or alter that historical recovery
point.

The accepted Production public recipient is now configured in the GitHub Actions Production environment variable BACKUP_AGE_RECIPIENT.

No replacement Production recovery point has yet been created.

Recurring Production backup automation remains disabled.

No Production R2 access occurred during this custody ceremony.

No Production database access occurred during this custody ceremony.

No timed Production restore has started.

Historical Stage 6 was not rerun.

Production RPO and RTO remain unproven.

Production customer onboarding remains blocked.
## Stage 5 Production public recipient configuration milestone

Result:

PASS - ACCEPTED PRODUCTION PUBLIC RECIPIENT CONFIGURED

Provider configuration:

- provider: GitHub Actions;
- scope: Production environment;
- variable: BACKUP_AGE_RECIPIENT;
- configured public recipient:
  age1w50x9ahjqfngv3adq6j6az6stqhmw5nq2e4mqz93lenh6rzcs5mq3j9m83;
- provider updatedAt after mutation:
  2026-09-26T14:47:11Z.

Accepted evidence:

- the pre-existing Production recipient differed from the newly accepted custody recipient;
- only Production/BACKUP_AGE_RECIPIENT was deliberately changed;
- the configured value now equals the accepted custody public recipient;
- no GitHub secret was changed;
- no private Production identity was supplied to GitHub;
- no encrypted escrow artifact was supplied to GitHub;
- no escrow passphrase was supplied to GitHub;
- PRODUCTION_BACKUP_AUTOMATION_ENABLED remains absent;
- recurring Production backup automation remains disabled;
- no backup was automatically dispatched by the recipient change;
- no Production R2 or Production database access occurred;
- no timed Production restore started;
- historical Stage 6 was not rerun.

The historical accepted Production recovery point remains immutable.

Changing BACKUP_AGE_RECIPIENT does not rewrite, re-encrypt, alter, or make the historical ciphertext decryptable by the replacement identity.

No replacement Production recovery point has yet been created.

A replacement Production backup remains a separate manually authorized action.

Production customer onboarding remains blocked.

## Stage 5 replacement Production backup dispatch milestone

Result:

PASS - SINGLE REPLACEMENT PRODUCTION BACKUP DISPATCH ACCEPTED

Exactly one separately authorized replacement Production backup workflow dispatch was issued.

Dispatch evidence:

- workflow: .github/workflows/backup-production.yml;
- GitHub Actions run ID: 36253489899;
- candidate SHA:
  1db366dae0c6328bb00ec639c3d5d11de9cc6de6;
- confirmation: BACKUP_PRODUCTION;
- retention class: frequent;
- event: workflow_dispatch;
- created at: 2026-09-26T15:53:09Z;
- initial captured provider status: queued;
- dispatch CLI exit code: 0;
- dispatch attempts issued: EXACTLY ONE;
- second dispatch authorized: NO;
- blind retry authorized: NO;
- recurring Production backup automation enabled: NO;
- local repository mutation during dispatch: NONE.

The accepted Production public recipient was still aligned with the accepted custody recipient immediately before dispatch.

The historical accepted Production recovery point remains immutable and separately identifiable.

This milestone records dispatch acceptance only.

It does NOT establish that the replacement Production recovery point was successfully created, uploaded, read back, verified, or accepted.

REPLACEMENT_PRODUCTION_RECOVERY_POINT_CREATED remains UNKNOWN pending inspection of run 36253489899.

No second dispatch or blind retry is authorized.

Production customer onboarding remains blocked.

## Stage 5 replacement Production backup run execution milestone

GitHub Actions replacement backup run 36253489899 completed successfully on attempt 1.

Execution evidence:

- workflow: Backup Production;
- head SHA:
  1db366dae0c6328bb00ec639c3d5d11de9cc6de6;
- event: workflow_dispatch;
- run status: completed;
- run conclusion: success;
- created at: 2026-09-26T15:53:09Z;
- started at: 2026-09-26T15:53:09Z;
- provider updated at: 2026-09-26T15:54:21Z;
- activation-gate job ID: 108435789829;
- activation-gate job conclusion: success;
- Production recovery-point job ID: 108435807795;
- Production recovery-point job conclusion: success;
- Create, upload, read back, and verify recovery point: success;
- Verify temporary recovery cleanup: success.

The successful GitHub job metadata establishes that the repository-defined replacement backup path executed through its recovery-point creation/verification step and cleanup without a workflow failure.

It does NOT yet independently establish the exact replacement recovery-point evidence required for acceptance because the exact backup-job log has not yet undergone the bounded recovery-contract review.

No second dispatch or workflow rerun occurred.

Recurring Production backup automation remains disabled.

REPLACEMENT_PRODUCTION_RECOVERY_POINT_CREATED remains NOT YET ACCEPTED.

No timed Production restore has started.

Production customer onboarding remains blocked.

## Stage 5 replacement Production recovery-point acceptance milestone

Result:

PASS - REPLACEMENT PRODUCTION RECOVERY POINT ACCEPTED

One manually authorized replacement Production recovery point was created and verified by GitHub Actions run 36253489899.

Accepted artifact identity:

- backup ID: 20260926T155349Z-1db366dae0c6-83b7427ec876b3c4;
- retention class: frequent;
- R2 object: frequent/2026/09/26/20260926T155349Z-1db366dae0c6-83b7427ec876b3c4.age;
- encrypted bytes: 34729;
- ciphertext SHA-256: 8555692960dcce344e0ed8b9dc2b4cb2905c1b5fccb5d06fe1d9e0771f5e8dff;
- repository SHA: 1db366dae0c6328bb00ec639c3d5d11de9cc6de6;
- configured Production public recipient: age1w50x9ahjqfngv3adq6j6az6stqhmw5nq2e4mqz93lenh6rzcs5mq3j9m83.

Acceptance evidence:

- exact-SHA CI acceptance is preserved;
- hosted readiness preflight passed;
- exactly one separately authorized manual Production dispatch occurred;
- workflow attempt 1 completed successfully;
- Production recovery-point job completed successfully;
- create/upload/readback/verify workflow step completed successfully;
- temporary recovery cleanup completed successfully;
- exactly one production_backup_verified structured runtime event was observed;
- runtime artifact identity matches backup ID, retention class, object key, bytes, and ciphertext SHA-256 above;
- run-production-backup.ts is identical to the historically accepted recovery-contract implementation;
- automation.ts is identical to the historically accepted recovery-contract implementation;
- operations.ts is identical to the historically accepted recovery-contract implementation;
- r2.ts is identical to the historically accepted recovery-contract implementation;
- uploadAndVerify completes before recoveryPointVerified becomes true;
- success-heartbeat flow occurs only after recovery-point verification;
- production_backup_verified is emitted only after executeVerifiedBackup returns successfully.

The earlier generic log text scan that reported missing literal Upload/Readback strings is not acceptance evidence. Exact structured runtime evidence plus exact recovery-contract source equivalence is authoritative.

The historical accepted Production recovery point remains immutable and separately identifiable.

Earlier milestone statements saying the replacement point was not yet created or not yet accepted are retained as historical snapshots and are superseded for current status by this acceptance milestone.

No second Production backup dispatch or workflow rerun is required or authorized.

Recurring Production backup automation remains disabled.

No restore retrieval or decryption has occurred in this acceptance checkpoint.

No timed Production restore has started.

Production RPO and RTO acceptance remain pending.

Production customer onboarding remains blocked.

## Stage 5 Production restore-readiness acceptance milestone

Result:

PASS - PRODUCTION RESTORE READINESS ACCEPTED

The read-only Production restore-readiness preflight completed through combined fail-closed evidence.

The initial full preflight accepted:

- repository authority;
- replacement recovery-point authority;
- Production recipient and source-project metadata;
- recurring backup automation disabled;
- Production retrieval entrypoint and identity-verification contract;
- isolated-local restore contract;
- local recovery-target isolation contract;
- all required immutable Docker image availability;
- PostgreSQL 17.6 recovery tools;
- absence of existing recovery-target resources;
- reviewed age 1.3.1 tooling.

The continuation then accepted:

- matching external Production private identity availability;
- identity outside repository;
- identity outside synchronized/cloud storage;
- exact recipient derivation match;
- 41-table reconciliation authority;
- 39 public tables plus auth.users and auth.identities;
- migration reconciliation;
- Auth reconciliation;
- relationship/data reconciliation;
- application-security reconciliation;
- temporary-material cleanup contract;
- Production RTO timing boundaries.

Readiness blockers:

NONE.

This milestone accepts READINESS ONLY.

It does NOT authorize retrieval or restore execution.

No Production recovery object was accessed or downloaded during the readiness ceremony.

No Production ciphertext was decrypted.

No local recovery target was created.

No Production restore was executed.

The timed Production restore has NOT started.

No second Production backup dispatch or workflow rerun is required or authorized.

Recurring Production backup automation remains disabled.

Historical Stage 6 remains historical evidence only and must not be rerun.

Production customer onboarding remains blocked.

## Stage 5 timed Production retrieval attempt 1 failure milestone

Result:

FAIL - RECOVERY HARNESS FAILURE BEFORE ACCEPTED CIPHERTEXT RETRIEVAL

Attempt identity:

- accepted backup ID: 20260926T155349Z-1db366dae0c6-83b7427ec876b3c4;
- accepted object key: frequent/2026/09/26/20260926T155349Z-1db366dae0c6-83b7427ec876b3c4.age;
- accepted ciphertext SHA-256: 8555692960dcce344e0ed8b9dc2b4cb2905c1b5fccb5d06fe1d9e0771f5e8dff;
- RTO attempt started: 2026-09-27T02:09:24.5163775+00:00;
- RTO attempt failed/stopped: 2026-09-27T02:09:25.3426569+00:00;
- measured elapsed time: 0.822 seconds.

Failure classification:

- Windows PowerShell invoked pnpm through pnpm.ps1;
- PowerShell surfaced pnpm.ps1 stderr as NativeCommandError;
- the ceremony wrapper stopped fail-closed;
- this attempt produced no accepted production_recovery_retrieved event;
- this attempt is NOT an accepted Production RTO measurement.

Post-failure forensic evidence:

- R2 process credentials were cleared;
- no registered recovery workspace;
- no registered recovery ciphertext;
- zero recovery workspaces touched since the attempt;
- zero Production ciphertext files found;
- zero exact accepted ciphertext files found;
- zero local recovery containers;
- zero local recovery volumes;
- zero local recovery networks;
- no retrieval retry performed.

Windows launcher diagnosis:

- pnpm.ps1 exists;
- pnpm.cmd exists;
- pnpm.cmd direct native execution passed;
- package-scoped pnpm.cmd native execution passed;
- no PowerShell NativeCommandError occurred through the pnpm.cmd native-process probe.

Current retry status:

NOT AUTHORIZED.

A new retrieval attempt requires a separate bounded retry-authorization checkpoint, fresh process-only R2 credential injection, and a new RTO stopwatch.

The failed 0.822-second harness attempt must remain separately preserved and must not be overwritten or relabeled as the later successful RTO attempt.

Production customer onboarding remains blocked.

## Stage 5 timed Production retrieval attempt 2 retry-authorization checkpoint failure milestone

Result:

`FAIL - RETRY AUTHORIZATION BLOCKED BEFORE PRODUCTION R2 ACCESS`

Purpose:

Authorize timed Production ciphertext retrieval attempt 2 only after all
required readiness assumptions were freshly reconfirmed.

Failure boundary:

- repository authority remained accepted;
- exact accepted backup/object/byte-count/SHA-256 authority remained unchanged;
- the checkpoint queried GitHub Actions Production public configuration;
- current `BACKUP_AGE_RECIPIENT` did not exactly equal the accepted Production
  public recipient;
- the current provider value was not printed or persisted;
- the ceremony stopped fail-closed at that mismatch.

Classification:

`UNRESOLVED PRODUCTION PUBLIC-RECIPIENT CONFIGURATION DISCREPANCY`

This checkpoint does NOT yet establish that the hosted recipient was
substantively changed.

The mismatch must first be classified as one of:

- exact substantive value drift;
- formatting-only variance;
- syntactically invalid provider value;
- another bounded provider-state discrepancy.

Fail-closed evidence:

- checkpoint event:
  `production_recovery_retry_authorization_checkpoint`;
- checkpoint result: FAIL;
- retrieval started: false;
- Production R2 accessed: false;
- local recovery target created: false;
- RTO stopwatch started: false;
- no accepted `production_recovery_retrieved` event occurred;
- no attempt-2 ciphertext was retrieved;
- no decryption occurred;
- no restore occurred;
- no Production database access occurred;
- no backup dispatch or rerun occurred;
- recurring Production backup automation was not enabled;
- historical Stage 6 was not rerun.

Credential and timing boundary:

- the failure occurred before fresh attempt-2 R2 credential injection completed;
- the fail-closed handler cleared Process-scope R2 access credentials;
- no attempt-2 stopwatch was started;
- this authorization failure is NOT an RTO measurement;
- timed retrieval attempt 1 remains separately preserved at 0.822 seconds as a
  failed harness attempt only.

Authorization state:

- Production ciphertext retrieval attempt 2 remains NOT AUTHORIZED;
- Production R2 access remains NOT AUTHORIZED;
- local recovery-target creation remains NOT AUTHORIZED;
- decryption remains NOT AUTHORIZED;
- restore remains NOT AUTHORIZED;
- provider-recipient mutation remains NOT AUTHORIZED pending diagnosis;
- another Production backup remains NOT AUTHORIZED;
- Production customer onboarding remains blocked.

## Stage 5 Production recipient mismatch diagnostic resolution milestone

Result:

`PASS - CURRENT PRODUCTION RECIPIENT EXACTLY MATCHES ACCEPTED RECIPIENT`

Diagnostic purpose:

Classify the Production public-recipient discrepancy that blocked the first
retry-authorization checkpoint for timed retrieval attempt 2.

Hosted operation:

- exactly one read-only GitHub API request was made;
- scope: GitHub Actions Production environment;
- variable: `BACKUP_AGE_RECIPIENT`;
- no provider mutation was performed.

Classification result:

`CURRENT_EXACT_MATCH`

Bounded evidence:

- exact match: true;
- trimmed match: true;
- raw age-recipient syntax valid: true;
- trimmed age-recipient syntax valid: true;
- same length as accepted recipient: true;
- outer whitespace present: false;
- internal whitespace present: false;
- provider value printed: false;
- provider mutation performed: false.

Accepted Production recipient:

`age1w50x9ahjqfngv3adq6j6az6stqhmw5nq2e4mqz93lenh6rzcs5mq3j9m83`

Interpretation:

The current hosted Production recipient exactly matches the accepted recipient.

The earlier retry-authorization checkpoint remains valid historical evidence that
it stopped fail-closed after observing an exact mismatch at that time.

This diagnostic does NOT establish why that earlier checkpoint observed a
mismatch.

Do not invent or infer a root cause.

Current substantive Production recipient drift is NOT established.

The recipient-configuration blocker is therefore resolved for the purpose of
performing a completely fresh retry-authorization checkpoint.

Safety evidence:

- Production R2 accessed: false;
- R2 credentials injected: false;
- recovery workspace created: false;
- local recovery target created: false;
- decryption started: false;
- restore started: false;
- RTO stopwatch started: false;
- PROJECT-STATE was not mutated during the diagnostic;
- historical Stage 6 was not rerun.

Authorization state:

- this diagnostic does NOT itself authorize Production retrieval;
- timed retrieval attempt 2 remains NOT AUTHORIZED;
- a completely fresh bounded retry-authorization checkpoint is still required;
- no Production provider remediation is required based on current evidence;
- `BACKUP_AGE_RECIPIENT` must NOT be mutated;
- another Production backup must NOT be dispatched;
- recurring Production backup automation must remain disabled;
- Production customer onboarding remains blocked.

## Stage 5 post-recipient-resolution attempt-2 retry-authorization checkpoint failure milestone

Result:

`FAIL - RETRY AUTHORIZATION BLOCKED BY R2 ENDPOINT-FORM ASSERTION`

Purpose:

Perform a completely fresh retry-authorization checkpoint for timed Production
ciphertext retrieval attempt 2 after resolution of the earlier recipient
discrepancy.

Accepted prior evidence entering this checkpoint:

- repository recovery authority remained accepted;
- accepted replacement recovery-point identity remained unchanged;
- timed retrieval attempt 1 remained preserved at 0.822 seconds;
- first attempt-2 authorization failure remained historical evidence;
- Production recipient diagnostic resolution remained `CURRENT_EXACT_MATCH`;
- recurring Production backup automation remained disabled.

Failure:

`Production R2 endpoint form changed.`

The authorization harness had required the R2 hostname to match:

`<32-lowercase-hex>.r2.cloudflarestorage.com`

The project architecture separately records the Production bucket as an
EU-jurisdiction Cloudflare R2 bucket.

This milestone does NOT establish that the provider R2 endpoint changed or is
incorrect.

It records only that the checkpoint's current hostname-shape assertion did not
accept the currently configured endpoint.

Classification:

`UNRESOLVED R2 ENDPOINT-FORM AUTHORIZATION DISCREPANCY`

Safety boundary:

- failure occurred before fresh operator R2 credential entry;
- Process-scope R2 credentials were cleared by the fail-closed handler;
- Production R2 accessed: false;
- retrieval started: false;
- recovery workspace created: false;
- recovery ciphertext created: false;
- local recovery target created: false;
- decryption started: false;
- restore started: false;
- RTO stopwatch started: false;
- no accepted `production_recovery_retrieved` event occurred;
- no Production database access occurred;
- no Production backup dispatch occurred;
- historical Stage 6 was not rerun.

Timing classification:

- this checkpoint is NOT timed Production retrieval attempt 2;
- this checkpoint is NOT an accepted Production RTO measurement;
- attempt 1 remains the only started recovery-side timing attempt and remains a
  failed 0.822-second harness measurement;
- attempt 2 remains unstarted.

Authorization state:

- Production R2 retrieval remains NOT AUTHORIZED;
- local recovery-target creation remains NOT AUTHORIZED;
- decryption remains NOT AUTHORIZED;
- restore remains NOT AUTHORIZED;
- R2 provider mutation remains NOT AUTHORIZED;
- GitHub Production R2 configuration mutation remains NOT AUTHORIZED;
- another Production backup remains NOT AUTHORIZED;
- recurring Production backup automation must remain disabled;
- Production customer onboarding remains blocked.

Exact diagnostic requirement:

Perform one bounded read-only diagnostic of the currently configured Production
`R2_ENDPOINT`.

That diagnostic must never print or persist the endpoint and must classify only:

- HTTPS scheme;
- user-info presence;
- query presence;
- fragment presence;
- root-only versus non-root path;
- standard R2 hostname shape;
- EU-jurisdiction R2 hostname shape;
- Cloudflare R2 suffix match;
- account-label length/hex shape;
- whether the endpoint is consistent with the repository's reviewed
  EU-jurisdiction R2 architecture.

No endpoint mutation may occur during that diagnostic.

## Stage 5 R2 endpoint diagnostic harness failure milestone

Result:

`FAIL - LOCAL DIAGNOSTIC HARNESS VARIABLE COLLISION`

Classification:

`R2_ENDPOINT_DIAGNOSTIC_HARNESS_FAILURE`

Purpose:

Classify the Production `R2_ENDPOINT` without printing or persisting its value
and without accessing Production R2.

Execution boundary:

- exactly one read-only GitHub Production variable query was performed;
- queried variable: `R2_ENDPOINT`;
- the provider response was successfully parsed;
- a non-empty endpoint value was obtained in process memory;
- no provider mutation occurred.

Failure:

PowerShell rejected assignment to `$Host` because `$Host` is a built-in
read-only automatic variable.

The failure occurred before the diagnostic produced endpoint-shape
classification metadata.

Therefore this failed diagnostic does NOT establish whether the endpoint is:

- the standard R2 hostname form;
- the EU-jurisdiction R2 hostname form;
- another Cloudflare R2 form;
- or an invalid/unexpected form.

Safety evidence:

- endpoint printed: false;
- Production R2 accessed: false;
- R2 credentials injected: false;
- recovery workspace created: false;
- local recovery target created: false;
- decryption started: false;
- restore started: false;
- RTO stopwatch started: false;
- Production database access: false;
- backup dispatch: false;
- provider mutation: false;
- historical Stage 6 rerun: false.

Timing classification:

- this is NOT Production retrieval attempt 2;
- this is NOT an accepted Production RTO measurement;
- attempt 2 remains unstarted.

Remediation:

Rerun the same bounded read-only diagnostic with the local hostname variable
renamed from `$Host` to a non-reserved variable such as `$R2Host`.

No provider remediation is authorized from this harness failure.

## Stage 5 corrected R2 endpoint diagnostic state-precondition harness failure milestone

Result:

`FAIL - LOCAL STATE AUTHORIZATION PRECONDITION MISMATCH`

Classification:

`CORRECTED_R2_DIAGNOSTIC_STATE_PRECONDITION_HARNESS_FAILURE`

Purpose:

Run the corrected read-only Production `R2_ENDPOINT` diagnostic after replacing
the invalid PowerShell `$Host` variable with `$R2Host`.

Failure boundary:

The corrected diagnostic performed local safety checks and read
`docs/PROJECT-STATE.md`.

It then required the literal marker:

`CORRECTED_READ_ONLY_R2_ENDPOINT_DIAGNOSTIC`

That literal marker was not present in the state file.

The marker had only been emitted by the previous state-sync command as terminal
output:

`Next allowed action: CORRECTED_READ_ONLY_R2_ENDPOINT_DIAGNOSTIC`

The canonical state nevertheless already authorized the corrected diagnostic in
natural-language Exact next step instructions.

The diagnostic therefore stopped before resolving repository identity for its
hosted GitHub operation and before any GitHub API request.

Safety evidence:

- GitHub API queried: false;
- provider endpoint read: false;
- endpoint printed: false;
- endpoint persisted: false;
- provider mutation performed: false;
- Production R2 accessed: false;
- R2 credentials injected: false;
- recovery workspace created: false;
- local recovery target created: false;
- decryption started: false;
- restore started: false;
- RTO stopwatch started: false.

Timing classification:

- this is NOT Production retrieval attempt 2;
- this is NOT a Production RTO measurement;
- attempt 2 remains unstarted.

Remediation:

Add the explicit authorization marker to the Exact next step, then rerun only the
corrected read-only endpoint diagnostic.

No Production provider remediation is authorized from this harness failure.

## Stage 5 Production R2 endpoint diagnostic resolution milestone

Result:

`PASS - PRODUCTION R2 ENDPOINT MATCHES REVIEWED EU-JURISDICTION ARCHITECTURE`

Classification:

`REVIEWED_EU_JURISDICTION_R2_ENDPOINT`

Purpose:

Resolve the R2 endpoint-form discrepancy that blocked the fresh attempt-2
retry-authorization checkpoint.

Diagnostic execution:

- exactly one read-only GitHub Production variable query was performed;
- queried variable: `R2_ENDPOINT`;
- the endpoint was parsed only in process memory;
- the endpoint itself was not printed;
- the endpoint itself was not persisted;
- no provider mutation occurred.

Classification evidence:

- HTTPS scheme: true;
- user information absent: true;
- query absent: true;
- fragment absent: true;
- root-only path: true;
- standard R2 hostname form:
  false;
- EU-jurisdiction R2 hostname form:
  true;
- Cloudflare R2 suffix match:
  true;
- 32-lowercase-hex account label:
  true;
- consistent with reviewed EU-jurisdiction architecture:
  true.

Interpretation:

The configured Production R2 endpoint matches the reviewed EU-jurisdiction
Cloudflare R2 architecture.

No current provider R2 endpoint drift is established.

The earlier authorization failure:

`Production R2 endpoint form changed.`

is therefore classified as an authorization-harness assertion defect.

The failed checkpoint required only:

`<ACCOUNT_ID>.r2.cloudflarestorage.com`

and omitted the reviewed EU-jurisdiction form:

`<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`

No provider remediation is required.

`R2_ENDPOINT` must NOT be changed based on this evidence.

Safety evidence:

- Production R2 accessed: false;
- R2 credentials injected: false;
- recovery workspace created: false;
- local recovery target created: false;
- decryption started: false;
- restore started: false;
- RTO stopwatch started: false;
- PROJECT-STATE mutated during diagnostic: false;
- backup dispatched: false;
- historical Stage 6 rerun: false.

Authorization effect:

This successful diagnostic resolves only the endpoint-form blocker.

It does NOT itself authorize Production retrieval.

A completely fresh attempt-2 retry-authorization checkpoint is still required.

That future checkpoint must accept the EU-jurisdiction endpoint form while
preserving every other accepted recovery invariant.

## Stage 5 fresh attempt-2 authorization existing-workspace blocker milestone

Result:

`FAIL - RETRY AUTHORIZATION BLOCKED BY EXISTING RECOVERY WORKSPACE`

Classification:

`UNRESOLVED EXISTING RECOVERY WORKSPACE BLOCKER`

Purpose:

Perform the fresh attempt-2 authorization checkpoint after resolving the
Production recipient and R2 endpoint-form discrepancies.

Accepted evidence entering the checkpoint:

- repository authority remained accepted;
- accepted replacement recovery point remained unchanged;
- recipient diagnostic remained `CURRENT_EXACT_MATCH`;
- R2 endpoint diagnostic remained
  `REVIEWED_EU_JURISDICTION_R2_ENDPOINT`;
- recurring Production backup automation remained disabled;
- reviewed EU-jurisdiction endpoint validation passed.

Hosted operation:

- one read-only GitHub Production environment-variable request was performed;
- no GitHub/provider mutation occurred.

Failure boundary:

The local temporary-workspace scan found at least one directory matching:

`madrasio-recovery-*`

The checkpoint therefore stopped with:

`A recovery workspace already exists.`

The workspace was not removed, renamed, moved, or otherwise modified.

Its provenance is not yet established.

Do not infer that it belongs to attempt 1 or that it is safe to delete until a
bounded read-only diagnostic proves that classification.

Safety evidence:

- fresh operator R2 credentials entered: false;
- Production R2 accessed: false;
- retrieval started: false;
- recovery workspace created by this checkpoint: false;
- local recovery target created: false;
- decryption started: false;
- restore started: false;
- RTO stopwatch started: false;
- Production database accessed: false;
- provider mutation performed: false;
- backup dispatched: false;
- historical Stage 6 rerun: false.

Fail-closed cleanup:

- Process-scope R2 credential variables were cleared;
- attempt Process-scope public recovery configuration was cleared;
- no attempt-2 stopwatch remained.

Timing classification:

- this checkpoint is NOT timed Production retrieval attempt 2;
- this checkpoint is NOT an accepted Production RTO measurement;
- attempt 2 remains unstarted;
- attempt 1 remains separately preserved at 0.822 seconds as failed-harness
  evidence only.

Authorization state:

- Production retrieval remains NOT AUTHORIZED;
- Production R2 access remains NOT AUTHORIZED;
- recovery workspace cleanup remains NOT AUTHORIZED pending diagnosis;
- local recovery-target creation remains NOT AUTHORIZED;
- decryption remains NOT AUTHORIZED;
- restore remains NOT AUTHORIZED.

## Stage 5 existing recovery workspace diagnostic parse-harness failure milestone

Result:

`FAIL - LOCAL POWERSHELL DIAGNOSTIC PARSE FAILURE`

Classification:

`EXISTING_RECOVERY_WORKSPACE_DIAGNOSTIC_PARSE_HARNESS_FAILURE`

Purpose:

Perform the authorized local read-only classification of temporary directories
matching `madrasio-recovery-*`.

Failure:

The diagnostic used the expression:

`).Sum ?? 0`

The active PowerShell parser rejected `??` as an unexpected token.

Because the parse failure occurred inside the outer script block, that original
diagnostic block did not execute.

The remaining pasted lines were subsequently interpreted individually at the
interactive PowerShell prompt.

Those follow-on commands produced secondary failures including:

- standalone `else` and `elseif` command errors;
- null-valued variable errors;
- unmatched closing-brace parser errors.

An apparent JSON object later displayed:

- `result: PASS`;
- `workspaceCount: 0`.

That object is invalid because it was produced from the partially interpreted
tail of the failed paste with uninitialized diagnostic variables.

It is NOT accepted workspace evidence.

No conclusion may be drawn from it about:

- the number of existing recovery workspaces;
- whether a generic recovery workspace exists;
- whether a local recovery-target workspace exists;
- workspace provenance;
- workspace contents;
- cleanup safety.

Safety evidence:

- no hosted request was required or performed by the intended diagnostic;
- Production R2 accessed: false;
- R2 credentials injected: false;
- workspace deleted: false;
- workspace modified: false;
- local recovery target created: false;
- decryption started: false;
- restore started: false;
- RTO stopwatch started: false.

Timing classification:

- this is NOT timed Production retrieval attempt 2;
- this is NOT an accepted Production RTO measurement;
- attempt 2 remains unstarted.

Authorization state:

- workspace inspection remains authorized only as a bounded LOCAL READ-ONLY diagnostic;
- workspace cleanup remains NOT AUTHORIZED;
- Production retrieval remains NOT AUTHORIZED;
- Production R2 access remains NOT AUTHORIZED;
- local target creation remains NOT AUTHORIZED;
- restore remains NOT AUTHORIZED.

## Stage 5 existing recovery workspace diagnostic resolution milestone

Result:

`PASS - THREE PRE-EXISTING RECOVERY WORKSPACES CLASSIFIED`

Overall classification:

`MIXED_GENERIC_AND_LOCAL_TARGET_RECOVERY_WORKSPACES`

PowerShell runtime:

`5.1.26100.9444`

Workspace count:

`3`

Reparse points:

`0`

Workspace classifications:

1. `madrasio-recovery-SG7Iy2`
   - `EMPTY_GENERIC_RECOVERY_WORKSPACE`
   - zero files;
   - zero directories;
   - zero bytes;
   - cleanup candidate for later review: true.

2. `madrasio-recovery-stage5-preauth-d0845d`
   - `GENERIC_RECOVERY_WORKSPACE_UNCLASSIFIED_CONTENT`
   - zero direct files;
   - one direct child directory;
   - known recovery artifact filenames absent;
   - cleanup candidate for later review: false.

3. `madrasio-recovery-target-Ic6tlJ`
   - `LOCAL_RECOVERY_TARGET_PREFIX_WITHOUT_STATE_MARKER`
   - zero files;
   - zero child directories;
   - zero bytes;
   - `state.json` absent;
   - cleanup candidate for later review: false.

The three creation timestamps are September 14, September 15, and September 21,
2026.

Timed Production retrieval attempt 1 occurred on September 27, 2026.

Therefore none of these three directories was created by Production retrieval
attempt 1 or the later blocked attempt-2 authorization checkpoint.

This resolves the question of whether the blocker was newly created by the
current Production attempts:

`NO`

It does NOT yet resolve whether all three directories can safely be deleted.

Remaining provenance questions:

- classify the single child directory inside
  `madrasio-recovery-stage5-preauth-d0845d`;
- establish whether any repository-owned Docker container, volume, or network
  still corresponds to `madrasio-recovery-target-Ic6tlJ`.

Safety evidence:

- file contents read: false;
- full workspace paths printed: false;
- workspace modified: false;
- workspace deleted: false;
- hosted request performed: false;
- Production R2 accessed: false;
- R2 credentials injected: false;
- local recovery target created: false;
- decryption started: false;
- restore started: false;
- RTO stopwatch started: false.

Authorization effect:

- no workspace cleanup is authorized yet;
- no Production retrieval is authorized yet;
- no Production R2 access is authorized yet;
- no local recovery-target creation is authorized yet;
- no restore is authorized yet.

## Stage 5 targeted stale-workspace provenance diagnostic parent-path harness failure milestone

Result:

`FAIL - LOCAL DIRECTORY-PARENT BOUNDARY HARNESS FAILURE`

Classification:

`TARGETED_STALE_WORKSPACE_PROVENANCE_DIAGNOSTIC_PARENT_PATH_HARNESS_FAILURE`

Purpose:

Classify the remaining two unresolved pre-existing recovery workspaces before
authorizing any cleanup.

Failure:

The diagnostic's direct-temp-child helper accepted a filesystem item and
attempted to calculate its parent using:

`$Item.DirectoryName`

followed by:

`[IO.Path]::GetFullPath(...)`

The item being validated was a directory object.

The resulting value was not a legal path for `GetFullPath`.

PowerShell therefore stopped with:

`The path is not of a legal form.`

The corrected helper must derive the directory parent from:

`$Item.Parent.FullName`

and then compare that full parent path with the operating-system temp root.

Execution boundary reached before failure:

- PROJECT-STATE authorization check: passed;
- clean Process-scope R2 credential checks: passed;
- no recovery bundle registered: confirmed;
- no restore target registered: confirmed;
- no attempt-2 stopwatch present: confirmed;
- exact `madrasio-recovery-stage5-preauth-d0845d` directory: found;
- first direct-temp-child parent assertion: failed.

Not reached:

- classification of the single `stage5-preauth` child;
- inspection of the `Ic6tlJ` filesystem shell;
- Docker daemon provenance checks;
- exact Docker container checks;
- exact Docker volume check;
- exact Docker network check;
- exact recovery-target label checks.

Safety evidence:

- workspace contents read: false;
- workspace modified: false;
- workspace deleted: false;
- Docker mutation performed: false;
- hosted request performed: false;
- Production R2 accessed: false;
- R2 credentials injected: false;
- local recovery target created: false;
- decryption started: false;
- restore started: false;
- RTO stopwatch started: false.

Timing classification:

- this is NOT timed Production retrieval attempt 2;
- this is NOT a Production RTO measurement;
- attempt 2 remains unstarted.

Authorization effect:

- cleanup remains NOT AUTHORIZED;
- Production retrieval remains NOT AUTHORIZED;
- Production R2 access remains NOT AUTHORIZED;
- local target creation remains NOT AUTHORIZED;
- restore remains NOT AUTHORIZED.

## Stage 5 targeted stale-workspace provenance ordered-dictionary harness failure milestone

Result:

`FAIL - LOCAL ORDERED-DICTIONARY ENUMERATION HARNESS FAILURE`

Classification:

`TARGETED_STALE_WORKSPACE_PROVENANCE_DIAGNOSTIC_ORDERED_DICTIONARY_ENUMERATION_HARNESS_FAILURE`

Purpose:

Continue the corrected targeted LOCAL READ-ONLY provenance diagnostic for the
remaining two unresolved stale recovery directories.

Successful correction entering this run:

The previous directory-parent failure was corrected by using:

`DirectoryInfo.Parent.FullName`

The corrected parent boundary was reached without reproducing the earlier:

`The path is not of a legal form.`

failure.

New failure:

During `stage5-preauth` child metadata classification, the diagnostic executed:

`foreach ($KnownName in $KnownPresence.Keys)`

while assigning values back into:

`$KnownPresence[$KnownName]`

PowerShell 5.1 treated those assignments as modification of the ordered
dictionary being enumerated and stopped with:

`Collection was modified; enumeration operation may not execute.`

The correction must enumerate a fixed snapshot, for example:

`$KnownNames = [string[]] @($KnownPresence.Keys)`

followed by:

`foreach ($KnownName in $KnownNames)`

Assignments may then update `$KnownPresence` without invalidating the active
enumerator.

Reached before failure:

- exact `stage5-preauth` workspace: found;
- corrected direct-temp-root parent assertion: passed;
- workspace reparse check: passed;
- exactly one direct child: confirmed;
- child metadata inspection started;
- direct child entries enumerated;
- direct-file byte measurement performed.

Not completed:

- known filename presence map;
- final `stage5-preauth` child classification.

Not reached:

- `Ic6tlJ` filesystem-shell provenance;
- Docker daemon probe;
- exact container checks;
- exact volume check;
- exact network check;
- exact ownership-label checks.

Safety evidence:

- file contents read: false;
- workspace modified: false;
- workspace deleted: false;
- Docker mutation performed: false;
- hosted request performed: false;
- Production R2 accessed: false;
- R2 credentials injected: false;
- local recovery target created: false;
- decryption started: false;
- restore started: false;
- RTO stopwatch started: false.

Timing classification:

- this is NOT timed Production retrieval attempt 2;
- this is NOT a Production RTO measurement;
- attempt 2 remains unstarted.

Authorization effect:

- cleanup remains NOT AUTHORIZED;
- Production retrieval remains NOT AUTHORIZED;
- Production R2 access remains NOT AUTHORIZED;
- local-target creation remains NOT AUTHORIZED;
- restore remains NOT AUTHORIZED.

## Stage 5 targeted stale-workspace provenance diagnostic resolution milestone

Result:

`PASS - LOCAL TARGET ORPHAN RESOLVED; STAGE5 PREAUTH SUPABASE SUBTREE REMAINS`

Harness:

- parent boundary:
  `DirectoryInfo.Parent.FullName`;
- known filename enumeration:
  `fixed-string-array`.

### `madrasio-recovery-stage5-preauth-d0845d`

Workspace boundary:

- direct OS-temp child: confirmed;
- workspace reparse point: false;
- direct child count: 1.

Direct child:

`supabase`

Metadata:

- type: directory;
- created: 2026-09-14T19:16:33.3907977Z;
- last written: 2026-09-22T17:33:20.9055001Z;
- reparse point: false;
- direct files: 0;
- direct directories: 2;
- direct-file bytes: 0;
- known recovery artifact filenames present: none;
- unknown direct files: 0.

Classification:

`PREAUTH_CHILD_REMAINS_UNCLASSIFIED_CONTENT`

Cleanup-review eligibility:

`false`

Remaining question:

Classify the two direct subdirectories beneath `supabase` using metadata only.

### `madrasio-recovery-target-Ic6tlJ`

Filesystem:

- empty: true;
- reparse point: false.

Exact repository-owned Docker resource checks:

- database container: absent;
- Auth container: absent;
- database volume: absent;
- network: absent;
- exact labeled containers: 0;
- exact labeled volumes: 0;
- exact labeled networks: 0.

Classification:

`ORPHAN_EMPTY_LOCAL_TARGET_DIRECTORY_NO_DOCKER_RESOURCES`

Cleanup-review eligibility:

`true`

No live or residual repository-owned Docker resource was established for this
target ID.

### Combined status

The earlier empty generic workspace:

`madrasio-recovery-SG7Iy2`

remains eligible for later cleanup review.

The local-target orphan:

`madrasio-recovery-target-Ic6tlJ`

is now also eligible for later cleanup review.

The remaining blocker is only:

`madrasio-recovery-stage5-preauth-d0845d\supabase`

because its two direct subdirectories remain unclassified.

No cleanup is authorized yet.

Safety evidence:

- file contents read: false;
- full workspace paths printed: false;
- Docker environment inspected: false;
- Docker mutation performed: false;
- workspace modified: false;
- workspace deleted: false;
- hosted request performed: false;
- Production R2 accessed: false;
- R2 credentials injected: false;
- recovery workspace created: false;
- local recovery target created: false;
- decryption started: false;
- restore started: false;
- RTO stopwatch started: false.

Timing classification:

- this is NOT timed Production retrieval attempt 2;
- this is NOT a Production RTO measurement;
- attempt 2 remains unstarted.

Authorization effect:

- cleanup remains NOT AUTHORIZED;
- Production retrieval remains NOT AUTHORIZED;
- Production R2 access remains NOT AUTHORIZED;
- local-target creation remains NOT AUTHORIZED;
- restore remains NOT AUTHORIZED.

## Stage 5 stage5-preauth Supabase metadata diagnostic milestone

Result:

`PASS - BRANCHES EMPTY; TEMP CHILD REMAINS`

Workspace:

`madrasio-recovery-stage5-preauth-d0845d`

Subtree:

`supabase`

Accepted structure:

- workspace reparse point: false;
- `supabase` reparse point: false;
- direct files beneath `supabase`: 0;
- direct directories beneath `supabase`: 2.

### `.branches`

Classification:

`EMPTY_DIRECT_SUBDIRECTORY`

Evidence:

- reparse point: false;
- direct files: 0;
- direct directories: 0;
- total direct-file bytes: 0;
- immediate child reparse points: 0.

`.branches` requires no further provenance traversal.

### `.temp`

Classification:

`NONEMPTY_DIRECT_SUBDIRECTORY_METADATA_ONLY`

Evidence:

- reparse point: false;
- direct files: 0;
- direct directories: 1;
- total direct-file bytes: 0;
- immediate child reparse points: 0.

Remaining unresolved object:

The single direct child directory beneath:

`madrasio-recovery-stage5-preauth-d0845d\supabase\.temp`

No name, contents, or deeper structure for that child has yet been accepted as
provenance evidence.

Aggregate classification:

`SUPABASE_SUBDIRECTORIES_CONTAIN_METADATA_ONLY_UNCLASSIFIED_CONTENT`

Safety evidence:

- recursion beyond immediate children: false;
- file contents read: false;
- full temp paths printed: false;
- filesystem mutation: false;
- Docker operation: false;
- hosted request: false;
- Production R2 access: false;
- R2 credentials injected: false;
- recovery target creation: false;
- restore: false;
- RTO stopwatch start: false.

Authorization effect:

- `SG7Iy2` cleanup remains NOT AUTHORIZED;
- `Ic6tlJ` cleanup remains NOT AUTHORIZED;
- stage5-preauth cleanup remains NOT AUTHORIZED;
- Production retrieval remains NOT AUTHORIZED;
- Production R2 access remains NOT AUTHORIZED;
- local target creation remains NOT AUTHORIZED;
- restore remains NOT AUTHORIZED.

## Stage 5 stale recovery workspace provenance closure and cleanup authorization milestone

Result:

`PASS - ALL THREE STALE RECOVERY WORKSPACES PROVENANCE-RESOLVED`

Final exact stale directory set:

1. `madrasio-recovery-SG7Iy2`
2. `madrasio-recovery-target-Ic6tlJ`
3. `madrasio-recovery-stage5-preauth-d0845d`

### `madrasio-recovery-SG7Iy2`

Classification:

`EMPTY_GENERIC_RECOVERY_WORKSPACE`

Cleanup eligibility:

`true`

### `madrasio-recovery-target-Ic6tlJ`

Classification:

`ORPHAN_EMPTY_LOCAL_TARGET_DIRECTORY_NO_DOCKER_RESOURCES`

Cleanup eligibility:

`true`

Latest accepted Docker evidence:

- database container: absent;
- Auth container: absent;
- database volume: absent;
- network: absent;
- exact labeled containers: 0;
- exact labeled volumes: 0;
- exact labeled networks: 0.

### `madrasio-recovery-stage5-preauth-d0845d`

Final accepted structure:

- workspace non-reparse;
- sole direct child: `supabase`;
- `supabase` non-reparse;
- `supabase` direct files: 0;
- `supabase` direct directories:
  - `.branches`;
  - `.temp`.

`.branches`:

- non-reparse;
- empty.

`.temp`:

- non-reparse;
- direct files: 0;
- exactly one direct directory:
  `start-secrets`.

`start-secrets`:

- non-reparse;
- direct files: 0;
- direct directories: 0;
- direct bytes: 0;
- immediate reparse points: 0.

Final classification:

`STAGE5_PREAUTH_EMPTY_DIRECTORY_RESIDUE_TREE`

Cleanup eligibility:

`true`

### Cleanup authorization

Exactly one subsequent local cleanup checkpoint is authorized.

Authorized deletion set is limited to the three exact workspace basenames
listed above.

The cleanup must fail closed unless the exact accepted structure remains true
immediately before deletion.

Wildcard deletion is NOT authorized.

Any fourth `madrasio-recovery-*` directory or any unexpected new content must
abort cleanup before deletion.

For `Ic6tlJ`, exact repository-owned Docker resources and exact ownership-label
counts must be revalidated as absent before deletion.

After exact deletion, the cleanup checkpoint must require:

`madrasio-recovery-* directory count = 0`

before reporting success.

This cleanup authorization does NOT authorize:

- Production R2 access;
- R2 credential injection;
- Production ciphertext retrieval;
- attempt-2 stopwatch start;
- local recovery-target creation;
- decryption;
- restore;
- hosted changes;
- Production backup dispatch;
- recurring Production backup enablement;
- historical Stage 6 rerun.

Attempt 2 remains unstarted until cleanup and subsequent PROJECT-STATE
synchronization are complete.

## Stage 5 exact stale recovery workspace cleanup completion milestone

Result:

`PASS - EXACT STALE RECOVERY WORKSPACE CLEANUP COMPLETE`

Pre-cleanup authorized exact workspace count:

`3`

Pre-cleanup validated workspace count:

`3`

Exact deleted workspace count:

`3`

Deleted exact workspace basenames:

1. `madrasio-recovery-SG7Iy2`
2. `madrasio-recovery-target-Ic6tlJ`
3. `madrasio-recovery-stage5-preauth-d0845d`

`Ic6tlJ` pre-cleanup Docker revalidation:

- database container present: false;
- Auth container present: false;
- database volume present: false;
- network present: false;
- exact labeled container count: 0;
- exact labeled volume count: 0;
- exact labeled network count: 0.

Deletion mechanism:

- exact `-LiteralPath` deletion only;
- wildcard deletion: false.

Post-cleanup recovery-prefixed entry count:

`0`

Accepted post-cleanup classification:

`ZERO_RECOVERY_WORKSPACES`

Filesystem mutation:

`true`

Docker read-only checks:

`true`

Docker mutation:

`false`

Hosted request:

`false`

Production R2 access:

`false`

R2 credential injection:

`false`

Production ciphertext retrieval started:

`false`

Recovery workspace creation:

`false`

Local recovery-target creation:

`false`

Decryption:

`false`

Restore:

`false`

RTO stopwatch start:

`false`

PROJECT-STATE mutation during cleanup:

`false`

Cleanup completed:

`true`

Attempt 2 authorized by cleanup:

`false`

Authorization effect:

The stale-workspace precondition blocker is resolved.

The cleanup milestone alone does NOT authorize Production recovery attempt 2.

A fresh explicit attempt-2 authorization checkpoint is required before:

- Production R2 access;
- R2 credential injection;
- Production ciphertext retrieval;
- RTO stopwatch start;
- recovery workspace creation;
- target creation;
- decryption;
- restore.

## Stage 5 fresh attempt-2 authorization external identity process-binding blocker milestone

Result:

`FAIL - AUTHORIZATION BLOCKED BEFORE PRODUCTION R2 ACCESS`

Classification:

`ATTEMPT2_AUTHORIZATION_BLOCKED_BY_UNCONFIGURED_EXTERNAL_IDENTITY_PATH`

Checkpoint event:

`production_recovery_attempt2_authorization_checkpoint`

Attempt:

`2`

Failure:

`External Production age identity is not configured.`

Hosted activity:

- read-only GitHub Production-environment request count: 1;
- provider mutation: false.

Accepted local baseline entering the checkpoint:

`ZERO_RECOVERY_WORKSPACES`

Failure semantics:

The failure means only that the current Process scope did not provide
`RECOVERY_AGE_IDENTITY_PATH`.

It does not prove that the previously accepted external Production private age
identity no longer exists.

No private identity path or contents were emitted.

Recovery safety:

- Production R2 accessed: false;
- Production ciphertext retrieval started: false;
- recovery workspace created: false;
- local recovery target created: false;
- decryption started: false;
- restore started: false;
- RTO stopwatch started: false;
- R2 credentials cleared after failure: true.

Authorization effect:

- attempt 2 remains unstarted;
- attempt-2 retrieval remains NOT AUTHORIZED;
- Production R2 remains NOT AUTHORIZED;
- R2 credential injection remains NOT AUTHORIZED;
- restore remains NOT AUTHORIZED.

A new hosted authorization request is NOT the immediate next step.

The immediate next step is one LOCAL external-identity process-binding
checkpoint.

## Stage 5 local Production age identity candidate mismatch milestone

Result:

`FAIL - CANDIDATE DOES NOT MATCH ACCEPTED PRODUCTION RECIPIENT`

Classification:

`TESTED_AGE_IDENTITY_IS_NOT_ACCEPTED_PRODUCTION_IDENTITY`

Checkpoint event:

`production_age_identity_process_binding_checkpoint`

Failure:

`The external Production identity does not match the accepted recipient.`

Evidence:

- candidate path was entered locally through hidden input;
- candidate path was not printed;
- identity contents were not printed;
- the checkpoint reached public-recipient derivation;
- derived recipient did not exactly equal the accepted Production recipient;
- `RECOVERY_AGE_IDENTITY_PATH` was cleared after failure.

No provenance is assigned to the rejected candidate.

It must not be treated as the current Production identity.

Historical accepted Production custody evidence remains preserved separately.

Safety boundary:

- hosted request: false;
- provider mutation: false;
- Production R2 access: false;
- R2 credential injection: false;
- Production ciphertext retrieval: false;
- recovery workspace creation: false;
- local recovery-target creation: false;
- decryption: false;
- restore: false;
- RTO stopwatch start: false.

Attempt 2 remains unstarted and NOT AUTHORIZED.

## Stage 5 accepted Production custody identity revalidation milestone

Result:

`PASS - ACCEPTED PRODUCTION CUSTODY IDENTITY REVALIDATED`

Checkpoint event:

`accepted_production_custody_identity_diagnostic`

Candidate source:

`CANONICAL_LOCAL_PRODUCTION_CUSTODY_FALLBACK`

Dedicated Production custody environment binding configured:

`false`

Accepted evidence:

- broad filesystem search: false;
- arbitrary age identity inspected: false;
- identity path printed: false;
- identity contents printed: false;
- identity exists: true;
- identity reparse point: false;
- identity file size within bounded limit: true;
- identity outside repository: true;
- identity outside recognized synchronized/cloud-storage locations: true;
- age version: 1.3.1;
- reviewed age executable SHA-256 verified: true;
- reviewed age-keygen executable SHA-256 verified: true;
- derived recipient matches accepted Production recipient: true;
- recovery-prefixed entry count: 0;
- `ZERO_RECOVERY_WORKSPACES`: verified;
- `RECOVERY_AGE_IDENTITY_PATH` bound in Process scope: true.

No private identity path or contents were recorded.

Safety evidence:

- hosted request: false;
- provider mutation: false;
- Production R2 access: false;
- R2 credential injection: false;
- Production ciphertext retrieval: false;
- recovery workspace creation: false;
- local recovery-target creation: false;
- decryption: false;
- restore: false;
- RTO stopwatch start: false;
- PROJECT-STATE mutation during diagnostic: false.

Authorization effect:

The Production identity process-binding blocker is resolved for the current
PowerShell process.

This milestone does NOT itself authorize timed Production retrieval attempt 2.

A fresh attempt-2 authorization checkpoint is required next.

## Stage 5 fresh attempt-2 PROJECT-STATE authority gate failure milestone

Result:

`FAIL - PROJECT-STATE AUTHORITY BOUNDARY`

Classification:

`ATTEMPT2_AUTHORIZATION_PROJECT_STATE_AUTHORITY_FAILURE`

Checkpoint event:

`production_recovery_attempt2_authorization_after_identity_binding`

Attempt:

`2`

Failure boundary:

`PROJECT_STATE_AUTHORITY`

Hosted read-only request count:

`0`

Validated Production identity binding preserved:

`true`

Recovery safety:

- provider mutation: false;
- Production R2 access: false;
- Production ciphertext retrieval: false;
- recovery workspace creation: false;
- local recovery-target creation: false;
- decryption: false;
- restore: false;
- RTO stopwatch start: false;
- attempt-2 retrieval authorized: false.

The exact failing PROJECT-STATE requirement is unresolved.

No blind authorization rerun is permitted.

## Stage 5 fresh attempt-2 authorization after state-authority repair milestone

Checkpoint event:

`production_recovery_attempt2_authorization_after_state_authority_repair`

Result:

`PASS`

Attempt:

`2`

Classification:

`ATTEMPT2_AUTHORIZATION_GATE_PASSED_AFTER_STATE_AUTHORITY_REPAIR`

Authorization evidence:

- repository authority verified: true;
- PROJECT-STATE authority repair verified: true;
- accepted artifact authority verified: true;
- accepted R2 bucket authority verified: true;
- accepted Production project-ref authority verified: true;
- Production recipient status: `CURRENT_EXACT_MATCH`;
- Production endpoint status: `REVIEWED_EU_JURISDICTION_R2_ENDPOINT`;
- recurring Production backup automation disabled: true;
- `ZERO_RECOVERY_WORKSPACES`: true;
- recovery container count: 0;
- recovery volume count: 0;
- recovery network count: 0;
- immutable recovery images available: true;
- `pnpm.cmd` 11.22.0 verified: true;
- bound Production identity present: true;
- bound Production identity matches accepted recipient: true;
- reviewed age binary SHA-256 verified: true;
- reviewed age-keygen binary SHA-256 verified: true.

Hosted effect:

- read-only GitHub Production-environment request count: 1;
- provider mutation: false.

Recovery effects:

- R2 credentials injected: false;
- Production R2 access: false;
- Production ciphertext retrieval: false;
- recovery workspace creation: false;
- local recovery-target creation: false;
- decryption: false;
- restore: false;
- attempt-2 stopwatch creation: false;
- RTO stopwatch start: false.

Timing status:

- timed attempt 2 remains unstarted;
- no attempt-2 elapsed time exists yet;
- historical attempt-1 0.822-second failure remains separate.

Authorization effect:

The public/pre-secret attempt-2 authorization gate is accepted.

Timed retrieval is still NOT started.

The next bounded checkpoint is Process-only execution preparation.

## Stage 5 attempt-2 execution-preparation authority failure milestone

Checkpoint event:

`production_recovery_attempt2_process_secret_and_stopwatch_preparation`

Result:

`FAIL`

Attempt:

`2`

Failure boundary:

`AUTHORITY`

Classification:

`ATTEMPT2_PREPARATION_AUTHORITY_FAILURE_BEFORE_SECRET_BINDING`

Observed checkpoint evidence:

- hosted read-only request count: 0;
- provider mutation: false;
- Production R2 access: false;
- Production ciphertext retrieval: false;
- recovery workspace creation: false;
- local recovery-target creation: false;
- decryption: false;
- restore: false;
- Process R2 configuration cleared: true;
- attempt-2 stopwatch removed: true;
- validated Production identity binding preserved: true;
- timed attempt 2 started: false;
- attempt-2 execution authorized: false.

The exact failing authority assertion remains unresolved.

No blind preparation retry is authorized.

## Stage 5 canonical attempt-2 retrieval authority registry

Purpose:

Provide one persistent canonical PROJECT-STATE authority block for Production
recovery attempt 2 that is independent of transient Current Stage and Exact
next-step wording.

Repository SHA:

`1db366dae0c6328bb00ec639c3d5d11de9cc6de6`

Accepted Production backup ID:

`20260926T155349Z-1db366dae0c6-83b7427ec876b3c4`

Accepted Production R2 object key:

`frequent/2026/09/26/20260926T155349Z-1db366dae0c6-83b7427ec876b3c4.age`

Accepted encrypted byte count:

`34729`

Accepted ciphertext SHA-256:

`8555692960dcce344e0ed8b9dc2b4cb2905c1b5fccb5d06fe1d9e0771f5e8dff`

Accepted Production public age recipient:

`age1w50x9ahjqfngv3adq6j6az6stqhmw5nq2e4mqz93lenh6rzcs5mq3j9m83`

Accepted Production R2 bucket:

`madrasio-production-backups`

Accepted Production source project ref:

`vpvbbsdmyhfjkbrbnocx`

Accepted recipient diagnostic:

`CURRENT_EXACT_MATCH`

Accepted R2 endpoint diagnostic:

`REVIEWED_EU_JURISDICTION_R2_ENDPOINT`

Accepted local recovery baseline:

`ZERO_RECOVERY_WORKSPACES`

Recurring Production backup automation:

`DISABLED`

Production customer onboarding:

`BLOCKED`

This registry records public recovery authority only.

It contains no:

- R2 credential value;
- private age identity path;
- private age identity contents;
- restore database URL.

## Stage 5 attempt-2 preparation authority diagnostic milestone

Diagnostic event:

`attempt2_preparation_authority_diagnostic`

Result:

`PASS`

Classification:

`PREPARATION_PROJECT_STATE_AUTHORITY_MARKER_MISMATCH_CONFIRMED`

Repository/process failure count:

`0`

Current PROJECT-STATE missing marker count observed by the diagnostic:

`3`

Observed missing symbolic markers:

1. `preparationAuthorizationMarker`
2. `acceptedR2Bucket`
3. `acceptedProductionProjectRef`

Non-historical missing marker count:

`2`

Non-historical missing markers:

1. `acceptedR2Bucket`
2. `acceptedProductionProjectRef`

Interpretation:

The preparation failure was a PROJECT-STATE authority representation failure.

No repository/process authority failure was established.

The current absence of the old preparation authorization marker is expected
after the failure synchronization and is not treated as the historical cause.

Safety evidence from the diagnostic:

- hosted request performed: false;
- R2 credentials requested: false;
- Production R2 accessed: false;
- Production ciphertext retrieval started: false;
- recovery workspace created: false;
- local recovery target created: false;
- attempt-2 stopwatch created: false;
- RTO stopwatch started: false;
- PROJECT-STATE mutated during diagnostic: false;
- timed attempt 2 started: false.

## Stage 5 canonical attempt-2 authority registry verification milestone

Verification event:

`attempt2_canonical_authority_registry_verification`

Result:

`PASS`

Classification:

`CANONICAL_ATTEMPT2_AUTHORITY_REGISTRY_VERIFIED`

Registry heading count:

`1`

Failed registry authority check count:

`0`

Verified canonical authorities:

- repository SHA: true;
- accepted backup ID: true;
- accepted Production object key: true;
- accepted encrypted byte count: true;
- accepted ciphertext SHA-256: true;
- accepted Production public age recipient: true;
- accepted Production R2 bucket: true;
- accepted Production project ref: true;
- recipient diagnostic: true;
- EU R2 endpoint diagnostic: true;
- `ZERO_RECOVERY_WORKSPACES`: true;
- recurring Production backup automation disabled: true;
- Production customer onboarding blocked: true.

Verified clean Process/repository boundary:

- repository HEAD: true;
- branch main: true;
- origin/main: true;
- no unexpected worktree changes outside PROJECT-STATE: true;
- validated Production identity binding present: true;
- R2 credentials absent: true;
- recovery bundle absent: true;
- restore target absent: true;
- attempt-2 stopwatch absent: true;
- recovery-prefixed entry count: 0.

Side effects:

- hosted request: false;
- R2 credential request: false;
- Production R2 access: false;
- Production ciphertext retrieval: false;
- recovery workspace creation: false;
- local recovery-target creation: false;
- stopwatch creation/start: false;
- timed attempt 2 start: false.

Authorization effect:

The canonical registry may now be used as the stable authority source for one
new bounded Process-secret/stopwatch preparation checkpoint.

This milestone does NOT itself authorize Production ciphertext retrieval.

## Stage 5 attempt-2 Process-secret and stopwatch preparation PASS milestone

Preparation event:

`production_recovery_attempt2_preparation_after_canonical_registry`

Result:

`PASS`

Attempt:

`2`

Classification:

`ATTEMPT2_PROCESS_SECRET_AND_STOPWATCH_PREPARATION_PASSED`

Authority:

- canonical attempt-2 registry verified: true;
- current Production public configuration matched registry: true;
- Production identity matched canonical recipient: true;
- `ZERO_RECOVERY_WORKSPACES`: true;
- retrieval launcher/contract verified: true.

Process preparation:

- public retrieval configuration bound: true;
- R2 credentials bound: true;
- credential values printed: false;
- identity path/contents printed: false;
- fresh attempt-2 stopwatch prepared: true;
- stopwatch running: false;
- stopwatch elapsed ticks: 0.

Hosted activity:

- read-only GitHub request attempt count: 1;
- read-only GitHub request success count: 1;
- provider mutation: false.

Recovery-side activity:

- Production R2 access: false;
- Production ciphertext retrieval: false;
- recovery workspace creation: false;
- local recovery-target creation: false;
- decryption: false;
- restore: false;
- timed attempt-2 start: false.

Authorization effect:

This PASS prepares, but does not itself start, timed Production recovery
attempt 2.

The next separately bounded checkpoint may start the prepared stopwatch
immediately before the exact Production ciphertext retrieval.

## Stage 5 attempt-2 pre-timer execution harness failure milestone

Event:

`production_recovery_attempt2_ciphertext_retrieval`

Result:

`FAIL`

Attempt:

`2`

Failure boundary:

`PRE_TIMER_AUTHORITY`

Failure message:

`You cannot call a method on a null-valued expression.`

Classification:

`ATTEMPT2_PRE_TIMER_AUTHORITY_HARNESS_FAILURE`

Timing:

- timed attempt 2 started: false;
- RTO stopwatch running: false;
- elapsed seconds: 0.

Recovery effects:

- Production ciphertext retrieval accepted: false;
- recovery workspace count after failure: 0;
- local recovery target created: false;
- decryption started: false;
- restore started: false.

Post-failure safety:

- R2 credential Process state cleared: true;
- retrieval Process configuration cleared: true;
- blind retry authorized: false.

This event is not an RTO measurement.

## Stage 5 attempt-2 pre-timer null-output diagnostic milestone

Diagnostic event:

`attempt2_pre_timer_null_output_diagnostic`

Result:

`PASS`

Classification:

`CONFIRMED_NULL_UNSAFE_DOCKER_TRIM_PRE_TIMER_HARNESS_DEFECT`

Docker container query:

- command exit success: true;
- raw value is null: true;
- normalized result count: 0;
- zero recovery resources: true;
- direct `.Trim()` would throw: true.

Docker volume query:

- command exit success: true;
- raw value is null: true;
- normalized result count: 0;
- zero recovery resources: true;
- direct `.Trim()` would throw: true.

Docker network query:

- command exit success: true;
- raw value is null: true;
- normalized result count: 0;
- zero recovery resources: true;
- direct `.Trim()` would throw: true.

Control checks:

- Git native outputs null: false;
- accepted HEAD: true;
- branch main: true;
- accepted origin/main: true;
- `pnpm.cmd` stdout null: false;
- `pnpm.cmd` 11.22.0: true.

Safety evidence:

- validated Production identity binding present: true;
- recovery/R2 Process variables: 0;
- recovery bundle absent: true;
- restore target absent: true;
- attempt-2 stopwatch absent: true;
- recovery workspace count: 0;
- hosted request: false;
- R2 credential request/binding: false;
- Production R2 access: false;
- Production retrieval start: false;
- timed attempt 2 start: false.

Corrective rule:

`NULL_SAFE_DOCKER_ZERO_RESULT_NORMALIZATION_REQUIRED`

Do not use direct `.Trim()` on Docker commands whose valid zero-result output
may be represented as `$null`.

## Stage 5 attempt-2 null-safe re-preparation Production-identity failure milestone

Event:

`production_recovery_attempt2_repreparation_after_null_safe_docker_diagnosis`

Result:

`FAIL`

Attempt:

`2`

Failure boundary:

`PRODUCTION_IDENTITY`

Classification:

`ATTEMPT2_REPREPARATION_PRODUCTION_IDENTITY_FAILURE_BEFORE_HOSTED_OR_SECRET_ACTIVITY`

Hosted activity:

- read-only request attempts: 0;
- read-only request successes: 0;
- provider mutation: false.

Recovery-side activity:

- Production R2 access: false;
- ciphertext retrieval: false;
- recovery workspace creation: false;
- local recovery-target creation: false;
- decryption: false;
- restore: false;
- timed attempt-2 start: false.

Post-failure state:

- R2/retrieval Process configuration cleared: true;
- attempt-2 stopwatch removed: true;
- validated Production identity Process binding preserved: true;
- blind retry authorized: false.

No accepted RTO measurement was created.

Candidate harness regression requiring diagnosis:

`REPREPARATION_AGE_TOOL_RESOLUTION_PATH_REGRESSION`

This is a diagnostic hypothesis only, not yet an accepted root cause.

## Stage 5 attempt-2 Production-identity tool-resolution diagnostic milestone

Event:

`attempt2_production_identity_tool_resolution_diagnostic`

Result:

`PASS`

Classification:

`CONFIRMED_REPREPARATION_AGE_TOOL_RESOLUTION_REGRESSION`

Production identity:

- Process binding present: true;
- identity file exists: true;
- identity is not a reparse point: true.

Reviewed tooling:

- reviewed tool-directory binding present: true;
- reviewed age exists: true;
- reviewed age-keygen exists: true;
- reviewed age hash matches accepted: true;
- reviewed age-keygen hash matches accepted: true;
- reviewed age version 1.3.1: true;
- reviewed age-keygen version 1.3.1: true;
- recipient derivation succeeded: true;
- derived recipient matches accepted Production recipient: true;
- reviewed tooling healthy: true.

Generic PATH tooling:

- PATH age exists: false;
- PATH age-keygen exists: false;
- PATH resolution equivalent to reviewed tooling: false.

Confirmed root cause:

`REPREPARATION_AGE_TOOL_RESOLUTION_PATH_REGRESSION`

Corrective rule:

`REVIEWED_AGE_TOOL_DIRECTORY_FIRST_RESOLUTION_REQUIRED`

Preserved Docker corrective rule:

`NULL_SAFE_DOCKER_ZERO_RESULT_NORMALIZATION_REQUIRED`

Safety:

- hosted request: false;
- credential request/binding: false;
- Production R2 access: false;
- ciphertext retrieval: false;
- recovery workspace creation: false;
- target creation: false;
- decryption: false;
- restore: false;
- stopwatch creation/start: false;
- timed attempt-2 start: false.

This diagnostic is not an RTO measurement.

## Stage 5 attempt-2 corrected re-preparation PASS milestone

Event:

`production_recovery_attempt2_corrected_repreparation`

Result:

`PASS`

Attempt:

`2`

Classification:

`ATTEMPT2_CORRECTED_REPREPARATION_PASSED`

Corrections applied:

- `NULL_SAFE_DOCKER_ZERO_RESULT_NORMALIZATION_REQUIRED`;
- `REVIEWED_AGE_TOOL_DIRECTORY_FIRST_RESOLUTION_REQUIRED`.

Authority:

- canonical attempt-2 registry verified: true;
- Production identity matched accepted recipient: true;
- current Production public configuration matched registry: true;
- zero recovery workspaces: true;
- zero recovery Docker resources: true.

Process preparation:

- accepted public retrieval configuration bound: true;
- Process-only R2 credentials bound: true;
- fresh attempt-2 stopwatch prepared: true;
- stopwatch running: false;
- stopwatch elapsed ticks: 0.

Hosted activity:

- read-only Production-variable requests attempted: 1;
- read-only Production-variable requests successful: 1;
- provider mutation: false.

Recovery-side activity:

- Production R2 access: false;
- Production ciphertext retrieval: false;
- workspace creation: false;
- target creation: false;
- decryption: false;
- restore: false;
- timed attempt-2 start: false.

This preparation PASS is not an RTO measurement.

## Stage 5 attempt-2 live retrieval and post-retrieval harness-failure synchronization milestone

Attempt:

`2`

Production retrieval phase:

`PASS`

Accepted event:

`production_recovery_attempt2_ciphertext_retrieval`

Accepted classification:

`TIMED_ATTEMPT2_PRODUCTION_CIPHERTEXT_RETRIEVED_VERIFIED`

Retrieval evidence:

- backup ID: `20260926T155349Z-1db366dae0c6-83b7427ec876b3c4`;
- object key: `frequent/2026/09/26/20260926T155349Z-1db366dae0c6-83b7427ec876b3c4.age`;
- encrypted bytes: `34729`;
- ciphertext SHA-256: `8555692960dcce344e0ed8b9dc2b4cb2905c1b5fccb5d06fe1d9e0771f5e8dff`;
- exact retrieved artifact independently verified: true;
- R2 credentials/configuration cleared after retrieval: true.

Reason this PASS was not already in PROJECT-STATE:

`CONFIRMED_RETRIEVAL_PASS_WAS_LIVE_ONLY_NOT_PROJECT_STATE_SYNCHRONIZED`

The RTO timer was active after retrieval, so no administrative PROJECT-STATE
synchronization was performed at that point.

Post-retrieval phase:

`FAIL`

Failure classification:

`ATTEMPT2_POST_RETRIEVAL_HARNESS_PARSE_FAILURE_WITH_FALSE_COMPLETION_BOOKKEEPING`

Failure occurred:

- after accepted ciphertext retrieval;
- before real local-target creation;
- before accepted decryption;
- before accepted restore;
- before accepted reconciliation/security verification.

Forensic local-target evidence:

- containers: 0;
- volumes: 0;
- networks: 0;
- target directories: 0;
- target state path: absent.

False bookkeeping evidence:

- attempt-2 stopwatch stopped: true;
- stopped elapsed evidence: 401.352 seconds;
- stray restore-completion timestamp recorded: true;
- false state: `ATTEMPT2_RTO_VERIFIED`;
- stray loopback restore URL residue: present.

Accepted isolated restore:

`false`

Accepted restored-table count:

`0`

Accepted attempt-2 RTO measurement:

`false`

Blind continuation/retry:

`NOT AUTHORIZED`

## Stage 5 attempt-2 local-cleanup launcher diagnostic milestone

Event:

`attempt2_cleanup_launcher_argument_diagnostic`

Result:

`PASS`

Classification:

`DIRECT_PNPM_EXEC_CLEANUP_LAUNCHER_CONFIRMED_PACKAGE_SCRIPT_LAUNCHER_REQUIRES_REVIEW`

Original real-cleanup failure boundary:

`ATTEMPT2_RETRIEVAL_WORKSPACE_CLEANUP`

Launcher diagnostic evidence:

- separator-form probe exit: non-zero;
- separator-form unknown-action result: false;
- separator-form cleanup-failure result: true;
- no-separator probe exit: non-zero;
- no-separator unknown-action result: false;
- no-separator cleanup-failure result: true;
- direct-exec probe exit: non-zero;
- direct-exec unknown-action result: false;
- direct-exec cleanup-failure result: true.

All launcher probes used a fake nonexistent workspace only.

Real attempt-2 evidence after diagnostic:

- real workspace still exists: true;
- real ciphertext still exists: true;
- bytes still verified: true;
- SHA-256 still verified: true;
- stopwatch still stopped: true;
- stopped elapsed evidence unchanged: true;
- R2 Process bindings: 0;
- real cleanup performed: false.

Interpretation:

The cleanup script action is reachable through direct execution.

The current evidence does not support an argument-separator/action-routing
failure as the cause of the real cleanup failure.

The next bounded investigation is real-workspace cleanup-contract validation
without deletion.

Blind cleanup retry remains unauthorized.

## Stage 5 attempt-2 real-workspace cleanup-contract diagnostic milestone

Event:

`attempt2_real_workspace_cleanup_contract_diagnostic`

Result:

`PASS`

Classification:

`REAL_WORKSPACE_CLEANUP_CONTRACT_ACCEPTED_OS_REMOVAL_BOUNDARY_REMAINS`

Validated real-workspace contract:

- under Node temporary root: true;
- direct child of temporary root: true;
- required recovery prefix: true;
- directory: true;
- reparse point: false;
- read-only attribute: false;
- ciphertext at exact expected location: true;
- ciphertext reparse point: false;
- ciphertext read-only attribute: false;
- ciphertext readable: true.

Committed contract verification:

- `assertRecoveryWorkDirectory` accepted real path: true;
- committed probe exit code: 0;
- committed accepted-event count: 1.

Artifact integrity after diagnostic:

- ciphertext bytes still accepted: true;
- ciphertext SHA-256 still accepted: true.

Recovery resource boundary:

- containers: 0;
- volumes: 0;
- networks: 0.

Attempt-2 stopwatch:

- running: false;
- stopped elapsed evidence: 401.352 seconds.

Mutation/access boundary:

- real cleanup performed: false;
- file/directory removed: false;
- Production R2 accessed: false;
- Production database accessed: false;
- target created: false;
- restore performed: false;
- retrieval performed: false.

Conclusion:

The committed cleanup path-validation contract accepts the real attempt-2
workspace.

The remaining cleanup problem is now isolated to the actual operating-system
filesystem removal boundary.

Blind cleanup retry remains unauthorized.

## Stage 5 attempt-2 operating-system removal-boundary diagnostic milestone

Event:

`attempt2_os_removal_boundary_diagnostic`

Result:

`PASS`

Classification:

`OS_REMOVAL_PREREQUISITES_ACCEPTED_TRANSIENT_OR_STALE_HANDLE_FAILURE_LIKELY`

Real workspace/ciphertext OS checks:

- ACL readable: true;
- read-only attributes: false;
- reparse points: false;
- workspace DELETE access: allowed;
- workspace Win32 error: 0;
- ciphertext DELETE access: allowed;
- ciphertext Win32 error: 0.

Disposable same-root Node removal:

`PASS`

Controlled deletion-sharing behavior:

- no-FILE_SHARE_DELETE handle blocks removal: confirmed;
- release of that handle permits removal: confirmed.

Retained real artifact after diagnostic:

- workspace still exists: true;
- ciphertext still exists: true;
- accepted bytes still verified: true;
- accepted SHA-256 still verified: true.

Attempt-2 failure stopwatch:

- running: false;
- elapsed evidence: 401.352 seconds.

Recovery/hosted safety:

- recovery containers: 0;
- recovery volumes: 0;
- recovery networks: 0;
- R2 Process bindings: 0;
- Production R2 accessed: false;
- Production database accessed: false.

Interpretation:

No persistent cleanup-path, ACL, read-only, reparse-point or same-temp-root Node
rm failure is present.

The previous repository cleanup failure is consistent with a transient or stale
Windows deletion-blocking handle which is no longer present.

Exactly one controlled cleanup retry is now authorized.

## Stage 5 attempt-2 authorized cleanup completion milestone

Event:

`production_recovery_attempt2_authorized_cleanup_retry`

Result:

`PASS`

Classification:

`ATTEMPT2_AUTHORIZED_REPOSITORY_CLEANUP_RETRY_PASSED`

Attempt:

`2`

Cleanup execution:

- authorized repository cleanup invocation count: 1;
- repository cleanup exit code: 0;
- cleanup completion event count: 1;
- cleanup completion event verified: true;
- physical cleanup verified: true.

Removed:

- failed attempt-2 recovery workspace;
- retained attempt-2 ciphertext;
- `RECOVERY_BUNDLE_PATH`;
- stray loopback restore URL;
- false restore-completion bookkeeping.

Remaining recovery retrieval workspaces:

`0`

Remaining recovery-target resources:

- containers: 0;
- volumes: 0;
- networks: 0.

Attempt-2 live state:

`ATTEMPT2_FAILED_POST_RETRIEVAL_HARNESS_PARSE`

Attempt-2 stopwatch:

- preserved: true;
- running: false;
- elapsed failure evidence: 401.352 seconds.

Accepted attempt-2 RTO measurement:

`false`

Preserved custody/tool bindings:

- Production age identity: true;
- reviewed age-tool directory: true.

Hosted access during cleanup:

- Production R2: false;
- Production database: false.

Second cleanup retry authorized:

`false`

Conclusion:

Attempt 2 is fully closed and cleaned locally.

Its successful ciphertext retrieval and failed post-retrieval harness execution
remain historical evidence only.

A future accepted RTO result requires a fresh timed recovery attempt from a clean
boundary.

## Stage 5 attempt-3 preparation age-version assertion diagnostic milestone

Event:

`attempt3_preparation_age_version_assertion_diagnostic`

Result:

`PASS`

Classification:

`ATTEMPT3_PREPARATION_FAILED_ON_OVERSTRICT_AGE_VERSION_REGEX_BINARY_AUTHORITY_INTACT`

Age binary evidence:

- age executable SHA-256 accepted: true;
- age-keygen executable SHA-256 accepted: true;
- age version command exit code: 0;
- sanitized version: `v1.3.1`;
- expected `1.3.1` token present: true.

Regex evidence:

- original `\b1\.3\.1\b` assertion: false;
- corrected optional-`v` assertion: true.

Failure interpretation:

The preparation checkpoint contained an over-strict harness assertion.

The accepted age executable and tool custody remain valid.

Attempt-3 state after the failed preparation:

- bookkeeping namespace variables: 0;
- stopwatch created: false;
- RTO started: false.

Recovery activity:

- R2 Process bindings: 0;
- Production R2 access: false;
- Production database access: false;
- retrieval: false;
- target creation: false;
- decrypt: false;
- restore: false.

PROJECT-STATE was not mutated by the failed preparation or diagnostic.

This diagnostic authorizes only a corrected Attempt-3 PREPARATION retry.

It does NOT authorize Production retrieval or starting the RTO clock.

## Stage 5 attempt-3 corrected fresh-preparation milestone

Event:

`production_recovery_attempt3_corrected_fresh_preparation`

Result:

`PASS`

Classification:

`ATTEMPT3_FRESH_PREPARATION_WITH_CORRECTED_AGE_VERSION_ASSERTION_PASSED`

Attempt:

`3`

Clean local boundary:

- retrieval workspaces: 0;
- target directories: 0;
- recovery containers: 0;
- recovery volumes: 0;
- recovery networks: 0;
- R2 Process bindings: 0;
- restore residue: false.

Tool / execution authority:

- accepted age executable: true;
- accepted age-keygen executable: true;
- age version: `v1.3.1`;
- corrected age assertion: true;
- pnpm accepted: true;
- retrieval wiring accepted: true;
- local-target wiring accepted: true;
- restore wiring accepted: true.

Immutable recovery-point authority:

- backup ID accepted: true;
- object key accepted: true;
- encrypted-byte count accepted: true;
- ciphertext SHA-256 accepted: true.

RTO target:

`28800` seconds

Attempt-3 preparation namespace:

`ATTEMPT3_PREPARED_NO_TIMER_NO_R2`

Attempt-3 stopwatch:

`NOT CREATED`

Attempt-3 RTO:

`NOT STARTED`

Recovery activity performed during preparation:

- Production R2: false;
- Production database: false;
- retrieval: false;
- target creation: false;
- decrypt: false;
- restore: false.

Conclusion:

Attempt 3 is fully prepared but has not begun.

The next execution gate is a single fresh timed Production ciphertext retrieval
from the accepted immutable recovery point.

## Stage 5 attempt-3 timed Production ciphertext retrieval milestone

Event:

`production_recovery_attempt3_ciphertext_retrieval`

Result:

`PASS`

Attempt:

`3`

Classification:

`TIMED_ATTEMPT3_PRODUCTION_CIPHERTEXT_RETRIEVED_VERIFIED`

RTO start:

`2026-09-27T20:33:38.6288894+00:00`

Elapsed at retrieval checkpoint:

`1.921` seconds

RTO stopwatch:

`RUNNING`

RTO target:

`28800` seconds

Retrieved artifact:

- accepted immutable backup identity: true;
- accepted object key: true;
- accepted encrypted bytes: true;
- accepted ciphertext SHA-256: true;
- independent local byte verification: true;
- independent local SHA-256 verification: true;
- retained workspace count: 1;
- verified bundle registered: true.

R2 lifecycle:

- Production R2 read: completed;
- credentials cleared: true;
- retrieval configuration cleared: true;
- remaining R2 Process bindings: 0.

Restore lifecycle:

- isolated target: not created;
- decrypt: not started;
- restore: not started;
- reconciliation/security verification: not started;
- timed Attempt 3 completed: false.

The stopwatch must not be stopped, reset or restarted while Attempt 3 remains
active.

## Stage 5 attempt-3 isolated-local target pre-restore verification milestone

Event:

`production_recovery_attempt3_isolated_local_target_pre_restore_verify`

Result:

`PASS`

Attempt:

`3`

Classification:

`TIMED_ATTEMPT3_ISOLATED_LOCAL_TARGET_PRE_RESTORE_VERIFIED`

Elapsed at checkpoint:

`470.426` seconds

RTO stopwatch:

`RUNNING`

Target lifecycle:

- target created: true;
- target verified: true;
- target ID registered: true;
- target state path registered: true.

Target resources:

- directories: 1;
- containers: 2;
- volumes: 1;
- networks: 1.

Pre-restore verification:

- database healthy: true;
- Auth healthy: true;
- Auth users: 0;
- Auth identities: 0;
- application tables: 0;
- migrations: 0;
- RLS tables: 0;
- application policies: 0;
- non-loopback bindings: 0;
- LAN connectivity: `rejected`;
- security: `not-migrated`.

Recovery ciphertext:

- retained: true;
- accepted byte count preserved: true;
- accepted SHA-256 preserved: true.

No Production database access, decrypt or restore occurred during this target
checkpoint.

Attempt 3 remains active.

## Stage 5 attempt-3 accepted Production RTO milestone

Event:

`production_recovery_attempt3_isolated_local_restore_rto`

Result:

`PASS`

Attempt:

`3`

Classification:

`TIMED_ATTEMPT3_ISOLATED_LOCAL_RESTORE_AND_RTO_ACCEPTED`

Repository restore:

- invocation count: 1;
- exit code: 0;
- success event: `isolated_restore_verified`;
- success-event count: 1;
- backup ID match: true;
- restored tables: 41;
- restored-data reconciliation: accepted;
- application-security verification: accepted.

RTO evidence:

- start:
  `2026-09-27T20:33:38.6288894+00:00`;
- completion:
  `2026-09-27T20:50:16.3959622+00:00`;
- elapsed:
  `997.767` seconds;
- target:
  `28800` seconds;
- within target: true;
- stopwatch: stopped;
- measurement accepted: true.

Safety evidence:

- direct Production database access: false;
- Production R2 access during restore: false;
- replacement target: false;
- second restore invocation: false;
- PROJECT-STATE mutation during timed restore: false.

Cleanup status:

- accepted local target retained;
- accepted retrieval workspace retained;
- accepted ciphertext retained.

These local artifacts are retained only until bounded post-acceptance cleanup is
performed and verified.

## Stage 5 attempt-3 post-acceptance local cleanup milestone

Event:

`production_recovery_attempt3_post_acceptance_local_cleanup`

Result:

`PASS`

Attempt:

`3`

Classification:

`ATTEMPT3_ACCEPTED_RTO_LOCAL_POST_ACCEPTANCE_CLEANUP_PASSED`

Target cleanup:

- invocation count: 1;
- repository cleanup accepted: true;
- remaining containers: 0;
- remaining volumes: 0;
- remaining networks: 0.

Retrieval cleanup:

- invocation count: 1;
- event:
  `production_recovery_retrieval_cleanup_complete`;
- repository cleanup accepted: true;
- retrieval workspace removed: true;
- ciphertext removed: true;
- remaining recovery workspaces: 0.

Local recovery binding cleanup:

- `RECOVERY_BUNDLE_PATH`: cleared;
- obsolete Attempt-3 target/workspace/bundle globals: cleared.

Accepted RTO evidence preserved:

- accepted state: `ATTEMPT3_RTO_VERIFIED`;
- elapsed: `997.767` seconds;
- target: `28800` seconds;
- within target: true;
- stopwatch: stopped;
- start timestamp: preserved;
- restore completion timestamp: preserved;
- immutable recovery-point authority: preserved.

No Production R2 access, Production database access, retrieval, target creation,
decrypt or restore occurred during this cleanup.

Attempt 3 is now fully closed locally.

## Stage 5 Production RPO backup-cadence acceptance review milestone

Event:

`production_rpo_backup_cadence_acceptance_review`

Result:

`PASS`

Classification:

`PRODUCTION_RPO_CADENCE_CONTRACT_READY_FOR_SEPARATE_ENABLEMENT_RPO_NOT_YET_ACCEPTED`

Accepted RTO status:

- Production RTO accepted: true;
- elapsed: `997.767` seconds;
- target: `28800` seconds;
- Attempt 3 locally closed: true.

RPO objective:

`6 hours`

Frequent Production backup schedule:

`23 1,5,9,13,17,21 * * *`

Frequent interval:

`4 hours`

Cadence headroom:

`2 hours`

Additional weekly schedule:

`47 2 * * 0`

Monitoring contract:

- expected heartbeat interval: 4 hours;
- grace: 1 hour;
- failure-detection window: 5 hours;
- detection window inside RPO boundary: true.

Repository/provider readiness:

- schedule contract accepted: true;
- cadence meets six-hour RPO design: true;
- Production backup entrypoints accepted: true;
- backup runtime contract accepted: true;
- hosted Backup Production workflow active: true;
- required Production variables present: true;
- required Production secret names present: true;
- heartbeat secret metadata present: true;
- secret values retrieved: false;
- active/conflicting backup runs: 0;
- provider ready for separate cadence enablement: true.

Activation state:

- `PRODUCTION_BACKUP_AUTOMATION_ENABLED`: ABSENT;
- recurring Production backup automation: DISABLED.

Production RPO:

`NOT ACCEPTED`

Reason:

`OPERATING_CADENCE_NOT_YET_ENABLED_OR_PROVEN`

No hosted mutation occurred during this review.

## Stage 5 Production RPO enablement precheck false-negative diagnostic milestone

Event:

`production_rpo_enablement_failure_diagnostic`

Result:

`PASS`

Classification:

`PREVIOUS_ENABLEMENT_PRECHECK_FALSE_NEGATIVE_PROVIDER_AUTHORITY_INTACT`

The first recurring-backup enablement checkpoint did NOT reach its provider
mutation.

Observed failed-checkpoint evidence:

- mutation attempt count: 0;
- mutation accepted: false;
- Production backup dispatched: false;
- Production R2 accessed: false;
- Production database accessed: false;
- PROJECT-STATE mutated: false;
- enablement retry performed: false.

A separate canonical GitHub Production environment-variable API diagnostic then
proved:

- `BACKUP_AGE_RECIPIENT`: exactly 1;
- `PRODUCTION_APP_ORIGIN`: exactly 1;
- `PRODUCTION_EXPECTED_PROJECT_REF`: exactly 1;
- `R2_BUCKET_NAME`: exactly 1;
- `R2_ENDPOINT`: exactly 1;
- Production age recipient matches accepted custody authority: true;
- Production expected project ref matches accepted authority: true;
- `PRODUCTION_BACKUP_AUTOMATION_ENABLED`: ABSENT.

Provider authority is therefore intact.

No duplicate enablement occurred.

No hosted mutation occurred.

The failed checkpoint is classified as a false-negative precheck and not as an
RPO failure.

Production RTO remains accepted at:

`997.767` seconds

Production RPO remains:

`NOT ACCEPTED`

## Stage 5 Production RPO enablement secret-precheck false-negative milestone

Event:

`production_rpo_corrected_enablement_secret_failure_diagnostic`

Result:

`PASS`

Classification:

`SECOND_ENABLEMENT_PRECHECK_FALSE_NEGATIVE_SECRET_PROVIDER_AUTHORITY_INTACT`

The corrected recurring-backup enablement checkpoint again stopped before any
provider mutation.

Corrected checkpoint evidence:

- previous failed-checkpoint provider mutation attempts: 0;
- corrected mutation attempt count: 0;
- corrected mutation accepted: false;
- automation state: `ABSENT`;
- manual backup dispatch: false;
- Production R2 direct access: false;
- Production database direct access: false;
- PROJECT-STATE mutation: false.

Canonical GitHub Production environment-variable API evidence:

- `BACKUP_AGE_RECIPIENT`: exactly 1;
- `PRODUCTION_APP_ORIGIN`: exactly 1;
- `PRODUCTION_EXPECTED_PROJECT_REF`: exactly 1;
- `R2_BUCKET_NAME`: exactly 1;
- `R2_ENDPOINT`: exactly 1;
- accepted recipient authority matched: true;
- accepted Production project-ref authority matched: true;
- `PRODUCTION_BACKUP_AUTOMATION_ENABLED`: ABSENT.

Canonical GitHub Production environment-secret API evidence:

- `BACKUP_HEARTBEAT_URL`: exactly 1;
- `DATABASE_SSL_CA`: exactly 1;
- `MIGRATION_DATABASE_URL`: exactly 1;
- `R2_ACCESS_KEY_ID`: exactly 1;
- `R2_SECRET_ACCESS_KEY`: exactly 1;
- heartbeat metadata present: true;
- secret values retrieved: false.

The GitHub CLI `gh secret list --env Production` view returned zero
`BACKUP_HEARTBEAT_URL` matches even though the canonical environment-secret API
returned exactly one.

That CLI listing discrepancy is classified as a false-negative provider view,
not provider drift.

No provider mutation has yet occurred.

There has still been no duplicate enablement.

Production RTO remains accepted at:

`997.767` seconds

Production RPO remains:

`NOT ACCEPTED`

## Stage 5 Production RPO recurring-backup automation enablement milestone

Event:

`production_rpo_recurring_backup_automation_canonical_api_enablement`

Result:

`PASS`

Classification:

`PRODUCTION_RPO_RECURRING_BACKUP_AUTOMATION_ENABLED_PENDING_NATURAL_SCHEDULED_CADENCE_PROOF`

Provider mutation history:

- false-negative precheck provider mutation attempts: 0;
- actual provider mutation attempts: 1;
- actual provider mutation accepted: true.

Authorized Production environment mutation:

`PRODUCTION_BACKUP_AUTOMATION_ENABLED=true`

Activation evidence:

- variable exists exactly once: true;
- activation value exact lowercase `true`: true;
- activation timestamp:
  `2026-09-28T03:41:22Z`.

The enablement checkpoint preserved:

- all required Production public variables;
- all required Production environment-secret metadata;
- accepted Production age recipient authority;
- accepted Production project-ref authority;
- hosted Backup Production workflow active state.

The enablement checkpoint did NOT:

- manually dispatch a Production backup;
- execute a Production backup locally;
- retrieve secret values;
- access Production R2 directly;
- access Production database directly;
- retrieve a recovery object;
- run a restore;
- mutate PROJECT-STATE.

Recurring Production backup automation is:

`ENABLED`

Committed frequent schedule:

`23 1,5,9,13,17,21 * * *`

Frequent cadence:

`4 hours`

Production RPO target:

`6 hours`

Nominal first frequent slot after activation:

`2026-09-28T05:23:00Z`

Production RTO remains accepted at:

`997.767` seconds

Production RPO remains:

`NOT ACCEPTED`

Reason:

`NATURAL_SCHEDULED_OPERATING_CADENCE_NOT_YET_PROVEN`

A previous PROJECT-STATE synchronization attempt failed before mutation because
Windows PowerShell 5.1 treated the `gh run list --json` result as one nested
array object and concatenated the individual run properties.

That harness failure did not change provider state or PROJECT-STATE.

Canonical GitHub workflow-runs API inspection is now required for scheduled-run
evidence.

## Stage 5 first natural scheduled Production recovery-point milestone

Event:

`production_rpo_natural_scheduled_backup_observation`

Result:

`PASS`

Classification:

`FIRST_NATURAL_SCHEDULED_PRODUCTION_BACKUP_VERIFIED_RPO_CADENCE_NOT_YET_ACCEPTED`

The first accepted naturally scheduled Production backup after recurring
automation enablement completed successfully.

Workflow evidence:

- GitHub Actions run ID:
  `36389763387`;
- run attempt:
  `1`;
- event:
  `schedule`;
- created at:
  `2026-09-28T07:05:26Z`;
- repository SHA:
  `1db366dae0c6328bb00ec639c3d5d11de9cc6de6`;
- run status:
  `completed`;
- run conclusion:
  `success`;
- Production recovery-point job ID:
  `108822811715`;
- Production recovery-point job conclusion:
  `success`;
- `Create, upload, read back, and verify recovery point`:
  `success`;
- `Verify temporary recovery cleanup`:
  `success`.

Exactly one structured runtime event was observed:

`production_backup_verified`

Accepted natural recovery-point identity:

- backup ID:
  `20260928T070603Z-1db366dae0c6-3aa30e2d340ada56`;
- retention class:
  `frequent`;
- object key:
  `frequent/2026/09/28/20260928T070603Z-1db366dae0c6-3aa30e2d340ada56.age`;
- encrypted bytes:
  `34729`;
- ciphertext SHA-256:
  `b23b72e178105de7a1c58dfca61fdc39107ec21bcf551c73c375b421724cea05`;
- runtime classification:
  `PRODUCTION_BACKUP_RECOVERY_POINT_VERIFIED`.

Repository-owned recovery-point verification:

`PROVEN`

Repository-owned success-heartbeat path:

`PROVEN`

Recurring Production backup automation remained enabled.

No manual Production backup run existed after automation activation.

This observation performed no:

- provider configuration mutation;
- workflow dispatch;
- direct Production database access;
- direct Production R2 access;
- secret-value retrieval;
- recovery-object retrieval;
- restore execution.

Production RTO remains accepted at:

`997.767` seconds

Production RPO remains:

`NOT ACCEPTED`

Reason:

`FIRST_NATURAL_SCHEDULED_POINT_VERIFIED_FULL_OPERATING_CADENCE_NOT_YET_ACCEPTED`

This first natural recovery point proves that recurring scheduled operation can
create and verify a Production recovery point through the repository-owned
monitoring path.

It does NOT by itself define or satisfy the full operating-cadence acceptance
standard.

## Stage 5 Production RPO cadence-gap remediation review milestone

Event:

`production_rpo_cadence_gap_remediation_review`

Result:

`PASS`

Classification:

`PRODUCTION_RPO_REMEDIATION_REVIEW_CONFIRMS_TRIGGER_REDUNDANCY_OR_FREQUENCY_HARDENING_REQUIRED`

Failure boundary:

`HOSTED_SCHEDULE_TRIGGER_GAP_BEFORE_WORKFLOW_RUN_CREATION`

The Production RPO failure is now classified as a recurring-schedule trigger
gap, not a backup-execution failure.

Provider/repository state during diagnosis:

- default branch:
  `main`;
- repository archived:
  false;
- repository disabled:
  false;
- GitHub Actions enabled:
  true;
- GitHub Actions allowed actions:
  `all`;
- hosted Backup Production workflow:
  `active`;
- hosted workflow path:
  `.github/workflows/backup-production.yml`;
- hosted workflow blob matched accepted repository SHA:
  true;
- recurring Production backup automation:
  ENABLED.

Confirmed missing frequent schedule window:

- expected slot:
  `2026-09-28T09:23:00Z`;
- window end:
  `2026-09-28T13:23:00Z`;
- Backup Production workflow runs inside window:
  `0`;
- all repository Actions runs inside window:
  `0`.

The first accepted natural scheduled run remains preserved:

`36389763387`

Current recurring design:

- GitHub-native frequent cadence:
  `4 hours`;
- Production RPO:
  `6 hours`;
- monitoring window:
  `5 hours`;
- independent automatic trigger:
  NONE;
- manual workflow-dispatch capability:
  PRESENT;
- recurring cadence depends on one GitHub scheduler fault domain:
  YES.

Resilience result:

- one missed 4-hour trigger can create an 8-hour recovery-point gap;
- 8 hours exceeds the 6-hour Production RPO;
- 8 hours exceeds the 5-hour monitoring window;
- current 4-hour GitHub-only cadence does NOT tolerate one missed trigger.

Maximum cadence that could tolerate one missed trigger:

- for 6-hour RPO:
  `3 hours`;
- for 5-hour monitoring window:
  `2.5 hours`;
- to satisfy both:
  `2.5 hours`.

Practical whole-hour candidate:

`2 hours`

At a 2-hour cadence:

- one missed trigger produces a 4-hour interval;
- 4 hours remains inside the 6-hour Production RPO;
- 4 hours remains inside the 5-hour monitoring window.

Candidate remediation A:

`SHORTEN_GITHUB_NATIVE_FREQUENT_CADENCE`

Example:

`2 hours`

Advantages:

- preserves the existing backup provider and workflow architecture;
- substantially simpler than adding another scheduler;
- mathematically tolerates one missed trigger against both current targets.

Trade-off:

- more Production backup executions;
- more recovery objects;
- still relies on GitHub scheduled-event delivery as the scheduler fault domain.

Candidate remediation B:

`ADD_INDEPENDENT_AUTOMATIC_TRIGGER_PATH`

Example:

an external scheduler invokes a separately authenticated repository-owned
trigger.

Advantages:

- preserves the nominal 4-hour cadence;
- adds an independent scheduler fault domain.

Trade-offs:

- higher operational complexity;
- additional authenticated integration;
- requires separate security and architecture review.

Candidate remediation C:

`KEEP_CURRENT_FOUR_HOUR_GITHUB_SCHEDULE_ONLY`

Status:

`NOT ACCEPTABLE FOR PRODUCTION RPO ACCEPTANCE`

Reason:

the current design has already demonstrated that one missed trigger can violate
both the declared Production RPO and monitoring window.

No remediation was implemented by this review.

This review performed no:

- provider mutation;
- workflow dispatch;
- direct Production R2 access;
- direct Production database access;
- secret-value retrieval;
- PROJECT-STATE mutation.

Production RTO remains accepted at:

`997.767` seconds

Production RPO remains:

`NOT ACCEPTED`

Production customer onboarding remains blocked.

## Stage 5 Production RPO cadence-remediation decision milestone

Event:

`production_rpo_cadence_remediation_corrected_decision_review`

Result:

`PASS`

Classification:

`PRODUCTION_RPO_REMEDIATION_DECISION_SELECT_TWO_HOUR_GITHUB_NATIVE_CADENCE_WITH_EXISTING_FIVE_HOUR_MONITOR_THRESHOLD`

The earlier decision-review failure was a local Markdown-literal assertion false
negative and did not change repository or provider state.

Selected remediation:

`SHORTEN_GITHUB_NATIVE_FREQUENT_CADENCE_TO_TWO_HOURS`

Selected frequent cadence:

`2 hours`

Candidate frequent cron:

`23 1,3,5,7,9,11,13,15,17,19,21,23 * * *`

Weekly schedule:

`UNCHANGED`

Selected monitoring strategy:

`KEEP_EXISTING_FOUR_HOUR_EXPECTATION_PLUS_ONE_HOUR_GRACE`

Cronitor provider mutation required:

`NO`

Existing monitor contract remains:

- expected verified recovery point:
  every `4 hours`;
- grace:
  `1 hour`;
- effective monitoring failure window:
  `5 hours`.

Why this option was selected:

- preserves the sole repository-owned Production backup workflow;
- preserves the existing fail-closed GitHub Production environment boundary;
- requires no new external scheduler;
- requires no new external authentication credential or secret surface;
- keeps the current database snapshot, encryption, R2 custody, readback,
  verification, cleanup, and heartbeat implementation;
- creates two nominal backup opportunities inside each four-hour monitoring
  expectation;
- one missed two-hour trigger produces a nominal four-hour interval;
- four hours remains inside the six-hour Production RPO;
- four hours remains inside the existing five-hour monitoring window;
- has lower implementation, security, operational, and recurring integration
  complexity than a second scheduler.

Capacity implication under the existing eight-day `frequent/` retention:

- previous nominal frequent runs/day:
  `6`;
- selected nominal frequent runs/day:
  `12`;
- execution-frequency multiplier:
  `2`;
- previous approximate retained frequent objects:
  `48`;
- selected approximate retained frequent objects:
  `96`.

No absolute provider/storage cost was derived by the decision review.

Independent scheduler status:

`RESERVED AS ESCALATION`

An independent trigger is not selected now because it would add:

- another scheduler provider;
- another authenticated credential/integration;
- another security boundary;
- additional architecture and operating complexity.

If hardened two-hour GitHub-native scheduling still demonstrates unacceptable
trigger gaps, the independent-trigger architecture must be reconsidered.

Rejected option:

`KEEP_CURRENT_FOUR_HOUR_GITHUB_SCHEDULE_ONLY`

Reason:

`ONE_MISSED_TRIGGER_CAN_CREATE_EIGHT_HOUR_RECOVERY_POINT_GAP`

ADR requirement:

`YES`

Repository ADR discovery found:

`docs/adr/ADR-020-production-age-identity-custody-and-recovery-point-supersession.md`

as the existing recovery-related ADR candidate.

The repository must determine whether ADR-020's scope legitimately covers this
cadence-hardening decision. It must be amended only if the scope matches;
otherwise a new recovery-cadence ADR must be created using repository ADR
conventions.

Expected later implementation scope:

- `.github/workflows/backup-production.yml`;
- `docs/architecture/production-backup-and-recovery.md`;
- the appropriate recovery ADR;
- `docs/PROJECT-STATE.md` only through separately authorized synchronization.

Post-implementation RPO evidence requirements include:

1. frequent cron exactly:
   `23 1,3,5,7,9,11,13,15,17,19,21,23 * * *`;
2. weekly Sunday schedule unchanged;
3. fail-closed `PRODUCTION_BACKUP_AUTOMATION_ENABLED` behavior unchanged;
4. GitHub Production environment values/secrets unchanged;
5. Cronitor monitoring remains 4 hours plus 1 hour grace;
6. architecture documentation distinguishes two-hour attempt cadence from the
   five-hour monitoring threshold;
7. ADR records the trigger-gap evidence, alternatives, selected option,
   trade-offs, evidence requirements, escalation path, and rollback;
8. implementation SHA passes repository CI and becomes hosted default-branch
   workflow authority;
9. recurring automation remains exact lowercase `true`;
10. no manual `workflow_dispatch` execution is used as cadence proof;
11. at least two post-change naturally scheduled verified recovery points are
    observed, solely because two points are the mathematical minimum needed to
    measure one real interval;
12. every accepted point emits exactly one `production_backup_verified` event
    classified `PRODUCTION_BACKUP_RECOVERY_POINT_VERIFIED`;
13. observed recovery-point interval is at most six hours;
14. observed success-heartbeat interval is at most five hours;
15. latest recovery point remains fresh inside six hours at final review;
16. no failed natural Production backup run exists in the acceptance interval.

No remediation was implemented by this decision review.

The decision review performed no:

- provider mutation;
- workflow edit;
- architecture-document edit;
- ADR edit;
- workflow dispatch;
- direct Production R2 access;
- direct Production database access;
- secret-value retrieval.

Production RTO remains accepted at:

`997.767` seconds

Production RPO remains:

`NOT ACCEPTED`

Production customer onboarding remains blocked.

## Stage 5 Production RPO two-hour cadence implementation-preparation milestone

Event:

`production_rpo_two_hour_cadence_implementation_preparation_review`

Result:

`PASS`

Classification:

`PRODUCTION_RPO_TWO_HOUR_CADENCE_IMPLEMENTATION_PLAN_READY_NO_MUTATION`

ADR scope review:

ADR-020 remains specifically scoped to:

`Production Age Identity Custody and Recovery-Point Supersession`

ADR-020 does NOT explicitly cover Production backup cadence hardening.

Therefore the cadence decision must NOT be folded into ADR-020.

Selected ADR disposition:

`CREATE_SEPARATE_CADENCE_ADR`

Selected ADR:

`docs/adr/ADR-021-production-backup-cadence-hardening.md`

Highest existing ADR number before implementation:

`020`

Exact Production workflow edit:

replace exactly one:

`cron: '23 1,5,9,13,17,21 * * *'`

with exactly one:

`cron: '23 1,3,5,7,9,11,13,15,17,19,21,23 * * *'`

The weekly schedule remains exactly:

`cron: '47 2 * * 0'`

The implementation must leave unchanged:

- `workflow_dispatch`;
- `PRODUCTION_BACKUP_AUTOMATION_ENABLED`;
- `needs.gate.outputs.should-run == 'true'`;
- Production environment;
- workflow permissions;
- non-cancelling Production backup concurrency;
- bounded backup timeout;
- backup implementation steps.

Architecture-document change:

replace:

`- frequent recovery attempts at minute 23 every four hours;`

with:

`- frequent recovery attempts at minute 23 every two hours;`

The existing Cronitor contract remains authoritative and unchanged:

- one verified recovery point every 4 hours;
- 1 hour grace;
- 5-hour effective monitoring window.

The architecture document must explicitly clarify that:

- 2 hours is the backup-attempt cadence;
- 4 hours plus 1 hour grace remains the monitoring/freshness threshold.

The architecture document must reference ADR-021 as the decision authority for
Production backup cadence hardening.

Existing workflow-contract test surface:

`apps/web/__tests__/recovery/backup-production.test.ts`

Test disposition:

`EXTEND_EXISTING_RELEVANT_TEST_SURFACE`

The test must protect at least:

1. frequent cron exactly
   `23 1,3,5,7,9,11,13,15,17,19,21,23 * * *`;
2. weekly cron exactly
   `47 2 * * 0`;
3. each cron occurs exactly once;
4. `PRODUCTION_BACKUP_AUTOMATION_ENABLED` remains present;
5. the backup job remains gated by
   `needs.gate.outputs.should-run == 'true'`;
6. `workflow_dispatch` remains present;
7. `repository_dispatch` remains absent unless separately authorized;
8. Production environment remains unchanged;
9. Production backup concurrency remains non-cancelling;
10. backup timeout remains bounded.

No changes are required to:

- Production GitHub environment variables;
- Production GitHub secrets;
- Cronitor provider configuration;
- R2 bucket configuration;
- frequent eight-day retention;
- weekly retention;
- Production database configuration;
- snapshot algorithm;
- age encryption contract;
- Production age recipient;
- `madrasio-recovery-v1`;
- restore algorithm;
- heartbeat implementation.

Rollback boundary:

If the local implementation fails before commit, only the authorized
implementation files may be restored to their exact pre-change bytes.

No backup dispatch is authorized as compensation for implementation failure.

Restoring the previous four-hour cron would restore only a known prior
operational configuration. It would NOT restore Production RPO acceptance.

Production RPO remains:

`NOT ACCEPTED`

Production customer onboarding remains blocked.

No implementation occurred during this preparation review.

## Stage 5 Production RPO two-hour cadence local implementation milestone

Event:

`production_rpo_two_hour_cadence_corrected_local_remediation_implementation`

Result:

`PASS`

Classification:

`PRODUCTION_RPO_TWO_HOUR_CADENCE_LOCAL_REMEDIATION_IMPLEMENTED_AND_VERIFIED_PENDING_STATE_SYNC_PRECOMMIT_REVIEW`

The corrected two-hour Production backup cadence remediation is implemented and
verified locally.

Production frequent backup-attempt cadence changed from:

`23 1,5,9,13,17,21 * * *`

to:

`23 1,3,5,7,9,11,13,15,17,19,21,23 * * *`

Selected cadence:

`2 hours`

Weekly schedule remains unchanged:

`47 2 * * 0`

ADR created locally:

`docs/adr/ADR-021-production-backup-cadence-hardening.md`

ADR-021 is intentionally NEW and UNTRACKED before the remediation commit.

ADR-020 remains unchanged.

Recovery architecture now distinguishes:

- backup-attempt cadence:
  2 hours;
- Cronitor expected recovery-point interval:
  4 hours;
- Cronitor grace:
  1 hour;
- effective monitoring/freshness failure window:
  5 hours.

Cronitor provider configuration was NOT changed.

Existing Production backup workflow-contract test was extended.

Local verification passed:

- focused workflow contract:
  27/27;
- recovery regression:
  169 passed / 8 intentionally skipped;
- web TypeScript:
  PASS;
- git diff check:
  PASS.

Authorized implementation files:

1. `.github/workflows/backup-production.yml`;
2. `docs/architecture/production-backup-and-recovery.md`;
3. `docs/adr/README.md`;
4. `docs/adr/ADR-021-production-backup-cadence-hardening.md`;
5. `apps/web/__tests__/recovery/backup-production.test.ts`.

This PROJECT-STATE synchronization is the sixth reviewed local file.

No commit has been created.

No push has occurred.

No Production provider or Cronitor mutation occurred.

No Production backup was manually dispatched.

Accepted Production RTO remains:

`997.767` seconds

Production RPO remains:

`NOT ACCEPTED`

Natural post-change Production schedule evidence is still required after the
remediation commit is pushed and exact-SHA hosted verification passes.

Production customer onboarding remains blocked.

## Stage 5 Production RPO two-hour cadence exact-SHA hosted verification milestone

Remediation commit:

`037a2b646f71753f65d865b5e4249bd3d2939396`

Exact-SHA repository CI:

`PASS`

GitHub CI run:

`36463939619`

The hosted Production backup workflow at the remediation SHA was independently
verified.

Hosted frequent backup-attempt cron:

`23 1,3,5,7,9,11,13,15,17,19,21,23 * * *`

Hosted weekly cron remains:

`47 2 * * 0`

Protected Production backup contracts remain present:

- manual workflow dispatch support;
- fail-closed `PRODUCTION_BACKUP_AUTOMATION_ENABLED`;
- Production environment;
- non-cancelling `production-backup` concurrency;
- 60-minute bounded timeout.

Recurring Production backup automation remains enabled.

The earlier broad exact-SHA verification classified the remediation as failed
because it treated every push-triggered workflow for the commit as repository CI.

That classification was overinclusive.

`Deploy STAGING` is a separate deployment workflow and is not repository CI for
the Production backup cadence remediation.

Deploy STAGING run:

`36463939651`

reported failure at:

`Trigger STAGING Deploy Hook`

The cadence-remediation commit did not modify the STAGING deployment workflow or
deployment transport implementation.

The previously accepted Deploy Hook transport fix remains in repository history.

Provider-visible evidence proved:

- exact tested SHA promotion to `staging-release` succeeded;
- `staging-release` equals
  `037a2b646f71753f65d865b5e4249bd3d2939396`;
- the stable STAGING deployment health endpoint reports `status=ok`;
- the stable STAGING deployment health endpoint reports exact commit SHA
  `037a2b646f71753f65d865b5e4249bd3d2939396`.

Therefore the STAGING incident is classified:

`DEPLOY_STAGING_HOOK_REPORTED_FAILURE_BUT_EXACT_SHA_IS_LIVE_NO_RETRY`

No manual Deploy Hook retry is authorized or required.

This proves a hook-confirmation false-negative/ambiguity at the workflow
boundary. It does not independently prove a specific lower-level network or
timing mechanism.

Accepted Production RTO remains:

`997.767` seconds

Production RPO remains:

`NOT ACCEPTED`

The repository/CI/hosted-workflow side of the two-hour cadence remediation is
accepted.

Production RPO still requires natural operating evidence from the new schedule.

No manual Production backup dispatch may substitute for natural schedule
evidence.

No provider mutation, Cronitor mutation, direct R2 access, direct Production
database access, recovery retrieval, or restore was performed by this
verification.

Production customer onboarding remains blocked.

## Stage 5 Production RPO independent scheduler ADR-022 and implementation-preparation milestone

Event:

`production_rpo_independent_scheduler_adr_022_and_implementation_preparation`

Result:

`PASS`

Classification:

`PRODUCTION_RPO_INDEPENDENT_SCHEDULER_ADR_ACCEPTED_IMPLEMENTATION_PLAN_PREPARED_NO_RUNTIME_OR_PROVIDER_MUTATION`

Accepted Production RTO:

`997.767` seconds

Production RPO remains:

`NOT ACCEPTED`

GitHub-only two-hour scheduling has failed the required operating-cadence proof.

Observed evidence:

- 3 successful natural Production backups;
- 0 failed natural Production backups;
- 9 fully elapsed nominal two-hour windows;
- 7 empty workflow-run creation windows;
- maximum run-creation gap:
  `7.177 hours`;
- maximum recovery-point gap:
  `7.174 hours`;
- maximum heartbeat-evidence gap:
  `7.171 hours`.

Accepted scheduler-resilience decision:

`ADD_INDEPENDENT_AUTOMATIC_SCHEDULER_TRIGGER_WHILE_RETAINING_GITHUB_TWO_HOUR_SCHEDULE`

Selected independent scheduler:

`CLOUDFLARE_WORKERS_CRON`

Provider:

`Cloudflare Workers Cron`

Cloudflare cadence:

`23 0,2,4,6,8,10,12,14,16,18,20,22 * * *`

Existing GitHub cadence:

`23 1,3,5,7,9,11,13,15,17,19,21,23 * * *`

Combined nominal opportunity spacing:

`1 hour`

Selected authentication:

`GITHUB_APP_INSTALLATION_TOKEN`

Selected dispatch mechanism:

`GITHUB_ACTIONS_WORKFLOW_DISPATCH`

GitHub App scope:

- Madrasio repository only;
- Actions:
  `write`;
- Contents:
  none;
- Administration:
  none;
- long-lived PAT:
  prohibited.

ADR created locally:

`docs/adr/ADR-022-production-backup-independent-scheduler.md`

No runtime implementation has occurred.

No Cloudflare Worker or Cron Trigger has been created.

No GitHub App or credential has been created.

No provider configuration has been mutated.

No Production backup dispatch was issued.

No Cronitor configuration changed.

Production customer onboarding remains blocked.

## Stage 5 Production RPO independent scheduler local implementation milestone

Event:

`production_rpo_independent_scheduler_local_repository_implementation`

Result:

`PASS`

Classification:

`PRODUCTION_RPO_INDEPENDENT_SCHEDULER_LOCAL_IMPLEMENTATION_VERIFIED_NO_PROVIDER_MUTATION`

Implementation baseline: `main` at
`2efc185fd749ffaa811413e124f0234fcda6ebc8`. The candidate remains uncommitted.

Accepted Production RTO remains `997.767` seconds. Production RPO remains
`NOT ACCEPTED`. Production customer onboarding remains `BLOCKED` under
`PRODUCTION_CUSTOMER_DATA_ONBOARDING_BLOCKED_BY_BACKUP`.

Accepted ADR-022 architecture implemented locally:

- GitHub native frequent cadence: `23 1,3,5,7,9,11,13,15,17,19,21,23 * * *`;
- Cloudflare independent cadence: `23 0,2,4,6,8,10,12,14,16,18,20,22 * * *`;
- weekly GitHub cadence: `47 2 * * 0`;
- combined nominal automatic opportunity spacing: `1 hour`;
- authentication: `GITHUB_APP_INSTALLATION_TOKEN`;
- provider: `CLOUDFLARE_WORKERS_CRON`;
- dispatch mechanism: `GITHUB_ACTIONS_WORKFLOW_DISPATCH`;
- external trigger source: `cloudflare-cron-v1`.

Exact eight implementation files:

1. `.github/workflows/backup-production.yml`;
2. `apps/web/scripts/recovery/run-production-backup.ts`;
3. `apps/web/__tests__/recovery/backup-production.test.ts`;
4. `apps/web/__tests__/recovery/production-backup-scheduler.test.ts`;
5. `infra/cloudflare/production-backup-scheduler/worker.ts`;
6. `infra/cloudflare/production-backup-scheduler/wrangler.jsonc`;
7. `infra/cloudflare/production-backup-scheduler/README.md`;
8. `docs/architecture/production-backup-and-recovery.md`.

Accepted local implementation verification:

- focused Production backup/scheduler tests: 64 passed;
- complete recovery regression: 206 passed / 8 opt-in skipped;
- web TypeScript: PASS;
- `git diff --check`: PASS.

Verified implementation properties:

- GitHub two-hour schedule preserved;
- weekly schedule preserved;
- Cloudflare automatic path uses the existing Production automation kill switch;
- intentional manual `workflow_dispatch` semantics preserved;
- external Cloudflare path is frequent-only;
- scheduled UTC metadata validated;
- safe `production_backup_verified` attribution includes allowlisted
  `triggerSource` and `scheduledForUtc`;
- Worker uses repository-scoped GitHub App authentication with Actions write;
- Worker has no public fetch handler;
- Worker calls `controller.noRetry()`;
- maximum one workflow dispatch attempt per scheduled invocation;
- immediate blind retry prohibited, including ambiguous dispatch acceptance;
- dispatch acceptance is not backup/recovery success;
- Cloudflare Cron not activated;
- no real provider credential created or stored.

Safety boundary of this local milestone:

- no GitHub App created;
- no GitHub App credential created or real installation token minted;
- no Cloudflare Worker deployed;
- no Cloudflare Cron Trigger created;
- no workflow dispatch issued;
- no GitHub provider secrets/variables changed;
- no Cronitor mutation;
- no Production R2 access;
- no Production database access;
- no Production age identity access;
- no commit;
- no push.

Dependencies, lockfile and migrations are unchanged. The implementation preserved
PROJECT-STATE, the ADR index, ADR-022 and ADR-021. This subsequent gate authorizes
only PROJECT-STATE synchronization; all other candidate files remain protected.

This milestone DOES NOT mean Production RPO acceptance. Natural automatic
evidence is still required under ADR-022. Provider setup is not yet authorized.
The immediate gate is local pre-commit acceptance of the exact 11-file candidate,
with no staging, commit or push during this gate.

Subsequent PROJECT-STATE synchronization/pre-commit verification (2026-09-30):

- focused tests: 64 passed;
- recovery regression: 206 passed / 8 opt-in skipped;
- web TypeScript and canonical `pnpm lint`: PASS;
- `git diff --check` and untracked-file whitespace checks: PASS;
- no dedicated pre-commit script or active hook was found;
- exact 11-file working-tree surface retained; nothing staged;
- all 96 prior H2 headings retained in order; exactly one milestone H2 added;
- `## Current Stage` remains unique;
- historical milestone sections remain unchanged;
- all other 10 candidate files and protected ADR-021 retain their pre-gate hashes;
- dependencies, lockfiles and migrations remain unchanged;
- static credential/dispatch/activation checks: PASS;
- no provider or Production operation, commit or push occurred.

Local pre-commit acceptance: PASS. Next gate, requiring separate authorization:
`PRODUCTION_RPO_INDEPENDENT_SCHEDULER_IMPLEMENTATION_COMMIT_AND_PUSH_ONLY`.

## Exact next step

Current handoff: complete local pre-commit acceptance of the exact 11-file
candidate. If all checks pass, request the separately authorized gate
`PRODUCTION_RPO_INDEPENDENT_SCHEDULER_IMPLEMENTATION_COMMIT_AND_PUSH_ONLY`.
Provider setup remains unauthorized. The prior implementation-only plan below
is retained as historical authorization, not a request to repeat implementation.

Task 050 - perform one bounded LOCAL repository implementation of the accepted
independent Production backup scheduler contract.

Authorization marker:

`PRODUCTION_RPO_INDEPENDENT_SCHEDULER_LOCAL_REPOSITORY_IMPLEMENTATION_ONLY`

This authorization is LOCAL repository implementation only.

It must NOT:

- create/deploy a Cloudflare Worker;
- create/enable a Cloudflare Cron Trigger;
- create a GitHub App;
- create/reveal/rotate/store a real GitHub App private key;
- mint a real GitHub installation token;
- mutate Production GitHub variables or secrets;
- mutate Cronitor;
- manually dispatch a Production backup;
- access Production R2 directly;
- access Production DB directly;
- retrieve or restore a Production recovery object;
- commit;
- push;
- mutate `docs/PROJECT-STATE.md`;
- mutate ADR-022 or its index entry.

Authorized implementation surface:

1. `.github/workflows/backup-production.yml`;
2. `apps/web/scripts/recovery/run-production-backup.ts`;
3. `apps/web/__tests__/recovery/backup-production.test.ts`;
4. `apps/web/__tests__/recovery/production-backup-scheduler.test.ts`;
5. `infra/cloudflare/production-backup-scheduler/worker.ts`;
6. `infra/cloudflare/production-backup-scheduler/wrangler.jsonc`;
7. `infra/cloudflare/production-backup-scheduler/README.md`;
8. `docs/architecture/production-backup-and-recovery.md`.

The workflow implementation must add safe inputs:

- `trigger_source`;
- `scheduled_for_utc`.

Cloudflare-originated automatic dispatch must:

- use source:
  `cloudflare-cron-v1`;
- use retention:
  `frequent`;
- use exact confirmation:
  `BACKUP_PRODUCTION`;
- use a pinned exact candidate SHA;
- fail closed behind:
  `PRODUCTION_BACKUP_AUTOMATION_ENABLED=true`;
- never be treated as manual cadence evidence.

Manual operator semantics must remain preserved.

GitHub schedule execution must remain represented safely as:

`github-schedule`

The Worker must:

- expose scheduled execution only;
- sign a GitHub App JWT with Web Crypto;
- mint a short-lived installation token;
- issue at most one workflow-dispatch request per invocation;
- disable automatic retry;
- never log/persist the App private key or installation token;
- treat GitHub dispatch acceptance as dispatch acceptance only;
- contain no Production DB/R2/age/restore/Cronitor credentials.

Secret:

`GITHUB_APP_PRIVATE_KEY`

Non-secret variables:

- `GITHUB_APP_ID`;
- `GITHUB_INSTALLATION_ID`;
- `GITHUB_OWNER`;
- `GITHUB_REPOSITORY`;
- `GITHUB_WORKFLOW`;
- `BACKUP_CANDIDATE_SHA`.

Repository configuration must describe cadence:

`23 0,2,4,6,8,10,12,14,16,18,20,22 * * *`

No provider activation is authorized.

Tests must cover workflow gate/source behavior, scheduled timestamp validation,
manual preservation, external frequent-only behavior, GitHub App JWT/token
contracts, exact dispatch payload, one dispatch attempt, no blind retry, no
public Worker fetch trigger, and secret-safe output/errors.

Architecture documentation must reference ADR-022 and distinguish the two
independent automatic scheduler fault domains.

If this eight-file implementation surface proves insufficient, STOP instead of
silently broadening it.

Required local verification:

- focused workflow/scheduler tests;
- relevant full recovery regression;
- web TypeScript validation;
- static secret/logging guards;
- `git diff --check`.

A separate PROJECT-STATE synchronization/pre-commit review is required after
successful local implementation.

Production RPO remains NOT ACCEPTED.

Production customer onboarding remains blocked.

## Important operations that must NOT be repeated

- DO NOT rerun the real Stage 6 restore. It already succeeded.
- DO NOT recreate the Stage 6 STAGING fixture.
- DO NOT create new Stage 6 STAGING recovery users or rows.
- DO NOT perform another Stage 6 hosted cleanup.
- DO NOT recreate the deleted encrypted Stage 6 bundle.
- DO NOT recreate or recover the deleted ephemeral Stage 6 age identity.
- DO NOT recreate the temporary Stage 6 manual/cleanup scripts.
- DO NOT trigger the already-completed a1e3945 STAGING deployment again.
- DO NOT manually invoke the Vercel Deploy Hook.
- DO NOT weaken recovery target isolation, source verification, encryption,
  tenancy, security, or fail-closed checks to complete Task 050.
- DO NOT onboard Production customer data until the Production backup/recovery
  gate is explicitly satisfied.

## Workflow rule

`docs/PROJECT-STATE.md` is the canonical cross-conversation handoff.

After every meaningful milestone, review and synchronize this document before
moving to another meaningful implementation step.

Meaningful milestones include:

- implementation completion
- bug fixes
- Task/Stage checkpoints
- verification/test cycles
- architectural or operational decisions
- commits
- blocker changes
- exact-next-step changes

Before ending a major work session or moving to another Task/Stage, verify that
this file reflects the real repository state.
