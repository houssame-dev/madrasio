# Parent Dashboard

Mode: Operate. Ordinary extension of the approved Madrasio application, using the approved `C:/Users/Ultrapc/Downloads/Madrasio Parent Dashboard_ Desktop and Arabic Mobile.png` for content composition only.

THESIS: A parent sees the selected child's trustworthy school context, near-term work, recorded attendance and official publications without inferring unrecorded outcomes.

OWN-WORLD: Inherit application cards, typography, shadows, actions, icon tiles, native selects and four exact themes. Preserve the entire shared shell, Admin/Teacher dashboards and authentication. No new tokens or raster assets.

STORY: My Child, Important to Know, My Child's School Week, Academic Progress, School Communication. Desktop paired cards; mobile clear stacked reading and compact local table scrolling. One-child identity remains simple; multiple children use a labeled existing native select. Ambiguous eligible years require explicit choice.

AUTHORITY: Existing parent bootstrap, linked-child/year checks, published timetable and results APIs. Missing attendance is never absence; homework listing never implies submission state. Personal communications remain separate from child records.

FINISH: Bounded batched desktop/mobile review, focused corrections if needed, fresh independent Impeccable consistency review and extension documentation. Engine context unavailable due external cache permissions; no fabricated tool scores.

## Implemented extension

The implemented contract is documented in `docs/frontend/parent-dashboard.md`. `parent-dashboard.tsx` preserves canonical self-profile/linked-child bootstrap and distinct empty/error states; `parent-daily-workspace.tsx` renders the five sections above. `.parent-workspace` rules reuse application fonts, cards, actions, icon tiles, native selects, semantic roles and four exact themes without new global tokens, dependencies or raster assets. Week/progress pair on desktop and stack at 700px; attention stacks at 1250px. Timetable overflow stays in the existing named keyboard-scroll region. RTL uses logical spacing, mirrored arrows and isolated names; focus and reduced motion remain inherited. `DESIGN.md` and `.impeccable/design.json` are preserved.

## Context and read authority

The new read-only `GET /api/v1/parent/children/:studentId/dashboard?academicYearId=...` requires verified Parent school/user context, strict UUID and query validation, canonical `parents.read`, active self-owned Parent profile and active child relationship, and a child-enrolled year. Responses, including errors, are private/no-store and vary by Cookie. Selected-child dashboard caches include school/user/child/year where applicable; communications remain school/user-scoped personal reads. URL child/year/section/date values are navigation hints, never authorization.

Automatic year choice requires exactly one ACTIVE eligible year containing today. Ambiguous or absent current context requires explicit selection; a sole historical year is never selected automatically. The overview refreshes every 60 seconds. Its PUBLISHED-only homework count spans today through today + 7 inclusive (eight calendar dates), with due-date enrollment/target eligibility and a four-row preview; CLOSED, archived and draft homework are excluded. Recorded ABSENT count spans today − 6 through today inclusive and counts records, not days, with record-date enrollment eligibility. Missing attendance and homework publication never imply presence, absence, submission or completion.

Existing reads supply enrolled years/placement, persisted attendance, independent SUBJECT/PERIOD/ANNUAL immutable results (two previews each), and published timetable only with current date-effective selected-year placement. Timetable validates the returned selected child and uses applicable class/date/weekday lessons. Recipient announcements and owned notifications remain personal school communication, not selected-child records. There are no finance cards, performance analytics, inferred submission counts, staff controls or new mutation workflows.

## Finish evidence and limits

Evidence is bounded to local fixtures/PGlite, not hosted acceptance or real mutations. `test-results/parent-dashboard/final-results.json` records 24 locale/theme/device cases, 30 settled narrow checks and 17 states with zero failures/errors. Final primary screenshots are `screenshots/final-en-desktop-light.png` and `screenshots/final-ar-mobile-midnight.png` in that directory.

The initial independent review requested a fix for the sole 320px overflow finding. `impeccable-verdict.md` resolves that scored finding with `disposition: ship`, expressly limited to that finding. `resize-settle.json` identifies the existing shell resize transition; settled EN/FR/AR document widths are each 320 at viewport 320. No Parent CSS correction or protected shell modification was necessary. Engine cache access prevented the detector; no detector result or numeric score is claimed.

Admin's two comparisons (`regression/results.json`) and Teacher's two (`teacher-regression.json`) have zero changed pixels. Eight authentication comparisons have six zero results, with only English desktop login/invalid-link differences of 10/15 pixels (`auth-regression/results.json`); all 31 protected source hashes remain unchanged (`preserved-files.json`). Final root lint/typecheck/build passed, and diff checks passed with CRLF advisories only.

`regressions-final.log` records 545 passes, 18 missing-`useSearchParams`-mock failures and 12 optional native PostgreSQL skips due unavailable ports. `final-focused.log` records 93 passes including all 18 corrected failures and Parent UI/new security checks: 563 unique passing checks from the 545 broad passes plus the 18 corrected cases. No single broad green rerun is claimed. Older Parent portal documentation still describes former dashboard/navigation/year behavior; it and pre-existing authentication documentation drift remain untouched outside this write boundary.
