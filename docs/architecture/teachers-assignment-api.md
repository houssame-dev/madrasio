# Teachers and Assignment API

> Task 017 — Application and REST API boundary for Teacher profiles and
> academic scope. This document complements the domain model, business rules,
> ADR-007, ADR-009, ADR-017, and the authentication/authorization documents.

## Boundary and authoritative School context

Every operation runs in the current School selected by Task 014. Route adapters
call `requireCurrentContext()` and derive `userId` and `schoolId` from its
authoritative result. Strict Zod bodies reject `schoolId`, role, permissions,
membership state, assignment status, and duplicated Class/Subject/year scope
fields. Application use cases run the existing authorization pipeline, while
repository reads and writes always include the current School id. Foreign
resources are hidden as not found or invalid academic context.

The implementation lives under `apps/web/lib/modules/teachers`:

- `domain/` owns strict request contracts, calendar-date validation, and the
  Teacher lifecycle graph.
- `application/` owns permission and ownership checks, User-link validation,
  assignment rules, lifecycle operations, and controlled feature errors.
- `infrastructure/repositories/` owns Drizzle queries and mutations.
- `apps/web/lib/api/teachers.ts` is the shared adapter behind thin `/api/v1`
  Route Handlers.

## Teacher profile, User, and membership

Teacher is a School-owned academic profile. It stores identity and lifecycle,
not current Class, Subject, AcademicYear, role, permissions, or assignment
arrays. TeacherAssignment is the only authoritative academic-scope source.

`userId` is optional and may be set to null. A non-null link is accepted only
when the application User is `ACTIVE` and has an `ACTIVE` membership in the
current School. The API neither creates an Auth User or membership nor changes
the membership role. Current domain rules do not require that membership role
to be `TEACHER`, so the application does not invent that compatibility rule.
SchoolMembership remains the authoritative role source.

The committed schema intentionally permits more than one Teacher profile to
reference a User in a School. No additional uniqueness rule is imposed.

## Permissions and ownership

The module reuses `teachers.read` and `teachers.manage`. Task 017 grants the
existing `teachers.read` identifier to `TEACHER`; ownership checks then restrict
that access to profiles whose `userId` is the current User.

- `SCHOOL_ADMIN` and membership-scoped `SUPER_ADMIN` can list, create, update,
  and inspect Teachers, create/end assignments, and read history.
- `TEACHER` can list/read only their own linked profile or profiles and their
  ACTIVE and ENDED assignment history. They cannot manage profiles or scope and
  cannot read another Teacher's administrative detail.
- `PARENT` has no Teacher administration or directory access.

Role alone creates no academic scope. A linked, `ACTIVE` Teacher profile plus a
matching `ACTIVE` TeacherAssignment is required. The central scope resolver now
ignores INACTIVE/ARCHIVED Teacher profiles. Their assignment rows remain
historical and unchanged.

## Routes

| Resource | Routes |
|---|---|
| Teacher | `GET/POST /api/v1/teachers`; `GET/PATCH /api/v1/teachers/:id` |
| TeacherAssignment | `GET/POST /api/v1/teachers/:id/assignments`; `POST /api/v1/teacher-assignments/:id/end` |

There are no DELETE routes and no generic TeacherAssignment PATCH. Current
assignments use the history endpoint's `status=ACTIVE` filter; no ambiguous
"latest assignment" route is needed.

## Teacher lifecycle

The conservative lifecycle graph is:

- `ACTIVE → INACTIVE`
- `INACTIVE → ACTIVE` or `ARCHIVED`
- `ARCHIVED` is terminal

Teacher status changes do not end or rewrite assignments. INACTIVE/ARCHIVED
profiles cannot receive new assignments and cannot contribute current scope,
but their assignment history remains readable to authorized callers.

Teacher code is optional and unique per School when present. Duplicate values
return `DUPLICATE_TEACHER_CODE`; multiple null codes remain valid.

## Assignment creation and lifecycle

Assignment creation accepts only `academicYearId`, `classId`, `subjectId`, and
required `effectiveFrom`. The server derives School, controls `status=ACTIVE`,
and leaves `effectiveUntil` null.

The Teacher must be ACTIVE. The Class and Subject must be ACTIVE. The
AcademicYear must be PLANNED or ACTIVE, and the Class must belong to that exact
AcademicYear in the current School. The current business rules do not add an
assignment-date-inside-year invariant, so no extra date containment rule is
invented.

The committed partial unique index allows multiple legitimate Class/Subject
scope units but only one ACTIVE row for the exact Teacher + Class + Subject +
AcademicYear identity. Concurrent duplicate creation is surfaced as
`DUPLICATE_ASSIGNMENT`, without exposing database details. ENDED historical
duplicates may coexist with a later ACTIVE assignment.

Ending is explicit and idempotent. `effectiveUntil` uses DATE semantics and
must be on or after `effectiveFrom`; the row becomes ENDED and is never deleted.
Repeated END returns the existing historical row unchanged.

No reassignment endpoint is introduced in V1. Explicit END followed by CREATE
is sufficient and keeps each scope identity historically clear. Callers that
need replacement perform those two explicit operations; the API does not
pretend they are one atomic business action or mutate an old assignment's
Teacher/Class/Subject/AcademicYear identity.

## Cross-module authorization and history

Student visibility, Grades operations, Homework management, Attendance, and
Class-scoped Announcement publishing continue to obtain Teacher scope from the
central resolver. Only ACTIVE assignments belonging to ACTIVE linked Teacher
profiles contribute. Ending an assignment affects the next authorization
decision but does not mutate Students, StudentEnrollments, Grades, Results,
Homework, announcement snapshots, notifications, or any other historical row.

TeacherAssignment is academic authorization scope, not a timetable. It carries
no weekday, lesson period, room, start time, end time, payroll, contract, or HR
meaning.

## Responses, filtering, ordering, and errors

Detail and mutation responses use `{ "data": ... }`. Lists use:

```json
{
  "data": [],
  "meta": { "page": 1, "pageSize": 50, "total": 0 }
}
```

`pageSize` defaults to 50 and is capped at 100. Teacher filters include status,
exact teacher code, bounded case-insensitive name/code search, AcademicYear,
Class, and Subject. Assignment-dimension filters use ACTIVE assignments and are
applied in SQL before pagination/counting. Assignment history supports status,
AcademicYear, Class, and Subject filters. Teacher ordering is last name, first
name, then id; assignment history orders by effective date, creation time, then
id, all deterministically.

The shared API envelope is reused. Feature codes are `TEACHER_NOT_FOUND`,
`TEACHER_NOT_ACTIVE`, `DUPLICATE_TEACHER_CODE`, `ASSIGNMENT_NOT_FOUND`,
`DUPLICATE_ASSIGNMENT`, `INVALID_ASSIGNMENT_STATE`,
`INVALID_ACADEMIC_CONTEXT`, `INVALID_USER_LINK`, and
`INVALID_TEACHER_STATUS_TRANSITION`. Raw SQL errors and constraint names are
never exposed.

## Schema boundary

Task 017 uses the committed schema and migrations unchanged. It introduces no
Teacher scope columns, timetable model, Auth onboarding, membership mutation,
RLS policy, or migration.
