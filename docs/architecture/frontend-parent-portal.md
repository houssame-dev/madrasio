# Frontend Parent Portal

## Role-aware information architecture

`/dashboard` remains the shared landing route. A current-School `PARENT` receives a simple Family workspace, while `TEACHER` retains the Task 036 operational dashboard and SCHOOL_ADMIN/membership-scoped SUPER_ADMIN retain the neutral foundation dashboard. `/children` is the Parent child overview, and `/children/[studentId]` is a relationship-gated child summary. The Parent navigation is limited to Dashboard, My Children, and Notifications.

Frontend presentation never grants access. Every available backend request still applies authenticated User, current School, permission, Parent profile, ParentStudent relationship, resource state, and tenant checks.

## Bootstrap, multiple profiles, and deduplication

The only child-discovery source is `GET /api/v1/me/parent-profiles`. It derives User and School on the server and returns ACTIVE self-owned Parent profiles with ACTIVE child relationships. The portal never calls the Parent directory, Student list, Parent relationship history, or any client-side `userId` lookup.

Multiple Parent profiles are accepted normally. Children are merged for presentation and deduplicated by Student ID; the frontend neither chooses a preferred Parent profile nor treats a relationship ID as authority. The same School-keyed `parentKeys.selfProfiles(schoolId)` cache is reused by Dashboard, `/children`, and child detail. The Task 025 School switch clears the entire QueryClient before the new School renders.

No active profile and active profiles with no related children are distinct empty states. A transient bootstrap failure is retryable. Unread Notification count failure remains supplemental and does not invalidate otherwise-authorized children.

## Children and route authority

Child cards display only the bootstrap DTO's name and optional Student code. `/children/[studentId]` first resolves the Student ID against the authoritative self-bootstrap collection. A guessed, foreign, ended-relationship, or otherwise unrelated ID renders the same controlled unavailable state and triggers no Student, Result, Homework, Attendance, or directory probe.

The route contains read-only Overview, explicit Academic Year selection, Academic placement, Homework, and published Result sections. It exposes no staff management actions or sensitive administrative metadata.

## Explicit Academic Year and placement

There is no global current Academic Year. The portal discovers only Years backed by this child's StudentEnrollment through `GET /api/v1/parent/children/:studentId/academic-years`; it never lists arbitrary School Years. Newest-date-first ordering is presentation ordering, not a current/default marker, and multiple ACTIVE Years are valid.

The selected context is explicit in `?academicYearId=...`. Exactly one eligible Year is preselected, and exactly one ACTIVE Year may be preselected as a documented convenience. When multiple ACTIVE Years exist the portal does not guess and requires selection. Placement then comes from `GET /api/v1/parent/children/:studentId/placement?academicYearId=...` and contains only the exact Year's ACTIVE enrollment plus safe Year, Class, Stage, Level, and optional Track labels. A Year with historical enrollment but no ACTIVE placement renders an empty state.

## Homework decision and read-only boundary

**Parent child-specific Homework list API is not exposed; Parent Homework discovery remains unavailable.** The portal does not call the broad staff `/homeworks` list, infer targets from Class, or probe known identifiers. It displays the required controlled limitation.

The existing `/homework/[id]` behavior remains unchanged: when a Parent already has a known authorized Homework URL, the backend permits non-DRAFT detail and filters Submissions to the related child. Parent target administration, roster, other Students, creation, submission writes, resubmission, review, and return controls remain unavailable.

## Published Results and separation

`GET /api/v1/parent/children/:studentId/results` requires the exact `academicYearId` and one `resultType`. It is a dedicated Parent consumption contract and does not weaken staff Result routes. Only immutable ResultPublication snapshots are visible. For each logical Result, the backend returns the highest `publicationVersion`; older revisions remain stored and are not rewritten.

Subject, Period, and Annual are requested and rendered separately. Subject rows include Subject and Period context, Period rows use authoritative PeriodResult publications, and Annual rows have no invented AcademicPeriod. The frontend does not call staff Result lists, use Gradebooks/Grades/Assessments, reconstruct Results from Notifications, calculate averages or coefficients, derive Annual from Period, or expose calculate/finalize/publish/revise/edit controls.

## Notifications and Announcements

Dashboard reuses the persisted Task 035 unread-count query and links to `/notifications`. The inbox remains the recipient-facing consumption surface, including persisted Announcement and Result Notification content. Opening historical Notification content does not re-check ParentStudent and does not fetch its source; Notification ownership remains authoritative.

The Parent portal never calls the staff Announcement list or detail routes and offers no creation, targeting, publication, or School-wide broadcast control.

## Attendance decision

**Parent Attendance read API is not exposed; Attendance is intentionally absent from the Parent portal.** Existing Attendance endpoints are staff administration contracts and explicitly deny Parent access. The portal does not reuse `/attendance` or calculate attendance summaries.

## Data, tenancy, performance, and UX

Dashboard makes two independent query families: Parent self-bootstrap and persisted unread count. `/children` reuses self-bootstrap. Child detail adds School + Student-keyed Year discovery and School + Student + Year-keyed placement and per-type Result caches. Requests send no School, Parent, User, relationship, role, or permission authority. There are no broad School Students, Parents, Teachers, Classes, Results, Homework, Announcements, Gradebook, Grade, or Attendance reads.

Child cards and sections stack on narrow screens and use larger keyboard-focusable actions. Headings preserve hierarchy, cards have Student-specific accessible names, limitations are textual, counts have labels, and status is never communicated by color alone. User-facing copy is centralized under `lib/frontend/parent-portal/copy.ts` for future locale catalogues.

## Deliberate exclusions

No new permission, schema, migration, Parent authorization model, Student login, raw Grade surface, Result mutation, Homework write, staff roster, Attendance portal, Announcement management, Notification creation, payment, timetable, transport, messaging, realtime, analytics, export, or PDF behavior is introduced. The server remains authoritative.
