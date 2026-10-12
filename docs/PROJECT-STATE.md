# Madrasio — Current Project State

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