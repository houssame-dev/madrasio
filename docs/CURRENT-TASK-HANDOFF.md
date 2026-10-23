# Madrasio - Current Task Handoff

## Current release checkpoint — 2026-10-23

**V1 UI/UX implementation and local quality verification complete; release actions
and real-account STAGING acceptance are not performed or authorized here.**

Local `main` remains at `fbb451a0ff4f5202603543fcd94b5b71fd57fc6c`.
All nine UI/UX phases and the original Teacher timetable improvement remain
uncommitted. See [the authoritative current project handoff](PROJECT-STATE.md#current-handoff--v1-uiux-release-checkpoint-2026-10-23)
for scope, validation, migration review and release boundaries.

Saved local evidence: **1,497 distinct passing tests / 163 files; 2 existing skips
and 21 TODOs; 63 synthetic Chromium contexts; lint, typecheck, production build
and diff checks exit 0**. These are local results, not new CI, deployed-SHA or
hosted acceptance. Existing skipped/TODO evidence is not counted as passing.
Real-account STAGING login/session behavior, School switching, tenant/Parent-child/
Teacher isolation, persisted Finance/receipts and notification delivery still
require separately authorized acceptance.

Proposed release: **158 exact paths**, including the two synchronized documents,
UI, tests, translations and official branding/configuration. Exclude and preserve
`attendance-sessions-new-files.zip`, `attendance-sessions-review.diff` and
`attendance-sessions-review.patch`. No dependency, API, schema or migration change
is proposed. The committed local chain is 31 entries through 0030; hosted ledger
freshness is unknown. The unchanged 0010 snapshot-parent discrepancy is recorded
in PROJECT-STATE for separate review before future migration generation.

Next: review the exact selective inventory and obtain Git checkpoint authorization.
Before any push approval, account for automatic CI **and STAGING migration/deploy**
on `main`, including existing target/TLS/ledger/recovery safeguards. Then verify
workflow/exact-SHA outcomes and separately authorize real-account STAGING acceptance.
Production and onboarding remain outside this checkpoint. Do not stage, commit,
push, deploy, run migrations or contact providers from this handoff alone.

The older direction and reconstruction below are preserved historical evidence.
Their former "current", ADR and admission statements are not active instructions;
accepted current ADRs and the repository's simplified cookie-locale strategy remain
unchanged. No retired ADR is recreated and no old approval is inferred.

## Historical owner direction — 2026-10-16

TASK_066_SIMPLIFIED_MULTILINGUAL_V1 replaces the prepared account-persistence/navigation strategy with a validated browser presentation cookie and full-document reload. ADR-024, ADR-025 and ADR-026 are removed and impose no active requirements. Current source and PROJECT-STATE.md govern current status and executed validation. The reconstruction below is preserved historical evidence, not implementation instructions or acceptance for the new V1. No hosted operation, migration application or deployment is authorized.

## Historical handoff reconstruction — preserved

## A. Project Identity

- Project: Madrasio, a multi-tenant School Management SaaS.
- Repository: `houssame-dev/madrasio`.
- Branch: `main`.
- Reconstruction date: 2026-10-15 (Africa/Casablanca).
- Stack: Next.js, TypeScript, Supabase PostgreSQL/Auth, Drizzle ORM, next-intl.
- This is an evidence snapshot and continuation guide, not implementation authorization.
- Apply [PRD precedence](../PRD.md#4-source-of-truth-hierarchy) and accepted ADRs.
- No missing prompt has been reconstructed or presumed executed.

Evidence labels used throughout:

- **VERIFIED**: directly observed local Git metadata, file bytes or source content.
- **DOCUMENTED BUT NOT INDEPENDENTLY VERIFIED**: an existing acceptance/validation report, not rerun here.
- **PENDING**: explicitly deferred work or approval in the inspected records.
- **UNKNOWN**: execution or outcome cannot be established from the available evidence.

## B. Current Task

- **VERIFIED/documented roadmap:** Task 066 - Multilingual and Responsive V1 Completion.
- **Current workstream:** TASK_066_04 - User language preference and locale activation/session integration.
- **Latest observable governance checkpoint:** ADR-025 metadata and register are Accepted.
- **Implementation stage:** architecture accepted; preference persistence/API/selector/activation are not implemented in the inspected source.
- **Parallel unfinished source:** navigation, shared-state and AppShell localization changes and tests are present but uncommitted.
- **Current objective:** preserve this exact state and reconcile checkpoint evidence before authorizing another development slice.
- TASK_066_03 foundation is committed; TASK_066_04 and overall Task 066 are not complete.
- Do not equate accepted architecture, authored tests, or source review with runtime acceptance.

## C. Repository Authority

**VERIFIED at reconstruction:**

- Origin: `https://github.com/houssame-dev/madrasio.git`.
- Local HEAD: `30338c7860817490f19edb559a32cc8143e463cf`.
- Local `origin/main`: `30338c7860817490f19edb559a32cc8143e463cf`.
- These refs agree locally. No fetch/network readback was performed; remote freshness is UNKNOWN.
- Before this document: 27 modified tracked + 6 untracked = 33 status entries.
- Staged files: 0. Tracked deletions: 0.
- This document adds one untracked file: resulting inventory is 27 modified + 7 untracked = 34.
- Every pre-existing change is protected; a dirty working tree is intentional.

Pre-existing porcelain v1 inventory (repository-relative paths):

```text
 M apps/web/__tests__/frontend/academic/test-helpers.tsx
 M apps/web/__tests__/frontend/announcements/test-helpers.tsx
 M apps/web/__tests__/frontend/app-bootstrap.test.tsx
 M apps/web/__tests__/frontend/attendance/test-helpers.tsx
 M apps/web/__tests__/frontend/dashboard/test-helpers.tsx
 M apps/web/__tests__/frontend/grades/configuration.test.tsx
 M apps/web/__tests__/frontend/grades/test-helpers.tsx
 M apps/web/__tests__/frontend/homework/test-helpers.tsx
 M apps/web/__tests__/frontend/i18n/locales-catalogs.test.ts
 M apps/web/__tests__/frontend/navigation.test.tsx
 M apps/web/__tests__/frontend/notifications/test-helpers.tsx
 M apps/web/__tests__/frontend/parents/test-helpers.tsx
 M apps/web/__tests__/frontend/platform.test.tsx
 M apps/web/__tests__/frontend/students/test-helpers.tsx
 M apps/web/__tests__/frontend/teachers/test-helpers.tsx
 M apps/web/__tests__/platform/layout.test.tsx
 M apps/web/components/app/app-shell.tsx
 M apps/web/components/app/navigation-links.tsx
 M apps/web/components/ui/states.tsx
 M apps/web/i18n/messages/ar.ts
 M apps/web/i18n/messages/en.ts
 M apps/web/i18n/messages/fr.ts
 M apps/web/lib/frontend/navigation.ts
 M docs/PROJECT-STATE.md
 M docs/adr/README.md
 M docs/architecture/overview.md
 M docs/architecture/security-and-production-hardening.md
?? apps/web/__tests__/auth/local-auth-gateway.test.ts
?? apps/web/__tests__/fixtures/local-auth-gateway.ts
?? apps/web/__tests__/frontend/i18n/app-shell.test.tsx
?? apps/web/__tests__/frontend/i18n/shared-states.test.tsx
?? docs/adr/ADR-024-trusted-control-plane-and-restricted-local-test-workloads.md
?? docs/adr/ADR-025-user-language-preference-and-request-locale.md
```

Working-tree SHA-256 anchors, verified from actual bytes:

| File | SHA-256 |
|---|---|
| `docs/PROJECT-STATE.md` | `81FB41D055201AA34D49338101822A446497F0129440CA540EDF5FC0A6B1A50F` |
| `docs/adr/README.md` | `D2E646B54FA07113B6BD8CCD8EFC3330D34AFB075E9FD37C0B8481513D1E9B43` |
| `docs/adr/ADR-024-trusted-control-plane-and-restricted-local-test-workloads.md` | `8648A08482E66B170539BB4E47A86B6D9B9EE6ABEB1DC13009E3AEFEF1148B28` |
| `docs/adr/ADR-025-user-language-preference-and-request-locale.md` | `D76C7DCA84EE2D1D3A38CE5C56D2D43CAB637C69DC77464F30EF21B2A07EADFE` |
| `apps/web/__tests__/fixtures/local-auth-gateway.ts` | `06306A9F52F988C962304D1C23A370FBCF8C07D807CA7A93BD06C247CBF69CFC` |
| `apps/web/__tests__/auth/local-auth-gateway.test.ts` | `E2F9B462F927E3C9565B7F527F444839366E547D87289E9078D41D8A6AC16790` |

## D. Verified Completed Work

**VERIFIED commits in the local main history:**

| Commit | Observed change |
|---|---|
| `5e6c8fb0933c20b826dcab6d98deef13be2fc0bc` | Typed multilingual foundation, next-intl integration, three catalogs and focused tests |
| `7aae8b76eeb730631d7791014be3d6a862a238c2` | Two exact-version dependency-build script denials in `pnpm-workspace.yaml` |
| `30338c7860817490f19edb559a32cc8143e463cf` | Latest local commit: TASK_066_03 project-state closeout |

**VERIFIED working-tree architecture state:**

- [ADR-023](adr/023-explicit-platform-authority.md), lines 13-22: ACTIVE platform authority remains separate from school memberships.
- ADR-024 (removed ADR; historical reference), lines 1-4: Accepted, dated 2026-10-14.
- ADR-024 is registered Accepted; its file remains untracked.
- ADR-025 (removed ADR; historical reference), lines 1-4: Accepted, dated 2026-10-15.
- ADR-025 is registered Accepted; its file remains untracked.
- ADR-025 acceptance is the latest identifiable completed governance state beyond the October 14 handoff.
- Neither ADR acceptance establishes implementation, isolation, Auth refresh or release readiness.

**DOCUMENTED BUT NOT INDEPENDENTLY VERIFIED validation:**

- [PROJECT-STATE](PROJECT-STATE.md), lines 43-71: foundation 29 focused tests; database 374; web 1,835 passed/13 skipped; combined 2,209 passed/13 skipped; lint/typecheck/build PASS; 38/38 static pages.
- Focused tests overlap canonical suites; do not add them again to the unique total.
- Lines 101-112: gateway R4-L4 reports ESLint PASS, Vitest 120 passed/0 skipped, TypeScript PASS at current HEAD.
- Gateway tests mock HTTP and inject transports/listeners; these are hermetic reports, not real GoTrue/browser proofs.
- Lines 116-125 record ADR-024 E3E-R acceptance verification.
- CI and Deploy STAGING SUCCESS are operator-reported; successful run IDs and deployed-SHA readback are not supplied.
- This reconstruction ran no tests or builds and independently verified no hosted outcome.

## E. Current Work in Progress

**VERIFIED source artifacts:**

- `apps/web/lib/frontend/navigation.ts` and `apps/web/components/app/navigation-links.tsx`: keyed translated navigation retaining role/permission filtering.
- `apps/web/components/ui/states.tsx`: translated default shared states with caller overrides.
- `apps/web/components/app/app-shell.tsx`: translated shell labels; existing logical sidebar CSS; physical directional chevrons remain.
- EN/FR/AR catalog source contains foundation/navigation/state/shell namespaces; the catalog test specifies 37 leaves (6 + 14 + 8 + 9).
- Focused shell/shared-state test files and feature provider-helper changes are present.
- These uncommitted additions do not inherit the old foundation/gateway test results.
- Named NAV_01/STATE_01/SHELL_01 review outcomes are not independently established by repository test source alone.

**VERIFIED activation boundary:**

- `apps/web/i18n/request.ts`, lines 5-10: English request locale/catalog.
- `apps/web/app/layout.tsx`, lines 21-28: default HTML language/direction and root intl/Query composition.
- `database/drizzle/schema/users.ts`, lines 41-61: no preferred-language field.
- No proposed language resource/selector/sync implementation was found in the inspected application source.
- Auth/session, schema/migration and API paths have no working-tree diff against HEAD.
- No production middleware file was found under `apps/web`; refresh-safe root rendering is not proved.

**E3F status reconciliation:**

- VERIFIED: E3F-style documentation additions are present, unstaged, in PROJECT-STATE, architecture overview and security/hardening.
- Their content describes accepted ADR-024 and its security boundary; it is not merely an absent proposed edit.
- DOCUMENTED: PROJECT-STATE lines 25/137 still name E3F-R as next and say that review is not started.
- UNKNOWN: whether E3F-R was actually executed/accepted elsewhere. No repository completion record or matching commit was found.
- Do not call reconstruction an E3F-R review or turn absence of evidence into proof that execution never occurred.
- VERIFIED: subsequent localization and ADR-025 artifacts exist; therefore the live tree advanced beyond the old checkpoint.
- UNKNOWN: the complete chronology or outcomes of every intervening gate.
- The separately proposed full Auth fixture source/test files listed in PROJECT-STATE lines 160-163 are absent.

## F. Last Codex Operation

- Latest identifiable completed pre-reconstruction artifact operation: ADR-025 metadata/register transition to Accepted, corresponding to the D3_A3 continuation checkpoint.
- VERIFIED repository support: matching Accepted metadata/register, hashes in section C and no later main commit.
- Attribution to a particular editor, exact uncommitted edit time and complete review execution cannot be proved by Git status alone.
- Available continuation evidence reports D3_A3 formal acceptance; repository bytes establish the resulting state, not a separate audit log.
- Latest identifiable committed operation: `30338c7860817490f19edb559a32cc8143e463cf`, foundation documentation closeout.
- Missing final Codex prompt: **UNAVAILABLE**.
- Execution status of that missing prompt: **UNKNOWN**.
- Do not identify the missing prompt with ADR acceptance or any proposed task without separate evidence.
- Current reconstruction creates only this document; it does not resume the missing operation.

## G. Current Blockers

- PENDING: explicit authorization and minimal file-level scope for any subsequent implementation or documentation update.
- UNKNOWN: E3F-R completion evidence and the missing final prompt/outcome.
- PENDING: reconcile older PROJECT-STATE checkpoint wording with Accepted ADR-025 and the uncommitted localization work.
- UNVERIFIED: runtime egress, real Auth/browser integration, P1/P2 runtime, server rendering/refresh, hydration and persistent-root coherence.
- NOT_MEASURED: Phase A baseline. DESIGN_REVIEW_REQUIRED: stale refresh after logout/new login.
- UNVERIFIED: Later/soft-navigation coherence, unsaved-work safety, concurrent/stale preference response isolation and Arabic visual readiness.
- No observed repository identity conflict blocks handoff creation; these gaps block unsupported readiness or next-task assumptions.

## H. Exact Next Safe Step

1. The next checkpoint explicitly named in PROJECT-STATE line 137 remains `TASK_066_04_A2_04_5A_2_E3F_R`.
2. Before scheduling or repeating it, obtain explicit authorization for a read-only checkpoint/sequence reconciliation using this live baseline and any available external completion evidence.
3. Resolve whether E3F-R is still pending or already completed; do not rerun the E3F documentation edits merely because their acceptance is uncertain.
4. Account for Accepted ADR-025 and existing localization artifacts; no next implementation gate is automatically authorized by the stale checkpoint text.
5. If E3F-R is confirmed pending, it requires its own explicit authorization. This reconstruction did not perform it.
6. Any later canonical documentation synchronization requires a separately approved exact file scope; PROJECT-STATE is unchanged here.
7. Freshly verify origin/branch/HEAD, all status paths, protected hashes and no staged/deleted/unexpected files before any approved mutation.
8. Stop for baseline drift, missing essential evidence, conflicting canonical requirements, or a request exceeding the approved scope.

After governance reconciliation, ADR-025 lines 453-475 specify separately authorized persistence/API, RTL-readiness, locale-activation and admitted-validation phases. They are not a permission to begin them.

## I. Forbidden Repeat Operations

- Do not recreate ADR-024 or ADR-025, revert their Accepted metadata, or repeat formal acceptance.
- Do not repeat TASK_066_03 implementation or dependency-policy remediation; both are committed.
- Do not overwrite/retranslate existing navigation/state/shell work or replace accepted catalog values.
- Do not repeat gateway construction or run its tests automatically; preserve both existing untracked artifacts.
- Do not reset, restore, stash, clean, discard, stage, commit or push protected work without authorization.
- Do not start tests/builds, browser/Auth/PostgreSQL fixtures, containers, migrations or provider operations from this handoff.
- ADR-024 requires separately verified workload admission; sanitized configuration and mocks do not prove network enforcement.
- No hosted credentials, customer data, existing sessions or recovery datasets may be reused for local proof.
- No STAGING/Production, R2/backup, deployment or workflow operation is authorized.
- Do not use a conditional earlier implementation inventory as an edit authorization.
- Do not claim current uncommitted work compiles, passes tests, renders correctly or is release-ready.

## J. ChatGPT Continuation Notes

- Start with PRD, this snapshot, PROJECT-STATE, the ADR register and the actual working tree; do not rely on an old summary alone.
- Retain ADR-018/019 identity invariants referenced by ADR-024/025 and ADR-023's independent platform boundary.
- Accepted ADR-025 preserves D1-D6: all ACTIVE authenticated Users, event-based sync, native select, nullable global preference, self-only API, request-scoped rendering and safe full-document transitions.
- It preserves Apply language / Later, pre-save confirmation/cancel, failure-vs-NULL distinction, database authority and account isolation.
- Anonymous selection, polling, reset-to-NULL UI and mandatory realtime remain excluded.
- PROJECT-STATE's latest accepted implementation remains the foundation; its E3F checkpoint predates the Accepted ADR-025 artifacts.
- ADR-025 still contains original proposal/pending-acceptance body wording, including lines 505-506; only its metadata and register were changed during the narrow acceptance operation.
- Treat its Accepted metadata and register as the observed governance status; do not silently rewrite preserved body wording.
- Any housekeeping correction or project-state update requires separate authorization.
- Current ADR/localization/preparation changes are outside HEAD. A file's existence does not prove tests or gate acceptance.
- Tasks 067/068 remain later roadmap work, not authorized next actions.
- No secret environment/configuration files were opened for this reconstruction; no secret values belong in this handoff.
- Final verification preserved all 33 pre-existing status files byte-for-byte; this document is the only addition.
- This snapshot will become stale after any subsequent authorized change; recheck Git and source before acting.
