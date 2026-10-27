# People V1 frontend handoff

Local checkpoint: 2026-10-26. Students, Teachers and Parents extend the existing Madrasio application world in Operate mode. The implementation is ready for user visual review; this document does not record user approval, hosted acceptance or deployment.

## Scope and authority

The 24 supplied HTML references in `C:/Users/Ultrapc/Downloads/Madrasio-People-Step3-Visual-Mockups/Madrasio-People-Step3` guide content hierarchy and responsive composition. PRODUCT.md, DESIGN.md and the existing server contracts remain authoritative. This extension covers the existing Students/Teachers/Parents directories and details, enrollment/transfer, assignments, relationships and supported profile/account actions. The Parent portal, shared application shell, authentication, global tokens, official assets, fonts and four exact theme backgrounds retain their existing scope.

Production changes live in `apps/web/components/{students,teachers,parents,people}` and People translations/helpers, including `people-experience`. `people/people.css` contains content-scoped rules. Existing TableShell, Modal, Field, SearchInput, permission checks, API clients and mutations remain the foundation. There are no new schemas, migrations, endpoints or authentication contracts.

## Implemented composition and behavior

Directories retain server search, machine-valued status filters and server pagination. Names remain full and readable; code, lifecycle status, supported account state and actions stay explicit. The directory does not add placement queries for each row. At narrower widths rows become compact cards; names, mixed-direction values and translated labels can wrap.

Details lead with initials, full identity and lifecycle status, then section links and distinct profile, placement/account and dated history areas. Person creation is separate from dated Enrollment, Assignment, Parent relationship and account provisioning. V1 has no Student login. Teacher and Parent account actions reuse existing provisioning/recovery behavior without inventing delivery guarantees, user identifiers or role authority.

Enrollment shows exact Student/Year/Class/date context. Transfer repeats the current Class and fixed Year, then destination and effective date, while explaining retained history. Placement selects the sole active Year automatically; multiple active Years require explicit choice. Teacher assignment repeats Teacher plus Year/Class/Subject/date. Ending records preserves their exact historical context. Teacher views remain read-only where authorized, omit administrative actions, and exclude Student DOB according to the server contract.

Parent linking searches one bounded page at a time, repeats the Parent and selected Student identity/code/status, and submits only the currently visible eligible Student. Search submission and page changes clear the earlier selection. Ending and relinking preserve separate historical rows. Existing server authorization, tenant isolation, dated scope and concurrency rules remain authoritative.

The approved form layouts use existing protected-focus dialogs with real selected-person context and explicit completion/cancel actions. Illustrative wizard steps, demographics and unsupported identity fields were not introduced. Forms retain validation, failure drafts, pending states and existing feedback. Loading, empty, error/retry and unavailable context remain explicit.

People styling reuses existing semantic tokens and self-hosted Inter/Arabic. The scoped content uses restrained bordered cards, muted identity fields, circular initials and orange primary actions. RTL retains logical spacing and unmirrored official marks. Forms become one column on mobile. Enrollment, assignment and relationship histories use compact two-column records below the existing responsive-table threshold, retaining supported dates/status and eligible actions while hiding empty action labels. Desktop history tables retain their composition. Reduced-motion preferences are honored.

## Evidence and review limits

See the [verification report](../../test-results/people-v1/REPORT.md), [screenshot index](../../test-results/people-v1/SCREENSHOTS.md), [actual screenshots](../../test-results/people-v1/screenshots/) and [independent Impeccable review](../../test-results/people-v1/impeccable-review.md). The report is the reconciled evidence entry point; links may be populated as the final local run completes.

Recorded runs inspected for this handoff:

- Root lint, typecheck and the 58-route production build passed in the parent verification session.
- Focused domain run: 283 passed / 3 skipped; connected run: 464 passed / 12 skipped; adjacent Grades/shell/theme run: 153 passed. Runs overlap and are not a unique aggregate total.
- Final People UI run after the mobile-history correction: 72 passed.
- Native PostgreSQL 17.6 verification: 3 passed, covering concurrency, isolation and historical integrity; all 59 initial seeded-table fingerprints matched, and 53 unrelated-table fingerprints remained unchanged after mutations (excluding the six People tables expected to change).
- Fixture browser journeys: 29 passed, covering bounded queries, exact payloads, validation/failure drafts, permissions, explicit Year choice, history preservation, account actions and selection clearing.
- The completed final matrix after the compact-history correction records 288 locale/device/theme cases and 108 responsive checks with no reported errors, failures, overflow, clipping or sampled contrast findings.
- Protected comparisons: 16 of 18 captures are pixel-identical (six authentication, six role dashboard and four additional Grades captures). English desktop Login has 10 changed pixels and Set Password has 7, isolated glyph/antialias differences recorded in `auth-regression/tiny-differences.json`; no material visual regression or layout/source change was observed. Grades captures use the same scroll position as their baselines; the capture harness correction required no production source change.

The fresh Impeccable reviewer inspected all 24 reference/actual pairs. Its single material correction was compact mobile history. The reviewer reopened the four affected Arabic mobile captures and four English desktop counterparts, confirmed retained fields/actions and read-only boundaries, and ended with `disposition: ship` for that scored fix only. The original full review and its limitations remain in the report. No detector score or numeric reference fidelity score is claimed; the unavailable engine is not treated as a passed gate.

Screenshots and browser journeys use local synthetic fixtures, not live-school totals. Source inspection, recorded test output and the independent screenshot review support this bounded local checkpoint. The user must visually review the actual implementation before local sign-off.
