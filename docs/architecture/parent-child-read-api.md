# Parent Child Academic Read API

## Scope and authority

Task 037.1 adds dedicated Parent consumption routes without changing staff Student or Result authorization. Every route resolves `requireCurrentContext()`, requires the current membership role to be `PARENT`, and verifies an ACTIVE Parent profile owned by the authenticated User plus an ACTIVE ParentStudent relationship to the exact Student. All repository predicates include the current `schoolId`; unrelated and foreign children use the same `CHILD_NOT_AVAILABLE` not-found response.

Routes never accept `schoolId`, `parentId`, `relationshipId`, User identity, role, or permission evidence.

## Academic Year discovery

`GET /api/v1/parent/children/:studentId/academic-years` returns only Academic Years joined through that child's StudentEnrollment in the current School. Both ACTIVE and ENDED enrollment history establish that the Year is child-relevant. Results are ordered by `startDate DESC`, `endDate DESC`, and ID for presentation only.

There is no global current Academic Year, no default/latest flag, and no automatic backend selection. Multiple ACTIVE Years are returned normally.

## Exact-Year placement

`GET /api/v1/parent/children/:studentId/placement?academicYearId=...` requires an enrolled child Year. It returns the ACTIVE enrollment for that exact Student + Year, or `data: null` when the child has historical enrollment in the Year but no ACTIVE placement. It does not return enrollment identity or history. The DTO contains safe enrollment dates and Year, Class, Stage, Level, and optional Track identity/labels.

## Published Result read model

`GET /api/v1/parent/children/:studentId/results` requires `academicYearId`, `resultType=SUBJECT|PERIOD|ANNUAL`, and bounded `page`/`pageSize` (default 1/50, maximum 100). `academicPeriodId` is optional for Subject/Period and invalid for Annual. Pagination is SQL-backed and ordered by publication timestamp and ID descending.

Visibility comes exclusively from immutable `ResultPublication` rows. A FINALIZED or CALCULATED Result without a publication is absent. For each logical Result, the visible snapshot is the row with the greatest `publicationVersion`; this is revision ordering for that one Result and never Academic Year selection. Historical publication rows remain immutable.

- Subject responses contain the published snapshot value plus recorded Year, Period, and Subject labels.
- Period responses contain the authoritative PeriodResult publication plus recorded Year and Period labels.
- Annual responses contain the authoritative AnnualResult publication plus recorded Year; `academicPeriod` is null.
- Legacy missing labels and all Class labels are explicitly unrecorded. Current mutable names are not substituted for publication context.

DTOs omit raw Grades, Assessments, Gradebooks, grading rules/configuration identifiers, publisher identity, idempotency keys, and mutation state. The routes expose GET only and cannot calculate, finalize, publish, or revise Results.

## Publication history (Task 061)

`GET /api/v1/parent/children/:studentId/publications/:publicationId?page=1`
returns `{ selected, data, meta }`. UUIDs and the strict positive integer `page`
are validated; page size is fixed at 20. Authentication, current PARENT role,
ACTIVE owned profile/relationship, tenant-bound publication and enrolled Year
are all required. History is limited to the selected child's same logical Result,
ordered by publication version descending. The selected exact snapshot is always
included separately, even when outside the requested history page. Raw/unpublished
Result UUIDs are not publication IDs and cannot resolve here. All responses,
including denials, are private/no-store.

Snapshot output includes recorded display context (or null), immutable value,
version/time, result/Student/Year/Period identifiers and exact rules-version ID
(not editable rules or publisher/recipient metadata). Version 1 is PUBLISHED;
later versions are REVISED. No new authorization model or duplicated history
system is introduced. Migration 0018 and legacy behavior are documented in
[Published result experience](published-result-experience.md).

## Task 060 — Attendance and Homework reads

GET `/api/v1/parent/children/:studentId/attendance` and GET
`/api/v1/parent/children/:studentId/homeworks` require the same active self-owned
Parent/relationship authorization above, plus an enrolled `academicYearId`.
Both use strict queries, default page/pageSize 1/50 (maximum size 100, page 10000),
SQL filtering/counting before pagination, deterministic date/id descending ordering,
and private/no-store responses including errors. No client School/role/User authority
is accepted. Ended relationships and inactive profiles lose access on fresh reads.

Attendance returns persisted date, status and historical Class name only; no staff
note or recorder metadata. Each row must match an enrollment interval for its exact
Class + Year on its attendance date. ENDED enrollment history remains eligible.
Optional inclusive `dateFrom`/`dateTo` are validated calendar dates, never timestamps;
no browser-timezone conversion or new "today" inference is performed. Missing rows
never imply presence/absence and reads create no rows.

Homework returns title, instructions, due date, lifecycle, Subject and Period labels.
DRAFT is excluded; PUBLISHED/CLOSED/ARCHIVED remain readable. An EXISTS query joins
the child's enrollment to a HomeworkTarget on exact School/Class/Year with inclusive
due-date bounds, preserving the existing Homework domain fallback. Multiple targets
do not duplicate results. No current-Class shortcut, roster, author identity,
submission content, attachments or staff metadata is returned. The paginated response
includes complete readable instructions for an in-page detail disclosure, avoiding
an alternate unscoped detail endpoint. No hand-in or management authority is granted.
