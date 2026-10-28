# Global Search V1

Local implementation record, 2026-10-28. This is an approved navbar extension in Operate mode. The existing application shell, role navigation, four themes, official branding and domain permissions take precedence over the illustrative Step 3 references. The baseline recorded in `test-results/global-search-v1/baseline.json` is `efdf97d7b8bb55354f380d016cede91a0213284b`, with substantial pre-existing School Holidays work. This record does not authorize release actions.

## Implemented experience

`apps/web/components/app/global-search.tsx` and its scoped stylesheet provide the search palette. `app-shell.tsx` inserts it once in the navbar's flexible area, keyed by User, selected School and role. Existing notifications, profile, School switch and mobile navigation retain their established behavior.

The desktop trigger carries a platform-sensitive Ctrl+K/⌘K hint; below 1024px it becomes an accessible search icon. The palette uses the installed Base UI Dialog and DirectionProvider, shared Button, existing Lucide icons and application semantic tokens. No dependency, font, asset or migration is added. The desktop popup is at most 680px wide, starts at 12vh and is bounded to 76dvh; below 640px it fills the viewport with safe-area padding. Results scroll independently and category chips scroll horizontally when needed.

Empty-query Quick navigation is derived from `visibleNavigationItems` for the current role, with localized page-name matching performed locally. Current navigation counts are 13 School Admin, 11 Teacher and 5 Parent destinations; these are incumbent navigation facts, not hardcoded reference counts. Record categories are School Admin Students/Teachers/Parents/Classes, Teacher assigned Students/Classes, and Parent linked Children. Pages is local-only and is not an API category.

The input receives focus when opened. Ctrl/⌘+K respects unrelated editable controls and existing dialogs; Up/Down selects an option, Enter activates it, and Escape closes and restores trigger focus. The input exposes combobox/listbox relationships and an active descendant. Loading and failure use status/alert semantics; category buttons expose pressed state. Retry retains the current query. Closing or navigating clears query, selection, filter and result state. User prose is isolated with `bdi`, layout uses logical spacing, and all 25 new message keys have EN/FR/AR entries. Existing Inter/Arabic font families are inherited.

Record requests wait 325ms after a qualifying change. An AbortController, effect live flag, query identity key and response identity checks prevent obsolete responses from rendering. The key includes User, School, role, locale, trimmed term and category; the response must match User, School and role. There is no query cache or search history. School/role transitions remount the component, and logout removes the authenticated shell.

## API and authorization

`GET /api/v1/search?q=<term>&category=<category>` is implemented by `apps/web/lib/api/search.ts`, with a thin route export and `lib/modules/search/{contracts,service}.ts`.

- `q` is trimmed and must contain 2–80 characters. The strict schema rejects unknown authority parameters, malformed categories and repeated parameters. `category` defaults to `all`; allowed record category names are `students`, `teachers`, `parents`, `classes`, `children`, subject to the server role allowlist.
- Each permitted category returns at most six rows, ordered deterministically. A row contains only `id`, `category`, `name`, nullable `detail` and `href`. The response includes the authenticated User/School/role identity for client matching; it returns no total directory counts.
- Student/child detail is the Student code; Class detail is the academic-year name; Teacher/Parent detail is null. No email, financial balance, grade, Attendance, credential metadata or private search history is returned. Parameterized literal matching escapes backslash, percent and underscore.
- The server obtains identity and selected School from authenticated current context, then checks operation permissions, active User/membership/current context and ACTIVE School. A read-only repeatable-read transaction keeps authorization and projections in one snapshot. Client parameters do not supply authority.
- Teacher visibility requires the current active Teacher profile, same-School active Class and assignment, matching academic year, and School-local inclusive assignment/enrollment effective dates. Student results additionally require active same-School enrollment and active Student status. Class results require the current active assignment. Parent results require active same-School Parent profile and active ParentStudent relationship. Staff/Parent directory categories remain School Admin-only. Record lifecycle behavior otherwise follows the existing directory/domain rules; this feature does not impose a new universal active-record policy.
- Success and error responses use `Cache-Control: private, no-store` and `Vary: Cookie`; errors follow existing sanitized API conventions. Raw terms and returned identities are not added to application logging by this feature.

Students, Teachers and Parents open existing detail routes; linked Children open `/children/:id`. Classes open the existing authorized Classes experience at `/academic?section=classes&yearId=…&search=…`; no Class-detail route is invented. Each destination retains its own authorization. Displaying a result grants no access.

## Reference comparison and finish review

The complete handoff is `test-results/global-search-v1/reference/Madrasio-Global-Search-Step3/CODEX-PROMPT.md`, alongside 24 HTML/PNG reference pairs. Actual captures and case metadata are indexed by `test-results/global-search-v1/SCREENSHOTS.json` (18 role/locale/primary-width cases), with a local `capture-index.html` for review.

This documentation pass directly inspected Desktop English Light School Admin `initial-light.png` and `records.png` in `browser-final/global-search-Global-searc-3759a--and-authorized-destination-chromium/`, and Arabic Mobile Midnight School Admin `initial-midnight.png` and `error.png` in `browser-final/global-search-Global-searc-b8e58--and-authorized-destination-chromium/`. The implementation retains the reference's input/filter/group/footer hierarchy, desktop contained palette and mobile full-screen RTL composition. The real shell stays visible behind the desktop backdrop. The mobile failure state centers its message and retry while preserving input, filters and footer.

Intentional differences are the existing orange selection/focus tokens instead of illustrative blue, current branding/labels, actual role navigation counts, and minimal code/year detail instead of an inferred Class. Reference and browser fixture names/counts are illustrations, not authorized live directory evidence. No fixture disclaimer is inserted into product UI.

The independent installed Impeccable finish reviewer reported `ship`, with no material fixes, after bounded Desktop/Mobile School Admin state review and Teacher/Parent initial/record comparisons. That disposition is a visual review, not an exhaustive computed comparison or database certification. Source guidance was applied; the engine cache was unavailable and no optional detector ran. No new visual world or global design change was approved.

## Verification evidence and limits

Results below are recorded in `test-results/global-search-v1/`; overlapping suites are not additive totals.

| Evidence | Recorded result |
| --- | --- |
| `search-final.log`: focused search domain/API/component Vitest | 21 passed |
| `connected-final.log`: search, holidays, directories, authorization, localization and dashboard suites | 674 passed, 5 opt-in skips, 21 existing TODOs |
| `workspace-regressions.log`: Academic Planning and Attendance frontend suites | 99 passed |
| `focused-first.log` / `components-first.log`: earlier overlapping checks | 44 / 19 passed |
| `refinement-tests.log`: recovery/publication refinement | 18 passed |
| `finance-timetable-ui.log`: focused Finance and Timetable UI regressions | 76 passed |
| `browser-reference-final.log`: representative closed-navbar captures added | 2 passed (overlapping journeys) |
| `browser-complete.log`: complete configured Chromium suite | 97 passed, 5 hosted-gated skips; 102 cases |
| `build-final.log` | Production build passed; new search route included |
| `lint-final.log` / `typecheck-verified.log` | Workspace lint and verified typecheck passed |

All 18 search matrix cases passed in both browser runs. Collectively cover EN/FR/AR × School Admin/Teacher/Parent × 390/1440px, all four initial themes, grouped role results, filters, keyboard selection, focus restoration, loading, empty, error/retry and an existing destination. Long-name overflow is also checked at 320/390/768/1024/1440px. Separate browser journeys cover stale transports, expired sessions, actual School switching, profile/logout, drawer behavior and focus boundaries. The earlier `browser-final.log` finished 96 passed/1 failed/5 skipped because an ambiguous drawer-close test selector matched two controls; the selector was scoped to the drawer and the complete rerun passed. This was not a production defect.

Initial-theme computed sampling across the 18 cases produced 2,496 text samples, minimum ratio 4.99859:1, with zero null ratios or failures. These checks cover the sampled visible initial text, not every state/control or every possible data combination. Screenshots and browser routes use synthetic local fixtures. PGlite domain tests separately exercise authorization/data logic; no fresh native PostgreSQL or hosted search acceptance is claimed.

The recovery refinement corrected stale pre-0031 table-count expectations from 57/59 to 58/60 without database logic changes. Pending `0031_school-holidays.sql` remains untouched by Global Search. Search adds no schema change and does not establish hosted release readiness for that migration. Existing School Holidays docs/code, root `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` and incumbent surface briefs are preserved. Previously documented authentication design-record drift is outside scope and is not repaired or promoted into search rules. No staging, commit, push, deployment, hosted mutation, external service or provider configuration change is claimed. User implementation/visual approval remains the next release boundary.
