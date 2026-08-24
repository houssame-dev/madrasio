# Notifications API

## Boundary

The persisted `notifications` row is the inbox source of truth (ADR-013).
Task 024 adds a read-state API over that existing foundation; it does not
create Notifications or change the Task 010/010.1 processor and Task 013
Outbox operations.

HTTP adapters strictly validate route/query input, resolve
`requireCurrentContext()`, call the Notifications application layer, and use
the shared error mapper. Application services enforce the existing
`notifications.read` permission plus self ownership. Drizzle filtering and
conditional updates remain in the Notifications repository.

## Ownership and School context

Every read and write is scoped by both authoritative values:

```text
school_id = CurrentContext.schoolId
recipient_user_id = CurrentContext.userId
```

The client cannot select either value. SCHOOL_ADMIN, TEACHER, PARENT, and a
membership-scoped SUPER_ADMIN all see only their own inbox in the current
School. A User with Notifications in two Schools sees only the selected
current School. Foreign-School and other-recipient identifiers resolve as
`NOTIFICATION_NOT_FOUND` without revealing that the row exists.

The canonical authentication pipeline still runs first. An inactive User or
inactive/missing current-School membership cannot access historical
Notifications until they again have a valid current context.

## Routes

- `GET /api/v1/notifications`
- `GET /api/v1/notifications/unread-count`
- `GET /api/v1/notifications/:id`
- `POST /api/v1/notifications/:id/read`
- `POST /api/v1/notifications/read-all`

There is no Notification create, delete, archive, or mark-unread endpoint.
The two POST actions accept no request body; read timestamps and ownership are
always server-derived. GET detail is read-only and never auto-marks the row.

## Inbox contract

Inbox output uses `{ data, meta: { page, pageSize, total } }`, with page 1,
page size 50, and maximum 100. Filtering happens in SQL before count and
pagination. Default ordering is `created_at DESC, id DESC`.

Supported filters are:

- `status=ALL|READ|UNREAD` (`ALL` by default);
- exact committed `notificationType` values
  `ANNOUNCEMENT_PUBLISHED|RESULT_PUBLISHED|RESULT_REVISED`;
- `sourceType=ANNOUNCEMENT_PUBLICATION|RESULT_PUBLICATION`;
- optional `sourceId`;
- offset-aware `createdFrom` and `createdTo`, with `createdFrom <= createdTo`.

The public DTO contains only `id`, `notificationType`, `sourceType`,
`sourceId`, `title`, `body`, `readAt`, and `createdAt`. It omits `schoolId`,
`recipientUserId`, `sourceEventId`, `updatedAt`, Outbox payload/status/errors,
and all database metadata.

## Read state and concurrency

`read_at IS NULL` means unread. Mark-one uses a conditional update on an owned
row where `read_at IS NULL`; a concurrent or repeated request then reads and
returns the existing row. The first server timestamp is therefore stable.

Mark-all conditionally updates only unread rows for the current User and
School using one server timestamp. It does not change already-read timestamps.
A replay with no remaining unread rows succeeds with `updatedCount: 0`.
Unread count applies the identical User+School boundary and `read_at IS NULL`.

## Historical and source boundaries

Inbox reads never re-run ParentStudent, Announcement target, TeacherAssignment,
StudentEnrollment, or Result recipient resolution. Publication-time recipient
resolution already decided delivery; the persisted Notification remains
historically stable while the User retains a valid current-School context.

`sourceType` and `sourceId` are references, not capabilities. Owning a
Notification never bypasses the Announcement or Result module's authorization
when the client later requests the source resource.

Read actions mutate only `notifications.read_at`. They do not change source
publications, recipient snapshots, results, relationships, assignments,
enrollments, Outbox rows, or processor state. FAILED Outbox events without a
persisted Notification never appear in the inbox, and zero-recipient events
naturally produce no inbox rows.

V1 intentionally has no realtime transport, WebSocket/polling infrastructure,
email/SMS/push delivery, notification preferences, or client-facing Outbox
operations in this API.
