# Announcement publication and recipient experience — Task 062

Implementation handoff: repository changes and regression tests authored; manual validation is still required. No hosted rollout or test result is asserted here. This extends the existing publication/version/snapshot model, Task 054 atomic audit and Task 055 School-time contracts; it does not introduce another publication model.

## Authoring and lifecycle

The logical Announcement keeps DRAFT, SCHEDULED, PUBLISHED and ARCHIVED. Each publication intent independently has SCHEDULED, PUBLISHED or CANCELLED. Cancelling the last pending intent leaves a previously published Announcement PUBLISHED, otherwise DRAFT. Archiving is refused while any pending intent exists; it preserves all history.

Content correction always creates a new immutable AnnouncementVersion, including pre-publication corrections. Targets may be added/removed only on the latest Version that has never had a publication intent. A scheduled or cancelled Version remains frozen. For scheduled content/target correction: cancel, create a new Version, select its targets, then publish/schedule. New Versions do not implicitly copy audiences. Rescheduling changes only the future instant on the same pending intent. Cancellation retains the intent and cannot create recipient snapshots, Outbox events or Notifications. Already cancelled cancellation is idempotent; published intents cannot be cancelled or rescheduled.

Every publication remains bound to its exact Version. Recipient snapshots are resolved at actual publication time, not scheduling time. New Versions or later relationships never rewrite historical content or recipients. Sequence numbers are allocated to intents: cancelled/pending intents can leave gaps in completed history, and scheduled intents may complete out of sequence. Initial/revision event naming therefore depends on whether another publication has actually completed, not on sequence being 1. One Version cannot be reused after cancellation; corrections require a new Version.

## Concurrency and atomic audit

Canonical publish/due-processing/cancel/reschedule/target/version/archive writers take `SELECT ... FOR UPDATE` on the same School-scoped Announcement row first. Due discovery is only a candidate list; the worker re-reads publication status and due instant after locking. A final status-and-due-time compare-and-swap guards transition. Database sequence/idempotency uniqueness remains a backstop. No Redis/distributed lock is introduced.

If cancellation/rescheduling wins, stale due discovery cannot publish the previous intent/time. If publication wins, cancellation/rescheduling is refused. A stale candidate rescheduled into the future returns bounded NOT_PUBLISHABLE; the existing processor may count that item as a failed attempt, but produces no delivery and discovers it normally at its new due time. Duplicate processors/replays emit no additional event. Reusing an idempotency key with a different Announcement or Version is a conflict.

Audit metadata is appended in the same transaction as content/target/status changes and publication/snapshot/Outbox creation. User operations retain authenticated User + School attribution; due publication uses SYSTEM / SCHEDULED_ANNOUNCEMENT_PROCESSOR. Closed metadata contains only identifiers, change kind and relevant times, not titles/bodies/recipient lists. Audit failure rolls back the entire business mutation. Idempotent no-ops do not add misleading audit entries.

Guarantees apply to canonical writers under the existing PostgreSQL transaction model. Unmanaged SQL writers are not guarded by application locks. Relationship writes do not take the announcement lock; recipient resolution observes the committed state available at publication, not a promise to serialize every School relationship edit. PGlite barrier/duplicate tests exercise application ordering; they are not a claim that real multi-connection hosted contention has been run. No hosted work was performed in this implementation gate.

## Rich content

`sanitize-html` 2.17.0 with `@types/sanitize-html` 2.16.0 is repository/lockfile controlled. No existing HTML sanitizer was available; this dependency avoids inventing a regex-based sanitizer and supplies the reviewed parser/allowlist boundary. One allowlist in `domain/content.ts` accepts paragraphs, line breaks, bold/emphasis/underline/strike, lists, quotes, h2/h3 and links. Only link href/title attributes survive; http/https/mailto are allowed. Script/style execution, event handlers, embeds, images, SVG/MathML, CSS, protocol-relative and dangerous scheme links are not accepted. Sanitized empty content is rejected.

Title remains text. Explicit HTML is sanitized server-side before immutable Version insertion; the shared renderer sanitizes again before its only HTML injection sink. The UI offers plain text or HTML source with sanitized preview. Legacy/omitted format is PLAIN_TEXT and always React-escaped, even if it looks like markup. Migration does not reinterpret legacy bodies or sanitize/rewrite old history. No attachment support or editor SDK is introduced.

## HTTP, management and recipient surfaces

- Existing create and Version-create accept optional `bodyFormat: PLAIN_TEXT | HTML`.
- `DELETE /api/v1/announcements/:id/targets` accepts only `{ announcementVersionId, targetId }`.
- `PATCH /api/v1/announcements/:id/publications/:publicationId` accepts only `{ action: cancel }` or `{ action: reschedule, scheduledAt }`.
- `GET /api/v1/me/announcements` is a paginated recipient inbox.
- `GET /api/v1/me/announcements/:publicationId` reads one authorized immutable publication.

School and User always come from authenticated CurrentContext. No request controls School, author, role, recipient IDs or snapshot authority. Management preserves current permissions: SchoolAdmin/permitted SuperAdmin; Teacher only authored Announcements within active assignment target scope; Parent cannot manage. Foreign identifiers fail safely.

Parent and Teacher sidebar navigation exposes School announcements → paginated inbox → publication detail/back. Detail shows exact title/content, content Version, publication sequence and School-local publication time without staff controls or other recipient identities. The server requires active identity/membership/School context plus an exact same-School/User publication snapshot and PUBLISHED status. Ended ParentStudent/TeacherAssignment relationships do not erase historical recipient access; inactive membership still denies it. Draft, scheduled, cancelled, unrelated and foreign publication IDs do not grant access. Lists count only authorized rows before pagination.

Management history pages both Versions and Publications; publication metadata includes the exact Version number even when that Version is not on the current Version page. Reschedule/cancel/remove controls use existing dialogs, pending handling, controlled errors and narrow query invalidation. School-local schedule input uses Task 055 conversion with DST ambiguity/nonexistence rejection; stored instants and due comparisons remain UTC-based.

## Notification compatibility

Announcement notification detail computes a relative destination using the same publication-snapshot query as recipient detail. Owning a Notification does not grant source access. Inaccessible/unpublished/cancelled sources yield null and a safe unavailable message. The frontend accepts only the fixed relative Announcement destination shape; source IDs or payload strings cannot become arbitrary URLs.

No new announcement event payload fields are required: legacy event/Version/publication IDs already locate immutable content. Notifications remain plain text, event/recipient unique and asynchronously produced from frozen snapshots. Cancel/reschedule/draft/target operations emit no publication event. The processor rejects non-PUBLISHED announcement sources, including inconsistent legacy events. Result notification context and behavior are unchanged.

## Migration and recovery

Generated migration: `0019_announcement-lifecycle-content` (Drizzle journal and snapshot included).

- Adds CANCELLED to publication status.
- Adds `announcement_versions.body_format` TEXT NOT NULL DEFAULT PLAIN_TEXT with two-value CHECK.
- Updates publication timestamp CHECK so CANCELLED retains a scheduled instant and no published instant. The enum comparison is cast to text so migration does not use a newly added enum value inside its transaction.

The chain is now 0000–0019 (20 migrations); application tables remain 40. Recovery remains `madrasio-recovery-v1`, with 42 allowlisted tables and unchanged Auth taxonomy/order. Existing full-row fingerprints and archives include body_format and cancellation state automatically. Deployment/operator/readiness expectations advance to 0019; no recovery-format fork or new table is required. Existing legacy Versions remain PLAIN_TEXT without content mutation; existing published snapshots/events are untouched.

## Manual validation handoff

No validation was executed in this continuation. Run from the workspace root with hosted/provider opt-ins disabled:

```sh
pnpm --filter @school/web test --maxWorkers=2 --minWorkers=1 __tests__/announcements __tests__/frontend/announcements __tests__/notifications __tests__/frontend/notifications
pnpm --filter @school/database test --maxWorkers=2 --minWorkers=1 __tests__/announcement-lifecycle-migration.test.ts __tests__/migration-readiness.test.ts __tests__/publication-context-migration.test.ts __tests__/audit.test.ts __tests__/platform-authority.test.ts __tests__/security-hardening.test.ts
pnpm --filter @school/web test --maxWorkers=2 --minWorkers=1 __tests__/recovery/recovery-contracts.test.ts __tests__/recovery/manifest-bundle.test.ts __tests__/recovery/local-target.test.ts __tests__/security/hardening.test.ts __tests__/deployment __tests__/operator __tests__/jobs
pnpm lint
pnpm typecheck
git diff --check
pnpm test --maxWorkers=2 --minWorkers=1
pnpm build
pnpm --filter @school/web test:e2e --workers=1 --retries=0 --reporter=list
```

The new publication-experience tests include full-row recovery fingerprints, stale-discovery barriers, duplicate processing, historical recipients, notification idempotency/destinations and audit rollback. Rich-content tests cover hostile/malformed markup. Recipient frontend tests cover Parent/Teacher navigation, pagination, denied/empty states, HTML/plain rendering, cancellation/target confirmation and School-time rescheduling. Migration tests cover fresh replay and populated legacy upgrade. Existing publisher, processor and authorization suites remain part of the focused handoff. Canonical lint/typecheck/full tests/build/E2E/diff-check are Product Owner follow-up, not evidence claimed by this document.
