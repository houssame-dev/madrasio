# Frontend Notifications

## Boundary

`/notifications` is the recipient-facing inbox for the current authenticated User and current School. It uses the committed Task 024 API and the existing `notifications.read` permission. SCHOOL_ADMIN, TEACHER, PARENT, and membership-scoped SUPER_ADMIN users therefore use the same self-owned inbox contract.

The frontend never sends `schoolId`, `recipientUserId`, role, relationship, assignment, or enrollment authority. School context and recipient ownership remain server-derived. Query keys include the current School id so cached inboxes and unread counts cannot be reused across a School switch.

## Inbox and detail

The inbox uses server-side page/pageSize pagination and the exact read-status and source-type filters exposed by the API. Default ordering remains the backend's `created_at DESC, id DESC`; the client does not re-sort or load an unbounded list.

List and detail render the safe Notification DTO: id, notification type, source type/id, title, body, read timestamp, and creation timestamp. Detail/mark-one also return an optional server-authorized relative Result destination. Historical text remains the persisted snapshot. The browser does not probe source or relationship APIs to construct a link. The server independently checks current Parent/child/School/Year access before offering it; the destination API checks again on navigation. Unavailable or legacy destinations leave the message readable. No external URL is rendered and a source reference is never an authorization capability.

Task 061 new Result messages use captured Student, Subject/type, Year/Period,
value and initial/revised state. Legacy events retain their original generic
value-only body. See [Published result experience](published-result-experience.md).

## Read state and cache coherence

`readAt === null` is the only unread rule. Mark-one and mark-all send bodyless POST requests, use server timestamps, and preserve backend idempotency. Successful mutations invalidate current-School list, detail, and unread-count query families; mark-one also seeds its returned detail before revalidation. Mark-all invalidates an open detail as well as every filtered list.

The application top bar shows a supplemental persisted unread count. It uses the committed unread-count endpoint, performs no speculative increment, and fails silently so a count transport failure cannot break the authenticated shell. There is no polling, realtime subscription, or client-created Notification state.

## Deliberate omissions

V1 has no create, edit, delete, archive, mark-unread, notification preferences, Outbox operations, realtime transport, email/SMS/push controls, source-detail authorization shortcut, or global administrative inbox.
