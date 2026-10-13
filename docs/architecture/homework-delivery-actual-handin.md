# Homework delivery and actual hand-in (Task 065)

## Delivery and time authority

This implements V1-AUDIT-027 / OWNER-06 without changing the Submission lifecycle.
No row is **Not delivered**. Any row is **Delivered** plus its existing SUBMITTED,
LATE, REVIEWED or RETURNED status. Returned work explicitly requires follow-up.
There is no persisted binary delivery field and no new attempt identity.

The prior columns cannot safely represent physical time: `submitted_at` is the
latest application recording (refreshed on resubmission), `created_at` is the
first recording, and `updated_at` also changes during review. Nullable
`actual_handed_in_at` is therefore separate. Migration
`0022_homework-actual-handin-attachments` does not backfill it or reinterpret
legacy timestamps/statuses.

Create and returned-work PATCH accept optional `actualHandedInAt`:
strict real calendar date and offset-bearing ISO instant, finite and not future
relative to server recording time. Bare local timestamps, impossible dates and
year zero are invalid. A known new actual hand-in cannot precede the previous
known actual hand-in. Omitted/null on resubmission means this hand-in is unknown;
the old physical time is not reused. First recording and logical identity remain.

The server derives initial/resubmitted SUBMITTED/LATE from actual time when known,
otherwise server recording time, using the Task 055 School-local calendar date.
The entire due date is on time. The UI converts explicitly labelled School-local
wall time through the shared adapter (rejecting DST gaps/folds), never the
browser's timezone. Recording and actual time are shown separately.
No arbitrary age/earliest-date rule is invented: Homework has no authoritative
published-at instant, and paper work may predate application entry.

## Authorization and lifecycle

Existing active User/membership, current School, permission and Teacher assignment
checks remain. Staff use the targeted due-date Enrollment eligibility for the
Student, not a client-chosen owner/Class. SchoolAdmin retains existing manage
authority; Parent has only active related-child eligible reads. No Student
account, Parent write, Grade/Result/Notification change, rich text, review comment
or reviewer-display feature is introduced.

SUBMITTED/LATE → REVIEWED → RETURNED is preserved. Only RETURNED work on PUBLISHED
Homework can be resubmitted. One logical row remains. Homework closing/archiving,
submission recording/review/resubmission and upload reservation/finalization
serialize on the School-scoped Homework row. Storage I/O is outside the lock.
An UPLOADING association blocks review/return/resubmission; READY files do not.
A lifecycle close that wins during an upload prevents READY finalization.

## Private attachments

Task 063 File metadata, validators, SigV4/private R2 store, bounded streams,
safe download headers and reconciliation errors are reused. There is no generic
file association API or second bucket/credential contract.

- `GET|POST /api/v1/homework-submissions/:id/attachments`
- `GET /api/v1/homework-submissions/:id/attachments/:attachmentId/download`

Authentication/resource authorization precedes reading upload bytes or storage
access. POST uses raw bytes, MIME, encoded filename and UUID Idempotency-Key.
Client School, File/object key and association authority are not accepted.
PDF/PNG/JPEG only, up to 2 MiB each, ten upload intents per logical Submission.
The SchoolAdmin/authorized Teacher may append only while Homework is PUBLISHED
and Submission is SUBMITTED/LATE. Parents can list/download their child's READY
files only; ended relationships and unrelated UUIDs fail closed.

The new RLS-enabled `homework_submission_attachments` table uses same-School
composite Submission/File FKs, unique File binding and RESTRICT deletion. Its
`submission_recorded_at` snapshots the server recording to which upload belongs.
Files remain attached to the logical Submission across review/return/resubmission,
and are not silently rebound to the next recording. There is no remove/replace
endpoint in this scope.

Reservation, File UPLOADING and association commit together. A conditional PUT is
attempted once. Under the same Homework lock, reauthorize, recheck the recording
and lifecycle, then commit READY + attributable audit. Identical READY replay
makes no storage call/new association/audit, while still enforcing current write
authority. Changed request content/resource or non-READY replay fails closed.
Uncertain PUT preserves intent and requires operator reconciliation; no blind
retry/delete. Confirmed PUT followed by failed finalization permits compensation
only after a fresh read proves this exact File remains UPLOADING. READY or unknown
DB outcome is never deleted. Failed cleanup leaves evidence, not false success.

## Auditing and history

The strict Task 054 Homework producer records recording, resubmission, review,
return and completed attachment addition. Same transaction as the state change;
failure rolls back application success. Metadata includes the logical resource,
Student/Homework UUIDs, current/previous status and recording/actual times; no
content, filename, object key or provider payload. Unknown actual times remain
explicitly unknown. No retrospective events are fabricated.

## Recovery/security and limitations

Current inventory: 23 migrations, 43 application/RLS tables, 45 recovery tables
including durable Auth. New table enables RLS and revokes PUBLIC/anon/
authenticated/service_role table grants; no Data API/RLS-policy redesign.
Metadata restores in FK order and participates in full-row fingerprints.
**Database recovery does not include R2 bytes**; Task 063's independent object
retention/recovery requirement remains.

No malware scan/inline preview. Ten-intent lifetime cap includes rejected intents;
no automatic garbage collection or operator reconciliation UI. An interrupted
upload may block review until a separately reviewed operator reconciliation.
Historical content still follows the existing one-current-content model, not
a new attempt/content-version table. Role/relationship authority is rechecked
at operation boundaries, not protected by a new cross-module locking system.

A1 authors tests only: actual-time/lifecycle/audit tests, HTTP authority and
download protections, attachment failure/races, UI School-time/delivery tests,
fresh/populated migration replay, and full-row metadata recovery. No validation
or hosted operation was performed.
