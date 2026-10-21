# Session-based Attendance V1

## Authority and scheduled identity

Only the verified ACTIVE Teacher assigned to the exact published lesson may record
or correct its Attendance. School Admins retain school-wide read access only.
Platform authority and Parent roles never grant Attendance writes. ADR-007 and
ADR-009 remain the tenant and TeacherAssignment authorities. Route adapters use
CurrentContext; client School/User/Teacher/role identities are never accepted.

A dated session is `(School, publicationId, lessonKey, date)`. It must occur on the
snapshotted weekday inside the applicable publication range. The existing
`applicablePublications` resolver ends a predecessor before its replacement,
including empty replacements; drafts and gaps are never sessions. Current ACTIVE
Teacher/profile/assignment, exact Class/Subject/Year and assignment dates are
rechecked. School-local wall time must have reached the lesson start; ambiguous or
nonexistent DST times fail closed. There is no substitution or scheduling engine.

## API

- `GET /api/v1/attendance/sessions?date=YYYY-MM-DD`: the Teacher's authorized
  occurrences or the Admin's school-wide published sessions, with writable flags.
- `GET /api/v1/attendance/session?publicationId=...&lessonKey=...&date=...&page=...`:
  dated enrollment roster, 100 Students per page, missing records explicitly NULL.
- `PUT` on the same session path: strict atomic batch of 1–100 unique Students,
  status, optional note and required `expectedVersion` (NULL for a new row).
- Existing daily GET and Student history GET remain available under their existing
  read scope. Every legacy daily PUT now returns FORBIDDEN, including Teachers.
- Parent child-scoped history remains independently authorized by ParentStudent
  and dated enrollment. Session rows expose only Subject/time labels in addition
  to the existing safe fields, never staff IDs, internal notes or draft data.

Only PRESENT, ABSENT, LATE and EXCUSED are supported. Unknown/repeated query keys,
authority fields, duplicate Students, invalid dates and malformed bodies fail
closed. Cookie writes require an exact same Origin. All success and error
responses are private/no-store and vary by Cookie. No automatic write retries.

## Persistence, concurrency and history

Forward migration `0030_attendance-sessions` follows unchanged 0000–0029. It adds
nullable publication/lesson/session snapshot fields plus version and last actor
on `attendance_records`. Legacy daily rows retain their original Class/date,
status, note and timestamps with NULL session fields; nothing assigns them to a
lesson. Partial unique indexes preserve daily uniqueness and enforce one row per
School/publication/lesson/date/Student. A composite FK enforces the publication's
School/Class/Year and RESTRICT preserves history. No new table or Data API grant.

Writes take the same School row lock as Timetable publication, then lock/recheck
User, membership, Class, Year, Teacher/profile/assignment, Student and dated
enrollment. Exactly one eligible enrollment must cover the session date; ended
historical enrollment remains eligible through its inclusive end, irrespective
of later transfer/current placement. An inactive Class cannot receive writes.

The complete batch and append-only AttendanceRecorded/AttendanceCorrected audit
are one transaction. Differing stale versions conflict and roll back every row;
identical repeats do not change versions or timestamps. Actor, time, prior/new
status/note and session references are recorded. Published snapshots and existing
payments/Grades/Results/Notification workflows are untouched.

Recovery remains 57 application + 2 durable Auth tables. Full-row fingerprints
include new session and actor/version fields; FK-derived restore order places
publications before Attendance. Old 30-migration bundles retain their exact-chain
compatibility boundary and require their matching source. Deployment accepts
reviewed prefixes through 0030 and postchecks require all 31 migrations. Local
validation does not authorize a hosted migration or release.

Release 0030 and this application as a matched pair: the old daily writer's
four-column conflict target no longer matches the partial daily index. Do not
roll back to the old writer or remove the forward migration without a separate
compatibility/recovery review. Historical reads remain preserved.
