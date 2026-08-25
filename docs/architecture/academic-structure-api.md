# Academic Structure API

> Task 015 — Application and REST API boundary for the committed Academic
> Structure schema. This document complements the domain model, business rules,
> ADR-007, ADR-010, ADR-017, and the authentication/authorization documents.

## Boundary and current School

All operations are school-scoped. Route adapters call `requireCurrentContext()`
and derive `userId` and `schoolId` from its authoritative result. Request bodies
are strict Zod objects and do not accept `schoolId`, `userId`, role, permission,
or membership state. Application use cases then re-run the existing server
authorization pipeline against current database state. Repository reads and
writes always include the authoritative School id; composite foreign keys remain
defense-in-depth. A foreign-School UUID resolves as `NOT_FOUND`.

The implementation lives under `apps/web/lib/modules/academic-structure`:

- `domain/` owns request contracts and lifecycle/date invariants.
- `application/` owns authorization, relation checks, lifecycle policy, and
  controlled errors.
- `infrastructure/repositories/` owns all Drizzle access.
- `apps/web/lib/api/academic-structure.ts` is the shared HTTP adapter used by
  thin `/api/v1` Route Handlers.

## Permission boundary

Two stable permissions extend the existing centralized vocabulary:

- `academic_structure.read`: `SUPER_ADMIN`, `SCHOOL_ADMIN`, and `TEACHER` with
  a valid active membership/current School context.
- `academic_structure.manage`: `SUPER_ADMIN` and `SCHOOL_ADMIN`, still subject
  to membership/current School semantics. It is not global omnipotence.

`PARENT` receives neither raw reference-list access nor management access in V1.
Teachers cannot create or mutate structural data.

## Routes

| Resource | Routes |
|---|---|
| AcademicYear | `GET/POST /api/v1/academic-years`; `GET/PATCH /api/v1/academic-years/:id` |
| AcademicPeriod | `GET/POST /api/v1/academic-years/:academicYearId/periods`; `GET/PATCH /api/v1/academic-periods/:id` |
| Stage | `GET/POST /api/v1/stages`; `GET/PATCH /api/v1/stages/:id` |
| Level | `GET/POST /api/v1/levels`; `GET/PATCH /api/v1/levels/:id` |
| Track | `GET/POST /api/v1/tracks`; `GET/PATCH /api/v1/tracks/:id` |
| Subject | `GET/POST /api/v1/subjects`; `GET/PATCH /api/v1/subjects/:id` |
| Curriculum | `GET/POST /api/v1/curricula`; `GET/PATCH /api/v1/curricula/:id` |
| CurriculumVersion | `GET/POST /api/v1/curricula/:curriculumId/versions`; `GET/PATCH /api/v1/curriculum-versions/:id` |
| CurriculumSubject | `GET/POST /api/v1/curriculum-versions/:versionId/subjects`; `PATCH /api/v1/curriculum-subjects/:id` |
| Class | `GET/POST /api/v1/classes`; `GET/PATCH /api/v1/classes/:id` |

There are no DELETE routes.

## Lifecycle and historical safety

- AcademicYear: `PLANNED → ACTIVE → CLOSED → ARCHIVED`. Dates must form a
  valid range. A real date change is allowed only while the current status is
  `PLANNED`, before date-sensitive operational rows exist, and only if every
  existing Period remains contained. Date-sensitive rows are Enrollments,
  TeacherAssignments, AttendanceRecords, Gradebooks, Homework, and Subject,
  Period, or Annual Results. A Class by itself does not freeze Year dates
  because Class carries no calendar date. Multiple ACTIVE years are allowed
  because no approved invariant or database constraint says otherwise.
- AcademicPeriod: `PLANNED → ACTIVE → CLOSED`. Its start must be before its end,
  and both dates must remain inside its AcademicYear. A real date change is
  allowed only while the current status is `PLANNED` and before a Gradebook,
  Homework, SubjectResult, or PeriodResult references the Period. ACTIVE and
  CLOSED Period dates are immutable.
- Stage, Level, Track, Subject: `ACTIVE`/`INACTIVE` reference-data lifecycle;
  no destructive deletion.
- Curriculum: `ACTIVE ↔ INACTIVE`; either may become terminal `ARCHIVED`.
  Changing Curriculum status never changes its versions.
- CurriculumVersion: `DRAFT → ACTIVE → ARCHIVED`, or `DRAFT → ARCHIVED`.
  The committed schema uses unique `(curriculum_id, name)` as the per-Curriculum
  version identity; it has no numeric `version_number`. Only DRAFT versions may
  change their name or CurriculumSubject structure. ACTIVE/ARCHIVED versions
  remain readable and structurally immutable. The schema has no one-ACTIVE-
  version constraint, so the application does not invent one or silently
  archive another version.
- Class: `ACTIVE → CLOSED → ARCHIVED`. `academicYearId` is accepted only on
  creation and is absent from the PATCH contract. Historical enrollment or
assignment rows are never changed as a side effect.

Metadata-only PATCH operations and the existing lifecycle transitions remain
available; the date restrictions do not turn a Year or Period into a globally
immutable row. Rejected date edits never rewrite, cascade, reassign, or delete
downstream history.

## Calendar containment concurrency

Year date PATCH, Period creation, and Period PATCH share one tenant-scoped
serialization key: the owning AcademicYear row is locked inside the write
transaction before containment is checked and before the write occurs. This
prevents a Year shrink from racing a Period creation or expansion into a final
state where the Period lies outside the Year. The same lock also serializes a
Period lifecycle transition against a date edit. Locks are resolved through
`(school_id, academic_year_id)` lookup, so a foreign tenant identifier remains
`NOT_FOUND` and cannot become an authorization or lock-scope shortcut.

## Relationships and coefficients

Application checks hide invalid/foreign parents before a database foreign-key
failure: Level → Stage, CurriculumVersion → Curriculum, CurriculumSubject →
Version + Subject, and Class → AcademicYear + Level + optional Track +
CurriculumVersion. Track follows the committed schema: it is School-scoped and
does not have a Stage/Level parent.

`CurriculumSubject.coefficient` is the single source of truth. It accepts a
positive decimal compatible with `numeric(4,2)` and is returned as a decimal
string. `Subject` has no coefficient, and strict Subject input rejects one.
Duplicate `(curriculum_version_id, subject_id)` attachments return the
controlled `DUPLICATE_RESOURCE` feature code.

## Responses, filters, ordering, and errors

Detail and mutation responses use `{ "data": ... }`. Lists use:

```json
{
  "data": [],
  "meta": { "page": 1, "pageSize": 50, "total": 0 }
}
```

`pageSize` is capped at 100. Supported filters are status; Level `stageId`;
Subject bounded case-insensitive `search` over name/code; and Class
`academicYearId`, `stageId`, `levelId`, `trackId`. Periods and versions are
nested under their parent. Ordering is deterministic: explicit sequence where
present, name for reference data, and creation time for administrative version/
year lists, always with an id tie-breaker.

The shared API error envelope is reused. Feature codes introduced here are
`NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `DUPLICATE_RESOURCE`,
`INVALID_ACADEMIC_CONTEXT`, `CURRICULUM_VERSION_IMMUTABLE`,
`ACADEMIC_YEAR_DATES_IMMUTABLE`, and `ACADEMIC_PERIOD_DATES_IMMUTABLE`. SQL
constraint names and raw database errors are not exposed.
