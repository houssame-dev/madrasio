# Students and Enrollment API

> Task 016 — Application and REST API boundary for Student identity and
> year-specific Class placement. This document complements the domain model,
> business rules, ADR-007, ADR-008, ADR-017, and the authentication/authorization
> documents.

## Boundary and authoritative School context

All operations run in the current School selected by Task 014. Route adapters
call `requireCurrentContext()` and derive `userId` and `schoolId` from that
authoritative result. Strict Zod request objects reject `schoolId`, `userId`,
roles, permissions, membership state, and Student placement fields. Application
use cases re-run the existing authorization pipeline against current database
state. Repository operations always include the authoritative School id, and a
foreign-School resource is reported as not found or invalid academic context
without disclosing its tenant.

The implementation lives under `apps/web/lib/modules/students`:

- `domain/` owns strict request contracts, date handling, and Student lifecycle
  transitions.
- `application/` owns authorization, tenant and relationship checks, enrollment
  rules, transaction boundaries, and controlled feature errors.
- `infrastructure/repositories/` owns Drizzle queries and mutations.
- `apps/web/lib/api/students.ts` is the shared HTTP adapter used by thin
  `/api/v1` Route Handlers.

## Placement source of truth

`Student` stores identity and lifecycle only. It does not store Class, Level,
Track, Stage, AcademicYear, CurriculumVersion, or coefficient. PATCH input is
limited to names, optional Student code, and Student status.

`StudentEnrollment` is the only source of truth for a Student's placement. An
enrollment binds exactly one Student, AcademicYear, and Class, and the Class
must belong to that exact AcademicYear in the current School. Current placement
is deliberately queried with an explicit `academicYearId`; Student detail does
not guess across years or embed an ambiguous current Class.

Initial enrollment and transfer require an `ACTIVE` Student, an `ACTIVE` Class,
and a `PLANNED` or `ACTIVE` AcademicYear. The application does not invent a
date-inside-AcademicYear enrollment rule because the current business rules do
not approve that additional invariant. Closed or archived years cannot receive
new placements.

## Permission and read-scope policy

The module reuses the existing centralized permissions; it adds no permission
identifiers or role system.

- `students.manage`: `SCHOOL_ADMIN` (and membership-scoped `SUPER_ADMIN` under
  the existing semantics) may create and update Students, enroll, transfer, and
  end enrollments.
- `students.read`: School administrators may list/detail Students and read
  enrollment history. Teachers may list and read only Students reached through
  an `ACTIVE` TeacherAssignment for the exact Class and AcademicYear of an
  `ACTIVE` enrollment. The SQL query is scoped before pagination and counting.
- Parents receive no general Student list or enrollment-history access. A
  parent may read a related Student and that Student's explicit current-year
  placement only through an `ACTIVE` ParentStudent relationship.

Inactive users, inactive memberships, missing current School context, and
unauthenticated callers are rejected by the existing Task 014/authorization
foundation. Teachers and parents cannot perform management operations.

## Routes

| Resource | Routes |
|---|---|
| Student | `GET/POST /api/v1/students`; `GET/PATCH /api/v1/students/:id` |
| Enrollment | `GET/POST /api/v1/students/:id/enrollments`; `GET /api/v1/students/:id/enrollments/current?academicYearId=...`; `POST /api/v1/student-enrollments/:id/end` |
| Transfer | `POST /api/v1/students/:id/transfer` |

There are no DELETE routes. Enrollment history is append-preserving: enrollment
rows are ended, never reassigned to another Class or AcademicYear.

## Student lifecycle

The conservative lifecycle graph is:

- `ACTIVE → INACTIVE` or `WITHDRAWN`
- `INACTIVE → ACTIVE`, `WITHDRAWN`, or `ARCHIVED`
- `WITHDRAWN → ARCHIVED`
- `ARCHIVED` is terminal

Status changes never rewrite or automatically end enrollment, attendance,
homework, result, or assignment history. Only `ACTIVE` Students may receive a
new enrollment or transfer.

Student code is optional. When present it follows the committed per-School
unique constraint; duplicate values return `DUPLICATE_STUDENT_CODE`. Multiple
Students may have a null code.

## Enrollment, transfer, and history semantics

At most one `ACTIVE` StudentEnrollment may exist for a Student in an exact
AcademicYear, as enforced by the committed partial unique index and surfaced as
a controlled conflict.

A transfer requires an existing `ACTIVE` enrollment in the requested year and
a different target Class in that same year. In one database transaction it:

1. conditionally ends the source enrollment;
2. sets its inclusive `effectiveUntil` to the calendar day before the transfer
   `effectiveDate`; and
3. inserts the new `ACTIVE` enrollment with `effectiveFrom` equal to the
   transfer date.

The transfer date must be strictly after the source `effectiveFrom`, so the old
range cannot become empty. A conditional update plus the unique database
constraint makes competing enrollment/transfer requests converge on one active
placement. A losing request returns `ENROLLMENT_CONFLICT`, and transaction
rollback prevents a half-transfer.

Ending an enrollment is idempotent: an already-ended row is returned unchanged.
For an active row, `effectiveUntil` must be on or after `effectiveFrom`.
Historical reads use inclusive ranges:

```text
effectiveFrom <= date <= effectiveUntil
```

with a null `effectiveUntil` representing an open interval. Transfer does not
mutate Attendance, HomeworkSubmission, Result, or other historical records.

## Responses, filters, ordering, and errors

Detail and mutation responses use `{ "data": ... }`. Lists use:

```json
{
  "data": [],
  "meta": { "page": 1, "pageSize": 50, "total": 0 }
}
```

`pageSize` defaults to 50 and is capped at 100. Student lists support `status`,
exact `studentCode`, bounded case-insensitive `search` across name/code, and
exact `academicYearId`/`classId` placement filters. A `classId` filter requires
`academicYearId`. Enrollment history supports `academicYearId`. Student lists
order by last name, first name, then id; enrollment history orders by
`effectiveFrom`, creation time, then id, all deterministically.

The shared API error envelope is reused. Controlled feature codes include
`STUDENT_NOT_FOUND`, `ENROLLMENT_NOT_FOUND`, `DUPLICATE_STUDENT_CODE`,
`DUPLICATE_ENROLLMENT`, `INVALID_ACADEMIC_CONTEXT`,
`INVALID_STUDENT_STATUS_TRANSITION`, `STUDENT_NOT_ENROLLABLE`,
`SAME_CLASS_TRANSFER`, `INVALID_TRANSFER_DATE`, and `ENROLLMENT_CONFLICT`.
Database constraint names and raw SQL errors are not exposed.

## Schema boundary

Task 016 uses the committed schema and migrations unchanged. No placement
columns are added to Student, no enrollment records are collapsed into Student,
and no database trigger or RLS policy is introduced.
