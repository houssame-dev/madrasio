# Academic Planning V1

Local implementation checkpoint: 2026-10-25. This is an ordinary extension of the established application world at `/academic`. `PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` retain their existing authority and scope; the composition record is `.impeccable/surfaces/academic-planning.md`. The shared shell, authentication, dashboards, tuition and invitation template remain outside this extension.

## Workspace and context

Four primary cards organize six existing sections without replacing their URLs or APIs:

| Primary area | Existing `section` values | Working content |
| --- | --- | --- |
| Academic Years & Periods | `years` | Search, status, year forms and lifecycle; contextual periods, dates, ordering and lifecycle |
| School Structure | `structure`, `tracks` | Selected stage and related levels; optional school-wide tracks in subordinate navigation |
| Subjects & Curricula | `subjects`, `curricula` | Subject catalog; curricula, named versions, attached subjects, coefficients and ordering |
| Classes | `classes` | Search, year/status filters, explicit year-bound creation, existing correction and lifecycle |

The `section`, `yearId`, `stageId`, `curriculumId` and `versionId` query parameters preserve UI context through refresh and sharing. Existing `page`, `status` and supported `search` parameters retain list context. Primary-area navigation resets list filters/pagination while preserving nested resource context; selecting a curriculum clears its prior version. Query parameters confer no authority: selections resolve through the authorized school reads. Direct year, curriculum and version reads preserve selection even when the resource is outside the current list page. Selector helpers collect existing paginated resources rather than silently limiting choices to the first page.

Class creation requires available years, levels and an eligible ACTIVE curriculum version. Missing prerequisites, loading and failed selector reads prevent an unusable create action and provide feedback. The year field stays explicit: it is prefilled only when user-selected `yearId` context resolves among the authorized year options, otherwise it starts blank. There is no newly inferred global current-year invariant. New curriculum bindings offer ACTIVE versions only. Existing class correction preserves historical year identity and curriculum-binding restrictions.

The create-class form is inline beside the desktop list. On narrow layouts, opening creation brings the form into the foreground by hiding the list until creation closes. Existing edit dialogs remain dialogs. Other forms, lifecycle confirmations, history restrictions, date validation, immutable version behavior, errors, success feedback and query invalidation continue through the existing components and services.

## Permissions and domain boundaries

School Admin retains `academic_structure.manage`; Teacher retains read-only access; Parent is denied this workspace. The existing server permission and tenant checks remain authoritative for every read/write. UI controls reflect those rules without replacing them. StudentEnrollment and TeacherAssignment remain the sources of enrollment and assignment truth; this surface introduces no competing roster or assignment state.

The only backend contract extension is optional `search` on the existing `GET /api/v1/academic-years`: trimmed, bounded to 100 characters, and applied as literal case-insensitive name matching with wildcard characters escaped. The existing school and status predicates apply consistently to both rows and total count before pagination. Existing actor verification and lifecycle rules are retained. There are no new routes, schema changes, migrations, dependencies or hosted changes.

## Visual implementation

Academic styling lives under `.academic-planning` in `apps/web/components/academic/planning.css` and consumes the established application card, text, border, focus and active-state tokens. It reuses self-hosted Madrasio Inter/Madrasio Arabic, official branding and the exact Light, Mist, Midnight and Dark backgrounds. Primary academic actions retain application orange with navy text. No authentication or global token replacement is introduced.

The four-card desktop navigation becomes two columns at 1100px; contextual panels stack at the same threshold. At 600px, cards reduce padding, secondary card hints hide and panels use tighter spacing. Responsive records retain visible field labels and lifecycle actions instead of crushing table columns. Logical spacing, Arabic leading/tracking, localized EN/FR/AR copy, native controls, semantic labels, visible keyboard focus and existing accessible dialog behavior support LTR/RTL use.

The protected shell takes precedence where mockup chrome differs. Mockup banner/footer and illustrative records are not product content. The working version list, status/search controls, pagination and lifecycle actions remain available; retaining these operations makes some mobile screens longer than the illustrative boards.

## Local verification and limits

Evidence is stored in `test-results/academic-planning/`:

- `tests-final.log`: 185 tests passed in 16 files, covering the focused frontend/API/domain work, authorization and historical safeguards.
- `connected-regressions.log`: 58 tests passed in seven files for connected domain behavior.
- `build-final.log`: successful production build with isolated output; the temporary TypeScript configuration change was restored afterward.
- `lint.log` and `typecheck.log`: completed root lint and typecheck successfully, including web ESLint and TypeScript checks.
- `final-results.json` and `browser-final.log`: completed 96 locale/device/theme/area cases and 72 responsive-width checks, with no reported overflow, errors or contrast findings. Eight recorded journeys cover Teacher read-only in EN/FR/AR, dialog focus/Escape, explicit year/ACTIVE version selection, lifecycle confirmation/draft edit locking, empty state and error state. These are bounded automated checks, not comprehensive accessibility certification.
- `additional-results.json`: eight further journeys passed: Parent denial without academic fetching, school-wide Track creation, Subject creation without a global coefficient, selected-Stage Level prefill, period containment validation, historical Class year/curriculum locks, explicit-context Class creation at 320px, and explained missing prerequisites. It reports no errors or contrast findings. Together the two browser reports record 16 journeys; these are separate from the test-suite counts above. `screenshots/additional-narrow-class-form.png` is the additional 320px creation capture; the existing responsive shell transition must settle before measuring overflow.
- `impeccable-review.md`: independent UI/UX and reference-fidelity disposition **ship**, with no material fixes identified. The reviewer inspected all eight approved references and all eight valid settled captures: `screenshots/review-en-desktop-light-{years,structure,curricula,classes}.png` and `screenshots/review-ar-mobile-midnight-{years,structure,curricula,classes}.png`. This disposition applies to that bounded visual scope; the user retains final module approval.

The local browser harness intercepts all application APIs and uses loopback authentication fixtures. Domain tests use PGlite. Neither constitutes native PostgreSQL or authenticated hosted acceptance. Native PostgreSQL and real authenticated live acceptance remain explicit verification limits.

`detector.log` records unavailable Impeccable engine 0.1.5: setup needs external cache write permission and network access. Installed source guidance was applied from the start; no numeric detector score or engine certification is claimed. Existing global design-document drift was reported and left outside this extension. No staging, commits, pushes, deployments, hosted migrations, provider settings or production operations form part of this checkpoint.
