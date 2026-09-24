# Madrasio — Current Project State

Last updated: 2026-09-23

## Current Task

Task 050 — Production Backup & Recovery

## Current Stage

Stage 5 — repository-owned Production restore-readiness implementation and
repository verification are COMPLETE locally.

Repository verification evidence:

- focused Production ciphertext retrieval tests: PASS, 5/5;
- bounded test-fixture typing correction: PASS;
- repository typecheck: PASS across all participating workspaces;
- broader recovery suite: PASS;
- recovery test files: 7 passed, 3 skipped;
- recovery tests: 152 passed, 8 skipped;
- final `git diff --check`: PASS;
- final retrieval implementation/static contract review: PASS;
- package wiring review: PASS;
- recovery architecture reconciliation review: PASS;
- repository mutation from verification: NONE.

The two repository-owned Stage 5 readiness blockers are now RESOLVED:

- `STAGE5_R2_RETRIEVAL_ORCHESTRATION_NOT_YET_DEFINED` — RESOLVED;
- `STAGE5_RECOVERY_DOCUMENTATION_RECONCILIATION_REQUIRED` — RESOLVED.

The implemented Production ciphertext retrieval path:

- reuses the existing signed R2 object-store transport;
- requires an explicit accepted object key;
- requires exact expected ciphertext bytes;
- requires exact expected ciphertext SHA-256;
- verifies remote metadata before download;
- downloads only into a generated recovery workspace;
- independently verifies downloaded ciphertext bytes and SHA-256;
- fails closed on identity or ciphertext mismatch;
- cleans the generated workspace on retrieval failure;
- provides bounded explicit cleanup after successful retrieval;
- keeps provider credentials environment-only.

Only the following Stage 5 operational prerequisites remain unresolved:

- `STAGE5_EXTERNAL_AGE_IDENTITY_PATH_NOT_CONFIGURED`
- `STAGE5_PINNED_POSTGRES_IMAGE_NOT_LOCALLY_AVAILABLE`

No real Production recovery object has been retrieved during Stage 5.

The timed Production restore has NOT started.

The six-hour Production RPO cadence remains unproven because recurring
Production backup automation is intentionally disabled.

The Production RTO target remains unproven until the timed Stage 5
Production-to-isolated-local restore completes.

Production customer onboarding remains blocked.
Current closeout work:
1. preserve all accepted Stage 4.2 Production recovery-point evidence;
2. preserve all accepted Stage 5 repository implementation and verification evidence;
3. create one substantive implementation/documentation commit containing the six
   currently changed files;
4. do not create a state-only commit;
5. after the substantive commit, verify the resulting repository SHA and clean
   working tree;
6. then resolve the remaining operational prerequisites:
   - exact pinned PostgreSQL 17.6 image availability;
   - external Production age identity configuration and recipient validation;
7. rerun the Stage 5 readiness gate before any real Production recovery-object
   retrieval;
8. start the timed Production restore boundary before the first real retrieval,
   workspace, or recovery-target action;
9. keep Production customer onboarding blocked.
## Current branch

main

## Latest relevant commit

b6b10389312842954779f9fe721ce586b18d4259

Commit:

`fix: harden Windows recovery pnpm launcher`

Repository verification:

- local `HEAD`: b6b10389312842954779f9fe721ce586b18d4259
- `origin/main`: b6b10389312842954779f9fe721ce586b18d4259

Remote verification:

- CI run 35818717476: completed / success
- Deploy STAGING run 35818717473: completed / success
- workflow head SHA: b6b10389312842954779f9fe721ce586b18d4259
- `staging_exact_sha_ready`: PASS for the same SHA
- `staging_deployment_smoke_passed`: PASS for the same SHA
- live STAGING smoke checks: 11

No additional launcher deployment or provider inspection is required.
Previous documentation migration commit:

a1e394530483d9f1c33fc6469feaab9469306a18

Commit:

docs: replace Claude project rules with PRD

## Completed work

### Task 050 recovery implementation

Task 050 recovery stage status:

- Stage 1: complete.
- Stage 2: complete.
- Stage 3: complete.
- Stage 4.1: complete — repository implementation and provider infrastructure.
- Stage 4.2: pending — no accepted real Production recovery point exists yet.
- Stage 5: pending — no accepted timed Production-to-isolated-local restore has been completed.
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

`IMPLEMENTED — VERIFICATION PENDING`

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

`PASS — 5/5 TESTS`

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

`FAILED — BOUNDED TEST-TYPING DEFECT`

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

`PASS — REPOSITORY IMPLEMENTATION VERIFIED`

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
## Exact next step

Task 050 Stage 5 — create one substantive repository commit containing the
verified Production-retrieval implementation, tests, package wiring, recovery
architecture reconciliation, and this canonical state update.

The commit must contain exactly the current six-file change surface:

- `apps/web/scripts/recovery/retrieve-production-recovery.ts`
- `apps/web/__tests__/recovery/retrieve-production-recovery.test.ts`
- `apps/web/package.json`
- `package.json`
- `docs/architecture/production-backup-and-recovery.md`
- `docs/PROJECT-STATE.md`

Do not create a documentation-only or state-only commit.

Before committing, verify:

- HEAD is still the accepted pre-implementation SHA;
- the working tree contains exactly those six files;
- `git diff --check` passes.

Do NOT yet:

- access real Production R2;
- download the accepted Production recovery object;
- configure/read the Production age identity;
- pull the PostgreSQL image;
- create a local recovery target;
- start the timed Production restore;
- execute the restore;
- access Production database data;
- emit Cronitor telemetry;
- dispatch/rerun a Production backup;
- enable recurring Production backup automation;
- trigger a deployment;
- rerun Stage 6.

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