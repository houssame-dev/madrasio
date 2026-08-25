# Announcements Management API

## Boundary

Task 023 extends the existing Announcements module with management use cases;
it does not replace the Task 011/011.1 publisher. HTTP adapters strictly parse
input, derive identity and School from `requireCurrentContext()`, call the
application layer, and use the shared error mapper. Application services own
authorization, version/target rules, lifecycle, and transactions. Drizzle
queries remain inside the existing Announcement repository.

## Announcement and Version

`Announcement` is the School-scoped logical object. It stores lifecycle and
author identity but no title/body. `AnnouncementVersion` is a complete plain-
text content snapshot with a per-Announcement server-allocated version number.

Creation atomically inserts a `DRAFT` Announcement and Version 1. Content is
never patched in place: every edit is `POST /announcements/:id/versions`, which
creates a new immutable snapshot. There is deliberately no Version PATCH or
DELETE route. This uniformly protects draft, scheduled, and published Version
history and makes concurrent allocation fail as a controlled conflict instead
of leaking a unique constraint.

The management lifecycle exposes archiving only. The publication engine owns
`DRAFT → SCHEDULED/PUBLISHED` and due-work `SCHEDULED → PUBLISHED` transitions.
Management may archive a DRAFT or PUBLISHED Announcement when it has no
SCHEDULED publication. `ARCHIVED` is terminal. Archiving is blocked while any
schedule exists because the schema has no cancellation state; allowing it
would leave due-work semantics ambiguous.

## Targets

Targets belong to an exact AnnouncementVersion—not to the logical
Announcement. V1 supports only:

- audience `PARENTS|TEACHERS`;
- target type `SCHOOL|CLASS`.

The target request names the exact Version. The committed schema requires an
`academicYearId` for both target types; it must identify an ACTIVE current-
School year. CLASS additionally requires an ACTIVE current-School Class in
that exact year. SCHOOL forbids `classId`.

Only the latest Version may receive targets, and only before it has any
SCHEDULED or PUBLISHED publication. There is no target DELETE endpoint. A
future revision creates a new Version and its own target set; prior Version
targets, publications, snapshots, and notifications stay unchanged.

## Authorization

The existing permissions remain sufficient:

- `announcements.read` gates management reads;
- `announcements.create` gates Announcement, Version, target, and archive
  management;
- `announcements.publish` gates the existing publish/schedule operation.

`SCHOOL_ADMIN` and membership-scoped `SUPER_ADMIN` manage all current-School
Announcements subject to lifecycle rules. A `TEACHER` must have at least one
ACTIVE TeacherAssignment, must be the Announcement author, and every target of
the managed Version must be a CLASS target covered by a current ACTIVE
Class+AcademicYear assignment. This exactly preserves Task 011's
subject-independent Announcement scope. Teachers cannot create/manage or
publish SCHOOL targets. Ending assignments or deactivating the Teacher profile
removes current management access without rewriting history.

`PARENT` is denied every management route. Parent inbox/consumer reads are not
part of Task 023.

## Publication integration

`POST /api/v1/announcements/:id/publish` delegates to the existing
`publishAnnouncement` use case. Its body contains only exact Version ID,
idempotency UUID, and optional scheduled instant. School is CurrentContext-
derived; client `schoolId`, recipients, snapshots, sequences, and outbox data
are rejected.

Immediate publication reuses the authoritative transaction: validate exact
Version/targets and scope, resolve current recipients, insert the Publication
and immutable deduplicated snapshots, emit `AnnouncementPublished` or
`AnnouncementRevisionPublished` through the Outbox, update Announcement state,
and commit atomically. It never inserts Notifications directly.

A future schedule persists only a SCHEDULED Publication intent bound to the
exact Version. It creates no recipients, snapshot, outbox event, or
notification. Due work resolves current recipients, freezes snapshots, moves
the Publication to PUBLISHED, and writes one outbox event atomically. Zero
recipients rolls back and leaves the schedule retryable. A later Version never
silently replaces scheduled Version A. Cancellation/rescheduling is not
exposed because no cancellation state exists.

Snapshot rows remain internal. Multi-path recipients are deduplicated to one
Publication+User row, and their canonical `audiences` array retains every
matched audience. Publication history returns only bounded metadata and a
recipient count—not recipient identities, snapshots, idempotency keys, or
outbox payloads.

## Routes

- `GET|POST /api/v1/announcements`
- `GET|PATCH /api/v1/announcements/:id`
- `GET|POST /api/v1/announcements/:id/versions`
- `GET|POST /api/v1/announcements/:id/targets`
- `GET /api/v1/announcements/:id/publications`
- `POST /api/v1/announcements/:id/publish` (reused and hardened)

There are no Announcement, Version, target, Publication, or snapshot DELETE
routes.

## Lists and errors

Management lists use `page=1`, `pageSize=50`, maximum 100, deterministic
ordering, and SQL tenant/scope/filtering before count and pagination. Filters
cover Announcement status, audience, target type, Class, Publication status,
created range, and bounded content search. Search/target filters may match any
historical Version while authorization always evaluates current/latest
management scope.

Pagination remains over logical Announcements. After the School-scoped page is
selected, its latest Versions are loaded in one set-based School-scoped query
using the existing highest `versionNumber` semantics. The list therefore
returns exactly one row per Announcement without a per-row Version lookup.

Responses use `{ data }` and pagination `meta`. Stable feature errors cover
not-found resources, immutable/non-editable state, duplicate target, invalid
academic context, version allocation conflict, and the existing publication
errors. SQL details and tenant existence are never exposed.

No schema, migration, UI, file handling, new audience/target type, new event,
notification policy, outbox API, or destructive delete is introduced.
