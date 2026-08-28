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

- Subject responses contain the published snapshot value plus Year, Period, Class, and Subject labels.
- Period responses contain the authoritative PeriodResult publication plus Year, Period, and Class.
- Annual responses contain the authoritative AnnualResult publication plus Year and Class; `academicPeriod` is null.

DTOs omit raw Grades, Assessments, Gradebooks, grading rules/configuration identifiers, publisher identity, idempotency keys, and mutation state. The routes expose GET only and cannot calculate, finalize, publish, or revise Results.

## Deliberate exclusions

Parent Homework discovery and Parent Attendance APIs remain unavailable. No schema, migration, new current-Year field, new Enrollment uniqueness rule, or duplicated publication cache is introduced.
