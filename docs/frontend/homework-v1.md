# Homework V1 local implementation handoff

Date: 2026-10-26. Status: implemented for the user's local review checkpoint.
This is an ordinary Operate extension of the existing application world. It does
not grant final module approval or hosted acceptance. The user must review the
actual implementation before local sign-off.

The [product brief](../../PRODUCT.md), [existing design system](../../DESIGN.md),
[Homework surface brief](../../.impeccable/surfaces/homework.md), and existing
[Homework architecture](../architecture/frontend-homework.md) retain their scopes.
The 24 approved HTML references guide hierarchy and visual intent; actual routes,
DTOs, domain rules and protected Madrasio controls take precedence over mock data.

## Implemented experience

The staff directory keeps server-backed search, Year, Class, lifecycle and due-date
filters with pagination. Its compact records expose title, Year, Subject, due date,
status and open action without per-row target reads. Creation remains a working
dialog with eligible Year/Period/Subject context, literal school calendar date,
plain-text instructions and retained input after failure. A successful create
remains DRAFT and explicitly directs the author to select target Classes.

Assignment detail puts identity and academic context before instructions, target
Classes and permitted actions. Targets remain append-only; existing targets are
not offered for selection again. Publication repeats the actual title, Year,
Period, Subject, due date and targets, explains immutable publication, and disables
confirmation when targets are unavailable, loading or absent. Close/archive retain
the existing forward-only lifecycle. Drafts do not show an operational roster.

The authoritative roster separates absence of a persisted submission (not
delivered) from delivered SUBMITTED/LATE/REVIEWED/RETURNED records. Compact roster
timing shows latest recording and actual hand-in, including unknown physical time.
Submission detail retains first recording, latest recording and independently
optional actual physical time. Record, review, return and same-row resubmission
dialogs repeat the exact Student/Homework context. Returned work remains delivered
and visibly requires follow-up.

School Admin oversight uses the existing staff workspace and permitted actions.
When an eligible active Teacher identity and matching assignment are missing,
authorship guidance replaces a misleading available creation action. There is no
author picker or impersonation path.

Parent Homework records always expose Subject, Period, due date and lifecycle,
with instruction disclosure and working detail links carrying selected child and
Year. The detail query/cache and render filter preserve exact selected-child
submission identity; an unrelated requested child fails closed. The focused
`?section=homework` child route follows the existing focused-child pattern and
omits unrelated Finance and Results content. Other child views retain their
existing behavior. Parent assignment, recorded submission and permitted files are
one authorized read view rather than invented extra detail stages. Parents have
no Homework write, upload, review or roster controls.
Returned-work guidance asks the Parent to contact the Teacher and explicitly
retains read-only operation, rather than presenting staff recording instructions.

## Scoped visual contract

`apps/web/components/homework/homework.css` owns the content extension, using
`.hw-workspace`, Homework record/card classes and Homework-containing dialogs.
It reuses existing application semantic colors, fonts, legacy form controls,
buttons, status badges, pagination and protected-focus modal behavior. Global
`DESIGN.md`, `.impeccable/design.json`, shell geometry and global tokens are not
rewritten for this surface.

The implemented content uses a 1600px maximum width, 12px bordered cards with 20px
padding (16px below 768px), compact neutral metadata grounds and orange primary
actions. Desktop records prioritize scanning; below 1280px records use paired
fields with full-width timing/actions. Forms become one column below 768px;
summary/timing metadata retain two columns where suitable. Dialogs are bounded to
the viewport and intentionally scroll. Long text wraps, logical alignment supports
RTL, timestamps/codes retain appropriate directional isolation, and Arabic title
leading/tracking follows the incumbent pattern. Reduced motion is honored.
Parent timing tiles become a single column below 360px so long French labels
remain readable at 320px without clipping. This narrow correction does not alter
the primary 1440px/390px reference-paired captures.

The four added `homeworkExperience` message keys are translated in EN/FR/AR;
catalog totals are 2016 per locale. Existing shared controls were retained rather
than introducing a parallel component system or migrating working legacy controls.

## Preserved integrity

No backend, API, database schema, migration or dependency change is part of this
Homework UI extension. Current-School membership, exact TeacherAssignment scope,
server-derived author, historical enrollment on the due date and ParentStudent
authorization remain server authority. Client filtering is presentation, never
tenant isolation. Existing school-scoped cache invalidation and school switching
boundaries remain in use.

Recording keeps one logical HomeworkSubmission per Homework/Student. Server-owned
recording timestamps and SUBMITTED/LATE status are not client-authored. Actual
hand-in uses the existing school wall-time adapter and remains unknown when not
entered; resubmission does not invent or reuse a previous physical timestamp.
Publication freezes content/targets, closing blocks new recording/resubmission,
and archive remains terminal/read-only under existing domain rules.

Files use the existing private attachment endpoint and original-recording
association: PDF/PNG/JPEG, up to 2 MiB each, ten lifetime upload intents per logical
submission. READY files remain associated across review, return and resubmission.
An uncertain/reconciliation-required upload blocks file selection and a new upload
intent; success is announced only after a server-confirmed READY response. Existing
authorization, upload locking, idempotent replay, audit and recovery boundaries
remain authoritative. Metadata recovery does not guarantee stored-byte recovery.

## Evidence and review boundary

The reconciled commands, exact file inventory, final matrix/regression counts,
limitations and protected-surface comparisons belong to the
[local verification report](../../test-results/homework-v1/REPORT.md).
The [screenshot index](../../test-results/homework-v1/SCREENSHOTS.md) maps the 24
approved workflows to actual application captures and reference captures.

Evidence checked while writing this handoff:

- `final-captures.json` lists all 24 application cases: 12 workflows each at EN
  desktop Light and AR mobile Midnight.
- The final browser journey run records 17 passed journeys, including scoped
  directory requests, draft conflict retention, append-only targeting, publication
  focus restoration, record/review/return/resubmission, READY-only upload success,
  uncertain-upload blocking, unavailable Admin authorship and exact Parent child
  isolation and keyboard focus containment. Eight supplementary state captures
  cover representative unavailable/loading/empty/pending and recovery states.
  These are fixture browser journeys, not hosted acceptance.
- `focused.log` records 93 passed tests and two native-gated skips; the separate
  `native-postgres-final.log` records both native Homework tests passed. These
  include upload/review locking, private READY replay, Parent access revocation
  and preserved resubmission identity/closing behavior, using local PostgreSQL
  17.6. All 59 initial seeded table fingerprints matched; 53 unrelated tables
  remained unchanged after excluding six expected mutated tables.
- UI/localization/Parent portal/theme/shell regressions record 500 passed and 21
  existing TODOs. The latest focused Homework/localization rerun records 67 passed
  after the Parent copy correction (the earlier run recorded 64). These overlap;
  they must not be added into an invented unique-suite total.
- `connected-bounded.log` records 266 passed and seven native-only skips (three
  People, four Attendance). The initial unbounded connected run exhausted worker
  memory; the bounded rerun with two workers passed. It is not a whole-root-suite
  claim.
- Six dashboard, four Grades and six People protected captures have zero changed
  pixels. Five authentication captures also have zero; EN desktop Login,
  Password and Invalid captures show respectively 10, seven and 15 isolated
  changed pixels. Exact comparisons and final matrix results are in REPORT.md.
- The completed matrix records 288 cases and 108 final width checks with zero
  reported errors, overflow, clipping or sampled contrast findings. Two initial
  French 320px timing-label failures were corrected with the single-column Parent
  timing rule; both affected captures passed the final readable-label review.
- The extra current-context, school-switch and session-handoff authentication run
  (`auth-switch.log`) passed 34 tests across three files. The final narrow
  regression passed 15 tests across two files, overlapping earlier coverage.
  Final root lint, typecheck, 58-route build and diff checks passed.

The [independent Impeccable review](../../test-results/homework-v1/impeccable-review.md)
has disposition `ship`, after individually inspecting all 24 actual/reference
pairs, with no material rendered issue. The later Parent returned-work copy
correction passed a scoped four-capture review. The reviewer subsequently requested
the French 320px timing-label correction, verified both affected captures after
the fix, and appended final disposition `ship`.
The review explicitly accepts protected dialogs,
compact authoritative roster data, real target counts and the combined Parent
read view as adaptations of illustrative references. That reviewer did not
independently execute keyboard, database, storage or API tests.

The optional Impeccable runtime was unavailable. Installed source guidance and an
independent rendered review were used; no detector or numeric fidelity score is
claimed. No deployment, hosted migration, remote settings change, production data
access, staging, commit, push or PR is authorized by this handoff. Next action:
the user's review of the locally implemented Homework experience and evidence.
