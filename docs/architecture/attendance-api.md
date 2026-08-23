# Attendance API

> Task 021 — Application and REST API boundary for daily Class Attendance.

## Boundary and architecture

Attendance operations run in the authoritative current School selected by
Task 014. Route adapters call `requireCurrentContext()`, validate route/query
parameters and strict Zod bodies, and delegate to the Attendance application
service. The application owns authorization, date and lifecycle policy,
historical enrollment eligibility, and the bulk transaction. The repository
owns School-scoped Drizzle reads, SQL filters, and upserts.

The implementation lives under `apps/web/lib/modules/attendance`:

- `domain/` owns the four statuses, strict write contracts, and the existing
  pure historical-validity invariant;
- `application/` owns use cases and controlled feature errors;
- `infrastructure/repositories/` owns Drizzle persistence and read models;
- `apps/web/lib/api/attendance.ts` is the shared HTTP adapter behind thin
  `/api/v1` Route Handlers.

Bodies cannot provide `schoolId`, `academicYearId`, `classId`, `teacherId`,
role, permission, or membership authority. School comes from CurrentContext;
Class and date come from the route; AcademicYear comes from the Class. Foreign
Class and Student identifiers are hidden as not found.

## Daily identity, statuses, and corrections

The committed logical identity is:

```text
School + Class + Student + Attendance date
```

`PUT /api/v1/classes/:classId/attendance/:date` performs an atomic upsert. A
later write changes only `status`, `note`, and `updatedAt` on the existing
logical row; it never changes School, Class, Student, AcademicYear, or date and
never creates a revision/history table. Concurrent writes rely on the existing
unique constraint and converge on one row with last-committed-write behavior.

The only statuses are `PRESENT`, `ABSENT`, `LATE`, and `EXCUSED`. An optional
plain-text note is trimmed and capped at 1,000 characters. Absence of a row is
not any status: in particular, missing does not mean `PRESENT` or `ABSENT`.
There is no DELETE route.

New rows require an `ACTIVE` Class. Because the committed domain explicitly
allows Attendance corrections but has no closure/revision table, a CLOSED or
ARCHIVED Class permits corrections to existing logical rows only; it cannot
receive a new row. Corrections still require a historically valid enrollment
for the exact date.

## Date and historical enrollment policy

Attendance is an observed calendar event. V1 rejects future dates using the
server's UTC calendar day and requires the date to lie inside the start/end
dates of the Class's exact AcademicYear. The API does not accept a separate
AcademicYear identifier.

Student eligibility is based on the exact StudentEnrollment effective on the
Attendance date, never only the current ACTIVE enrollment:

```text
enrollment.schoolId = current School
AND enrollment.studentId = Student
AND enrollment.classId = Class
AND enrollment.academicYearId = Class.academicYearId
AND enrollment.effectiveFrom <= attendanceDate
AND (enrollment.effectiveUntil IS NULL
     OR enrollment.effectiveUntil >= attendanceDate)
```

Effective dates are inclusive and enrollment status is intentionally not part
of historical eligibility. Therefore an ENDED Class A enrollment remains valid
for Class A dates inside its range after a transfer, is invalid after its end,
and the new Class B enrollment becomes valid from its effective start. Student
lifecycle changes do not rewrite or invalidate already stored Attendance.

## Permissions and Teacher scope

The existing `attendance.read` and `attendance.manage` permissions are reused;
no permission or role identifiers are added.

- `SCHOOL_ADMIN`, and membership-scoped `SUPER_ADMIN` under existing semantics,
  may read/manage all valid Attendance contexts in the current School.
- `TEACHER` may read/manage a Class when an ACTIVE Teacher profile linked to the
  current User has at least one ACTIVE TeacherAssignment for that exact Class +
  AcademicYear. Subject is deliberately ignored for daily presence: one valid
  assignment in the Class is sufficient. The central authorization pipeline
  resolves this `teacherClass` requirement from TeacherAssignment; no parallel
  scope system exists. Ending the assignment or deactivating the profile removes
  access without touching historical rows.
- `PARENT` cannot use raw Attendance administration or Student-history routes.
  A future parent portal requires a dedicated relationship-scoped read model.

## Routes, reads, filtering, and bounds

| Method | Route | Contract |
|---|---|---|
| `GET` | `/api/v1/classes/:classId/attendance/:date` | Historically eligible roster plus nullable Attendance row |
| `PUT` | `/api/v1/classes/:classId/attendance/:date` | Atomic daily upsert, 1–100 unique Students |
| `GET` | `/api/v1/students/:studentId/attendance` | Paginated Attendance history |

The daily roster is derived from StudentEnrollment effective on the requested
date. Each eligible Student has `attendance: null` when no row exists; reads do
not persist default `PRESENT` rows. The roster uses `page=1`, `pageSize=50`, and
maximum `pageSize=100`, ordered by last name, first name, then Student id.

Student history supports exact `academicYearId`, `classId`, `status`,
`dateFrom`, and `dateTo` SQL filters. `dateFrom` must not exceed `dateTo`.
History uses the same pagination bounds and orders by Attendance date descending,
then id descending. Teacher filtering happens in SQL and returns only rows whose
Class + AcademicYear remains inside current active TeacherAssignment scope.

Bulk bodies contain 1–100 records and reject duplicate Student ids before the
application transaction. Every Student/date eligibility check and every upsert
runs in one transaction. One invalid row rolls back the entire batch, and the
response contains normalized persisted rows rather than echoing request data.

## Errors and cross-module behavior

Shared API envelopes and error mapping are reused. Attendance feature codes are
`ATTENDANCE_NOT_FOUND`, `INVALID_ATTENDANCE_DATE`,
`ATTENDANCE_ENTRY_NOT_ALLOWED`, and `STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE`.
Strict malformed status, UUID, date, duplicate
input, and authoritative-field failures use `VALIDATION_ERROR`. Database error
details and constraint names are never exposed.

Attendance writes mutate only `attendance_records`. They do not mutate Student,
StudentEnrollment, Class, TeacherAssignment, Grade, Result, Homework,
ParentStudent, Notification, or Outbox data. No notification/event is emitted,
and no Subject, timetable, session, completeness table, UI, RLS policy, schema
change, or migration is introduced by Task 021.
