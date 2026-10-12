# Madrasio — Current Project State

Last updated: **2026-10-12**

## Current task and release status

**Current roadmap task:** **Task 065 — Homework Delivery & Actual Hand-In** (next to plan/implement; **not yet started**).

**Latest accepted milestone:** **Task 064 — Student Date of Birth**.

**Status:** `TASK_064_STUDENT_DATE_OF_BIRTH_PASS`

Task 064 implementation, manual local verification, implementation commit, and user-reported GitHub **CI / Deploy STAGING SUCCESS** are complete. This full replacement state file records Task 064 acceptance; **its repository documentation synchronization must be committed manually** after copying it to `docs/PROJECT-STATE.md`. Do not treat preparation of this file as proof that the documentation commit has already occurred.

- **Repository:** `houssame-dev/madrasio`
- **Branch:** `main`
- **Task 064 implementation commit:** `55cd860` (`feat(students): implement school-local date of birth`)
- **Task 064 starting HEAD:** `5060033504fbf6f9af2a26a176da93ed5d87940c`
- **Implementation commit:** 44 files (39 modified and 5 newly added), with **8,209 insertions and 68 deletions**. Git reported a clean local working tree and `main` one commit ahead of `origin/main` immediately after the commit.
- **CI / Deploy STAGING:** **SUCCESS / SUCCESS**, confirmed by the user after the implementation push step. Workflow IDs, exact remote post-push SHA readback, and separate live Student-DOB application checks were not provided; do not invent them.
- **Production:** no Production deployment, direct hosted database migration verification, or Production customer-data operation is asserted by this Task 064 record. Existing Production customer-onboarding and backup/recovery obligations remain separate and are not waived.
- **Documentation status:** replacement prepared; commit/push of this revised `docs/PROJECT-STATE.md` remains the user-operated final documentation step.

**Next step:** complete the `PROJECT-STATE.md` documentation commit, then begin planning **Task 065 — Homework Delivery & Actual Hand-In** under its own approved audit scope. Task 064 does not add real Homework hand-in, new Student login, or unrelated Student demographics.

---

## Task 064 — Student Date of Birth

**Accepted implementation status:** `TASK_064_STUDENT_DATE_OF_BIRTH_PASS`

**Owned audit finding:** `V1-AUDIT-025` (`OWNER-04`).

**Scope:** Student DOB only; no broader demographics or Homework changes.

### Functional behavior and privacy boundary

Task 064 adds Student date of birth end-to-end to the existing School Admin management workflow:

- A **normal new Student creation** requires a valid DOB.
- Existing Students with an unknown DOB continue to store **NULL**; no birth dates are invented or retroactively required when updating unrelated fields.
- Authorized corrections may set a valid DOB without disturbing Student identity, lifecycle, placement, enrollment history, or School ownership.
- DOB is a **calendar date**, not a timestamp/instant. The application rejects invalid real dates (including incorrect leap days) and dates after the **authoritative School-local today**, using the previously accepted Task 055 School Business-Time contract.
- DOB handling does not shift calendar dates through browser or UTC timezone conversion, does not introduce universal minimum/maximum-age business rules, and fails safely when required School-time configuration is invalid.
- **School Admin** create/edit and management detail/mutation responses expose DOB as authorized. Broad Student lists, Teacher/Parent DTOs, notification payloads, and unrelated academic projections do not gain DOB fields simply because the column exists.
- Existing tenant, current-School membership, and role access controls remain in force. No new Student user/account role is introduced.
- The Student management forms/detail preserve Task 056 frontend conventions, including validation and feedback behavior.

**Explicitly out of scope:** Student sex/gender, medical data, national identifiers, Teacher DOB, age-derived rules, Student login, and Task 065 Homework Delivery & Actual Hand-In.

### Persistence and migration

New Drizzle migration:

`database/drizzle/migrations/0021_student-date-of-birth.sql`

```sql
ALTER TABLE "students" ADD COLUMN "date_of_birth" date;
```

- Column is **nullable DATE**, with no default and **no backfill**.
- Fresh and populated migration replay passed, including a populated upgrade from migration `0020` that preserves Student identity, related historical rows, and legacy `NULL` DOB.
- Generated Drizzle journal/snapshot were included in the implementation commit.
- RLS policies, application grants, and School tenant ownership were not widened.

**Current persistence inventory after Task 064:**

- **22 migrations** (through `0021`)
- **42 application / RLS-enabled tables**
- **44 recovery tables/fingerprints** (42 application tables + `auth.users` + `auth.identities`)

The migration and recovery fingerprints were included in deployment/security/recovery compatibility regression coverage. The unit/in-memory replay tests do **not** independently prove that a hosted STAGING or Production database has applied migration `0021`.

### Recovery and historical compatibility

- Full-row Student recovery now preserves **both populated DOB values and unknown (`NULL`) DOB**, with the existing **44-table** recovery format unchanged.
- Updated deployment/security/backup/operator fixtures and inventory contracts account for `0021` without creating new tables or authorizing new roles.
- Historical `0000–0017` publication-migration upgrade fixtures continue to represent their original older database schema faithfully; later migrations are not assumed to exist before the upgrade step.
- The separate Task 063 caveat remains: database recovery covers private application-file metadata/associations, **not the Cloudflare R2 binary bytes**.

### Manual local validation evidence

Every required Task 064 local gate completed successfully after one narrow test-fixture remediation.

| Validation gate | Verified result |
| --- | --- |
| Gate 1 — Student / frontend / Parent focused tests | **13 files passed; 128 tests passed** |
| Gate 2 — database migrations / security (complete rerun) | **8 files passed; 21 tests passed** |
| Gate 3 — recovery / security / deployment / operator | **19 files passed, 3 files skipped; 491 tests passed, 8 skipped** |
| Gate 4 — `pnpm lint` | **PASS** |
| Gate 4 — `pnpm typecheck` | **PASS** |
| Gate 4 — `git diff --check` / `git diff --cached --check` | **PASS** |
| Gate 5 — canonical database suite | **19 files passed; 372 tests passed** |
| Gate 5 — canonical web suite | **168 files passed, 4 files skipped; 1,755 tests passed, 13 skipped** |
| Gate 5 — combined canonical suites | **2,127 tests passed; 13 skipped; 0 failed** |
| Gate 6 — `pnpm build` | **PASS** — Next.js 15.5.23; production compilation; 38/38 static pages generated |
| Gate 7 — local Playwright (Chromium) | **6 tests passed, 5 conditionally skipped; 0 failed** |
| Gate 8 — repository review | **PASS** — 44 expected files; migration SQL verified; no staged/unrelated changes; clean whitespace checks |
| GitHub CI | **SUCCESS**, user-confirmed |
| Deploy STAGING | **SUCCESS**, user-confirmed |

The web canonical 13 skipped tests and Playwright 5 skipped tests concern conditional integration/hosted or browser opt-in coverage. Do not report these skips as independently run checks; the local Playwright tests do not constitute an end-to-end hosted DOB-management exercise.

The local Git LF → CRLF messages were line-ending warnings, not whitespace/test failures.

### Narrow Gate 2 remediation

The first Gate 2 database run completed **20 passing tests and one failing test** across eight files. The failing case was:

`database/__tests__/publication-context-migration.test.ts` — populated historical `0000–0017` publication upgrade.

**Confirmed root cause:** the fixture applied only migrations `0000–0017` but used the current Drizzle Student model to insert/return a Student, which implicitly referenced `date_of_birth` introduced later in `0021`.

**Correction:** the historical Student insert was changed to parameterized SQL listing only columns actually present in the older schema. It does not fabricate a DOB. Publication-preservation assertions, NULL historical publication context, current fresh-chain replay, and application code remained unchanged.

- Targeted remediation retest: **1 file, 2 tests passed**.
- Full Gate 2 rerun: **8 files, 21 tests passed**.
- Full canonical database and web suites subsequently passed.
- **No production-code changes** were required for this regression remediation.

### Implementation, release, and remaining boundaries

- **Code commit:** `55cd860` — `feat(students): implement school-local date of birth`.
- **Change inventory:** 39 modified + 5 new = **44 files**; 8,209 insertions, 68 deletions (including the generated Drizzle migration snapshot).
- **No dependency/lockfile changes** were reported in A1 and the final change inventory.
- Implementation commit was created manually following the 8 local gates; immediately afterward the user saw a clean working tree and `main...origin/main [ahead 1]` before the instructed push.
- The user subsequently confirmed **CI SUCCESS** and **Deploy STAGING SUCCESS**. Their post-push exact SHA readback and workflow IDs were not supplied, so these remain reported release outcomes rather than a separately verified provider audit.
- No direct hosted School Admin DOB journey or hosted applied-migration inspection was supplied. No Production acceptance should be inferred.
- Existing Production backup/recovery and customer-data onboarding gate remains in force.

**Acceptance:** Task 064 satisfies the approved Student DOB-only scope, preserves unknown legacy DOB and School/role privacy, and passed all eight local validation gates plus user-reported GitHub CI and Deploy STAGING checks.

`TASK_064_STUDENT_DATE_OF_BIRTH_PASS`

**Documentation closeout:** save this **entire** file as `docs/PROJECT-STATE.md` and commit/push that documentation change manually. Until then, this acceptance record is prepared but not synchronized into the repository.

---

## Historical accepted milestone — Task 063

The Task 063 record below is retained as accepted historical context. References to its then-current inventory and next roadmap milestone are historical; Task 064 is the current latest accepted implementation.

## Task 063 — Private Application Files & Attachments

**Final status:** `TASK_063_PRIVATE_APPLICATION_FILES_AND_ATTACHMENTS_PASS`

### Scope completed

Task 063 establishes a reusable, private application-file foundation and integrates it with **exact `AnnouncementVersion` attachments**. It does not introduce a public media library or a generic file manager.

Implemented capabilities include:

- private R2-backed application file storage with server-generated opaque object keys;
- School-owned file metadata and explicit `AnnouncementVersion` attachment associations;
- announcement management upload, list, logical removal, and authorized download routes;
- recipient announcement attachment listing and download routes;
- announcement management and recipient UI integration;
- pre-storage file validation, bounded upload/download handling, immutable digests, idempotency, and deterministic failure behavior;
- audit attribution and transactional mutation/audit handling;
- database migration, recovery inventory, security/deployment compatibility, and regression tests.

**Explicitly deferred:** Task 065 owns Homework Delivery & Actual Hand-In, including any real homework submission/attachment/review semantics. No new Student login role, generalized media management, antivirus service, file search, OCR/AI processing, or operator-wide object reconciliation workflow was introduced.

### Security, authorization, and attachment history

- Application objects remain private; no public bucket policy or permanent public object URLs are used as the authorization mechanism.
- Application-mediated downloads authorize the current authenticated User and active School context before reading storage.
- Management authority is derived server-side from normal School roles/resource scope; clients cannot supply authoritative School IDs, object keys, or attachment ownership.
- Recipient attachment access follows Task 062's **immutable publication-recipient snapshot** authorization, not reconstructed current ParentStudent/Teacher relationships or possession of an attachment ID.
- A Version with **any publication history**, including scheduled or cancelled publication intent, has its attachments frozen. A later corrected/new Version has its own independent attachment history.
- Existing published publication and recipient evidence is not rewritten by later content, target, or relationship changes.
- Removing an eligible pre-publication attachment is a logical operation; historical associations remain preserved rather than destructively rewritten.
- Download responses are bounded and private, use no-store behavior, and do not expose bucket keys, secrets, or permanent R2 links.

### File acceptance and storage consistency

- V1 accepted formats: **PDF, PNG, JPEG**.
- Maximum file size: **2 MiB** per file.
- Maximum active associations: **10 attachments** per AnnouncementVersion.
- Validation checks filename safety, declared type/extension, content signatures, length bounds, and a SHA-256 digest.
- Metadata reservation precedes R2 writes; only finalized/ready attachments can be downloaded, and incomplete attachment state blocks publication as appropriate.
- Idempotency prevents duplicated successful upload effects; uncertain storage/database outcomes fail conservatively and may require reconciliation.
- Compensation is limited to operation-owned objects when safe; ambiguous finalization does not trigger unsafe blind object deletion.
- The application R2 target is separate from the Production backup storage boundary. Existing recovery R2 request-signing functionality was refactored into a reusable shared helper without making application files part of the backup bucket.

### Persistence and recovery

New migration:

`database/drizzle/migrations/0020_private-application-files.sql`

New application entities:

- `files`
- `announcement_attachments`

Database constraints and security include School ownership / same-School associations, uniqueness/check constraints, conservative deletion, RLS enabled, and Data API privilege hardening. Legacy publication history is retained without fabricating historical attachment rows.

**Current inventory after Task 063:**

- **21 migrations** (through `0020`)
- **42 public application / RLS-enabled tables**
- **44 recovery tables/fingerprints** (42 application + `auth.users` + `auth.identities`)

Recovery testing validates exact private-file **metadata and association** replay and all 44 fingerprints. **Database recovery does not restore or verify the underlying R2 binary object bytes**; backing up/restoring those bytes is a separate storage recovery obligation. Do not represent metadata-only recovery as full file-content disaster recovery.

### Validation completed

All required **local** Task 063 gates passed after focused test-only remediation.

| Validation gate | Accepted result |
| --- | --- |
| Focused web files/announcements/notifications tests | **26 files passed; 279 tests passed** |
| Database/migration/audit/security gate | **7 files passed; 19 tests passed** |
| Recovery/security/deployment/operator/jobs gate | **19 files passed, 3 files skipped; 496 tests passed, 8 skipped** |
| `pnpm lint` | **PASS** |
| `pnpm typecheck` | **PASS** |
| `git diff --check` and staged `git diff --cached --check` | **PASS** |
| Canonical database suite | **18 files passed; 370 tests passed** |
| Canonical web suite | **166 files passed, 4 skipped; 1,725 tests passed, 13 skipped** |
| Combined canonical database + web | **2,095 tests passed** |
| `pnpm build` | **PASS** — Next.js 15.5.23; optimized production build; 38/38 static pages generated |
| Local Playwright E2E | **6 passed, 5 conditionally skipped; 0 failed** |
| GitHub CI | **SUCCESS**, manually inspected by user |
| Deploy STAGING | **SUCCESS**, manually inspected by user |

The 5 skipped Playwright cases require conditional hosted STAGING integration and do not constitute independent proof of hosted application-file/R2 behavior.

### Narrow test-only remediation

1. **Attachment HTTP route test fixture:** Vitest/jsdom did not preserve a synthetic browser-managed `Content-Length` header. The invalid-size test now supplies an actually oversized body; cross-origin behavior is exercised through an explicitly server-visible header fixture. Production request handling was not weakened.
2. **Platform authority historical migration fixture:** A legacy test applied only through migration `0017` but checked the current **42-table** application security inventory. It now verifies the `0017` upgrade semantics first, replays subsequent migrations, and then runs the current global security audit.
3. **TypeScript test fixtures:** An invalid-byte test uses `Buffer.alloc(0)` instead of a mismatched `Uint8Array` type; R2 test environment fixtures supply `NODE_ENV: 'test'`. No production behavior was changed for these typing corrections.

The affected tests and full suites subsequently passed.

### Commit, release evidence, and known boundaries

- The completed implementation comprises **62 files**: **40 modified** and **22 newly added**.
- The validated local commit changed 9,227 inserted lines and 116 deleted lines, including the generated Drizzle migration snapshot.
- No dependency or lockfile changes were required for Task 063.
- Final validated code commit: `b049a41188d647528dadca7b41fb8d82c0c7a454`.
- The commit was pushed to `origin/main`, with the exact remote SHA confirmed and a clean synchronized local working tree.
- The user manually confirmed **CI and Deploy STAGING SUCCESS** after this push; no hosted CI run IDs are asserted here.
- No hosted private R2 bucket setup, real object upload/download, or object-byte disaster-recovery acceptance was independently evidenced in this Task 063 local validation record. Such claims must be supported by separate provider/hosted evidence.
- There were no Task 063 Production operations.

**Acceptance:** Task 063 delivers the approved private-file foundation plus AnnouncementVersion attachments, preserves historical publication/recipient semantics and School isolation, and passes the agreed local repository gates and reported CI/STAGING release gate.

`TASK_063_PRIVATE_APPLICATION_FILES_AND_ATTACHMENTS_PASS`

---

## Historical accepted milestone — Task 062

The following Task 062 record is preserved from the supplied `PROJECT-STATE.md`. Its final “Next roadmap task” refers to the **historical next step at Task 062 closure**, not the current roadmap position; Task 063 has now been completed above.

## Task 062 — Announcement Publication & Recipient Experience

**Status:** `TASK_062_ANNOUNCEMENT_PUBLICATION_RECIPIENT_EXPERIENCE_PASS`

Task 062 is complete and accepted.

### Scope completed

Task 062 completed the V1 announcement publication and recipient experience, including:

- pre-publication authoring and correction
- announcement scheduling
- rescheduling
- cancellation
- publication and revision history
- immutable/reconstructable recipient snapshots
- safe rich-text announcement content
- Parent/Teacher recipient inbox and detail journeys
- authorization-safe notification destinations
- audit coverage for important announcement lifecycle mutations
- concurrency protection for publish/reschedule/cancel races

This closes the Task 062 work associated with:

- `V1-AUDIT-004`
- `V1-AUDIT-005`
- `V1-AUDIT-014`

### Announcement lifecycle

Announcement publication intents now support:

- `SCHEDULED`
- `PUBLISHED`
- `CANCELLED`

Cancellation is retained as truthful lifecycle state rather than deleting the scheduled publication intent.

A cancelled publication:

- cannot later publish
- creates no recipient snapshots
- creates no publication notification event
- remains visible to authorized management users as historical intent

Rescheduling operates on the existing unpublished scheduled intent.

Lifecycle mutations share announcement-row serialization and re-read authoritative state after locking.

Due-processing also re-checks status and scheduled time after acquiring the lock so stale processor discovery cannot:

- publish a cancelled intent
- publish an intent that was rescheduled into the future
- create duplicate publication delivery

Database uniqueness/idempotency constraints remain the final backstop.

### Draft correction and publication history

Draft correction does not overwrite content in place.

Corrections create a new immutable `AnnouncementVersion`.

Before publication, authorized management may:

- create corrected content Versions
- add valid targets
- remove unpublished targets
- reschedule
- cancel

These operations do not fabricate publication history.

After publication:

- the exact published Version remains immutable
- the publication record remains immutable historical evidence
- recipient snapshots remain frozen
- later announcement revisions create distinct publication history
- later target or relationship changes do not rewrite previous recipients

A cancelled publication intent does not cause the first later successful publication to be mislabeled as a revision.

### Rich-text safety

Announcement content now supports explicitly distinguished body formats.

New rich-text content uses a shared sanitization policy based on:

- `sanitize-html@2.17.0`
- `@types/sanitize-html@2.16.0`

Rich content is sanitized before persistence and rendered through the same approved content policy.

The allowlist rejects unsafe markup including script execution, event-handler attributes, and dangerous URL forms.

Existing historical announcement bodies remain:

- `PLAIN_TEXT`
- escaped when rendered
- never silently reinterpreted as HTML

This preserves historical meaning and avoids unsafe migration-time reinterpretation.

### Recipient experience

Recipient-facing announcement journeys now exist at:

- `/announcements/inbox`
- `/announcements/inbox/[id]`

Ordinary Parent and Teacher navigation exposes the announcement inbox.

Recipient access requires:

- an authenticated User
- an ACTIVE current School context
- a matching immutable publication-recipient snapshot

Access does not depend on reconstructing historical eligibility from current relationships.

Therefore:

- later ParentStudent changes do not rewrite prior Parent access
- later Teacher assignment changes do not rewrite prior Teacher access
- foreign-School publications remain hidden
- non-recipients remain denied
- forged identifiers remain denied
- draft/scheduled/cancelled publications are not exposed as recipient publications
- inactive School membership does not grant recipient access

Recipient list and detail journeys include bounded pagination and ordinary loading, empty, error, and navigation behavior.

### Notification navigation

Announcement notification destinations now resolve through the same publication-recipient authorization boundary.

A notification does not itself grant access to the announcement.

Navigation fails safely when the referenced announcement publication is:

- missing
- unpublished
- cancelled
- outside the current School
- inaccessible to the current User

Existing historical announcement notification payloads remain compatible.

Notification processing preserves existing event/recipient idempotency.

No notification is manufactured for inconsistent legacy events whose source publication is still `SCHEDULED` or is `CANCELLED`.

### Audit

Important announcement lifecycle mutations produce attributed audit events.

Where the business mutation and audit record are required together, they are transactional.

Validated rollback behavior includes:

- content creation rollback when audit persistence fails
- publication rollback when audit persistence fails
- recipient snapshot rollback
- outbox rollback
- schedule/reschedule mutation rollback

Audit metadata does not persist announcement body content or secrets.

### Persistence

Added migration:

`0019_announcement-lifecycle-content.sql`

The migration adds the minimal persistence required for Task 062, including:

- retained `CANCELLED` publication state
- announcement Version body-format persistence
- lifecycle/content constraints required by the accepted model

Legacy populated data upgrades without fabricating historical publication meaning or reinterpreting existing plain-text content.

Current persistence inventory after Task 062:

- **20 migrations**
- **40 application/RLS tables**
- **42 recovery tables**

Recovery inventory shape remains unchanged.

Existing full-row recovery fingerprints were updated for the Task 062 announcement fields.

### Validation

Task 062 local acceptance completed successfully.

Focused announcement / notification validation:

- **22 test files passed**
- **232 tests passed**

Database / migration / audit validation:

- **6 test files passed**
- **17 tests passed**

Recovery / deployment / operator compatibility:

- **10 test files passed**
- **197 tests passed**
- **5 skipped**

Static validation:

- `pnpm lint` — PASS
- `pnpm typecheck` — PASS
- `git diff --check` — PASS

Canonical database suite:

- **17 test files passed**
- **368 tests passed**

Canonical web suite after narrow remediation:

- **161 test files passed**
- **4 test files skipped**
- **1,677 tests passed**
- **13 tests skipped**

Production build:

- `pnpm build` — PASS
- optimized Next.js production build completed
- static generation completed successfully

Local Playwright E2E:

- **6 passed**
- **5 skipped**
- skipped cases are conditional hosted/STAGING integration paths

Hosted validation:

- **CI — SUCCESS**
- **Deploy STAGING — SUCCESS**

### Narrow canonical remediation

The first canonical web-suite run exposed two non-product issues:

1. the Parent navigation regression expectation had not yet been updated for the new `School announcements` navigation entry;
2. the local validation shell contained an invalid temporary `CRON_SECRET`, causing unrelated Supabase environment tests to fail validation.

Remediation:

- updated the Parent navigation expectation to include `School announcements`
- removed the temporary local `CRON_SECRET` environment contamination

The affected narrow regression set then passed:

- **2 test files passed**
- **9 tests passed**

The complete canonical web suite subsequently passed.

No production security validation was weakened.

### Known validation boundary

Task 062 contains application-level concurrency regression coverage for:

- publish vs publish
- stale processor vs cancellation
- stale processor vs reschedule
- processor winner vs later lifecycle mutation
- idempotent duplicate delivery prevention

However, real multi-connection hosted database contention was not independently exercised as a dedicated Task 062 acceptance experiment.

Do not interpret the local concurrency regression suite as separate proof of every production-network contention scenario.

### Task 062 acceptance

Task 062 satisfies the accepted V1 announcement-publication requirements:

- pre-publication correction
- schedule/reschedule/cancel
- truthful cancellation state
- immutable publication/revision history
- frozen recipient evidence
- safe rich-text handling
- recipient discovery and read journeys
- authorization-safe notification navigation
- School-scoped access
- atomic auditing
- recovery/deployment compatibility

**Final status:**

`TASK_062_ANNOUNCEMENT_PUBLICATION_RECIPIENT_EXPERIENCE_PASS`

### Next roadmap task

Proceed to:

**Task 063 — Private Application Files & Attachments**

Task 063 owns private attachment/file infrastructure and must not retroactively move attachment storage concerns into Task 062.