# Teacher daily dashboard

This is an ordinary content extension of Madrasio's application system. `PRODUCT.md` owns product context, `DESIGN.md` owns the incumbent visual system, and `.impeccable/surfaces/teacher-dashboard.md` records this surface's direction. The approved desktop and Arabic mobile references guide Teacher content only. Shared navigation, profile, themes, authentication, and Admin/Parent dashboards remain outside this extension.

## Composition and inherited design

`apps/web/components/dashboard/teacher-daily-workspace.tsx` presents the school-local day and Teacher identity, four existing workflow links, the current/next published lesson beside attention, four overview figures, the teaching schedule beside assignment groups, and two communication feeds. The next lesson is the first ongoing session, otherwise the first upcoming session; completed-only days have a distinct completion message. No lessons has its own empty message.

The workspace reuses application cards, actions, icon tiles, fonts, semantic palette, and Light/Mist/Midnight/Dark themes. `teacher-workspace.css` confines its content rules to `.teacher-workspace`; it introduces no shared tokens. Tonal cards and thin borders retain the incumbent visual language. The local green readiness treatment has explicit light and dark theme colors; it is a Teacher status treatment rather than a new global token.

Desktop priority columns use a 1.55:1 ratio; schedule/assignment columns use 1.15:1. Both stack at 1250px. At 650px, the lesson content stacks, overview figures use two columns, and the schedule keeps a 580px minimum width inside its own horizontal scroll region. The region has a keyboard focus target and accessible name. Logical borders and spacing support RTL, directional arrows mirror, and dynamic names use bidirectional isolation. Existing application reduced-motion behavior remains inherited. This extension adds no fonts, dependencies, images, or shipped rasters.

## Data and meaning

`teacher-operational-dashboard.tsx` retains the existing bootstrap: self-scoped active Teacher profiles, active assignments for those profiles, then school-keyed academic-year/class/subject label queries. No-profile, no-assignment, loading, scope failure, and reference failure states remain distinct. Multiple linked profiles are supported. Groups preserve exact `(academicYearId, classId)` identities and independent subject rows; they do not invent one global current academic year.

The daily workspace reads `GET /api/v1/dashboard/teacher` and refreshes that query every 60 seconds or through its refresh button. Its query key includes school and user. The response contains school-local `date`, `timezone`, server `asOf`, authorized lessons, `pendingAttendance`, and `homeworkReview`. Communication queries load independently, so each feed has loading, retry, empty, and populated states.

| Display | Actual source and scope |
| --- | --- |
| Today's lessons | Existing attendance `listSessions` for the server's school-local day, backed by applicable immutable timetable publications and exact Teacher assignment scope. |
| Assigned classes | Distinct academic-year/class pairs among active assignments whose effective date range includes the response day. |
| Subjects | Distinct subject IDs among those date-effective assignments. |
| Pending attendance | Number of writable, started, available sessions whose eligible roster count exceeds its distinct recorded-student count. It measures incomplete recording, never student absence. |
| Homework to review | Distinct `SUBMITTED`/`LATE` submissions for non-archived homework: the Teacher must manage every target through active assignments, the student must be enrolled in a target class on the due date, and no submission attachment may remain `UPLOADING`. This is not a grade deadline or an evaluation count. |
| Unread attention | Existing personal persisted notification unread count; omitted when unavailable. |
| Announcements | First four results from the recipient endpoint `/api/v1/me/announcements?page=1&pageSize=4`. |
| Notifications | First four results from the existing personal notifications list. |

The server obtains roster and recorded counts from eligible date-effective enrollments and actual attendance records. No student roster is delivered to the dashboard. Active assignment groups may include future or past effective ranges; their dates remain visible, while overview counts use only currently effective assignments.

## Authorization and navigation

`apps/web/app/api/v1/dashboard/teacher/route.ts` requires current authenticated context and the `TEACHER` role. It accepts no query parameters or client scope overrides, derives school/user from verified context, and returns `Cache-Control: private, no-store` with `Vary: Cookie`, including errors. The service requires `attendance.read`, checks the active school, and requires `homework.manage` for the submission count. Existing session authorization resolves role, applicable publication, active linked Teacher profile, exact assignment/year/class/subject identity and effective dates.

Attendance permission comes only from the server session's `writable` flag. Browser lesson status selects presentation and destination; it cannot confer authority. Upcoming/unavailable lessons lead to timetable. Completed, empty-roster, fully recorded, and non-writable lessons offer attendance viewing; an incomplete writable ongoing lesson offers record/continue. A pending completed session may still appear in attention, linking into the existing authorized attendance workflow.

Lesson links carry only `date`, `publicationId`, and `lessonKey` into `/attendance`. The Teacher-only URL parser validates the date, rejects future days, validates publication identity, and bounds the lesson key. These values are navigation hints: the attendance panel selects a lesson only by finding it in the current server-authorized session list; an unmatched selection is discarded and cannot trigger a roster fetch. The existing roster/write API reauthorizes every operation. Saving, transaction locks, version conflicts, enrollment checks, audit, and dirty-change confirmation remain owned by the attendance module.

`teacher-class-card.tsx` keeps existing destinations: attendance uses year/class/day; grades use year/class/subject; homework uses year/class because its list contract has no subject filter; results use `resultType=SUBJECT` plus year/class/subject. Visible grouping and URL filters are never authorization.

## Exclusions and evidence

There are no fictional student totals, pending-grading figures, charts, absence rates, invented analytics, new permissions, schema changes, or duplicated academic write workflows. Fixture school names and numbers in captures are test data, not live school facts.

The fresh finish review in `test-results/teacher-dashboard/impeccable-review.md` records `disposition: ship` for the bounded inherited-system review. It compares type/material, preserved theme fields and shell, adapted lesson/attention composition, four truthful figures, responsive schedule, assignment work, and recipient communications. It records no material fixes. Engine detector, quality-bar card, measured comp state, and numeric scores were unavailable and are not claimed as passed gates.

`test-results/teacher-dashboard/initial-results.json` and `final-results.json` each record 24 locale/theme/device cases, 30 narrow responsive checks, and 13 states with empty failure/error arrays. Final primary Teacher captures for English desktop Light and Arabic mobile Midnight have the same SHA256 hashes as the reviewed initial captures. `regression/results.json` records four Admin/Parent baseline comparisons with zero changed pixels. `regressions.log` records 607 tests passed and 12 optional native PostgreSQL tests skipped; native test ports were unavailable. After the Teacher-only session-hint reset, `final-focused.log` records 107/107 tests passed, `handoff-final.log` records 3/3 passed, and `integration-final.log` records 1/1 passed with an explicitly verified test actor. Earlier localized-copy and test-actor typing failures were corrected in the tests. Final root lint, typecheck and production build passed (`lint-final.log`, `typecheck-final.log`, `build-final.log`). `git diff --check` passed, with only pre-existing CRLF advisories.

`auth-regression/results.json` records eight protected authentication comparisons: five have zero changed pixels; English desktop login, password and invalid-link captures differ by 10, 7 and 15 pixels respectively. The comparison review reports a maximum channel delta of 11, each below 0.0013% of the 1.2-million-pixel canvas, with no geometry change; these are bounded antialias-level differences, not an all-zero result. Authentication source hashes remain preserved. The detector attempt confirmed that the engine 0.1.5 cache was unavailable; no automated detector closure is asserted.

This document supersedes the earlier Teacher implementation description in `docs/architecture/frontend-teacher-operational-dashboard.md`, which now contradicts the daily endpoint, lesson/feed reads, metrics and current role surfaces. That older document remains unchanged because it is outside the write boundary. The authentication drift already noted in `DESIGN.md` also remains untouched. Neither is promoted into new design guidance. `DESIGN.md` and `.impeccable/design.json` are preserved unchanged because this work extends the incumbent system.
