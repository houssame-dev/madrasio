# Tuition Management V1

Local implementation checkpoint: 2026-10-25. This extends the approved application
design described in `DESIGN.md` and `.impeccable/surfaces/tuition.md`. It does not
replace the shell, authentication or role dashboards. Product and financial rules
remain in `PRD.md` and `docs/domain/finance-v1.md`.

## School Admin experience

The existing `/finance` destination contains six internal sections: Overview,
Students & Balances, Payments, Charges, Fee Configuration and Reports. Overview
is the default. The `section` query parameter persists selection through refresh
and sharing; charge generation is the `generation` subview of Charges.
`studentId` carries selected-student context into balances and payment entry;
`academicYearId` carries the applicable year filter. These parameters select UI
context and never confer authority. Reports have their own explicit filters;
opening Reports clears the workspace year selection so a hidden filter cannot
misrepresent the report.

Overview reads `/api/v1/finance/overview`. The application service composes the
existing outstanding report, collections report and payment history with bounded
overdue-student and class aggregations in a read-only repeatable-read transaction.
Outstanding, overdue-student count and charged-student count follow the selected
academic year (or all years). Collections cover the School-local month to date
across academic years, net of currently reversed payments. They are not
reversal-date cash movement. Recent payments retain reversal indicators.
Class bars aggregate remaining OPEN charges by the charge's stored generation
Class ID, using its current Class label; transfers do not move earlier charges.
Each follow-up/class/recent list is bounded to six entries. Charged students means
students represented by the report's charges, not total enrolled students.

Students & Balances reuses the existing all-year student balance service, bounded
student search, charge breakdown, payment history and receipt links. Payments
adds a visible details/allocation/review/confirmation sequence to the existing
offline payment workflow. Review shows the actual student, method, date, amount
and allocations before confirmation. Charges preserves generation preview,
duplicate handling, adjustments, cancellation and reduction correction history.
Configuration groups fee types, structures and currency. Reports retain existing
outstanding, aging, collections, filtering and CSV semantics.

All monetary writes continue through the existing authorized Finance services:
integer minor units, exact allocation totals, currency locking, previews and
hashes, request keys, locks, immutable payment/receipt snapshots, append-only
reversals and transactional auditing. No Teacher or Parent mutation authority
has been added.

## Parent child tuition

Tuition appears within `/children/[studentId]#tuition`; it introduces no Parent
Finance administration destination. The selected child's name is repeated in the
section. Balances are explicitly across all academic years and independent of
the academic filters above the section. Charges show net amount, paid amount,
remaining amount, due date and paid/partial/unpaid/cancelled state. Payment history
shows offline method, amount, date, stable receipt reference and reversal status.
Charges and payment history use 20-row pagination.

The dedicated reads are:

- `GET /api/v1/parent/children/[studentId]/tuition?page=1`
- `GET /api/v1/parent/children/[studentId]/tuition/receipts/[paymentId]`
- The same receipt endpoint with `?download=1` returns an HTML attachment.

Every tuition, receipt and download request checks authenticated current context,
ACTIVE School/membership, Parent role, ACTIVE Parent profile and ACTIVE
ParentStudent relationship on the server. Receipt/payment/allocation queries
also constrain School, child and payment identity. Guessed IDs, another child,
another School and ended relationships do not bypass this boundary. This is a
dedicated `parents.read` child-scoped exception; no `finance.read` or
`finance.manage` grant, substituted Admin actor or broad Admin Finance API is used.
Authorization and returned totals/rows share a read-only repeatable-read snapshot.
The API rejects unknown/repeated parameters and malformed IDs and sends private,
no-store responses with `Vary: Cookie`, including errors.

Parent projections contain only the needed charges, payment snapshots,
allocations and reversal reference/time. Recording/reversing staff identity,
internal reasons/notes, request keys and audit metadata are excluded. Receipts
use the original School/Student/payment/allocation snapshots and currency;
reversals mark the original receipt rather than rewriting its history.

The receipt route `/children/[studentId]/tuition/receipts/[paymentId]` offers
browser Print / Save as PDF and an authenticated, escaped, self-contained UTF-8
HTML download. The attachment has restrictive CSP and no scripts or external
assets. There is no programmatic native PDF endpoint. Saving a PDF through the
browser does not change that API contract. Back navigation uses the child tuition
fragment. A ResizeObserver keeps its initial alignment while asynchronous
academic content above it settles, ending alignment on user input.

## Presentation and scope

Tuition reuses official branding, self-hosted Inter/Arabic fonts, application
tokens and Light, Mist, Midnight and Dark themes. Orange actions and selected
navigation replace illustrative mockup blue. EN/FR/AR, RTL/LTR, bidirectional
money/name isolation, focus outlines, retry, loading, empty and denied states are
supported. Wide data tables retain semantics and become labelled rows below the
desktop breakpoint; receipt printing restores table presentation. Local content
styles are scoped to the tuition workspace, with no shared palette changes.

The mockups guide hierarchy and content. Actual class-balance bars and a method
list replace unsupported donut/trend decoration. No hardcoded student totals,
growth percentages, invented trends or sample school details enter product data.
No dependency, chart library, database migration, new financial write endpoint,
online payment gateway, invoice/accounting feature or hosted change is introduced.

## Verification checkpoint and limits

Saved local evidence inspected for this checkpoint:

- `test-results/tuition/final-tests.log`: 24 files passed; 235 tests passed,
  15 optional native PostgreSQL concurrency tests skipped in one file.
- `refinement-tests-final.log`: six files / 45 tests passed;
  `parent-security-final.log`: two files / 14 tests passed. These overlap the
  focused coverage and are not additive distinct test totals.
- `final-results.json`: 48 role/locale/theme/viewport cases and 48 responsive
  checks, with no recorded overflow, contrast failures or page errors.
- `auth-regression/results.json`: six exact captures, two tiny differences
  (7 and 15 pixels), with unchanged dimensions. No protected authentication,
  shell or dashboard source was changed by the tuition work.
- `regression/results.json`, `teacher-regression.json` and
  `parent-regression.json`: six dashboard captures in total, all with zero
  changed pixels and unchanged dimensions.
- Root lint and typecheck completed successfully in `lint-final.log` and
  `typecheck-final.log`; the final-source production build completed with exit 0
  in `build-final.log`.
- `journeys-results.json`: 12 final local browser scenarios with no failures or
  page errors, including allocation/conflict/retry, locked currency, generation,
  CSV, Parent empty/reversed/denied states, child-fragment alignment, receipt
  Print / Save as PDF, HTML download and denied direct receipt access.

The final focused test rerun after the ResizeObserver change completed with
235 passes and 15 optional PostgreSQL concurrency skips in `final-tests.log`.
The final `journeys-parent-mobile-anchor.png` was visually inspected: the tuition
heading, selected child name and introductory copy are fully below the unchanged
64px navbar at 390 × 844 in Arabic Midnight. The independent review in
`impeccable-verdict.md` marks all four originally scored fixes resolved, with
`disposition: ship` for that fix batch only. It is not whole-surface
certification, hosted acceptance or detector-gate closure. Local implementation
and verification are complete for user review; commit and release remain subject
to the user's separate approval.

Installed Impeccable source guidance was used from the beginning. Engine 0.1.5
context/detector execution was unavailable because it required external-cache
permissions; no detector, numeric visual score or engine gate closure is claimed.
Fixture browser captures and local domain/API tests do not replace real hosted
identity, cross-school/child isolation, persisted payment/receipt or native
multi-connection contention acceptance. No staging, commit, push, deployment,
hosted migration or provider-setting activity is authorized by this evidence.

Existing historical Finance migration notes and older PROJECT-STATE release
inventories remain dated evidence. Pre-existing authentication documentation
drift remains outside this work; `DESIGN.md` and `.impeccable/design.json` are
preserved without repair or regeneration.
