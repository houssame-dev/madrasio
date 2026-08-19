# Announcements — Application & Publication Flow

Status: **Approved** (Task 011; recipient-timing hardening in Task 011.1)
Module: Announcements
Dependencies: Outbox (ADR-012), Notifications (ADR-013), Authorization foundation (Task 005), Announcements foundation schema (Task 009)

## 1. Scope

This document describes the Announcements **Application layer** and the
**publication flow** — the missing producer of the `AnnouncementPublished` /
`AnnouncementRevisionPublished` outbox events (Global Integration Review
C-1) and the missing consumer support for `AnnouncementRevisionPublished` in
the Notifications processor.

It covers:

- the publication use case (`publishAnnouncement`)
- due-work publication (`publishDueAnnouncement`)
- authorization for publishing
- recipient resolution and the immutable snapshot
- publication sequencing and revisions
- scheduling semantics
- idempotency and concurrency
- the outbox event hand-off and notification integration
- the HTTP surface (`POST /api/v1/announcements/:id/publish`)

It deliberately does **NOT** cover: draft authoring, editing, version
creation, target/audience management, attachments, or a broad CRUD API —
those remain out of scope for V1 (Task 011 §3/§9). This task also does **NOT**
build a scheduler; `publishDueAnnouncement` is the minimal helper a worker or
request can invoke for one now-due publication (BR-ANNOUNCEMENT-012).

## 2. Authoritative Flow

`publishAnnouncement` runs, in order (Task 011 §2):

```text
Authenticated (session identity)
  ↓ School Context (membership + school resolution)
  ↓ Authorization (announcements.publish, school-scoped)
  ↓ Load Announcement (ANNOUNCEMENT_NOT_FOUND)
  ↓ Load exact Version (VERSION_NOT_FOUND)
  ↓ Idempotency replay (idempotency_key)
  ↓ Validate publishable state (ARCHIVED → NOT_PUBLISHABLE)
  ↓ Load targets (NO_VALID_TARGETS)
  ↓ Academic scope (teacher CLASS-target check)
  ↓ One-publication-per-Version (ALREADY_PUBLISHED)
  ↓ Resolve recipients (NO_ELIGIBLE_RECIPIENTS)
  ↓ Create Publication
  ↓ Persist RecipientSnapshots
  ↓ Persist OutboxEvent (immediate publish only)
  ↓ COMMIT (one transaction)
```

## 3. Module Boundary

The announcements use case writes ONLY:

- `announcement_publications`
- `publication_recipient_snapshots`
- the Announcement row status (`DRAFT` → `SCHEDULED` / `PUBLISHED`)
- the shared `outbox_events` row (via `persistOutboxEvent`, ADR-012)

It NEVER writes `notifications`, `grades`, `attendance` or `homework` rows
(CLAUDE.md §17). The Notifications processor is the only producer of
notifications and consumes the durable outbox event.

## 4. Authorization

Publishing requires the `announcements.publish` permission with a valid
ACTIVE SchoolMembership + School Context (BR-ANNOUNCEMENT-006). The pipeline
is the canonical `lib/authorization/server` pipeline; the frontend is never
authoritative (CLAUDE.md §16).

The permission matrix grants `announcements.publish` to `SCHOOL_ADMIN`,
`SUPER_ADMIN` and `TEACHER` (BR-ANNOUNCEMENT-007 — teacher direct publishing).

### Teacher academic scope

Role alone is never sufficient (BR-ROLE-002). A `TEACHER` publisher is
additionally restricted by the second half of BR-ANNOUNCEMENT-006 (appropriate
academic scope), enforced against the Version's targets once they are loaded:

- a `CLASS` target must belong to a Class the teacher currently holds an
  **ACTIVE TeacherAssignment** for, in the target's AcademicYear (ADR-009,
  BR-TEACHER-002);
- a `SCHOOL`-wide target is **beyond a teacher's academic scope** and is
  always denied for a `TEACHER` publisher.

`SCHOOL_ADMIN` / `SUPER_ADMIN` act with School-wide scope and are not subject
to the Class-level restriction.

Decision note: restricting teachers to CLASS targets (and denying SCHOOL-wide
teacher publishing) is the conservative reading of "appropriate School /
academic scope" — teacher scope is defined by `TeacherAssignment`, which is
Class+Subject+Year, so no assignment can ever cover a School-wide audience.
It can be revisited by a product decision without touching the schema.

## 5. Recipients & the Immutable Snapshot

At ACTUAL publication time the use case loads the CURRENT relationship
candidates (Task 011 §5/§15, Task 011.1):

- **Parents**: ACTIVE `parents` rows with a User identity, with their
  SchoolMembership status and the Class ids of children currently linked via
  ACTIVE `parent_students` + ACTIVE `student_enrollments`.
- **Teachers**: ACTIVE `teachers` rows with a User identity, with their
  SchoolMembership status and Class ids covered by ACTIVE `teacher_assignments`
  (ENDED assignments never grant current recipients).

The pure resolver (`domain/recipients.ts`) produces the deterministic,
deduplicated recipient list (one entry per User carrying every matched audience
in canonical order). The result is persisted as `publication_recipient_snapshots`
rows in the SAME transaction as the publication (BR-ANNOUNCEMENT-009).

**Scheduling time (Task 011.1 §16):**
- publication intent is persisted (the `SCHEDULED` publication row);
- recipients are NOT resolved or frozen;
- no outbox event exists.

**Actual publication time (Task 011.1 §16):**
- recipients are resolved from the CURRENT relationships (immediate publish or
  the due transition of a scheduled publication);
- the immutable snapshot is persisted;
- the publication event is emitted.

The snapshot is **write-once history**: later ParentStudent/TeacherAssignment/
enrollment/membership changes NEVER rewrite it (BR-ANNOUNCEMENT-010). The
Notifications processor reads recipients EXCLUSIVELY from this snapshot.

## 6. Publication Sequencing & Revisions

- `publication_version` is a **per-Announcement** sequence (1, 2, 3 …),
  enforced unique per Announcement in the schema. It is NOT the Version number.
- Publishing an Announcement's first Version → sequence 1.
- Publishing a **NEW** Version of an already-published Announcement → sequence
  N+1 (a revision). A revision NEVER rewrites the previous publication or
  snapshot (BR-ANNOUNCEMENT-014).
- One exact Version can be published at most once → `ALREADY_PUBLISHED`.
- `ARCHIVED` Announcements cannot be published → `NOT_PUBLISHABLE`.

## 7. Events

Only `publishAnnouncement` / `publishDueAnnouncement` emit announcement events
(Task 011 §10). CRUD, draft, edit, status, version or target operations NEVER
emit events.

| Publication sequence | Event | Notification type |
|---|---|---|
| 1 | `AnnouncementPublished` | `ANNOUNCEMENT_PUBLISHED` |
| > 1 | `AnnouncementRevisionPublished` | `ANNOUNCEMENT_PUBLISHED` |

Payload (`domain/announcement-events.ts`):

```json
{
  "eventId": "<uuid>",
  "eventType": "AnnouncementPublished | AnnouncementRevisionPublished",
  "schoolId": "<uuid>",
  "announcementId": "<uuid>",
  "announcementVersionId": "<uuid>",
  "publicationId": "<uuid>",
  "publicationVersion": 1,
  "publishedAt": "<iso-8601>"
}
```

The event is written inside the SAME transaction as the publication +
snapshot (ADR-012). The Notifications processor is idempotent
(`ON CONFLICT DO NOTHING` on `(source_event_id, recipient_user_id)`,
BR-NOTIFICATION-005) and consumes both announcement event types
(Task 011 §13/§24). A revision notification reuses the `ANNOUNCEMENT_PUBLISHED`
notification type with the same `ANNOUNCEMENT_PUBLICATION` source kind.

## 8. Scheduling (due-based)

A future `scheduled_at` creates a `SCHEDULED` publication and the Announcement
moves `DRAFT` → `SCHEDULED`. At scheduling time ONLY the publication intent is
persisted — **recipients are NOT resolved or frozen and no outbox event exists**
(Task 011.1 §1/§16). A `SCHEDULED` publication is never visible as published
(BR-ANNOUNCEMENT-011).

Correctness is "due work" based (BR-ANNOUNCEMENT-012): `publishDueAnnouncement`
resolves recipients from the CURRENT relationships, persists the immutable
snapshot, transitions `SCHEDULED` → `PUBLISHED` and emits the event — all in
ONE transaction (Task 011.1 §7) — whenever it is called after the due time; it
never depends on a timer firing at the exact second. Concurrency is handled by
a compare-and-swap (`UPDATE ... WHERE id = ? AND status = 'SCHEDULED'`), so two
workers can never emit a duplicate event (BR-ANNOUNCEMENT-013, Task 011.1 §8).

A scheduled publication remains bound to the EXACT AnnouncementVersion that was
scheduled (Task 011.1 §5): a newer Version created before the due date never
replaces it. `publication_version` stays a per-Announcement publication
sequence and is unrelated to the Version number (Task 011.1 §6).

If a scheduled publication has ZERO eligible recipients when it becomes due,
`publishDueAnnouncement` fails with the controlled `NO_ELIGIBLE_RECIPIENTS`:
the transition, snapshot and event roll back atomically, the publication stays
`SCHEDULED` (retryable), and nothing is ever published to nobody (Task 011.1
§3). Reprocessing an already-`PUBLISHED` scheduled publication is an idempotent
no-op — it never re-resolves recipients, never changes the snapshot, and never
emits a second event (Task 011.1 §9).

A due/past `scheduled_at` on the initial request publishes immediately
(`PUBLISHED`, keeping the original `scheduled_at` — satisfying the schema
`schedule_order` CHECK). Scheduling a revision of an already-PUBLISHED
Announcement never regresses its status back to `SCHEDULED`.

## 9. Idempotency & Concurrency

- `idempotency_key` (UUID, caller-supplied) is unique in the database. A
  replay of the same logical request returns the existing publication row.
- Reusing the key for a DIFFERENT Announcement → `PUBLICATION_CONFLICT`.
- No Redis locks (ADR-015). Two concurrent identical publishes (same key)
  resolve via the idempotency unique; two concurrent same-Version publishes
  (different keys) resolve via the per-Announcement sequence unique — the loser
  surfaces a controlled `PUBLICATION_CONFLICT` and never creates a duplicate.

## 10. Controlled Failures

- `NO_VALID_TARGETS` — the Version has no targets.
- `NO_ELIGIBLE_RECIPIENTS` — targets exist but zero eligible recipients. For a
  scheduled publication this is raised at ACTUAL publication time: the
  publication stays `SCHEDULED` and retryable (Task 011.1 §3).

Both are explicit, stable `featureCode`s (422) — the system never silently
publishes to nobody and never falls back to an implicit School-wide audience
(Task 011 §16).

## 11. Rich Text

The Version `title`/`body` are stored as PLAIN TEXT (schema comment, Task 009
§5/§34). This task introduces no rich-text editor and no HTML rendering path;
any future rich-text content must be sanitized server-side before trusted
rendering (BR-ANNOUNCEMENT-003). The notification body uses only the
immutable Version title.

## 12. HTTP Surface

`POST /api/v1/announcements/:id/publish` (thin, Task 011 §4/§7)

```json
{
  "schoolId": "<uuid>",
  "announcementVersionId": "<uuid>",
  "idempotencyKey": "<uuid>",
  "scheduledAt": "<iso-8601>"   // optional
}
```

Response `201 { "data": { publicationId, schoolId, announcementId,
announcementVersionId, publicationVersion, status, scheduledAt, publishedAt,
publishedBy, idempotencyKey, eventEmitted } }`.

Errors use stable machine-readable codes (CLAUDE.md §28): generic `code` +
module `featureCode`. Unauthenticated → 401, forbidden → 403, not found →
404, validation → 400, business rule violations → 422, conflicts → 409.

## 13. Files

New:

- `lib/modules/announcements/domain/announcement-events.ts`
- `lib/modules/announcements/application/announcement-errors.ts`
- `lib/modules/announcements/application/authorization.ts`
- `lib/modules/announcements/application/publish-announcement.ts`
- `lib/modules/announcements/application/index.ts`
- `lib/modules/announcements/infrastructure/repositories/announcement-repository.ts`
- `lib/api/errors.ts` (shared parseBody / toApiErrorResponse)
- `lib/api/announcements.ts`
- `app/api/v1/announcements/[id]/publish/route.ts`

Modified:

- `lib/modules/announcements/index.ts`, `domain/index.ts` (surface the new layer)
- `lib/modules/notifications/domain/notification-vocabulary.ts`
  (`AnnouncementRevisionPublished` event support)
- `lib/modules/notifications/application/process-notification-event.ts`
  (consume both announcement events + `announcementVersionId` payload)
- `lib/api/results.ts` (delegate to shared `lib/api/errors.ts`)

No database migration was required: the Announcement schema (Task 009) already
covers versions, targets, publications, snapshots and the outbox.

## 14. Testing

`apps/web/__tests__/announcements/publish.test.ts` (with hermetic PGlite
helpers) covers the Task 011 §39 matrix: successful publish, snapshots,
outbox event emission, sequence/revision events, zero-target / zero-recipient
failures, teacher scope denial, tenant isolation, idempotent replay,
idempotency conflict, scheduling + due-work processing, concurrent publish,
and the end-to-end publish → notification flow (including historical-snapshot
stability and duplicate-event idempotency).

Task 011.1 adds the scheduled-publication recipient hardening matrix: scheduling
creates zero snapshots and zero outbox events; the T1/T2 historical scenario
(recipients resolved at ACTUAL publication time, frozen forever — including
publication-time notifications); zero recipients at due time stays `SCHEDULED`
with no event and remains retryable; concurrent due-work produces one snapshot
set / one event / one transition; and version binding to the originally
scheduled Version.

No database migration was required: the Announcement schema (Task 009) already
covers versions, targets, publications, snapshots and the outbox, and no
constraint requires snapshot rows for `SCHEDULED` publications.