# Parent daily dashboard

## Scope and inherited system

This is an ordinary content extension of the approved Madrasio application. `PRODUCT.md` supplies product context; `DESIGN.md` and `.impeccable/design.json` retain visual authority and are unchanged. `.impeccable/surfaces/parent-dashboard.md` records this surface's composition. The approved `C:/Users/Ultrapc/Downloads/Madrasio Parent Dashboard_ Desktop and Arabic Mobile.png` guides Parent content composition, not product data or a replacement identity.

`apps/web/components/parent/parent-dashboard.tsx` keeps the self-profile bootstrap and distinct loading, retry, no-profile and no-linked-child states. `parent-daily-workspace.tsx` provides the daily content; `parent-workspace.css` scopes its rules to `.parent-workspace`. Shared shell, profile, navigation, official branding, Admin/Teacher dashboards and authentication retain their existing behavior.

The surface inherits application cards, actions, icon tiles, native selects, self-hosted Madrasio Inter and Madrasio Arabic, semantic palette, borders and restrained depth. Chrome/canvas backgrounds remain Light `#ffffff`, Mist `#e5e5e5`, Midnight `#14213d` and Dark `#000000`. Existing colored official marks serve Light/Mist and white marks serve Midnight/Dark; assets remain unmirrored in RTL. Local blue/green status and link treatments have dark-theme variants and do not establish new global tokens. No fonts, dependencies, raster assets or shared tokens are added.

## Five-section composition and interaction

The header presents the school-local day and timezone. The content follows five sections:

1. **My Child:** linked-child identity and student code, placement, enrolled academic year and school, with the existing child-profile destination. One child needs no selector; multiple children use a labeled native select.
2. **Important to Know:** eligible homework due from today through seven days ahead, recorded absences in the seven-date trailing window, and the latest recipient announcement. Counts retain explicit meanings below.
3. **My Child's School Week:** up to four near-term homework disclosures beside today's published lessons. The timetable is a daily preview within this section, not a synthetic week aggregate.
4. **Academic Progress:** up to four persisted attendance records beside separate Subject, Period and Annual published-result previews. This is read-only publication/history access, without calculated performance analytics.
5. **School Communication:** recipient announcements and the user's personal notifications, each with independent loading, error/retry, empty and populated states. These messages are not attributed to the selected child.

Homework uses native `details`/`summary` disclosures for instructions. Desktop week/progress grids use equal columns with an 18px gap. At 1250px and below the child row can wrap and attention stacks; at 700px and below child context, week and progress stack into one column. The timetable keeps the inherited local scroll region with a keyboard target and accessible name. Dynamic identity text uses `bdi`, directional arrows mirror in RTL, and focus-visible controls use the inherited ring. Shared reduced-motion handling remains in force.

## Read contracts and truthful meanings

`GET /api/v1/parent/children/:studentId/dashboard?academicYearId=...` is the only new read endpoint. `dashboard-read-service.ts` returns `date`, `timezone`, server `asOf`, `from`, `through`, `upcomingCount`, `absenceRecords` and `homework`. School-local dates come from the server; the selected-child overview refreshes every 60 seconds.

| Display | Source and exact scope |
| --- | --- |
| Homework count and preview | Selected school/year, `PUBLISHED` only, due date from school-local today through today + 7 inclusive. Both endpoints are included; this is eight calendar dates. Enrollment must cover the due date and match a target class/year. `EXISTS` avoids multiplying homework for multiple targets. The preview is ordered by due date then ID and limited to four; the count covers all eligible rows. |
| Recorded absence count | Actual `ABSENT` attendance records from today − 6 through today inclusive, selected school/child/year, with enrollment covering the record date and class. It counts records, not distinct days or students; multiple session records can share a date. Missing records never imply absence or presence. |
| Attendance preview | Existing `/api/v1/parent/children/:studentId/attendance`, first page, with the first four returned persisted records displayed. This preview is distinct from the trailing absence count. |
| Published results | Existing child `/results` endpoint, independent `SUBJECT`, `PERIOD` and `ANNUAL` reads for the selected year, first page with two publications per type. Values and revision numbers come from immutable publications; no averages or annual results are reconstructed. |
| Today's timetable | Existing `/api/v1/timetable/published?studentId=...&date=...`. Enabled only when the selected year and placement include the overview date. The response's selected child must match. Applicable schedules match the placement class and date; lessons match weekday and sort by start. Upcoming/ongoing/completed describes server-as-of timing in the school timezone, not attendance or completion of schoolwork. |
| Announcements | Existing recipient `/api/v1/me/announcements?page=1&pageSize=4`; first item is also the school-update preview. |
| Notifications | Existing personal notification list, first four rows. No new unread or child-specific message count is invented. |

The new homework preview/count excludes `CLOSED`, archived and draft homework by requiring exactly `PUBLISHED`. It never implies submission, overdue submission, review, completion or grading state. The existing full child homework journey keeps its broader non-draft contract; the dashboard's narrower preview does not rewrite that API.

## Authorization, context and navigation

The new route requires authenticated current context, `PARENT` and verified school context. Student and year are UUIDs; its strict query accepts exactly one `academicYearId`, rejecting unknown or repeated parameters. School/user authority comes from authenticated context, never URL values. Success and errors return `Cache-Control: private, no-store` and `Vary: Cookie`.

The service calls canonical `listChildAcademicYears`, which requires `parents.read`, resolves the Parent role, and verifies an active self-owned Parent profile and active child relationship in the current school. The selected year must belong to that child's enrolled-year set. All homework/absence predicates retain school, child, year and date-effective enrollment scope. Existing placement, result, attendance and publication APIs independently authorize every read.

`resolveParentYear` accepts an explicit year only if it belongs to the returned set. Automatic selection requires exactly one `ACTIVE` year whose date range includes today. Zero or multiple such years leave the context unselected, even when there is only one historical year; there is no automatic historical-year fallback. A valid explicit historical selection remains supported. Child-bound content waits for a selected year; today's timetable additionally requires current date-effective placement.

Selected-child dashboard queries include school, user, child and year where applicable, plus result type or timetable date. Year discovery includes school/user/child; communications include school/user, because their ownership is personal. The shared bootstrap retains its existing school key and school-switch cache reset contract. Workspace and selected-child remount keys reset child/year selection when their identities change, avoiding old child content during a switch. These keys improve cache isolation; server checks remain authoritative.

Links preserve child/year in `/children/:studentId?academicYearId=...`, with `section=attendance`, `section=homework` or `#results`. The tiny `child-journeys.tsx` hint selects only a recognized attendance/homework section. Timetable links carry student/date; `timetable/publication.tsx` initializes these only for Parent, with UUID/date-shape checks. These are navigation hints; the destination APIs reauthorize context. Profile, publication, announcement-inbox and notification links retain existing routes. No dashboard write, roster, staff directory or administrative controls are introduced.

## Exclusions, review and verification limits

There is no Parent finance card, performance chart, inferred submission count, fictional metric, new permission, schema migration or duplicated write workflow. Fixtures are synthetic school data. Verification used local fixtures and PGlite; it does not establish hosted acceptance, production data correctness or a real mutation workflow.

`test-results/parent-dashboard/final-results.json` records 24 locale/theme/device cases, 30 settled narrow responsive checks and 17 states, with empty failure/error arrays. States include bootstrap/context empties, explicit/ambiguous years, placement absence, independent failures/loading, child-switch isolation, keyboard disclosure focus, timetable/attendance handoffs, school refresh and reduced motion. Final primary captures are `screenshots/final-en-desktop-light.png` and `screenshots/final-ar-mobile-midnight.png` in that evidence directory.

The initial independent review disposition was fix for the sole 320px overflow finding. `impeccable-verdict.md` closes that scored finding with `disposition: ship`; its verdict expressly covers the finding, not the entire surface. `resize-settle.json` shows that the original observation occurred during the existing shell resize transition: after settlement, EN/FR/AR each have document scroll width 320 at viewport width 320. The timetable remains locally scrollable. No Parent CSS correction or protected shell modification was needed. The Impeccable detector engine cache was unavailable; no detector score or unavailable engine gate is claimed.

`regression/results.json` records two Admin comparisons with zero changed pixels; `teacher-regression.json` records two Teacher comparisons with zero changed pixels. `auth-regression/results.json` records eight authentication comparisons: six zero, English desktop login 10 changed pixels and invalid-link 15 changed pixels. `preserved-files.json` confirms all 31 protected file hashes are unchanged; the tiny pixel differences are reported rather than called an all-zero result.

`regressions-final.log` records 545 passed, 18 failed and 12 skipped optional native PostgreSQL checks; all 18 failures were missing `useSearchParams` test mocks. `final-focused.log` records 93 passed, including all 18 resolved checks and Parent UI/new security coverage. Together the runs cover 563 unique passing checks (545 broad passes plus 18 corrected mock checks); this is not a single green broad run. Native PostgreSQL test ports were unavailable. Final root lint, typecheck and production build passed in `lint-final.log`, `typecheck-final.log` and `build-final.log`. `git diff --check` passed with CRLF advisories only.

The older `docs/architecture/frontend-parent-portal.md` still describes the former simple Family dashboard, old role surfaces/navigation and two-family dashboard reads, which conflict with this implementation. Its historical-year convenience wording must not be applied to this dashboard's stricter resolver. That older document and the pre-existing authentication drift noted in `DESIGN.md` remain unchanged because they are outside this extension's write boundary.
