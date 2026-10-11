# Announcements Frontend

## Boundary and routes

Task 034 replaces the `/announcements` placeholder with the staff management workspace and adds `/announcements/[id]` for one logical Announcement. The list uses the Task 024.4 optimized `latestVersion` row and never performs per-row Version requests. Detail composes the current Version, immutable Version history, exact-Version targets, publication actions, and bounded publication metadata.

Task 062 extends this workspace with correction/cancellation/rescheduling and sanitized rich HTML authoring. It also adds the separate recipient inbox at `/announcements/inbox` and exact-publication detail at `/announcements/inbox/[id]`. There is still no recipient directory, Outbox console, in-browser processor, attachment workflow, or general messaging system.

## Authorization and tenancy

`SCHOOL_ADMIN` and membership-scoped `SUPER_ADMIN` receive the current-School management experience. `TEACHER` receives the same route only for backend-authorized authored Announcements and active assignment scope. Teacher Class choices are reduced to Classes from the current User's ACTIVE assignments and the School-wide option is absent. `PARENT` has no raw management navigation or workspace; Parent and Teacher consumption uses the separate School announcements inbox with server-checked immutable recipient snapshots.

Client permission checks shape the experience only. Every API call remains protected by CurrentContext and the Announcement application authorization pipeline. Requests never submit `schoolId`, author User IDs, role, recipient IDs, snapshots, notification data, or Outbox data. Foreign identifiers map to the tenant-safe unavailable state.

## Version and content model

The Announcement is the logical lifecycle object; its plain-text title and explicitly formatted body live in an immutable `AnnouncementVersion`. Creation atomically produces a DRAFT Announcement and Version 1. Editing calls `POST /announcements/:id/versions` to create the next complete snapshot. No UI patches or deletes a historical Version, and legacy/default PLAIN_TEXT bodies remain escaped text. Explicit HTML bodies use the single shared sanitize-html allowlist both before storage and before rendering. The minimal rich editor is an HTML textarea with a sanitized preview, not a WYSIWYG editor.

The detail view presents the relationship explicitly: an Announcement has Versions, and each Publication remains tied to one exact Version. Creating a later Version never changes an earlier Publication.

## Targets and audiences

The UI uses only the committed audiences `PARENTS|TEACHERS` and target types `SCHOOL|CLASS`. Every target includes the exact Version and ACTIVE Academic Year; a Class target also includes an ACTIVE Class in that year. Multiple explicit target rows may be accumulated. The UI never resolves recipients or queries Parent/Teacher directories for recipient construction. Targets may be added or removed only on the latest never-used Version; controls disappear for archived or scheduled/published/cancelled Versions. Each correction creates a new content Version with explicitly selected targets. Cancelling an intent does not unfreeze its old content or targets.

## Publication and scheduling

Publish-now requires confirmation and calls only the dedicated publish endpoint with the exact Version and a new idempotency UUID. The server resolves current eligible recipients, rejects zero recipients with `NO_ELIGIBLE_RECIPIENTS`, atomically freezes the recipient snapshot and Outbox event with publication, and processes Notifications asynchronously.

Scheduling uses that same endpoint with an ISO-8601 `scheduledAt` instant. Task 055 interprets `datetime-local` components in the authenticated current School IANA timezone, using the shared adapter. Nonexistent and ambiguous clock times are both rejected with field feedback (`disambiguation: "reject"`); browser/server timezone is never an input to conversion. Publication, Version, and list timestamps render in the explicit School timezone with a zone label. Persisted scheduled instants remain absolute and are not rewritten by later timezone changes; due processing still compares instants. Scheduling persists intent only. Recipients are determined and frozen by the backend at actual publication time, not schedule creation time. The frontend never processes or polls due work.

Task 062 shows Reschedule and confirmation-protected Cancel only for SCHEDULED intents. Rescheduling reuses the School-time adapter and requires a future instant. Cancellation retains the row as CANCELLED without recipients or notifications. A processor that already published wins; the UI reports the server conflict and does not claim successful cancellation. Cancel all pending intents before archiving. To correct scheduled content/targets, cancel that intent, create a new Version and select targets before scheduling again.

## Publication history and integration boundary

The existing history route supplies bounded, immutable Publication metadata: publication sequence, exact Version ID/number, status, timestamps, and aggregate recipient count. Version history and publication history both paginate. The UI does not expose snapshot identities, idempotency keys, or Outbox payloads. It never calls Notification creation or Outbox APIs; the authoritative chain remains publication → recipient snapshot + Outbox atomically → asynchronous Notification processing.

## Data and cache architecture

`lib/frontend/announcements` owns DTOs, strict form schemas, API calls, School-keyed query keys, targeted invalidation, feature-code mapping, and copy. List state is URL-backed and sent to the server using only supported filters. Create invalidates lists; Version creation invalidates detail, Versions, and lists; targets invalidate exact detail/target/list resources; publish/schedule invalidate detail, list, and publication history. Query keys include current School so switching School cannot reuse prior tenant data. The recipient inbox additionally keys by current User; it pages 20 publications and provides loading, empty, denied and retry states. Detail shows exact published content/version and School-time publication date, with no staff controls. Later relationship changes do not rewrite historical access; current active identity/membership/context and a matching publication snapshot are still required.

Forms use React Hook Form and Zod with backend-aligned length, UUID, enum, target-shape, and timestamp validation. Server authorization and lifecycle errors remain authoritative and are mapped from committed feature codes.
