# Grading configuration administration — Task 059

## Existing model and scope

ADR-011 and Task 053 remain authoritative. A School owns a named
GradingConfiguration and numbered GradingConfigurationVersions. This aggregate
does not belong to a CurriculumVersion, Subject or AcademicYear. A Gradebook
binds an exact rules version and academic context; Subject/Period/Annual results
and publications retain that version. Period/annual aggregation rejects mixed
versions instead of guessing a current/latest version.

Before Task 059, Gradebook setup could select eligible active rules versions, but
could not create or administer them. Assessment type, maximum score and weight
already have separate Gradebook setup controls. CurriculumSubject remains the
sole coefficient-value source. Neither surface is duplicated here.

## Application workflow

`/grades/configuration`, linked from Gradebook setup for `grades.manage` actors:

- list School configurations, including inactive/archived;
- create a named configuration and initial DRAFT rules version atomically;
- correct unused drafts; create subsequent numbered drafts;
- activate a draft, atomically archiving the prior active version;
- archive versions; deactivate/reactivate a logical configuration, or archive
  it permanently; historical rows remain readable and are never deleted.

API: `/api/v1/grading-configurations` GET/POST, `/{id}` GET/PATCH (status only),
`/{id}/versions` POST, `/{id}/versions/{versionId}` PATCH (rules OR status).
The existing eligible-version discovery API is unchanged. Current School and
actor come from the authenticated server context. Bodies are strict: no School,
role, curriculum, subject, authority or arbitrary relationship fields. Responses
are private/no-store. Services independently require `grades.manage` with the
normal School authorization pipeline. Teacher/Parent/platform-only authority
does not suffice. Existing School-scoped SUPER_ADMIN membership semantics are
preserved; the independent Task 058 platform flag grants nothing here.

## History and concurrency

Only DRAFT rules under an ACTIVE configuration, with no Gradebook, SubjectResult,
PeriodResult, AnnualResult or ResultPublication reference, may change. ACTIVE
versions are immutable even before first use. ARCHIVED versions cannot reactivate
or return to draft. Existing references are never rebound; activation/status
operations do not calculate, publish or revise results. Historical calculation
and revision reads continue using the original version, including archived rules.

Mutations serialize on the School-owned configuration using FOR UPDATE. Version
editing then takes a full FOR UPDATE lock on the exact version, followed by a
separate dependency query at READ COMMITTED. Immediate referencing foreign keys
conflict with that full row lock: committed prior usage is visible before edit;
new references wait behind it. Version numbers and activation serialize on the
parent; existing unique indexes remain the final duplicate/one-active guard.
Gradebook creation takes parent/version FOR SHARE locks in the same order, then
revalidates active eligibility and inserts in one READ COMMITTED transaction.
This prevents a stale eligible-version read from crossing concurrent archival.
Draft corrections serialize; concurrent corrections use last-committed-write
semantics (no new optimistic revision field). This gate uses local PGlite tests
and code-level lock-order evidence, not a live multi-connection PostgreSQL race
proof. No stronger race-test claim is made.

The UI explains the history lock and offers a new draft, not force update. New
version activation may mean future Gradebooks must consistently select that new
version for a result aggregation; it does not make mixed-version aggregation valid.

## Fields and existing calculation semantics

| Setting | Existing consumer / boundary |
| --- | --- |
| Assessment weighting EQUAL/WEIGHTED, weights by existing type | Subject normalized scores; weights 0–100, divided by actual total, not required to total 100 |
| Required assessment types | Subject completeness check; absent optional list means none |
| Result maximum score | Subject normalized aggregate rescaled to this maximum |
| Passing score | Validated metadata, not used by the current average engine; no new pass/fail calculation |
| Rounding mode / scale 0–6 | Subject, Period and Annual calculations |
| Period SIMPLE/WEIGHTED_AVERAGE | Subject aggregation; weighted requires CurriculumSubject coefficient usage |
| Coefficient usage | Selects use/ignore strategy; never supplies coefficient values |
| Annual SIMPLE_AVERAGE | V1 period aggregation; weighted annual mode is not implemented by the engine and cannot be activated here |

Shared `validateGradingRules` remains the semantic numeric validator; a closed
administration schema rejects unsupported categories/nested keys/type names.
Drafts may be incomplete. Activation additionally requires the categories needed
by the engine and positive aggregate type weighting where selected. Missing
weights for actual later assessments, missing curriculum coefficients or missing
grades still produce the existing controlled calculation failures. No formula
or engine code changes are made. Historical raw rules remain viewable even if
they predate the stricter administration contract.

## Audit and UX

Closed actions: GradingConfigurationCreated, GradingConfigurationStatusChanged,
GradingConfigurationVersionCreated, GradingConfigurationRulesChanged,
GradingConfigurationVersionStatusChanged. SCHOOL scope, session actor and exact
configuration/version resource; bounded string metadata contains only
configurationId, versionNumber and statuses. No complete rules/before-after
blobs. Each event and mutation shares a transaction; activation includes prior
version archive events. Failed audit rolls the whole action back. Denied/invalid
operations and unchanged rules/status produce no success event.

Task 056 shared Field/FormActions/feedback/pagination/containers are reused.
Forms have pending protection, controlled persistent errors and success feedback.
Only configuration administration and eligible-version queries are invalidated;
no global cache clearing or session changes.

## Persistence and local acceptance boundary

No migration, schema or dependency change: 18 migrations, 40 application tables,
42 recovery tables. Tests cover draft correction, immutable activation/history,
tenant/role denials, identity-preserving authorization, strict validation, audit
rollback, archived revision reconstruction, API contracts and accessible UI.
Task 059 A1 runs focused local regressions plus lint/typecheck/diff checks only.
Full suite/build/E2E and hosted acceptance remain separate gates.
