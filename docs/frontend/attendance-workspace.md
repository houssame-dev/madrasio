# Attendance workspace V1

Local implementation checkpoint: 2026-10-26. This is an ordinary Attendance content extension of the established Madrasio application. The sixteen supplied Desktop Light and Mobile Arabic Midnight HTML references govern content composition; the existing application shell, official branding, fonts, themes, role permissions and server rules take precedence. PRODUCT.md, DESIGN.md and `.impeccable/design.json` remain unchanged.

## Delivered workflows

| Role | Entry and supported work |
| --- | --- |
| Teacher | `/attendance`: School-local date, published-session cards, actual dated roster and authorized student history. |
| School Admin | `/attendance`: published-session inspection, read-only roster, separate legacy daily records and student history. |
| Parent | My Children → selected child → attendance; `/children/{studentId}?academicYearId={yearId}&section=attendance` opens focused attendance within the existing authorized child workflow. |

Teacher session cards show subject, class, published time and availability. A localized before-start label explains upcoming lessons using existing School-time conversion. It grants no authority: editable actions require Teacher role and the server's writable value, and roster controls use the roster response's authoritative writable value. The existing one-time lesson-start refresh rereads server authority. Dashboard session hints remain hints validated against the returned authorized session list.

Roster cards retain student names/codes, saved status, Unmarked, optional notes and a changed indicator. Only Present, Absent, Late and Excused are accepted. Notes are optional and retain the existing 1,000-character limit. Three compact counts describe students, saved records and unmarked records **on the current roster page**. They are not whole-session totals and do not estimate recording completeness.

The bulk action sets Present only for pristine unmarked students on the current page; it excludes saved records and any local edits. It does not save. A disclosure lists changed students and their proposed status. The explicit orange Save action sits before the rows and remains sticky below the existing topbar, including narrow layouts. Save status is announced, controls lock during submission, and validation requires a status for each changed row.

Explicit saves retain the existing atomic batch and each row's expected version. Failed and stale requests retain local edits; no automatic save or ambiguous-write retry was introduced. A conflict offers an explicitly confirmed latest-record reload. Failed reload does not clear drafts. Date/session/section/page transitions, ordinary links and browser unload retain unsaved-work guards.

School Admin has no edit, bulk or Save controls. Legacy daily records keep their Year/Class/date workflow and are visibly separate from published lessons. History retains student search/selection, Year/Class/status/date filters and pagination, with published subject/time context when present and actual historical Year/Class context. No legacy daily write path or invented session identity was added.

Parent history retains selected-child authorization, existing academic-year selection, date range, pagination, historical class and session subject/time when available. It exposes no staff notes or recording controls. The focused `section=attendance` view keeps child identity and year context while concentrating on attendance; returning to the child overview restores the existing complete child view. Overview, placement, results, tuition and homework behavior outside the focused attendance section remains part of the existing child workflow.

## Implementation and visual boundaries

Attendance source lives in `apps/web/components/attendance/`, with integration in `apps/web/components/parent/child-detail.tsx` and `child-journeys.tsx`, plus EN/FR/AR `attendanceUi` copy. Existing academic/UI controls are reused. Status and note inputs remain native controls; no dependency was introduced.

`attendance.css` owns Attendance composition. It reuses incumbent card, border, text, focus and application tokens, fonts and official theme marks. Heading, dated session rows, restrained cards, semantic status pills, changed-record treatment and historical record lists implement the references within the existing shell. The Save color is scoped to Attendance (`#fca311`, dark text), preserving global primary tokens and shared Button behavior. Existing Light/Mist/Midnight/Dark canvas and chrome backgrounds remain unchanged.

The content has a centered 1600px maximum width, modest rounded cards, three compact page counts and desktop roster columns. At 767px and below, session content wraps, headings stack, roster identity spans the row, date filters stack and Save occupies the available width. Logical spacing, bidirectional isolation of names/codes/times, visible input labels and reduced-motion rules support EN/FR LTR and AR RTL.

Accepted reference adaptations are functional date, select, search and pagination controls; current-page metrics; omitted unsupported mock completeness totals and extra Admin tab; preserved child academic-year context; and incumbent shell rather than illustrative reference chrome. Mock names, dates, counts and lessons are fixtures, never a product-data contract.

This work introduces no API, domain, schema, migration, dependency, global-token or shell change. Existing TeacherAssignment, dated StudentEnrollment, publication/lesson/date identity, School timezone/start rules, parent links, tenant isolation, Origin validation, private/no-store responses, transactional locking, version checks, idempotent behavior and audit history remain authoritative on the server. UI inspection does not replace those protections.

## Evidence and limits

Evidence is local in `test-results/attendance-v1/`. `baseline-hashes.json` records task-start preservation fingerprints; unrelated pre-existing work must not be attributed to this task.

- `references/manifest.json` records all sixteen supplied HTML references rendered. `render-references.mjs` uses scripts-disabled browser contexts and blocks non-file requests; local logo assets remain available. Reference PNGs live in `references/`.
- `comparison-captures.json` identifies exactly sixteen actual counterparts at document scroll position zero. These are `screenshots/final-{en-desktop-light,ar-mobile-midnight}-` with Teacher sessions/roster/history, School Admin sessions/roster/legacy-daily/history, and Parent parent.
- `impeccable-review.md` records the full source/render review and the subsequent **ship / VERDICT PASS on F1/F2 only**: orange Teacher Save and before-start explanation are resolved. This is a scoped finding disposition, not a new whole-surface approval or user sign-off. The optional detector engine/cache was unavailable, so no detector or numeric comparison score is claimed.
- `tests-final.log`: 112 passed / 4 optional native PostgreSQL skipped. `ui-final.log`: 93 passed after final UI fixes. These runs overlap; their counts are not unique-test totals. `connected-final.log`: 328 passed / 8 optional native PostgreSQL skipped (41 passed files / one skipped). `recording-final.log`: 15 passed, including the before-start explanatory-label assertion.
- `native-postgres.log`: 12 passed / zero skipped across Attendance and Timetable, resolving all twelve native skips from the focused and connected suites. This used PostgreSQL 17.6 in owned temporary loopback-only containers, subsequently removed; no hosted database changed.
- `journeys-results.json`: 14 fixture browser journeys / zero reported errors, including bulk/versioned recording, retained failure/conflict edits, confirmed reload, denied editing, loading/empty/error states, Parent isolation/overview return and keyboard activation/focus.
- Root lint, typecheck and production build passed in `lint-final.log`, `typecheck-final.log` and `build-final.log`.

The completed `final-results.json` records **192 cases and 72 responsive checks**, with zero reported errors, failures or sampled contrast failures. Coverage includes EN/FR/AR with RTL, desktop/mobile, all four themes, exact canvas/sidebar backgrounds and official desktop wordmarks, and 320/390/768/1024/1440px widths. Matrix checks sample composited text and field-boundary contrast, overflow, clipping and read-only role controls; they are not full accessibility acceptance.

Protected School Admin, Teacher and Parent desktop/mobile regression captures record zero changed pixels across six comparisons (`admin-regression.log`, `teacher-regression.json`, `parent-regression.json`). Eight authentication comparisons record five exact matches and three tiny desktop differences (10/7/15 pixels), matching the same pre-task deviations (`auth-regression.log`); protected sources remain preserved. No final verification run remains pending.

Useful local entry points (run from repository root with the existing local dev server available for browser fixtures):

```powershell
pnpm lint
pnpm typecheck
pnpm build
node test-results/attendance-v1/render-references.mjs
node test-results/attendance-v1/matrix.mjs
node test-results/attendance-v1/journeys.mjs
node test-results/attendance-v1/comparison.mjs
```

The browser harnesses route synthetic API fixtures and do not establish authenticated hosted acceptance. Native tests establish local database concurrency/recovery evidence only. Earlier initial/matrix-before-refinement captures and incomplete logs are historical evidence, not the final state.

Next action is user visual review of the actual implementation and sixteen counterparts. No local sign-off, staging, commit, push, PR, deployment, hosted migration, provider configuration or production/customer-data operation is implied or performed by this checkpoint.
