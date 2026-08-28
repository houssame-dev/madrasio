# Frontend Teacher Operational Dashboard

## Role-aware dashboard

`/dashboard` remains the shared landing route. A current-School `TEACHER` receives the operational Teacher composition; SCHOOL_ADMIN and membership-scoped SUPER_ADMIN retain the neutral foundation dashboard. PARENT also retains the safe neutral dashboard until the dedicated Parent experience. The dashboard branch uses authoritative current context and the centralized role/permission foundation for presentation only; every destination API reauthorizes the operation.

## Bootstrap and exact assignment scope

The Teacher view calls the existing server-self-scoped `GET /api/v1/teachers` contract with `status=ACTIVE`. It sends no User or School identifier and never fetches all School Teachers to match the current User in the browser. Multiple returned linked profiles are handled by loading each profile's ACTIVE assignments through the existing bounded TeacherAssignment client.

TeacherAssignment remains the only academic authority. The dashboard requests ACTIVE assignments and preserves exact Academic Year, Class, and Subject identities. ENDED assignments never enter the primary operational view. Missing profile, no ACTIVE assignments, and transient profile/assignment failures each have distinct controlled states and never trigger a broad-data fallback.

## My Classes composition

The view groups assignments by exact `(academicYearId, classId)` for presentation, displaying the Year explicitly and retaining independent Subject rows beneath the Class. Grouping is not authorization and never turns Class membership into Subject authority. Multiple ACTIVE Academic Years remain separate; the frontend does not invent a global current Year.

Year, Class, and Subject labels reuse the existing School-keyed Academic reference caches. They are fetched in three bounded query families only after ACTIVE assignments exist. There are no per-assignment reference lookups and no Student, Gradebook, Homework, Announcement, timetable, or analytics fetches while rendering the dashboard.

## Operational deep links

- Attendance uses `/attendance?section=daily&academicYearId=...&classId=...&date=YYYY-MM-DD`. The date comes from the existing local-calendar helper, never UTC conversion, and Subject is deliberately absent because Attendance scope is Year + Class.
- Grades uses `/grades?academicYearId=...&classId=...&subjectId=...`, matching the committed Gradebook list filters. The dashboard does not fetch Gradebooks or perform Grade/Result calculations.
- Homework uses the committed Task 033 list filters: `/homework?academicYearId=...&classId=...`. The Assignment Subject stays visible on the card, but Task 033 exposes no Homework `subjectId` list filter, so the dashboard does not invent or send one.
- Announcements links to `/announcements` without unsupported Class parameters. The existing Teacher Announcement workspace and backend preserve author/assignment scope and never expose a School-wide target to Teachers.
- Notifications reuses the Task 035 School-keyed persisted unread-count query and links to the existing inbox. Failure of this supplemental count does not fail the dashboard, and there is no polling or realtime behavior.

## Counts, cache, and tenancy

The only overview counts are derived from already-loaded authoritative data: ACTIVE assignments, grouped Classes, unique assigned Subjects, and persisted unread Notifications. There are no attendance rates, score averages, rankings, completion metrics, reach statistics, scheduled lessons, or next-lesson claims.

Self-profile queries reuse Teacher query keys; Academic labels and unread count reuse their owning feature keys. The combined ACTIVE-assignment key includes current School and sorted profile IDs. Task 025 still clears the QueryClient on School switch. Requests submit no `schoolId`, `userId`, role, permission, or client scope.

## Responsive and accessibility behavior

Overview cards flow from one to four columns, Class cards stack before using two columns, and action links remain touch-sized. Headings preserve Class and Subject grouping, links have assignment-specific accessible names, counts have textual labels, statuses are visible text, and shared loading/error controls remain keyboard accessible with announced state.

## Deliberate exclusions

This composition adds no backend endpoint, schema, migration, permission, timetable, schedule, analytics, Student roster, Parent portal, realtime transport, messaging, payroll, or duplicated domain workflow. The server remains authoritative in every linked module.
