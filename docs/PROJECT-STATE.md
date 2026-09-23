# Madrasio — Current Project State

Last updated: 2026-09-23

## Current Task

Task 050 — Production Backup & Recovery

## Current Stage

Stage 6 acceptance is complete through reconstructed evidence after the original
manual lifecycle was interrupted.

Current closeout work:
1. synchronize Task 050 / recovery documentation;
2. permanently harden the Windows pnpm launcher resolution used by recovery;
3. rerun the relevant recovery verification suite;
4. close Task 050 only after the documentation and launcher follow-up are complete.

## Current branch

main

## Latest relevant commit

5d9dd3e84cbd87cf2afe9f81cf5abfd1b1e7b17d

Commit:

fix: preserve accepted staging deploy hook responses

Remote verification:
- CI #93: PASS
- Deploy STAGING #36: PASS

Previous documentation migration commit:

a1e394530483d9f1c33fc6469feaab9469306a18

Commit:

docs: replace Claude project rules with PRD

## Completed work

### Task 050 recovery implementation

Task 050 Stages 1–5 are complete.

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

## Current recovery engineering follow-up

The real Stage 6 restore exposed a Windows pnpm-launcher portability issue.

Root cause already established:

- recovery tooling intentionally avoids shell-based package-manager execution;
- on Windows, `resolvePnpmInvocation()` requires a safe absolute JavaScript pnpm
  launcher when using Node directly;
- pnpm 11.22.0 in the operator environment did not populate `npm_execpath`;
- the actual safe launcher was located at the installed pnpm.cjs path;
- setting `npm_execpath` to that absolute launcher allowed the real restore to
  complete successfully.

The manual environment workaround proved the recovery implementation works but
is NOT considered the permanent repository fix.

The repository must still gain the smallest safe Windows launcher-resolution
hardening, backed by tests.

Do not reintroduce the earlier temporary `restore-local.ts` environment-spread
experiment. The successful real restore proved it was not required.

## Current blockers

### Task 050 engineering closeout

No Stage 6 restore execution blocker remains.

Remaining engineering follow-up:

`resolvePnpmInvocation()` must be made robust on Windows when `npm_execpath` is
not provided by pnpm, without falling back to unsafe shell execution or blindly
launching `.cmd` shims.

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

## Exact next step

1. Review and commit the completed Task 050 Stage 6 documentation together with
   this canonical PROJECT-STATE.md handoff.

2. Inspect `apps/web/scripts/recovery/tools.ts` and the focused recovery tests for
   the Windows `resolvePnpmInvocation()` contract.

3. Identify the narrowest safe way to resolve the installed pnpm JavaScript
   launcher when `npm_execpath` is absent on Windows.

4. Preserve the existing fail-closed rules:
   - no shell execution;
   - no blind `.cmd` execution;
   - no user-specific path committed;
   - no weakening of package-manager launcher validation.

5. Implement the smallest test-backed fix.

6. Run targeted recovery tests, the applicable non-empty local integration
   rehearsal, TypeScript verification, and repository diff checks.

7. Synchronize this PROJECT-STATE.md again immediately after that milestone.

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