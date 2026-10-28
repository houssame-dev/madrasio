# School Holidays V1

Implemented locally on 2026-10-28 as an ordinary Operate extension of the existing Madrasio application. The approved School Holidays brief and eighteen Step 3 HTML/PNG references guide feature composition; the incumbent shell, navigation, typography, orange controls and four themes remain authoritative. This document records the implementation, not final user approval or hosted acceptance.

## Entry and management workflow

School Admin opens `/academic?section=years&view=calendar`. School Calendar is subordinate to Years & Periods; Academic Planning retains its four primary areas. The existing Years & Periods view remains available beside it. Teacher and Parent have no holiday-management controls or direct holiday-administration API access.

The directory provides labeled name search, informational type and academic-year overlap filters, and server pagination of twenty records. Changing filters returns to page one. Academic years are authorized server records; a failed year read disables that filter and offers retry. A range crossing academic years remains one school-wide holiday and appears in each overlapping year. API date-overlap filters are also supported; there is no additional date-filter UI.

Add and Edit reuse the existing protected-focus academic modal. Fields are a required trimmed name (1–160 characters), required Public Holiday or School Holiday type, inclusive valid start/end civil dates, and an optional trimmed description (up to 2,000 characters). Both types close the school. User-entered prose is preserved, never automatically translated. The form keeps entered values after validation, historical-conflict, stale-revision or request failure. Busy controls prevent duplicate submissions. Dirty dialog dismissal requires discard confirmation; browser unloading receives the existing native unsaved-change protection.

Removal has a separate confirmation showing the exact name and dates. The API additionally requires `confirmed: true` and the expected positive revision. Successful create/edit/remove announces success and invalidates relevant dated-consumer caches within the current School namespace. List loading, retryable failure, empty results, validation, attendance conflict and stale revision have localized feedback.

## Dated timetable, Attendance and dashboard behavior

`schoolHolidaysOnDate` is the single typed internal School/date resolver. Callers authorize School, Teacher assignment and Parent selected-child scope before consuming its result. Active overlapping records are ordered by start date, name and identity; closure applies once while all applicable names and types remain displayable.

Published timetable reads apply a closure to the selected date's weekday in the returned dated projection. The immutable weekly snapshot, drafts, sequence, replacement history and unrelated dates remain intact. The read-only closure state names the holidays and says that no classes are scheduled. Weekly context/history stays available; a matching weekday in another week is unaffected. Teacher and Parent retain their existing assignment/child authorization.

Holiday dates produce no eligible new Attendance sessions. Recording and correction recheck closure on the server, including direct requests. Admin read-only session/daily surfaces show an explicit holiday state; retained historical rows are not deleted or reclassified. Dated Admin/Teacher dashboard calculations use the same closure-aware lesson/session inputs to avoid false missing-lesson or missing-recording follow-up.

Creating a holiday or expanding/changing its dates checks only newly closed dates against existing School Attendance records, covering session-based and legacy daily rows. Conflict returns actionable guidance without student identities. Retained dates and metadata-only edits can preserve legacy history. Mutation and Attendance transactions share School → User → Membership lock order, with authorization and holiday eligibility rechecked under the serialization boundary. Native PostgreSQL tests exercise both contenders winning first; only one inconsistent action can succeed.

## API, persistence and recovery boundary

| Endpoint | Contract |
| --- | --- |
| `GET /api/v1/school-holidays` | School Admin list; literal name search, type, authorized Year/date overlap and page |
| `POST /api/v1/school-holidays` | School Admin create with strict validated fields |
| `GET /api/v1/school-holidays/[id]` | School Admin detail within the current School |
| `PATCH /api/v1/school-holidays/[id]` | Complete validated fields plus expected revision |
| `DELETE /api/v1/school-holidays/[id]` | Expected revision plus explicit confirmation; tombstone removal |

The authenticated server context supplies actor and School. School Admin role, appropriate `academic_structure.read`/`manage` permission and active School are checked independently of visible controls. Platform-only authority grants no bypass. Teacher and Parent obtain holiday information only through authorized dated views. Mutations require the exact request Origin; duplicate query parameters, injected authority and unknown contract fields are rejected. Responses, including errors, are private/no-store with `Vary: Cookie`; errors use the shared sanitizer.

The forward-only `database/drizzle/migrations/0031_school-holidays.sql` appends the thirty-second migration. `school_holidays` stores UUID identity, School, bounded prose, enum type, inclusive PostgreSQL `DATE` bounds, revision, actor/timestamps and removal timestamp. Restrictive foreign keys, checks and a School/range index preserve tenant and range integrity. RLS is enabled and public/Data API role grants are revoked. No historical migration is rewritten and no hosted migration is run.

Create, update and removal atomically append immutable audit events with the business transaction. Bounded metadata records before/after type, dates and revision plus a SHA-256 digest of editable name/description content; it does not duplicate full prose or claim to be a complete historical prose viewer. Audit failure rolls back the mutation. Tombstones and audits remain in recovery even though removed rows disappear from normal reads.

The recovery inventory now has 58 application tables and 60 total tables including the two auth tables. The full-row recovery test replays active and removed holidays, revisions and immutable audits and compares all sixty fingerprints. Historical pre-holiday thirty-/thirty-one-migration manifests still parse with their original inventories. Restore requires the exact source migration chain/repository revision; parsing compatibility does not authorize implicit upgrading into the new schema.

## Inherited visual system and reference adaptations

`apps/web/components/academic/school-calendar.tsx` and its scoped stylesheet provide the directory and forms. `holiday-state.tsx` supplies the shared dated closure message. Academic workspace, Attendance panels and published timetable composition consume these additions. Shared `Button`, `NativeSelect`, academic `Field`/`Modal`, native date/radio controls, existing Lucide icons and semantic HSL roles remain in use. No dependency, font, image asset, global token or new design system is introduced.

| Treatment | Observed implementation |
| --- | --- |
| Palette/type | Existing self-hosted Inter/Arabic, orange emphasis, semantic foreground/card/muted/border/input roles and Light/Mist/Midnight/Dark |
| Main grouping | Bordered tonal card, 12px radius, 24px padding and 20px gaps; 16px padding and 18px gaps below 768px |
| Directory | Desktop 13px table with 14px/12px cell padding; labeled stacked records below 768px, 10px radius and 12px record padding |
| Filters | Desktop search at twice the relative width of each selector; mobile search spans both filter columns |
| Type controls | Native radio choices with 8px border radius; selected accent foreground applies to the label and hint for contrast |
| Form | Existing focus-managed modal bounded to 560px; dates stack below 380px and share a row from 380px upward |
| Direction | Logical spacing, bidirectional isolation for user prose and explicit LTR ISO civil dates within Arabic RTL |

Deliberate reference adaptations are the approved existing shell and subordinate navigation, explicit ISO civil dates, labeled functional filters, a true server-backed pager and retained weekly timetable/history context. Reference sample records are illustrative. The actual captures contain synthetic verification fixtures, not production data. Working modal focus, validation, confirmation and dirty-state behavior replace static mockup presentation without inventing routes or wizard stages.

## Local evidence and limits

Evidence lives under `test-results/school-holidays-v1/`. Recorded suites overlap; their totals must not be added as distinct coverage.

| Evidence | Recorded result |
| --- | --- |
| `database-final.log` | 383 passed |
| `frontend-final.log` | 131 passed |
| `connected-final.log` | 668 passed, 20 gated skips |
| `feature-final.log` | 18 passed: 14 service, 3 route and 1 sixty-table recovery test |
| `history-final.log` | 40 passed, including 27 manifest compatibility tests |
| `native-final.log` and native test source | 2 actual PostgreSQL 17.6 contention tests; full forward migration chain, zero security-audit findings and sixty-table source fingerprints checked in setup |
| `browser-complete.log` | 76 passed, 5 hosted-gated skips out of 81 cases |
| `browser-controls.log` | 15 passed; final locale/theme management and role-specific dated closure journeys with sampled text/control/focus contrast assertions |
| `build-reviewed.log` | Successful production build, 60 routes |
| `lint-final.log`, `typecheck-verified.log` | Passed root lint and verified typecheck |

Browser source exercises EN/FR/AR, LTR/RTL, all four themes, CRUD and filters, twenty-plus-one pagination, errors/retry, validation, historical conflicts, unsaved dialog dismissal and responsive widths 320/390/768/1440. Browser APIs are intercepted local fixtures; these checks do not establish hosted authentication, live tenant acceptance or exhaustive assistive-technology coverage. Service/database tests and actual native locking tests are separate evidence.

This documentation pass inspected the actual Desktop Light capture `browser-complete/school-holidays-School-cal-6df55-ters-and-complete-mutations-chromium/calendar-light.png` and Arabic Mobile Midnight capture `browser-complete/school-holidays-School-cal-bca5b-ters-and-complete-mutations-chromium/calendar-midnight.png`. They show four primary Academic cards, subordinate calendar navigation, inherited shell, labeled filters and table-to-record adaptation. The main agent reports an independent installed finish-reviewer disposition of `ship`, with no material fixes, following primary desktop/mobile calendar/add/edit and closure reference/actual inspection. That reviewer disclosed that desktop conflict/delete and mobile edit were not individually opened; the main agent separately inspected actual delete and add. This is bounded rendered review, not exhaustive reference-pair certification. The optional detector did not run because its engine cache was unavailable; there is no numeric detector certification.

The main agent's final control-sampling summary records 1,068 text samples with minimum ratio 4.99859 and zero failures, 456 field/icon samples with minimum ratio 3.27993, focus-token minimum ratio 7.92908, and 96 final PNGs under `browser-controls/`. These are supplied bounded measurements, not an independent documentation-pass recalculation or an exhaustive accessibility audit. Final root lint/typecheck passed (`lint-verified.log`, `typecheck-complete.log`). Additional `browser-states.log`: 15 passed, including held loading, empty/error captures and 320px forms; 120 PNGs in `browser-states/`.

`PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` and existing surface briefs are preserved. Previously recorded authentication documentation drift remains outside this extension and is neither repaired nor canonized. This pass adds only this document and `.impeccable/surfaces/school-holidays.md`; root reporting/checkpoint updates belong to the main implementation handoff.

Provider imports, automatic national calendars, half-day/class exceptions, time windows, recurrence, substitutes, automatic rescheduling and exam scheduling remain out of scope. No staging, commit, push, deployment, hosted migration or provider-setting change is performed or authorized by this record.
