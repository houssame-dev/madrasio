# Grades & Results V1 — local implementation handoff

Date: 2026-10-26. Status: implemented and locally verified; the user must visually review the actual application before local sign-off. This document does not record user approval, hosted acceptance or deployment.

## Scope and visual authority

This is an Impeccable **Operate** extension of the incumbent Madrasio application. `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` and `.impeccable/surfaces/grades-results.md` remain the visual authority. The 24 supplied HTML references guide content composition within that authority. No new visual world or global token system is introduced.

The implementation retains `/grades`, `/grades/configuration`, `/grades/[id]`, `/results` and the existing My Children/selected-child publication-history routes. Shared shell, role navigation, authentication, dashboards and Attendance application logic remain outside this change. The existing self-hosted Inter/Arabic fonts, official wordmarks, four themes, orange actions, borders, radii and focus conventions continue to apply.

Grading Setup exposes exact configuration versions and their Draft/Active/Archived lifecycle, immutable rule definitions, exact Gradebook academic identity and Draft/Open/Closed/Archived lifecycle, and supported Assessment types, maxima, weights, dates and lifecycle actions. Assessment weight stays distinct from curriculum coefficient. Publishing an Assessment does not publish Results.

GradeEntry and staff publication history retain the existing wide-modal presentation rather than becoming the references' standalone pages. Captures are viewport views of scrollable dialogs, not full-dialog composites. Immutable UUID/version identity, supported rule-definition fields and stored historical values take precedence over illustrative version labels or invented records. These adaptations preserve the approved application world and data truth; the user still needs to review them visually.

## Grade entry and matrix

`components/grades/grade-entry/grade-entry-dialog.tsx` reads the persisted matrix for the selected Assessment, with a bounded 100-student page. The protected editing focus repeats the Gradebook, Academic Year, Period, Class and Subject context alongside Assessment and maximum score. Student names/codes, saved state, changed indicators, unsaved count and explicit Save make the editing scope visible.

Persisted states remain `VALID`, `MISSING`, `ABSENT` and `EXCUSED`. An absent Grade is displayed as **Not entered**; it is never inferred as Missing or zero. Exact decimal strings are retained. VALID input requires a supported non-negative decimal within the Assessment maximum; other states send `score: null`. Client fixed-point comparison validates the maximum and does not calculate averages or Results.

Save sends only changed students through the existing bounded atomic Assessment Grade API. Validation and save failures retain drafts. Dismissal/Escape, roster page changes, ordinary link navigation and browser unload protect dirty edits. Successful saving invalidates the relevant queries and reloads persisted data. The matrix displays stored state/score, with readable mobile records and no browser-derived average.

## Option B data flow

The new `GET`/`POST /api/v1/results/batch` route delegates to `lib/api/result-batch.ts`, strict domain schemas in `lib/modules/grades/domain/result-batch.ts`, application orchestration in `application/result-batch.ts`, and scoped lookup/locking/token logic in `infrastructure/repositories/result-batch.ts`. Paths in this paragraph are relative to `apps/web`.

The browser sends one confirmed request for the selected entries. The server orchestrates existing calculation, finalization and publication primitives; it does not rely on a client mutation loop. The fixed-point/BigInt engine remains the calculation authority. There is no schema, migration, dependency, queue or new formula change.

| Boundary | Implemented contract |
| --- | --- |
| Authority | Actor and School come from authenticated server context. Application authorization additionally resolves the actual database role and requires `SCHOOL_ADMIN`; a forged route role, client School, Teacher ID, coefficient, rules or recipient is not authority. |
| Scope | Exact Academic Year, Class and Result type. Subject requires the exact Gradebook and Period, checked against the Gradebook's real Year/Class/Period/Subject. Period requires the exact Period and rejects Gradebook. Annual uses Year/Class and rejects Period and Gradebook. |
| Discovery | School-scoped Students with dated enrollment overlapping the selected Period or Year; existing calculation eligibility/completeness rules still apply. Candidate pages contain at most 20 students. |
| Input | One to 20 entries, strict object shapes, UUIDs, no duplicate Student/Result IDs, and `confirm: true`. Publication requires distinct stable UUID idempotency keys. Unknown/repeated query parameters and spoofed fields are rejected. POST requires matching Origin. Responses are private/no-store. |
| Staleness | SHA-256 expected tokens bind School, exact scope, Student, current Result row, precise database update timestamp and latest publication identity. The server rechecks identity/token before mutation. These are concurrency tokens, not authorization credentials. |
| Transaction | Each entry runs in its own SERIALIZABLE transaction, locks the School and existing Result, reauthorizes, rechecks dated eligibility/scope/current state, then calls the existing primitive. Successful individual effects are atomic; the whole batch is not atomic. |
| Outcomes | Every entry returns COMPLETED, INCOMPLETE, CONFLICT or FAILED with a controlled code and supported incomplete reason. Serialization conflicts remain explicit; there is no blind automatic write retry. Other entries can succeed independently. |
| Retry | Completed entries are removed from ordinary unsuccessful-entry retries. Changed/stale candidates need refreshed review. Initial publication retries retain the same intended keys and can return REPLAYED without another publication or Outbox event. |

CALCULATE uses the existing Subject/Period/Annual services. Ordinary calculation cannot overwrite FINALIZED Results. Missing or non-VALID Grades remain governed by existing completeness rules; they do not become zero. Failed calculations roll back that entry and do not persist fabricated partial Results.

FINALIZE selects existing CALCULATED Results and requires explicit review/confirmation. PUBLISH is a separate selection/confirmation for eligible FINALIZED Results. Subject confirmation repeats authoritative Gradebook/Subject identity in EN/FR/AR inside the dialog, in addition to Year/Class/Period and count. Annual confirmation has no invented Period.

Batch publication always requests `revision: false`. Already-published Results cannot silently become revisions. The existing individual explicit revision workflow remains available to authorized staff. Successful publication reuses the immutable ResultPublication snapshot, frozen eligible Parent recipient set, audit and transactional Outbox behavior. Publication success means committed publication intent/evidence; it does not claim asynchronous Notification delivery has completed. Concurrent same-intent publication recovery reuses existing idempotency reconciliation.

## Staff history and Parent publications

Working CALCULATED/FINALIZED status is distinct from publication status. Staff history retains initial/revised publication versions, exact rules identity, timestamps, stored historical values and paginated snapshots. Missing historical labels are not reconstructed from today's mutable names.

`child-results-workspace`, `published-results`, `publication-history` and the Results-focused branch of child detail retain the current-School, authorized child/year workflow. Parent views contain only published Subject/Period/Annual snapshots and the exact selected publication/history. They do not expose raw Grades, matrix, unpublished working Results, administration or batch actions. Existing ParentStudent/enrollment and publication authorization remain authoritative.

## Recorded local evidence

Artifacts are under `test-results/grades-results-v1/`. Counts below belong to separate runs and must not be added as unique tests.

| Evidence | Recorded result |
| --- | --- |
| `focused-first.log` | 265 passed |
| `ui-final.log` | 135 passed |
| `review-fix-tests.log` | 131 passed |
| `batch-review-final.log` | 66 passed, including the 55-test corrected People localization suite |
| `native-postgres.log` | 3 native PostgreSQL tests passed; serialization/idempotent publication, partial outcomes and recovery replay, including all 59 recovery-table fingerprints |
| Root `lint-final.log`, `typecheck-final.log`, `build-final.log` | Passed |
| `connected-final.log` | Initial connected run: 965 passed, 9 failed, 11 skipped, 21 todo. All nine failures were obsolete People localization expectations; corrected in tests only and rerun within the 66-pass result. This initial run is not represented as a wholly passing connected suite. |
| `final-results.json` | 288 fixture browser cases and 108 responsive checks; zero recorded errors, failures, page overflow, clipping or sampled contrast failures |
| `fix-matrix-results.json` | Final GradeEntry context: 24 cases and 9 responsive checks; zero recorded errors, failures, overflow, clipping or sampled contrast failures |
| `journey-results.json` | 19 passed fixture journeys: exact Grade save/states/failure retention, unsaved guards, confirmed bounded batches, partial retry, stable publication keys, Teacher denial and Parent published history |
| `recapture-results.json` | All 24 named actual counterparts; six Subject confirmations covering EN/FR/AR desktop/mobile, plus loading, empty and safe-error states; errors empty |
| Protected screenshot comparisons | Two Admin, two Teacher and two Parent captures have zero changed pixels; eight authentication captures have zero changed pixels. See regression/auth-regression artifacts. |

The matrix exercises EN/FR/AR, LTR/RTL, Light/Mist/Midnight/Dark, desktop/mobile and 320/390/768/1024/1440px widths across its cases and responsive checks. Automated checks and fixtures support the evidenced states; they do not prove every possible content length or hosted configuration.

`impeccable-review.md` identified two P2 context omissions: Gradebook/Class/Subject/Year/Period inside GradeEntry and selected Gradebook/Subject inside Subject batch confirmation. Both were corrected and recaptured. `impeccable-verdict.md` records **disposition: ship** for those two scored fixes only, with no whole-module approval. No detector score is available or claimed.

## Remaining acceptance boundary

Browser evidence uses controlled fixtures; native PostgreSQL evidence is separately recorded. No authenticated hosted acceptance, deployment, hosted migration, provider-setting change or Production/customer-data operation is claimed. No staging, commit, push or pull request is part of this handoff. The next step is the user's visual review of the actual Grades & Results implementation before local sign-off. Exact changed-file inventory and the complete artifact index belong to `test-results/grades-results-v1/REPORT.md` when prepared.
