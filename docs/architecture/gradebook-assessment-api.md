# Gradebook & Assessment API

Task 019 adds the Gradebook and Assessment application/API boundary inside the
existing Grades module. It does not implement Grade entry, score mutation,
Result workflows, or UI.

## School and permission boundary

Every route resolves `requireCurrentContext()` and derives `schoolId` from the
authoritative current School. Request bodies do not accept `schoolId`, User,
role, permission, or Teacher identity as authorization evidence. Foreign-School
detail resources resolve as not found; relationship inputs fail as controlled
invalid Gradebook context.

- `SCHOOL_ADMIN` (and membership-scoped `SUPER_ADMIN`) reads with `grades.read`
  and manages with `grades.manage`.
- `TEACHER` reads with `grades.read` and manages Gradebook/Assessment setup with
  the existing `grades.enter` capability, only when an ACTIVE Teacher profile
  has an ACTIVE TeacherAssignment for the exact Class + Subject + AcademicYear.
- `PARENT` cannot use raw Gradebook or Assessment administration APIs. Parent
  grade consumption remains a future published Result read-model concern.

Teacher-scoped list predicates are applied in SQL before count and pagination.
Ending an assignment or deactivating the Teacher profile removes access on the
next request without changing historical Gradebooks or Assessments.

## Gradebook identity and creation

A Gradebook is identified by its committed academic context:

`School + AcademicYear + AcademicPeriod + Class + Subject`

It binds one exact `GradingConfigurationVersion`; that version is historically
preserved and is deliberately not part of logical uniqueness. Creation requires:

- a PLANNED or ACTIVE AcademicYear;
- a PLANNED or ACTIVE AcademicPeriod belonging to that exact year;
- an ACTIVE Class belonging to that exact year;
- an ACTIVE same-School Subject;
- an ACTIVE GradingConfigurationVersion whose parent GradingConfiguration is
  ACTIVE.

The server sets initial status `DRAFT`. It never selects a “latest” version or
silently substitutes a newer one. The academic identity and bound version are
not accepted by PATCH. The optional presentation `name` may change only while
the Gradebook is DRAFT or OPEN.

Gradebook lifecycle is conservative and one-way:

`DRAFT → OPEN → CLOSED → ARCHIVED`

No skipped or backward transition is accepted. CLOSED and ARCHIVED Gradebooks
cannot receive Assessment structural mutations. Lifecycle updates do not
delete or mutate Assessments, Grades, Results, or publications.

## Assessment rules

Assessments are created beneath an owning Gradebook and inherit its School and
TeacherAssignment authorization scope. Creation is allowed while the Gradebook
is DRAFT or OPEN and its AcademicPeriod is not CLOSED. The server sets initial
Assessment status `DRAFT`.

The API accepts only the committed Assessment type vocabulary: `QUIZ`, `TEST`,
`EXAM`, `ORAL`, `PROJECT`, and `HOMEWORK`. `maximumScore` and `weight` use an
exact positive decimal contract compatible with `numeric(6,2)` (up to 4
integer and 2 fractional digits). Weight is assessment metadata; it is not a
`CurriculumSubject` coefficient. Duplicate Assessment titles are allowed.

When supplied, `assessmentDate` uses ISO DATE semantics and must lie inside the
owning Gradebook's AcademicPeriod, inclusive. This is the documented
application-level cross-table invariant; no trigger is added.

Assessment lifecycle is:

- `DRAFT → PUBLISHED`
- `DRAFT → ARCHIVED`
- `PUBLISHED → ARCHIVED`
- `ARCHIVED` is terminal and read-only.

A PUBLISHED Assessment freezes its title and structural grading fields
(`assessmentType`, `maximumScore`, `weight`, and `assessmentDate`). If any Grade
already exists, the calculation-relevant structural fields are immutable even
while the Assessment is DRAFT, preventing score reinterpretation. Archiving
never deletes Grades.

An Assessment whose type is `HOMEWORK` does not create or link a Homework
entity. Homework remains independent. Neither Gradebook nor Assessment copies
the authoritative `CurriculumSubject.coefficient`.

## HTTP contracts

| Method | Route |
|---|---|
| GET / POST | `/api/v1/gradebooks` |
| GET / PATCH | `/api/v1/gradebooks/:id` |
| GET / POST | `/api/v1/gradebooks/:id/assessments` |
| GET / PATCH | `/api/v1/assessments/:id` |

There are no DELETE routes. Single-resource responses use `{ data }`. Lists use
`{ data, meta: { page, pageSize, total } }`, default `page=1`, default
`pageSize=50`, maximum `pageSize=100`. Gradebooks filter by academic identity,
configuration version, and status; Assessments filter by status, type, and
bounded date range. Ordering always includes deterministic tie-breakers.

Strict Zod contracts reject unsupported or authoritative fields. Controlled
feature errors include Gradebook/Assessment not-found, duplicate Gradebook,
invalid academic context/date, invalid lifecycle transition, and non-editable
resource state. SQL constraint names are never exposed.

## Task boundary

Task 019 provides safe context objects for Task 020. It adds no Grade write,
bulk score, import, calculation, finalization, publication, notification, or
Result behavior and does not change the existing Result application workflows.
