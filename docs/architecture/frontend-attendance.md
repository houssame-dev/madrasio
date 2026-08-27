# Frontend Attendance

## Information architecture and permissions

`/attendance` is one operational workspace with URL-backed Daily roster and Student history sections. It consumes the committed Task 021 APIs and creates no parallel Attendance model. `SCHOOL_ADMIN` and membership-scoped `SUPER_ADMIN` receive current-School management. `TEACHER` receives Daily and history workflows subject to exact server scope. `PARENT` is denied raw Attendance UI; the future child-facing portal is outside this feature.

Frontend permission checks are presentation only. Every roster, write, and history request remains subject to server authentication, active User, current School, permission, Teacher scope, tenant, historical eligibility, and Class-state checks.

## Daily context and calendar dates

Daily Attendance requires an explicit Academic Year, Class, and `YYYY-MM-DD` calendar date. There is no global current Academic Year. If exactly one Year is ACTIVE it may be preselected as a local convenience. Changing Year clears Class, and Class choices are filtered to that exact Year. Teacher choices are further narrowed using the Teacher's own ACTIVE profiles and ACTIVE assignments; the Attendance backend remains authoritative and Subject is irrelevant.

The browser preserves the date string directly and never serializes it through a UTC timestamp. It blocks dates obviously later than the browser's local calendar day and dates outside the selected Year. The backend's UTC calendar-day rule remains authoritative. School timezone is not modeled in V1, so a timezone policy is not invented here.

## Authoritative roster and historical eligibility

`GET /api/v1/classes/:classId/attendance/:date` is the only roster source. The UI never constructs the roster from `/students`. It renders every returned Student without checking current Enrollment status or placement. Historical eligibility is already resolved by the server from inclusive StudentEnrollment effective dates, so a transferred Student can remain visible in their previous Class for a historical date.

Each row shows Student identity, one of `PRESENT`, `ABSENT`, `LATE`, or `EXCUSED`, and an optional plain-text note. `attendance: null` is displayed as **Not marked** but is not persisted or treated as a fifth status. The explicit “Mark unmarked present” action changes only currently null, untouched form rows and performs no request until Save.

## Atomic entry, corrections, and unsaved state

The dense roster uses purpose-built controlled state plus Zod validation. One Save sends 1–100 unique changed Students through `PUT /api/v1/classes/:classId/attendance/:date`; no per-row writes or optimistic persistence occur. Blank notes become `null`, notes are bounded to 1,000 characters, and exact enum values are submitted.

An ACTIVE Class permits new rows and corrections. For CLOSED or ARCHIVED Classes, persisted rows remain editable for backend-approved corrections, while null rows expose no creation controls. A failed atomic batch retains every edit and never claims partial success. Dirty count, browser-unload protection, and confirmations for Year, Class, date, section, and roster-page changes prevent accidental loss. There is no autosave or browser persistence.

## Student history and caching

Student history uses backend Student search/pagination and `GET /api/v1/students/:studentId/attendance`. It supports Academic Year, Class, status, date range, and backend metadata pagination, displaying the persisted date, historical Class, Year, status, and note. Teacher history is available because the backend applies ACTIVE Teacher profile and exact Class+AcademicYear assignment scope in SQL. Parents never fetch it.

Attendance query keys include current School and exact Class/date/page or Student/filter context. Successful saves invalidate the exact daily roster and affected Student history prefixes only. The Task 025 School switch still clears the entire QueryClient, preventing prior-School reuse.

## Boundaries, responsive behavior, and accessibility

Attendance writes call only the Attendance endpoint. They create no Grade, Result, Homework, Notification, or Outbox request, and the UI calculates no percentages, rates, rankings, or trends. No backend, schema, migration, event, timezone, export, realtime, or Parent portal work is included.

The roster and history use semantic tables inside horizontal overflow containers, with a sticky Student row-header column for dense screens. Controls carry Student-specific accessible labels, status is always textual, feedback uses status/alert semantics, and all inputs and actions are keyboard operable. The server remains authoritative for all domain decisions.
