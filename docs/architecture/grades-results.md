# Grades — Results, Calculation, Publication (Task 006D)

> Module: **Grades**
> Status: **Implemented (Task 006D; Result notification recipients approved in Task 012)**
> Related: ADR-011 (Grading Configuration Versioning), ADR-012 (Transactional Outbox), ADR-017 (REST API v1), `docs/domain/domain-model.md` §32–§33, Task 006C (Grade + Result storage).

This document defines how Results are **calculated**, **finalized**, **published** and **revised** in V1, and how historical integrity is preserved. It complements the storage foundation already defined by Task 006C.

---

## 1. Concepts

| Concept | Meaning |
|---|---|
| **SubjectResult** | One Student × (Year + Period + Class + Subject) → numeric value from the Subject's Grades/Assessments. |
| **PeriodResult** | One Student × (Year + Period + Class) → aggregate of the SubjectResults of that period. |
| **AnnualResult** | One Student × (Year + Class) → aggregate of the PeriodResults of that year. Distinct from "the latest PeriodResult". |
| **Calculated** | A value has been computed (`status = 'CALCULATED'`). Not yet protected. |
| **Finalized** | `status = 'FINALIZED'`. Semantically immutable in the Application layer; only an explicit revision may recompute it. |
| **Publication** | A `result_publications` row = the publication record AND its immutable historical snapshot. One row per published version (1, 2, 3 …). |
| **Revision** | Explicit, authorized recomputation of a FINALIZED result followed by publishing the next version. |

**Grade ≠ SubjectResult ≠ PeriodResult ≠ AnnualResult.** These are distinct business entities with distinct aggregates (BR-GRADE-007/008/009). Publication is separate from calculation and finalization (BR-GRADE-010).

---

## 2. The Calculation Engine

The engine is **pure** (no I/O, no framework) and lives in:

```
apps/web/lib/modules/grades/domain/calculation/
├── decimal.ts   # DecimalValue — exact fixed-point math
├── engine.ts    # computeSubjectResult / computePeriodResult / computeAnnualResult
└── index.ts
```

- Exact **BigInt fixed-point** arithmetic at `DECIMAL_SCALE = 12`. Floating point is never used for academic values.
- Rounding happens **only at the end** of an aggregate, using the configured rounding mode/scale.
- Storage formatter converts to `toFixed(2)` (the V1 `numeric(6,2)` columns); the engine never loses precision internally.

### Inputs

| Engine call | Inputs |
|---|---|
| `computeSubjectResult` | Assessments (type, maxScore, weight), Grades (score + state), `RulesInput`, CurriculumSubject `coefficient`. |
| `computePeriodResult` | SubjectResults (value + coefficient), `RulesInput`. |
| `computeAnnualResult` | PeriodResults (value), `RulesInput`. |

### Coefficient source

The **only** coefficient source is `CurriculumSubject.coefficient` (BR-SUBJECT-002). `Subject` never owns a coefficient. A subject value is never scaled by its coefficient — the coefficient is used only when aggregating subject results into a period result.

### Weighting

- `EQUAL` — every assessment weighs equally (percentage of max score).
- `WEIGHTED` — the weight comes from `assessmentWeighting.weightsByType` in the GradingConfigurationVersion (e.g. QUIZ 25 / EXAM 75). A missing type weight or a zero total weight → controlled `incomplete` (`UNCONFIGURED` / `ZERO_WEIGHT`). It is NOT inferred from `Assessment.weight`.

### `incomplete` outcomes (controlled, never invented)

The engine NEVER fabricates a default for an unresolved policy (BR-GRADE-*). Unsupported or unconfigured combinations produce a machine-readable `incomplete` outcome:

| Reason | Meaning |
|---|---|
| `NO_VALID_GRADES` | No assessments/grades to aggregate. |
| `GRADE_STATE` | A grade is not `VALID` (MISSING / ABSENT / EXCUSED). |
| `REQUIRED_ASSESSMENT` | A required assessment type is absent. |
| `UNCONFIGURED` | Required rules are absent (maxScore, rounding, period/annual calculation, weights…). |
| `MISSING_COEFFICIENT` | A coefficient is required but absent. |
| `ZERO_WEIGHT` | Total configured weight is zero. |
| `UNSUPPORTED_MODE` | A configured mode has no V1 vocabulary (e.g. annual `WEIGHTED_AVERAGE`). |

The application layer maps these to `CALCULATION_INCOMPLETE` with the reason + details carried on the error.

### Rounding modes

`HALF_UP`, `HALF_DOWN`, `HALF_EVEN`, `TRUNCATE`, `NONE` (rounding to scale 0 → returns full internal precision).

---

## 3. Lifecycle

```
CALCULATED ──finalize──▶ FINALIZED ──publish──▶ Publication (version N)
     ▲                        │                        │
     └── calculate (upsert)   │                        ▼
                              └── revise: recalc(revision) → finalize → publish (version N+1)
```

- **Calculate** — compute + upsert (`CALCULATED`). Idempotent while `CALCULATED`.
- **Finalize** — `CALCULATED → FINALIZED` (one-way; guarded).
- **Publish** — requires `FINALIZED`; creates a snapshot row + outbox event (`ResultPublished`).
- **Revise** — explicit; requires an existing publication; recomputes with the SAME bound configuration version, re-finalizes, publishes `ResultRevisionPublished` (version N+1).

### Configuration binding (BR-GRADE-013 / BR-HISTORY-004)

- Every result row binds the exact `gradingConfigurationVersionId` that produced it.
- Period/Annual results require ALL aggregated inputs to share ONE version; if they disagree → `INVALID_RESULT_STATE`.
- A revision recomputes with the result's OWN bound version — never silently adopting a newer configuration.

---

## 4. Publication Model

One `result_publications` row is both the publication record and the immutable snapshot: it denormalizes the published value plus the full academic context (School / Student / Year / Period / Class / ConfigurationVersion) and the metadata (`publication_version`, `published_by`, `published_at`, `idempotency_key`).

- **Immutability**: rows are never mutated or deleted. Revisions create new rows with the next version.
- **Uniqueness**: `idempotency_key` unique; partial unique `(result_id, publication_version)` per result type → two concurrent publishes of the same version are impossible.
- **Exactly-one-result** CHECK: a publication always references exactly one of the three result tables, matching `result_type`.

### Idempotency (BR-CONCURRENCY-002)

The caller supplies a stable `idempotencyKey`. Replays return the existing row. Concurrent races that slip between read and insert are resolved by catching the unique violation (`23505`) and re-reading the canonical row. A key already used for a **different** result → `PUBLICATION_CONFLICT`.

### Atomicity (ADR-012)

Publication insert + outbox event insert happen in **one database transaction**. A committed publication can never lose its event, and a failed transaction publishes nothing.

### Outbox events

- `ResultPublished` (eventType) — initial publication.
- `ResultRevisionPublished` — revision.

Payloads carry `eventId`, `schoolId`, `studentId`, `resultType`, the result id(s), `resultValue`, `publicationId`, `publicationVersion`, `publishedAt` **and the frozen publication-time notification recipient snapshot** `recipientUserIds` (Task 012). Consumers must be idempotent (at-least-once, CLAUDE.md §32).

### Atomicity of the recipient snapshot (Task 012 §8)

Publication insert + notification-recipient resolution + outbox event insert happen in **one database transaction**. The frozen `recipientUserIds` payload always belongs to the same successful publication operation — a committed publication can never lose its frozen recipient decision, and a failed transaction publishes nothing and freezes nothing.

---

## 9. Result Notification Recipients (Task 012)

Approved V1 recipient policy for `ResultPublished` / `ResultRevisionPublished`:

> Notification recipients are ONLY the eligible PARENT Users of the Student
> whose ResultPublication was published, evaluated at RESULT PUBLICATION TIME.

A Parent recipient must satisfy ALL of:

1. the Parent belongs to the same School as the Result;
2. the Parent is linked to the Result student through an **ACTIVE** ParentStudent;
3. the Parent has a non-null authenticated `user_id`;
4. that User has an **ACTIVE** SchoolMembership in the same School.

Students have no V1 accounts; Teachers, SCHOOL_ADMIN and SUPER_ADMIN are
operational actors — never automatic Result notification recipients.

### Resolution & freezing

- A small pure domain resolver (`grades/domain/result-recipients`) reduces the
  candidate facts (loaded School-scoped by the repository at publication time)
  into a deterministic, deduplicated, canonical-ordered list of
  `recipientUserIds`. A single authenticated User reachable through several
  Parent/relationships appears exactly once.
- The resolved list is frozen **inside the existing Outbox event payload** —
  no new snapshot table, no schema change. The stored `recipientUserIds` are
  historical event data ("Users eligible when this publication occurred") and
  are NEVER recalculated by the Notification processor.
- **Revisions resolve independently**: every publication event (initial or
  revision) resolves its OWN current recipients at its own publication time.
  A revision never copies the previous publication's list (Task 012 §9/§10).

### Zero recipients (Task 012 §5)

A ResultPublication is an academic record. Zero eligible Parents does NOT block
publication — the event is still created with `recipientUserIds: []`, and
processing it succeeds with zero notifications (PROCESSED, not an error).

### Historical integrity (Task 012 §17/§18)

ParentStudent and SchoolMembership rows may change AFTER publication. The frozen
event recipient set never changes: an ENDED relationship does not remove an
already-frozen recipient, and an INACTIVE membership does not either — the
notifications composite FK targets `school_memberships(school_id, user_id)`,
and INACTIVE rows still satisfy it, so delayed event processing preserves the
historical publication-time decision.

### Notification ≠ access (Task 012 §21/§22)

A Notification references the exact ResultPublication as `source_id`, but
notification existence NEVER grants Result access. Opening the source still
requires the normal school-scoped authorization pipeline (Authenticated →
Membership → School Context → Parent relationship/ownership → Resource state →
ALLOW/DENY). There is no "notification possession" authorization.

---

## 5. Authorization Matrix (Part U)

Every protected operation is re-authorized **server-side** via the canonical pipeline (CLAUDE.md §15/§16). Frontend permission checks are UX only.

| Operation | Permission | Scope | Resource state |
|---|---|---|---|
| Calculate SubjectResult | `grades.enter` **OR** `grades.manage` | teacher (Class+Subject+Year via ACTIVE TeacherAssignment) **OR** school | Gradebook `OPEN`/`CLOSED` |
| Calculate PeriodResult | `grades.manage` | school | — |
| Calculate AnnualResult | `grades.manage` | school | — |
| Finalize | `grades.manage` | school | — |
| Publish / Revise | `grades.publish` | school | — |

- Teacher: can calculate a Subject within their assignment scope, cannot finalize/publish/revise.
- School Admin: can calculate/finalize/publish/revise.
- Parent: denied for all (read-only domain).
- Cross-school operations are denied by the pipeline (no School Membership), regardless of valid UUIDs.

---

## 6. Error Codes

Generic codes follow CLAUDE.md §28. Feature codes (`ResultDomainError.featureCode`):

`CALCULATION_INCOMPLETE`, `CONFIGURATION_INVALID`, `GRADEBOOK_NOT_AVAILABLE`, `STUDENT_NOT_ENROLLED`, `RESULT_NOT_FOUND`, `RESULT_ALREADY_FINALIZED`, `RESULT_NOT_FINALIZED`, `RESULT_ALREADY_PUBLISHED`, `RESULT_NOT_PUBLISHED`, `INVALID_RESULT_STATE`, `PUBLICATION_CONFLICT`.

`CALCULATION_INCOMPLETE` carries `{ reason, details }` derived from the engine's `incomplete` outcome.

---

## 7. API (ADR-017)

All endpoints are protected and server-authorized (`getSessionUserId` + school context).

| Method & Path | Action |
|---|---|
| `POST /api/v1/results/subjects/calculate` | Calculate a SubjectResult (gradebookId, studentId). |
| `POST /api/v1/results/periods/calculate` | Calculate a PeriodResult. |
| `POST /api/v1/results/annual/calculate` | Calculate an AnnualResult. |
| `POST /api/v1/results/:id/finalize` | Finalize. |
| `POST /api/v1/results/:id/publish` | Publish (idempotencyKey). |
| `POST /api/v1/results/:id/revise` | Explicit revision (idempotencyKey). |

---

## 10. Tests

| File | Covers |
|---|---|
| `apps/web/__tests__/grades/calculation.test.ts` | Pure engine: decimal math, weighting, coefficients, incomplete outcomes, rounding modes (21 tests). |
| `apps/web/__tests__/grades/result-workflow.test.ts` | PGlite end-to-end: calc→finalize→publish→revise, idempotency, snapshot immutability, config binding, outbox events, period/annual aggregation (6 tests). |
| `apps/web/__tests__/grades/publication-auth.test.ts` | Authorization matrix + tenant isolation + resource state (8 tests). |
| `apps/web/__tests__/grades/grading-rules.test.ts` | Rules payload validator (existing Task 006A). |
| `apps/web/__tests__/notifications/result-recipients.test.ts` | Pure resolver: eligibility filters, deduplication, deterministic ordering, zero-parents → `[]` (Task 012 §23). |
| `apps/web/__tests__/notifications/result-notifications.test.ts` | ResultPublished/ResultRevisionPublished payload freezing, publication → processing integration, historical stability (ParentStudent/SchoolMembership changes), zero-recipient processing, malformed payload → FAILED, source reference, end-to-end T1/T2 scenario (Task 012 §24/§25/§26). |

---

## 11. Non-Goals (V1)

- No email/SMS/push delivery for published results — notifications are the
  persisted in-app records produced by the Notifications processor (Task 012
  closes the ResultPublished → Notifications integration gap; delivery
  channels remain out of scope, ADR-014/ADR-015).
- No scheduled outbox delivery worker yet — Task 013 added the safe
  retry/batch entry points (`docs/architecture/outbox-operations.md`); a
  periodic runner invoking `processRetryableOutboxEvents()` is a future task.
- No gradebook-closing automation.
- No announcement/gradebook UI (later UI tasks).
- Homework never automatically becomes a Grade/Assessment.