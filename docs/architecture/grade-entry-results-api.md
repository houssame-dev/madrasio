# Grade Entry & Results API

Task 020 completes the server-side Grades workflow from raw Grade entry through
calculation, finalization, publication, revision publication, Outbox delivery,
and administrative Result reads. It extends the existing Grades module and
reuses the committed calculation and publication foundations.

## Security and permissions

Every HTTP route resolves `requireCurrentContext()` and derives `schoolId` from
the authoritative current School. Bodies never accept `schoolId`, Teacher or
User identity as scope evidence, roles, permissions, calculated values,
coefficients, grading rules, or publication recipients.

- SCHOOL_ADMIN reads with `grades.read`, enters/manages Grades and calculates
  aggregate Results with `grades.manage`, and finalizes/publishes with the
  existing `grades.manage` / `grades.publish` policy.
- TEACHER reads and enters Grades and calculates SubjectResults only through an
  ACTIVE Teacher profile and exact ACTIVE TeacherAssignment for Class + Subject
  + AcademicYear. Teacher finalization, publication, PeriodResult, and
  AnnualResult administration remain denied.
- PARENT has no raw Grade, Gradebook matrix, or unpublished administrative
  Result access. Parent-facing data remains the immutable published Result
  model and is not introduced as a raw-Grade API here.
- SUPER_ADMIN retains the existing membership/current-School semantics.

Foreign-School resources are never resolved through current-School queries.

## Grade entry

`PUT /api/v1/assessments/:assessmentId/grades` accepts a strict, bounded batch:

```json
{
  "grades": [
    { "studentId": "uuid", "state": "VALID", "score": "15.50" },
    { "studentId": "uuid", "state": "ABSENT", "score": null }
  ]
}
```

The maximum batch size is 100, and one Student may appear only once per batch.
All rows are validated and upserted in one transaction; one invalid row rolls
back every write from the batch. Concurrent writes rely on the committed
Assessment + Student uniqueness and PostgreSQL upsert semantics: one logical
Grade survives, with the last committed update becoming current. The schema has
no Grade version or audit-user columns, so Task 020 invents neither.

Grade state is authoritative:

- VALID requires an exact non-negative `numeric(6,2)`-compatible score no
  greater than the Assessment `maximumScore`.
- MISSING, ABSENT, and EXCUSED require `score: null`.
- Non-scored states are never converted to zero.

Grade mutation requires an OPEN Gradebook and PUBLISHED Assessment. DRAFT,
CLOSED, or ARCHIVED boundaries reject Grade mutation; existing rows remain
historical and are never deleted.

## Historical Student eligibility

Eligibility follows Assessment → Gradebook → Class + AcademicYear and the
authoritative StudentEnrollment history.

When `assessmentDate` exists, an exact-Class enrollment is eligible when:

`effectiveFrom <= assessmentDate` and
`effectiveUntil is null or effectiveUntil >= assessmentDate`.

Enrollment status is not substituted for date validity. A Student transferred
from Class A to Class B remains eligible for a Class A Assessment dated while
the Class A enrollment was effective. The Grade stays in Class A history.

For the schema-supported null Assessment date, the conservative fallback is an
existing exact School + Student + AcademicYear + Class enrollment, including a
historical ENDED row. No current-Class shortcut is used.

## Gradebook matrix

`GET /api/v1/gradebooks/:gradebookId/grades` returns the Gradebook, up to 100
deterministically ordered Assessments, and a page of academically relevant
Students with their existing Grades. Students use `page=1`, `pageSize=50`,
maximum 100. Metadata reports both Student total and Assessment total/limit.
Results are deliberately not embedded.

## Calculation and result identity

The existing fixed-point/BigInt engine is the only calculation authority. API
and application code load authoritative relational inputs and call the existing
Subject, Period, and Annual calculation functions; no formula is duplicated in
route or service code.

- SubjectResult is calculated from one exact Gradebook and therefore uses its
  exact bound GradingConfigurationVersion.
- PeriodResult aggregates distinct SubjectResults. When configured,
  coefficients come only from CurriculumSubject in the Class's historically
  bound CurriculumVersion; Assessment weight is never a subject coefficient.
- AnnualResult aggregates PeriodResults using the committed annual rules. It is
  not the latest PeriodResult and has no AcademicPeriod identity.

Non-VALID Grade semantics, required Assessments, weighting, rounding, missing
coefficients, incomplete reasons, and version agreement all remain controlled
by the existing engine/use cases. Logical Result uniqueness is preserved by
upsert. Normal recalculation cannot overwrite a FINALIZED result; only explicit
revision mode can do so.

## Result routes

Existing Task 006D routes are preserved and hardened to derive School from
CurrentContext:

- `POST /api/v1/results/subjects/calculate`
- `POST /api/v1/results/periods/calculate`
- `POST /api/v1/results/annual/calculate`
- `POST /api/v1/results/:id/finalize`
- `POST /api/v1/results/:id/publish`
- `POST /api/v1/results/:id/revise`

Administrative reads added by Task 020:

- `GET /api/v1/results/subjects`
- `GET /api/v1/results/periods`
- `GET /api/v1/results/annual`
- `GET /api/v1/results/:id?resultType=SUBJECT|PERIOD|ANNUAL`

Lists use bounded page/pageSize pagination and deterministic created-time/ID
ordering. Teacher SQL scope is applied before SubjectResult count/pagination.
Period and Annual administrative reads remain SchoolAdmin-only.

## Finalization, publication, and revision

Finalization reuses the committed `CALCULATED → FINALIZED` guard and remains
SchoolAdmin-only through `grades.manage`. Repeated finalization is a controlled
conflict. FINALIZED rows reject normal recalculation.

Publication reuses the existing transaction-aware primitive:

1. insert immutable ResultPublication snapshot;
2. resolve publication-time eligible Parent recipients;
3. persist `ResultPublished` or `ResultRevisionPublished` in `outbox_events`.

Only FINALIZED Results publish. Initial publication creates version 1. An
explicit revision authorizes and resolves a completed idempotency key before
mutation; a replay returns the same publication without recalculation,
finalization, recipient resolution, publication, or Outbox work.

For a new key, the server locks the tenant-scoped Result row and performs the
in-transaction idempotency recheck, authoritative-input recalculation with the
same historical configuration binding, normal finalization, recipient freeze,
immutable next-version publication, and Outbox insert in one transaction.
Any failure rolls back the revised Result value/state and all new publication
state. Existing database idempotency and publication-version constraints remain
authoritative for races; recovery happens only after the losing transaction has
rolled back.

Eligible automatic recipients are only ACTIVE Parent profiles connected by an
ACTIVE ParentStudent relationship, with a non-null User and ACTIVE same-School
membership at publication time. Zero recipients does not block publication.
Every publication freezes its own canonical `recipientUserIds`; relationship or
membership changes do not rewrite an old event, and a revision resolves its own
current recipient set. A zero-recipient revision still commits its publication
and `ResultRevisionPublished` event with `recipientUserIds: []`.

Routes never insert Notifications. The existing processor consumes the frozen
Outbox payload and retains PENDING / FAILED / PROCESSED and idempotent retry
semantics. No second queue, realtime path, destructive delete, migration, or UI
is introduced.
