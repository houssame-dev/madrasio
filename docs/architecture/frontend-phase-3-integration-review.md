# Phase 3 Frontend Integration Review

## Review scope

Task 039 reviewed the integrated Phase 3 frontend delivered by Tasks 025–038. The review covered the application bootstrap and shell, authentication transitions, current-School switching, centralized navigation, every primary frontend route, feature query keys and mutation invalidation, role and relationship scope, cross-feature links, forms, lifecycle actions, responsive layout, accessibility, and frontend/API DTO alignment.

The committed architecture and domain documents remained authoritative. This review adds no product module, schema concept, migration, UI feature, or alternate authorization mechanism.

## Routes reviewed

The following routes were traced from their App Router entry through their workspace role gate, enabled queries, loading/error/empty states, mutation behavior, and current-School cache keys:

- `/login`, `/dashboard`, and `/academic`
- `/students` and `/students/[id]`
- `/children` and `/children/[studentId]`
- `/teachers` and `/teachers/[id]`
- `/parents` and `/parents/[id]`
- `/grades`, `/grades/[id]`, and `/grades/results`
- `/attendance`
- `/homework` and `/homework/[id]`
- `/announcements` and `/announcements/[id]`
- `/notifications`

All `(app)` routes remain below `AppBootstrap`. Direct visits cannot render feature content before `/me` resolves. Feature workspaces disable queries before returning the shared denied state when the current role is not eligible. Foreign or out-of-scope detail identifiers rely on the server and render controlled unavailable states without tenant disclosure.

## Role matrix reviewed

| Role | Integrated frontend behavior |
| --- | --- |
| `SUPER_ADMIN` | Uses the same active-membership and current-School boundary as every other role; current-School administrative controls follow the centralized permission vocabulary. |
| `SCHOOL_ADMIN` | Retains current-School management surfaces for academic structure, people, grading, attendance, homework, announcements, and recipient-owned notifications. |
| `TEACHER` | Receives read-only academic structure, backend-scoped Students and self Teacher profile, exact assignment-scoped grading/attendance/homework/announcement operations, the operational dashboard, and notifications. Parent administration and aggregate Result administration remain unavailable. |
| `PARENT` | Navigation remains Dashboard, My Children, and Notifications. Child discovery uses `/me/parent-profiles`; placement and published Results use child-authorized read models. Staff lists and raw grading/attendance/announcement administration remain unavailable. |

Frontend checks remain presentation policy only. Server authentication, active User, membership, permission, TeacherAssignment, ParentStudent, ownership, lifecycle, and tenant checks remain authoritative.

## Authentication and session findings

Login clears the complete QueryClient only after Supabase sign-in succeeds, then replaces the route with `/dashboard` and refreshes the App Router. The canonical POST logout route signs out on the server and clears the current-School selector; the client clears the complete QueryClient only after success, replaces with `/login`, and refreshes. Failed login/logout preserves the current screen and meaningful error state.

An expired `/me` response clears the complete cache, shows a non-disclosing transition state, replaces with `/login`, and refreshes without flashing protected children. Inactive and unprovisioned Users, no memberships, current-School selection, transient bootstrap failure, and unauthenticated state remain distinct.

## Current-School switching findings

The successful sequence remains:

1. POST `/api/v1/me/current-school` with a School selected only from authoritative `/me` memberships.
2. Clear the complete QueryClient after server success.
3. Fetch `/me` again from the authoritative server.
4. Replace the route with `/dashboard` and refresh.

A failed switch does not clear the old cache, replace the old context, or navigate. All reviewed feature keys include current `schoolId`, and the full successful clear covers Students, Teachers, Parents, Academic Structure, Grades, Attendance, Homework, Announcements, Notifications, Teacher dashboard scope, and Parent child read models.

## Cache and query findings

List keys include the supported filter/pagination object; detail keys include resource identity; nested keys include their owning identity; every school-scoped family includes current `schoolId`. Mutation invalidation targets the affected list/detail/nested prefixes. Whole-cache clearing remains restricted to identity boundaries: successful login, successful logout, successful School switch, and `/me` 401 recovery.

One HIGH cache defect was fixed. The Gradebook persisted matrix requested 20 Students per page while the Grade entry editor requested 100, but both used the same key. With the shared stale time, the editor could reuse the 20-row preview and omit eligible Students. The exact matrix key now includes both `page` and `pageSize`; prefix invalidation after Grade saves still covers every matrix variant.

## Teacher scope findings

Teacher list reads remain server-scoped and never load a School-wide result set for client filtering. Attendance derives eligible Classes from active TeacherAssignments using Year + Class scope, without adding a Subject requirement. Homework authoring/targeting uses Year + Class + Subject assignment scope. Teacher Announcement target options remain assignment-Class scoped and do not offer `SCHOOL` targets.

One HIGH authorization-UX inconsistency was fixed in Gradebook creation. The server already enforced exact Year + Class + Subject TeacherAssignment scope, but the form offered all School reference options and relied on a rejection. The frontend now composes Teacher creation choices from the authenticated User's ACTIVE Teacher profiles and ACTIVE TeacherAssignments. A Teacher without active scope receives no create action; Year limits Class, Class limits Subject, and parent changes clear stale dependent selections. No User id is submitted as authority.

Teacher Result UX remains Subject-only for calculation and omits Period/Annual calculation, finalization, publication, and revision controls. Every operation remains server-authorized.

## Parent scope findings

Parent bootstrap calls only `/api/v1/me/parent-profiles`. Child routes first prove the requested child exists in that relationship-backed response, then enable only child Academic Year, placement, and publication-backed Result queries. A foreign or ended child relationship produces the same unavailable experience as a missing child. The Parent frontend does not call raw Grade/Gradebook, staff Attendance, broad Homework, staff Announcement, or School-wide Student/Parent APIs.

The safe parent Homework detail remains reachable only when an authorized source supplies a known Homework id; the documented absence of a Parent Homework discovery/list API is unchanged.

## Navigation and deep-link findings

One centralized navigation configuration owns labels, destinations, permissions, roles, active-state behavior, and desktop/mobile parity. No dead primary route or unsupported Parent entry was found. Notifications remain visible to every recipient role and a failed unread-count query does not block the shell.

Teacher dashboard deep links use only committed parameters:

- Attendance: `section=daily`, `academicYearId`, `classId`, and `date`
- Grades: `academicYearId`, `classId`, and `subjectId`
- Homework: `academicYearId` and `classId`; no unsupported Subject filter
- Announcements: no invented filter

Year changes clear dependent Period/Class state where required. Gradebook Teacher creation now also clears Subject when Year or Class changes. Parent `academicYearId` is accepted only when present in the child's authorized Academic Year response.

## Domain-boundary findings

No frontend Homework flow calls Gradebook, Grade, or Result operations. Attendance does not write Grades, Results, Homework, Notifications, or Outbox state. Announcement UI submits content, targets, and explicit publication actions but does not resolve recipients or create Notifications/Outbox events. Result values and coefficients are displayed as server DTO strings; the browser does not calculate Subject, Period, or Annual averages. Notification lists and details use notification DTOs directly and perform no per-notification source fetch or historical reauthorization.

No `dangerouslySetInnerHTML`, browser auth/session storage, GET logout, open redirect, client Notification creation, or raw database error rendering was found. Announcement and Homework bodies remain plain text.

## N+1 and performance findings

The Teacher dashboard uses bounded query families: self Teacher profiles, their assignment pages, and shared School reference selectors. Parent child bootstrap is a single relationship-backed request. Notification rows are DTO-only. Announcement lists retain the set-based `latestVersion` contract and detail history uses bounded page requests rather than per-row Version fetches.

Parent administrator relationship history still resolves Student identity only for the visible page with tenant-safe Student detail requests. This is the explicitly documented limitation of the committed relationship DTO, which exposes `studentId` but not an embedded Student summary. It was not changed because Task 039 does not expand backend contracts; the Parent directory and Parent portal do not use this pattern.

## Date, decimal, and lifecycle findings

Fixed-point assessment, Grade, Result, and coefficient values remain strings. Grade validation compares scaled decimal strings and does not perform result arithmetic. Attendance and Homework calendar values remain `YYYY-MM-DD` strings without timezone conversion. Announcement `datetime-local` values become explicit ISO instants using the device timezone, and the UI continues to disclose that the School timezone is not modeled.

The reviewed lifecycle actions match the committed graphs: Gradebook `DRAFT -> OPEN -> CLOSED -> ARCHIVED`; Assessment `DRAFT -> PUBLISHED/ARCHIVED` and `PUBLISHED -> ARCHIVED`; Homework `DRAFT -> PUBLISHED -> CLOSED -> ARCHIVED`; immutable Announcement versions/publications; and Result calculate -> finalize -> publish with revision through the single revise operation.

## Responsive findings

The public login and unauthenticated protected-route transition were rendered at 375 px, 768 px, and desktop widths with no document overflow. Dense feature tables and Grade/Attendance matrices retain semantic tables inside horizontal scroll containers, while filters, cards, forms, and detail grids collapse at their documented breakpoints.

One MEDIUM mobile shell defect was fixed. A multi-School selector plus full text logout control could overrun the 375 px topbar. The selector now has a bounded mobile width and the shell uses an accessible icon-only logout control at all widths, preserving its full accessible name and pending state.

Authenticated feature composition was additionally verified through component tests because no test-account credentials are stored in the repository.

## Accessibility findings

Primary pages use one visible level-one heading, nested sections use labeled headings, tables use column headers (and row headers in the Grade matrix), statuses have text, form controls have labels, mutation errors use alert semantics, and success/loading feedback uses status semantics. Shared dialogs trap focus, handle Escape, restore trigger focus, and scroll within the viewport.

One MEDIUM keyboard defect was fixed in the mobile navigation dialog. Escape and initial/restored focus already worked, but Tab could leave the modal and reach background content. Tab and Shift+Tab now wrap across the dialog's focusable controls. A focused regression covers initial focus, both wrap directions, Escape close, and focus restoration.

## API contract findings

Frontend DTOs and requests match the committed REST envelopes, pagination metadata, field names, enums, lifecycle actions, and feature error codes. School context is absent from domain create/update payloads. Identifiers such as Student, Parent, Teacher, Class, Subject, Version, Assessment, or Result ids are sent only where they identify the resource required by that endpoint; role and permission are never submitted as authority.

The reusable current-Teacher assignment composition was consolidated in the Teachers frontend API helper. It uses the existing server-scoped Teacher list and assignment contracts, filters the already-authorized profiles against `/me` User identity in memory, and sends no `userId` query/body authority.

## Defects fixed

| Severity | Finding | Resolution |
| --- | --- | --- |
| HIGH | Grade preview and editor cache collision across page sizes could omit Students from Grade entry. | Added `pageSize` to the exact Grade matrix key and a cache-partition regression. |
| HIGH | Teacher Gradebook creation offered out-of-assignment Year/Class/Subject combinations. | Composed exact active assignment options, hid creation without scope, and cleared dependent selections. |
| MEDIUM | Multi-School mobile topbar could overflow at the required mobile width. | Bounded the selector and made shell logout compact while preserving its accessible name. |
| MEDIUM | Mobile navigation dialog allowed keyboard focus to escape into the page. | Added Tab/Shift+Tab containment with Escape close and focus restoration coverage. |

No CRITICAL or LOW defect required a code change.

## Intentional V1 limitations retained

- There is no global current Academic Year; academic context remains explicit.
- Parent Attendance and Parent Homework discovery/list APIs are not exposed.
- Homework historical eligibility continues to use `dueDate` because `publishedAt` is not modeled.
- School timezone is not modeled; scheduled Announcement input uses device-local time converted to an ISO instant.
- Announcement schedule cancel/reschedule and expanded publication-history management remain unavailable.
- Notifications are persisted/polled; realtime delivery is not part of V1.
- Homework attachments and rich text are not part of V1.
- Parent relationship administrator history uses visible-row Student identity queries because the committed DTO contains only Student ids.
- No timetable, fake analytics, Student login, or Student portal was introduced.

## Unresolved issues and readiness conclusion

No unresolved security, authorization, tenant-isolation, domain-integrity, or core-workflow blocker was found. No backend route, schema, migration, RLS policy, or functional-module count changed.

Subject to the repository-wide verification recorded with Task 039, Phase 3 is ready to close as the coherent V1 frontend foundation.
