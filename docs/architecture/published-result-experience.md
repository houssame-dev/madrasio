# Published result experience — Task 061

## Persistence decision and historical meaning

The existing `result_publications` row remains the single immutable publication
snapshot/history system. Its value, academic identifiers, grading-version ID,
publication version and timestamp already preserve numerical meaning, but its
foreign keys cannot reconstruct names at publication time after mutable renames.
Migration `0018_result-publication-context` therefore adds only nullable JSONB
`display_context` to that table. No new history table, formula or permission exists.

New publications capture one versioned display object in the publication
transaction: Student name, Academic Year name, optional Period name and optional
Subject name. One tenant-filtered query captures the labels; the same object is
stored in the publication and its Outbox payload. Annual context has no Period;
Period/Annual have no Subject. Class labels are not captured. Names are display
data, never authorization evidence.

Initial publication and each revision capture their own context. Later renames,
rule configuration changes and subsequent revisions never update old snapshots
or messages. Idempotent publication replay returns the existing publication before
recapture. Existing atomic revision, historical academic binding (Task 053), exact
grading-version rules (Task 059), audit conventions (Task 054), frozen recipients
and Outbox/Notification uniqueness remain unchanged.

Old publication rows stay null: there is **no unverifiable backfill**. Legacy
history displays the stored value, version/time, exact rules-version ID and a
missing-label explanation. Result lists use explicit unrecorded-label text, not
current names/code/Class labels masquerading as historical context.

## Parent journey and state

Dashboard → My children → child → selected enrolled Year → Subject/Period/Annual
results uses the existing server list, independently paginated at 50 per type.
Shared Previous/Next controls expose the server total without loading an unbounded
list or raising the limit. Query keys include School, child, Year, type and page;
context changes remount the paging state. Errors do not render stale rows.

Each row links to `/children/:studentId/results/:publicationId`. The detail keeps
that exact selected publication visible while paging its logical Result's full
history, newest version first, 20 per page. Version 1 is an initial PUBLISHED
snapshot; later versions are REVISED snapshots. CALCULATED and FINALIZED describe
the working Result and do not grant Parent visibility. Staff detail retains the
working status alongside independently paginated publication history.

`GET /api/v1/parent/children/:studentId/publications/:publicationId?page=1` is a
strict, read-only, private/no-store contract (including errors). The server resolves
the current identity/School, requires PARENT membership, an ACTIVE owned Parent
profile and ACTIVE child relationship, checks the exact tenant/publication/Student
binding and an enrolled Year. Unknown, foreign, unrelated and forged publication
or Student IDs cannot reveal a snapshot. Raw Result IDs and unpublished results
never resolve as publications. Staff history stays behind `grades.read` and exact
Teacher Class/Subject/Year assignment scope; Parents cannot use staff result reads.

## Notifications

New Result bodies identify Student, Subject/type, Year/Period, value and initial
or revised publication state using the frozen event context, not current rows.
Old events without context retain the supported generic value-only body; old
persisted messages are not rewritten. Malformed present context fails with the
existing controlled `EVENT_PAYLOAD_INVALID` feature code. Processor replay and
recipient/event uniqueness remain unchanged.

Detail and mark-one reads compute an optional relative `destination` only after
owned-inbox and current source authorization checks. Ending a relationship removes
the destination, not access to the owned historical message. Destination navigation
checks authorization again. The frontend accepts only the fixed child/publication
path shape, never arbitrary payload URLs. Mark-read detail-cache replacement
retains the reauthorized link. No new global directory or client authority exists.

## Migration and recovery impact

The canonical chain becomes 0000–0018: **19 migrations, 40 application tables,
42 recovery tables** (40 application + the two accepted Auth recovery tables).
Migration 0018 has no default, rewrite/backfill, policy, grant or table addition.
Deployment/operator baseline expectations follow the new count/latest migration.
This is an additive migration compatible with the prior application during rollout.

The recovery allowlist, `madrasio-recovery-v1`, Auth taxonomy and restore order do
not change. Full-row archive/fingerprint logic already includes the new JSONB
column; a focused local test proves its content affects fingerprints without
changing primary-key identity. Fresh replay and populated 0017→0018 upgrade tests
cover schema/null preservation. Exact migration-manifest matching is not weakened:
older bundles still require their matching reviewed repository migration contract.
No hosted migration or recovery operation has been performed by this implementation.

## Validation handoff (not acceptance evidence)

The latest continuation is implementation-only at the user's request. The following
commands are **pending manual execution**, not claimed passes. Use the repository
root, normal bounded workers, and a clean local test shell with every hosted/provider
opt-in disabled. PGlite tests do not need a hosted database or `.env.local` secrets.

Focused application, authorization, notification, historical/audit and frontend checks:

```powershell
pnpm --filter @school/web exec vitest run __tests__/parents __tests__/notifications __tests__/grades/result-workflow.test.ts __tests__/grades/revision-atomicity.test.ts __tests__/grades/grade-results-routes.test.ts __tests__/grades/class-curriculum-history.test.ts __tests__/grades/configuration-administration.test.ts __tests__/academic-structure/class-history-boundary.test.ts __tests__/audit/audit.test.ts __tests__/frontend/parent-portal __tests__/frontend/grades/results.test.tsx __tests__/frontend/grades/result-actions.test.tsx __tests__/frontend/notifications --maxWorkers=2 --minWorkers=1
```

Fresh migrations, populated upgrade, schema/security and recovery/deployment contracts:

```powershell
pnpm --filter @school/database exec vitest run __tests__/publication-context-migration.test.ts __tests__/migration-readiness.test.ts __tests__/security-hardening.test.ts __tests__/platform-authority.test.ts __tests__/audit.test.ts __tests__/grade-results.test.ts --maxWorkers=2 --minWorkers=1
pnpm --filter @school/web exec vitest run __tests__/recovery/recovery-contracts.test.ts __tests__/recovery/manifest-bundle.test.ts __tests__/recovery/local-target.test.ts __tests__/recovery/audit-recovery.test.ts __tests__/security/hardening.test.ts __tests__/deployment --maxWorkers=2 --minWorkers=1
```

The narrow browser test uses actual Next pages and ordinary navigation with 55
synthetic authorized rows at intercepted HTTP boundaries. PGlite tests independently
prove the real database/application authorization and pagination. Browser interception
is not claimed as a live Auth/database test. Non-loopback browser requests are blocked.
To avoid a build solely for this focused test, start a local development server in
a separate disposable PowerShell session with explicit synthetic overrides:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_local_fixture'
$env:SUPABASE_SECRET_KEY = 'sb_secret_local_fixture'
$env:DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:5432/fixture'
$env:MIGRATION_DATABASE_URL = ''
$env:APP_URL = 'http://localhost:3000'
$env:NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
pnpm --filter @school/web dev --hostname 127.0.0.1 --port 3000
```

In a second local shell with `CI` unset (the existing Playwright configuration
reuses the local server), run only this spec, then stop that development server:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:3000'
pnpm --filter @school/web test:e2e e2e/published-results.spec.ts --workers=1 --retries=0 --reporter=list
```

Remaining static checks and subsequent canonical local validation, each once after
focused checks are green (all pending; no commit/push/hosted commands):

```powershell
pnpm lint
pnpm typecheck
git diff --check
pnpm test
pnpm build
pnpm --filter @school/web test:e2e --workers=1 --retries=0 --reporter=list
```

The full canonical E2E uses the existing production server configuration, so stop
the temporary dev server first. Review actual results before declaring A1 focused
acceptance or A2 canonical acceptance; source inspection is not test execution.
