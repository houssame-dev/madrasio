# Announcements Frontend

## Boundary and routes

Task 034 replaces the `/announcements` placeholder with the staff management workspace and adds `/announcements/[id]` for one logical Announcement. The list uses the Task 024.4 optimized `latestVersion` row and never performs per-row Version requests. Detail composes the current Version, immutable Version history, exact-Version targets, publication actions, and bounded publication metadata.

This is not a Parent inbox, recipient directory, Notification console, Outbox console, scheduled-work processor, rich-text editor, or attachment workflow.

## Authorization and tenancy

`SCHOOL_ADMIN` and membership-scoped `SUPER_ADMIN` receive the current-School management experience. `TEACHER` receives the same route only for backend-authorized authored Announcements and active assignment scope. Teacher Class choices are reduced to Classes from the current User's ACTIVE assignments and the School-wide option is absent. `PARENT` has no raw management navigation or workspace; parent consumption is deferred to Task 037.

Client permission checks shape the experience only. Every API call remains protected by CurrentContext and the Announcement application authorization pipeline. Requests never submit `schoolId`, author User IDs, role, recipient IDs, snapshots, notification data, or Outbox data. Foreign identifiers map to the tenant-safe unavailable state.

## Version and content model

The Announcement is the logical lifecycle object; its publishable plain-text `title` and `body` live in an immutable `AnnouncementVersion`. Creation atomically produces a DRAFT Announcement and Version 1. Editing calls `POST /announcements/:id/versions` to create the next complete snapshot. No UI patches or deletes a historical Version, and content is rendered as text rather than injected HTML.

The detail view presents the relationship explicitly: an Announcement has Versions, and each Publication remains tied to one exact Version. Creating a later Version never changes an earlier Publication.

## Targets and audiences

The UI uses only the committed audiences `PARENTS|TEACHERS` and target types `SCHOOL|CLASS`. Every target includes the exact Version and ACTIVE Academic Year; a Class target also includes an ACTIVE Class in that year. Multiple explicit target rows may be accumulated. The UI never resolves recipients or queries Parent/Teacher directories for recipient construction. Targets are add-only because V1 exposes no removal endpoint, and controls disappear for archived or already scheduled/published Versions.

## Publication and scheduling

Publish-now requires confirmation and calls only the dedicated publish endpoint with the exact Version and a new idempotency UUID. The server resolves current eligible recipients, rejects zero recipients with `NO_ELIGIBLE_RECIPIENTS`, atomically freezes the recipient snapshot and Outbox event with publication, and processes Notifications asynchronously.

Scheduling uses that same endpoint with an ISO-8601 `scheduledAt` instant. A `datetime-local` value is interpreted in the device timezone and converted to an exact ISO instant; no School timezone is implied because none is modeled. Scheduling persists intent only. Recipients are determined and frozen by the backend at actual publication time, not schedule creation time. The frontend never processes or polls due work.

V1 has no schedule cancellation or rescheduling contract, so neither action is shown. A scheduled row is labeled `SCHEDULED`, never Published.

## Publication history and integration boundary

The existing history route supplies bounded, immutable Publication metadata: publication sequence, exact Version ID, status, timestamps, and aggregate recipient count. The UI does not expose snapshot identities, idempotency keys, or Outbox payloads. It never calls Notification creation or Outbox APIs; the authoritative chain remains publication → recipient snapshot + Outbox atomically → asynchronous Notification processing.

## Data and cache architecture

`lib/frontend/announcements` owns DTOs, strict form schemas, API calls, School-keyed query keys, targeted invalidation, feature-code mapping, and copy. List state is URL-backed and sent to the server using only supported filters. Create invalidates lists; Version creation invalidates detail, Versions, and lists; targets invalidate exact detail/target/list resources; publish/schedule invalidate detail, list, and publication history. Query keys include current School so switching School cannot reuse prior tenant data.

Forms use React Hook Form and Zod with backend-aligned length, UUID, enum, target-shape, and timestamp validation. Server authorization and lifecycle errors remain authoritative and are mapped from committed feature codes.
