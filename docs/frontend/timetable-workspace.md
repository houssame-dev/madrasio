# Timetable V1 workspace — local implementation handoff

Recorded 2026-10-25. This is an extension of the established Madrasio application world at `/timetable`. The approved sixteen HTML references govern timetable content; the existing shell, official marks, self-hosted fonts, application tokens, authorization and historical rules take precedence. `PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` were preserved rather than regenerated. User visual review and approval remain required.

## Implementation and ownership

| Source | Responsibility |
| --- | --- |
| `apps/web/components/timetable/workspace.tsx` | Five School Admin destinations; configuration, rooms and requirements editors; academic-year context |
| `apps/web/components/timetable/builder.tsx` | Shared week/day lesson rendering and actions; explicit draft save; existing eligibility/conflict/load feedback |
| `apps/web/components/timetable/publication.tsx` | Published reads, history, role-specific filters and explicit publication confirmation |
| `apps/web/components/timetable/timetable.css` | Scoped timetable composition, responsive week/day presentation and sticky draft controls |

Changed timetable labels are supplied through EN/FR/AR localization. Existing shared `Button`, academic `Field` and `Modal` components remain the interaction primitives. There are no new APIs, schema fields, migrations or dependencies, and no changes to domain/application services. Academic Planning, Tuition, authentication, dashboards, shared application shell and invitation work retain their separate scope.

## Five Admin areas

- **Teaching week:** selected-day editor for working days and lesson/break intervals, scope selection and effective Class configuration. The existing Level → Stage → School precedence, inheritance, revisions and closed/archived context restrictions remain authoritative.
- **Rooms:** responsive list plus the existing inline create/edit form, active/inactive lifecycle and revision feedback. Name search and active-status filtering operate locally over the returned room collection; they introduce no search endpoint. `ROOM` and `LAB` are existing modeled kinds. Capacity and additional categories are unsupported.
- **Teaching requirements:** Class context, Curriculum Version subjects, eligible TeacherAssignments, required lessons, duration, optional room, status and revision appear alongside editing controls. Requirements grant no teacher permissions.
- **Builder:** Academic Year sits beside Period and Class. Desktop presents a weekly interval table; below 768px, configured-day navigation exposes one day from the same table and uses the same add/edit/move/remove handlers. Break rows come from the pinned draft configuration. The existing lesson modal moves a lesson by changing its eligible slot. Save/Reload controls stick below the unchanged navbar on mobile and desktop.
- **Published:** Class/Teacher views, existing date/day/Today controls and immutable revision history remain explicit. Admin read grids use actual published lesson times. Publication snapshots lack break intervals: do not merge current configuration into history or fabricate historical breaks.

Saving a draft never publishes it. Invalid lessons and Class/Teacher/room conflicts disable Save and publication; incomplete/excessive loads and duration differences remain warnings. Dirty drafts retain context/navigation protection and explicit discard/reload. Configuration changes require explicit adoption; off-grid lessons remain visible for correction. Existing expected revisions, request keys, stale-write feedback and server validation remain in use.

Publication opens the existing accessible confirmation modal, with localized first-publication/replacement wording, Class, draft revision, published sequence, effective date and load warnings. Existing School-local date restrictions, explicit confirmation, idempotent request reuse and expected revision/sequence guards remain binding.

## Teacher and Parent

Teacher remains read-only and receives authorized published lessons through the existing TeacherAssignment boundary. Parent retains authorized-child selection, dated ParentStudent/StudentEnrollment scope and published reads only. Both gain prominent day navigation and scoped timetable presentation while preserving existing All days, Today, date and child filters. A selected day in a screenshot is a comparison state, not evidence that the All days default changed. Neither role receives Admin settings, draft access or publication controls.

## Visual contract

Timetable content inherits the established fonts, card/text/border/focus roles and four exact canvas/sidebar backgrounds: Light `#FFFFFF`, Mist `#E5E5E5`, Midnight `#14213D`, Dark `#000000`. Orange primary actions retain navy text. Official colored desktop marks remain in Light/Mist and white marks in Midnight/Dark. New content styling is scoped to the timetable and publication summary; it does not revise global tokens.

Five destination cards form a desktop row and reflow into two columns at 1100px and below. Editing/publication columns stack at the same threshold. Panels use existing tonal card surfaces, thin borders and gentle rounding. Arabic uses the existing Arabic font behavior, logical alignment and relaxed heading leading. The week table becomes a day-first editing surface below 768px, preserving semantic labels, explicit actions, visible focus and reachable controls.

## Rendered reference comparison

All sixteen supplied HTMLs were rendered locally with scripts disabled and network blocked. The rendered reference images and manifest live in `test-results/timetable-v1/references/`. Their eight paired views are configuration (`config` in reference filenames), rooms, loads, builder, published, confirm, teacher and parent, each in Desktop English Light and Mobile Arabic Midnight.

Actual counterpart captures live in `test-results/timetable-v1/screenshots/`:

| View | Desktop English Light | Mobile Arabic Midnight |
| --- | --- | --- |
| Configuration | `review-en-desktop-light-configuration.png` | `review-ar-mobile-midnight-configuration.png` |
| Rooms | `review-en-desktop-light-rooms.png` | `review-ar-mobile-midnight-rooms.png` |
| Requirements | `review-en-desktop-light-loads.png` | `review-ar-mobile-midnight-loads.png` |
| Builder | `review-en-desktop-light-builder.png` | `review-ar-mobile-midnight-builder.png` |
| Published | `review-en-desktop-light-published.png` | `review-ar-mobile-midnight-published.png` |
| Confirmation | `review-en-desktop-light-confirm.png` | `review-ar-mobile-midnight-confirm.png` |
| Teacher | `review-en-desktop-light-teacher.png` | `review-ar-mobile-midnight-teacher.png` |
| Parent | `review-en-desktop-light-parent.png` | `review-ar-mobile-midnight-parent.png` |

Confirmation uses viewport captures; other counterparts are full-page captures. The independent review records that every reference and actual counterpart was opened individually and was valid, settled and readable. `impeccable-review.md` gives `disposition: ship` within this UI/source review scope, with no material fixes identified. It is not final module approval.

Accepted adaptations include denser guard/history copy, inline functional editors, neutral lesson cards instead of invented subject colors, preserved user filters and actual authorized values instead of mock placeholders. Existing `ROOM`/`LAB` kinds are supported; illustrative capacity is not. Publication confirmation uses the required existing modal instead of reproducing a standalone mock page. Published lessons omit illustrative break rows because snapshots do not supply historical break data.

## Local verification and limits

Evidence is under `test-results/timetable-v1/`:

| Evidence | Recorded result |
| --- | --- |
| `tests-final.log` | 221 tests passed, 8 native PostgreSQL tests skipped; 27 files passed, 1 skipped |
| `connected-regressions.log` | 82 tests passed, 4 native PostgreSQL tests skipped; 9 files passed, 1 skipped |
| `native-postgres.log` | Subsequent direct native run: 12 tests passed (8 timetable, 4 attendance), 2 files passed, zero skips; resolves the twelve earlier native skips |
| `lint.log`, `typecheck-final.log`, `build-final.log` | Root lint, typecheck and production build passed |
| `final-results.json` | 192 locale/role/device/theme/surface cases and 126 additional width checks; no recorded page errors, overflow or contrast failures |
| `journeys-results.json`, `guard-results.json` | 11 workflow journeys plus 3 guard/loading journeys passed, zero recorded errors |
| `impeccable-review.md` | Independent sixteen-pair visual/source finish review, bounded disposition above |

The browser matrix uses local routed fixtures, not genuine hosted identity or persisted customer data. It covers EN/FR/AR, LTR/RTL, all four themes, School Admin/Teacher/Parent, desktop/mobile and additional 320/768/1024px checks alongside the 390/1440px captures. It checks exact canvas/sidebar backgrounds, desktop mark selection and contrast using composited backgrounds. Automated contrast sampling and screenshot review do not establish full accessibility conformance or server authorization. Existing domain/API tests provide separate authorization, eligibility, revision, conflict and historical-integrity coverage.

Separate fixture browser runs completed fourteen journeys: configuration inheritance/override; room search/create; requirement update through an existing assignment; stable lesson move/mobile day focus; stale-save edit retention and request-key reuse without publication; publication modal focus/Escape; explicit replacement with load warnings; conflict-blocked Save/publication; Parent child switch, empty and error states; real browser unsaved-navigation dismissal retaining URL/dirty state; explicit configuration revision adoption; and pending-response loading. Their results are in the two journey reports, independently of the matrix's empty journeys array.

The native feasibility issue was resolved through elevated local Docker access using an already available PostgreSQL 17.6 image. Two owned ephemeral containers exposed loopback-only ports 55457 (`timetable_test`) and 55458 (`attendance_test`). Repository migrations were applied only to these fresh local test databases. The direct native run passed all twelve previously skipped tests, including native serialization/concurrency and recovery coverage; the focused/connected totals plus this run represent 315 executed test cases. Both owned containers were stopped and automatically removed after verification; a filtered Docker inventory confirmed neither remains. This is local native evidence, not authenticated hosted acceptance.

Reproduction commands (native ports require equivalent fresh local databases):

```powershell
pnpm --filter @school/web exec vitest run __tests__/timetable __tests__/frontend/academic __tests__/frontend/theme __tests__/frontend/i18n/locales-catalogs.test.ts __tests__/frontend/i18n/ui-catalog-contract.test.ts
pnpm --filter @school/web exec vitest run __tests__/academic-structure __tests__/attendance __tests__/frontend/i18n/app-shell.test.tsx
$env:TIMETABLE_LOCAL_PG_PORT='55457'; $env:ATTENDANCE_LOCAL_PG_PORT='55458'; pnpm --filter @school/web exec vitest run __tests__/timetable/builder-native.test.ts __tests__/attendance/native.test.ts
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Installed Impeccable source guidance was used. Engine 0.1.5 was missing and its external cache directory required unavailable permission; `detector.log` records the limitation. No detector result, numeric visual score or engine gate closure is claimed. No hosted acceptance, staging, commit, push, PR, deployment, hosted migration, provider settings change or production/customer-data operation is part of this handoff. The next action is user review of the actual sixteen counterparts and local implementation before sign-off.
