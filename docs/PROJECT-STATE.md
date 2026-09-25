# Madrasio — Current Project State

Last updated: 2026-09-23

## Current Task

Task 050 — Production Backup & Recovery

## Current Stage

Stage 5 — the repository-owned Production age identity custody gate at
`670a6c502a7ea1442b238c7404752548c8822e9e` remains accepted by exact-SHA CI
and STAGING, but its original two-plaintext-copy custody policy is now being
superseded by the approved ADR-020 encrypted off-device escrow amendment.

Accepted existing release evidence:

- CI run `36042621930`: completed / success;
- Deploy STAGING run `36042621963`: completed / success;
- both runs use exact SHA
  `670a6c502a7ea1442b238c7404752548c8822e9e`;
- both were automatically triggered by `push`.

Approved replacement custody architecture:

- one plaintext primary Production age identity outside the repository;
- one passphrase-encrypted escrow copy of that same identity;
- encrypted escrow stored in independently controlled off-device storage;
- escrow passphrase kept separately from the ciphertext;
- passphrase operations remain operator-interactive;
- repository automation consumes only non-secret artifact-bound verification
  evidence;
- off-device retrieval/hash verification is required before custody acceptance.

The earlier second-physical-device blocker remains historical evidence of why
the original custody design could not be executed on this workstation. It is no
longer the approved remediation requirement.

The amended escrow implementation is NOT yet complete or accepted.

No replacement Production identity has been generated.

No escrow artifact or passphrase has been created.

No Production public recipient has been changed.

No replacement Production recovery point has been created.

Recurring Production backup automation remains disabled.

The timed Production-to-isolated-local restore has NOT started.

Production RPO and RTO remain unproven.

Production customer onboarding remains blocked.
Current closeout work:
1. preserve the historical accepted Production recovery point unchanged;
2. preserve its historical decryption-readiness classification as BLOCKED;
3. preserve custody-gate release evidence for
   `670a6c502a7ea1442b238c7404752548c8822e9e`;
4. preserve CI run `36042621930` and Deploy STAGING run `36042621963`;
5. keep recurring Production backup automation disabled;
6. implement the approved encrypted off-device escrow architecture;
7. verify the implementation synthetically before any real Production identity,
   passphrase, escrow artifact, cloud upload, or provider mutation;
8. commit the implementation, ADR-020 amendment, PRD, architecture, tests, and
   PROJECT-STATE together as one substantive change;
9. require exact-SHA CI and accepted STAGING verification for that future
   substantive commit;
10. only afterward authorize a separate real Production custody ceremony.
## Current branch

main

## Latest relevant commit

670a6c502a7ea1442b238c7404752548c8822e9e

Commit:

`feat: add production age identity custody gate`

Repository status at remote acceptance:

- local `HEAD`:
  `670a6c502a7ea1442b238c7404752548c8822e9e`;
- `origin/main`:
  `670a6c502a7ea1442b238c7404752548c8822e9e`;
- remote `main`:
  `670a6c502a7ea1442b238c7404752548c8822e9e`;
- substantive commit push: PASS;
- exact remote SHA verification: PASS.

Remote verification:

- CI run `36042621930`: completed / success;
- CI workflow: `CI`;
- CI event: `push`;
- CI exact head SHA:
  `670a6c502a7ea1442b238c7404752548c8822e9e`;
- Deploy STAGING run `36042621963`: completed / success;
- deployment workflow: `Deploy STAGING`;
- deployment event: `push`;
- deployment exact head SHA:
  `670a6c502a7ea1442b238c7404752548c8822e9e`;
- automatic push-trigger evidence: PASS;
- manual workflow dispatch: NOT USED;
- manual deployment trigger: NOT USED.

Historical verification for
`81bf394ccd761e0c5499174e73b04e3f34a74e1c` remains valid for the earlier
Production recovery-retrieval implementation milestone.
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
## Stage 5 pinned PostgreSQL image availability milestone

Result:

`PASS — EXACT PINNED POSTGRESQL 17.6 IMAGE AVAILABLE`

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

`STAGE5_PINNED_POSTGRES_IMAGE_NOT_LOCALLY_AVAILABLE` — RESOLVED

Remaining operational blocker:

`STAGE5_EXTERNAL_AGE_IDENTITY_PATH_NOT_CONFIGURED`
## Stage 5 Production age identity investigation milestone

Result:

`BLOCKED — MATCHING EXTERNAL PRODUCTION AGE IDENTITY NOT CURRENTLY AVAILABLE`

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

`IMPLEMENTED AND SYNTHETICALLY VERIFIED — REAL PRODUCTION CUSTODY NOT YET ESTABLISHED`

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
- PRD §55: Production recovery custody rules added;
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

`PASS — CUSTODY GATE REPOSITORY/RELEASE ACCEPTED; REAL PRODUCTION CUSTODY NOT YET ESTABLISHED`

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

`BLOCKED — SECOND INDEPENDENT STORAGE DEVICE REQUIRED`

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

`APPROVED — HARDWARE-ONLY SECONDARY CUSTODY SUPERSEDED BY ENCRYPTED OFF-DEVICE ESCROW; IMPLEMENTATION NOT YET COMPLETE`

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

`BLOCKED — SECOND INDEPENDENT STORAGE DEVICE REQUIRED`

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

`PASS — ENCRYPTED OFF-DEVICE ESCROW IMPLEMENTATION SYNTHETICALLY VERIFIED LOCALLY; NOT YET COMMITTED OR RELEASE-ACCEPTED`

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
## Exact next step

Task 050 Stage 5 — perform a final pre-commit review of the exact ten-file
encrypted off-device escrow change.

The final review must verify:

1. repository base remains
   `670a6c502a7ea1442b238c7404752548c8822e9e`;
2. the working tree contains exactly the ten approved substantive files;
3. ADR-020, PRD, architecture, implementation, tests, package command, and
   PROJECT-STATE remain mutually consistent;
4. the old two-plaintext-copy implementation contract is absent from active
   source;
5. the earlier second-physical-device blocker remains preserved only as
   historical evidence;
6. no real Production private age identity appears in the change;
7. no Production escrow passphrase transport exists through command arguments,
   environment variables, repository configuration, logs, or chat;
8. `git diff --check` remains PASS;
9. focused escrow tests, broader recovery tests, targeted lint, and typecheck
   evidence remain accepted.

If that final review passes, create one substantive commit containing the entire
ten-file change. Do not create separate documentation, state, or implementation
commits.

After the substantive commit, push it to `main` and require automatic exact-SHA
CI and Deploy STAGING acceptance before any real Production custody ceremony is
authorized.

Do NOT yet:

- generate a real Production age identity;
- create a real Production escrow;
- request or enter a Production escrow passphrase;
- upload an escrow artifact to off-device storage;
- change `BACKUP_AGE_RECIPIENT`;
- dispatch a replacement Production backup;
- enable recurring Production backup automation;
- access Production R2;
- access Production database data;
- create a Production restore target;
- start the timed Production restore;
- emit Cronitor telemetry;
- manually trigger CI or STAGING deployment;
- rerun historical Stage 6.

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