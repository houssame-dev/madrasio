# Homework API and Application Boundary

## Scope and architecture

Task 022 implements Homework as an internal application boundary under
`apps/web/lib/modules/homework`. Thin `/api/v1` route adapters perform strict
Zod parsing, resolve `requireCurrentContext()`, call the application service,
and map shared errors. The application service owns authorization, lifecycle,
academic-context checks, historical eligibility, and submission state. The
repository owns School-scoped Drizzle reads and writes.

No UI, schema change, migration, file foundation, notification event, or
Homework-to-Grade integration is part of this API.

## Tenant and permission boundary

Every query derives `schoolId` from the authoritative Current School Context.
Bodies reject `schoolId`, `teacherId`, role, permission, membership, Grade, and
Assessment authority fields. Foreign identifiers are absent from School-scoped
queries and therefore surface as not found or a controlled invalid-context
error without revealing another tenant.

The committed `homework.read` and `homework.manage` permissions are reused:

- `SCHOOL_ADMIN` and membership-scoped `SUPER_ADMIN` may read and manage
  current-School Homework. Because the schema requires `teacher_id` and the
  domain says Homework is created by an authorized Teacher, creation also
  requires the caller to have an ACTIVE Teacher profile with an ACTIVE matching
  assignment. No client-selected author is accepted.
- `TEACHER` reads and manages only through ACTIVE `TeacherAssignment` scope.
  Because Homework carries a Subject, the match is exact Class + Subject +
  AcademicYear. A Teacher can access their own targetless DRAFT while the
  author profile and Subject + AcademicYear assignment remain active. Every
  target must be within scope for management and publication.
- `PARENT` cannot use the broad Homework list or any administration, target,
  roster, or write endpoint. A Parent may read a non-DRAFT Homework detail and
  their actively related child's Submission only when an ACTIVE Parent profile,
  ACTIVE `ParentStudent`, and historical Homework eligibility all match.
- There is no Student login or `STUDENT` role in V1. Submission entry is an
  administrative Teacher/SchoolAdmin workflow.

Ending a TeacherAssignment removes current Teacher management access but does
not rewrite Homework, targets, or submissions.

## Routes

The plural resource spelling follows ADR-017 and the existing API convention.

- `GET|POST /api/v1/homeworks`
- `GET|PATCH /api/v1/homeworks/:id`
- `GET|POST /api/v1/homeworks/:id/targets`
- `GET|POST /api/v1/homeworks/:id/submissions`
- `GET /api/v1/homeworks/:id/students`
- `GET|PATCH /api/v1/homework-submissions/:id`
- `POST /api/v1/homework-submissions/:id/review`

There are no DELETE routes.

## Homework and target lifecycle

Homework is always created as `DRAFT`. Subject, AcademicYear, AcademicPeriod,
due date, and authoritative Teacher author are validated before insert. The due
date must be inside both the AcademicPeriod and AcademicYear. The context must
be operational: Subject active, year not closed/archived, and period not closed.

The conservative transition graph is:

`DRAFT → PUBLISHED → CLOSED → ARCHIVED`

There are no backward transitions and `ARCHIVED` is terminal. A publish requires
at least one target, and every target Class must still be active. Title,
description, due date, and target set are mutable only in `DRAFT`; after
publication they freeze to preserve what Students saw. `CLOSED` blocks new
submissions but still permits historical reads and review. `ARCHIVED` is
read-only.

`HomeworkTarget` remains Class-only and supports multiple Classes. Each Class
must be current-School, ACTIVE, and in the Homework AcademicYear. Duplicate
Homework + Class targets return `DUPLICATE_HOMEWORK_TARGET`. Target removal is
not exposed because the committed target model has no non-destructive lifecycle.

## Historical Student eligibility

`StudentEnrollment` is the sole source of Class placement. The schema has no
`published_at`, so V1 uses the Homework `due_date` as the closest committed,
stable temporal boundary: a Student is eligible when an enrollment interval
for a targeted Class includes the due date (both interval ends are inclusive).
The same rule drives submission eligibility, Parent detail access, and the
bounded Homework roster.

This is deliberately not a "current class today" check. A later transfer does
not move a target or submission and does not invalidate a Student who was in a
target Class on the due date. If a future schema adds an authoritative
publication timestamp, the product should revisit this documented fallback.

## Submission behavior

The absence of a `HomeworkSubmission` row represents `NOT_SUBMITTED`. The
`/students` read model returns `submission: null`; it never writes placeholder
rows. One logical row is preserved per Homework + Student.

Only `PUBLISHED` Homework accepts a new Submission. `studentId` is accepted for
the administrative workflow, while `submittedAt` and initial status are always
server-derived. The server compares the School's configured calendar date to
the DATE-valued due date: after the due date the status is `LATE`, otherwise
`SUBMITTED`. The client cannot submit a timestamp or status.

Review transitions are explicit:

- `SUBMITTED|LATE → REVIEWED`
- `REVIEWED → RETURNED`
- PATCHing content is a resubmission operation allowed only from `RETURNED`
  while the Homework is still `PUBLISHED`; it reuses the same row, refreshes
  the server timestamp, and derives `SUBMITTED`/`LATE` again.

Submission identity (`schoolId`, `homeworkId`, `studentId`) is immutable.
Duplicate create attempts return `DUPLICATE_HOMEWORK_SUBMISSION`.

## Lists and errors

Lists use `page=1`, `pageSize=50`, maximum `100`, SQL scope/filtering before
count, and deterministic ordering. Homework filters are status, Class,
AcademicYear, due-date range, and bounded title search. Submission filters are
status and Student. The roster is bounded and sorted by Student name/id.

Feature errors use the shared envelope and generic HTTP category plus a stable
`featureCode`, including not found, invalid context/transition, not editable,
not publishable, duplicate target/submission, Student ineligibility, and invalid
submission state. SQL constraint names and details are never returned.

## Independence and history

Creating, publishing, closing, submitting, reviewing, returning, or archiving
Homework does not create or mutate Assessment, Grade, Result, Attendance,
ParentStudent, Notification, or Outbox records. Attachments remain deferred.
No destructive delete or automatic cascading lifecycle mutation is exposed.
