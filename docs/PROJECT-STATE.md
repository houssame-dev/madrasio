# Madrasio — Current Project State

Last updated: 2026-10-09

---

## 1. Current State

### Current Task

`Task 060 — Parent Attendance and Homework Journeys`

### Current Stage

Tasks **050–059 are complete**.

Task 059 completed local acceptance, was committed and pushed to `main`, and both:

- `CI`
- `Deploy STAGING`

completed successfully.

The repository is ready to begin:

`TASK_060_PARENT_ATTENDANCE_AND_HOMEWORK_JOURNEYS`

### Current Branch

`main`

### Latest Accepted Repository State

Task 059 — Grading Configuration Administration

Latest accepted commit:

`CURRENT_HEAD_AFTER_TASK_059`

Replace the value above with:

```bash
git rev-parse HEAD
```

after synchronizing this file.

Hosted verification:

- CI: PASS
- Deploy STAGING: PASS

---

# 2. Current Persistence Snapshot

Expected accepted repository inventory after Task 059:

- Migrations: `18`
- Application tables: `40`
- Recovery tables: `42`

Recovery inventory consists of:

- 40 application tables
- `auth.users`
- `auth.identities`

Latest migrations of particular importance:

- `0016_audit-events.sql`
- `0017_platform-authority.sql`

Task 059 introduced:

- migrations: `0`
- schema changes: `0`
- dependency changes: `0`
- lockfile changes: `0`

---

# 3. Completed Roadmap

Completed:

- Task 001–049 — previous accepted roadmap work
- Task 050 — Production Backup & Recovery
- Task 051 — V1 Product Audit & Gap Analysis
- Task 052 — Password Setup Credential Safety
- Task 053 — Historical Academic Binding Integrity
- Task 054 — Important-Action Audit Foundation
- Task 055 — School Business-Time Consistency
- Task 056 — Shared Accessible Management UX
- Task 057 — Safe Account Recovery
- Task 058 — Minimal Platform School Administration
- Task 059 — Grading Configuration Administration

Current roadmap position:

`Task 060`

Remaining V1 roadmap:

- Task 060 — Parent Attendance and Homework Journeys
- Task 061 — Published Result Understanding and Navigation
- Task 062 — Announcement Publication and Recipient Experience
- Task 063 — Private Application Files and Attachments
- Task 064 — Student DOB
- Task 065 — Homework Delivery and Actual Hand-In
- Task 066 — Multilingual and Responsive V1 Completion
- Task 067 — V1 Regression and Documentation Closure
- Task 068 — V1 Release Readiness and Regression Acceptance

---

# 4. Task 050 — Production Backup & Recovery

Status:

`TASK_050_PRODUCTION_BACKUP_AND_RECOVERY_COMPLETE`

Task 050 is complete.

Earlier intermediate documentation that described Production recovery as pending or customer onboarding as blocked is historical evidence only and must not be interpreted as current state.

## Final Acceptance

Acceptance-state commit:

`abf594db55d5c96e641802f4962e4f930b8f311b`

Production Recovery Time Objective:

`997.767 seconds`

Result:

`ACCEPTED`

Production Recovery Point Objective:

`ACCEPTED`

Backup-specific Production onboarding blocker:

`RESOLVED`

## Production Backup Automation

Accepted recurring backup coverage includes:

- GitHub-native scheduler: ACTIVE
- independent Cloudflare scheduler: ACTIVE

The Cloudflare scheduler implementation/candidate associated with the accepted architecture remains:

`eeb42755f51262a7e82fbc413d7b33f750f06bd6`

A later documentation-only acceptance commit does not imply that the Cloudflare deployment candidate SHA changed.

## Recovery Architecture

The recovery system remains fail-closed and requires isolated recovery targets.

Core properties include:

- encrypted backup artifacts
- external age identity custody
- exact artifact verification
- loopback-only local recovery targets
- explicit restore target rejection for Production/STAGING/Supabase endpoints
- migration reconciliation
- Auth reconciliation
- relationship/data reconciliation
- application-security reconciliation
- deterministic cleanup

Auth recovery scope includes:

- `auth.users`
- `auth.identities`

Recovery evidence must remain revision-aware because schema/recovery contracts evolve with repository versions.

Task 050 should not be reopened unless a later task materially changes backup/recovery requirements or release-readiness validation discovers a regression.

---

# 5. Task 051 — V1 Product Audit & Gap Analysis

Status:

`TASK_051_V1_PRODUCT_AUDIT_AND_GAP_ANALYSIS_COMPLETE`

Task 051 established the current V1 roadmap.

Final disposition summary:

## Required Fix V1

- 012
- 021
- 022

## Required Feature V1

- 001–010
- 013
- 014
- 023
- 024
- 025
- 027
- 028
- 029
- 030

## Required Release Hardening

- 015
- 017
- 018
- 019
- 020

## Verify Before Implementation

- 011

## Deferred to V1.1

- 016
- 026

No unresolved product decisions remain from the Task 051 audit.

### Important Locked Product Decisions

#### Result history

V1 uses minimal publication/revision history:

- current states
- immutable/reconstructable publication history
- revision history

No elaborate result timeline or analytics UI is required.

#### Recovery

Supported V1 account recovery includes:

- resend/recovery
- administrator-assisted recovery
- supported Supabase password reset
- controlled callbacks
- identity preservation

Explicitly excluded:

- delete/recreate recovery
- administrator password sharing
- direct Auth-table password mutation

#### Announcements

V1 requires:

- draft correction
- reschedule/cancel before publication
- immutable/reconstructable post-publication history
- revisions

#### School time

School timezone governs business wall time.

Real instants are UTC.

Date-only values are not converted through UTC.

Browser/device timezone is not authoritative.

Historical records are not rewritten because timezone rules change.

#### Curriculum/Class binding

Normal new Classes may bind only to ACTIVE CurriculumVersions.

Archived historical references remain readable.

#### Success feedback

Ordinary transient success feedback is approximately four seconds.

Errors, warnings and persistent business state must remain persistent when user action is required.

#### Search

Required V1 academic search includes:

- Subjects
- Classes by name
- Curricula by name

Search must not be expanded indiscriminately across all academic lists.

#### Student profile

Student DOB is required for normal new Student records.

It is:

- date-only
- nonfuture

Historical rows may remain nullable.

Student sex/gender is not a V1 requirement.

#### Homework delivery

V1 does not require a redundant delivered enum.

- no submission = Not delivered
- submission = Delivered

Existing statuses remain.

Actual hand-in is handled later by Task 065.

#### Management layouts

Accepted shared containers:

- `MANAGEMENT_WIDE`
- `FORM_DETAIL`
- `READING_CONTENT`

#### Result notifications

Notifications should contain enough context to understand the result, including where applicable:

- Student
- subject/result type
- Academic Year/Period
- value/state
- initial/revised state
- authorized destination

Teacher identity is not mandatory notification content.

---

# 6. Task 052 — Password Setup Credential Safety

Status:

`TASK_052_PASSWORD_SETUP_CREDENTIAL_SAFETY_PASS`

Accepted implementation commit:

`b4fefb38e70459b0fd47fc050366d8969de6995a`

Parent:

`abf594db55d5c96e641802f4962e4f930b8f311b`

## Accepted Security Invariant

Password setup must never leak credentials through native/pre-hydration browser behavior.

The accepted implementation prevents native GET password submission.

Key behavior includes:

- explicit POST semantics
- safe pre-hydration behavior
- controls disabled until hydrated handling is available where required
- JS requirement explanation
- password values never placed in URL/query state
- hydrated Supabase password update behavior preserved
- keyboard and autocomplete behavior preserved

Task 052 remains authoritative for password setup and password-reset form safety.

---

# 7. Task 053 — Historical Academic Binding Integrity

Status:

`TASK_053_HISTORICAL_ACADEMIC_BINDING_INTEGRITY_PASS`

Accepted implementation commit:

`c28afbbc90a59b358fa257070f11e176cf489e90`

Parent:

`b4fefb38e70459b0fd47fc050366d8969de6995a`

## Accepted Historical Invariant

Academic configuration may not be changed in a way that silently reinterprets recorded history.

A Class curriculum binding is locked once dependent academic history exists.

Relevant history includes records such as:

- grades
- calculated results
- historical academic records

Unused Class configuration mistakes may still be corrected when all tenant/lifecycle rules pass.

New Class creation accepts only ACTIVE CurriculumVersions.

Archived historical curriculum references remain readable.

The accepted locking order protects the Class/Curriculum relationship during mutation checks.

This task is a foundational dependency for grading and results work.

---

# 8. Task 054 — Important-Action Audit Foundation

Status:

`TASK_054_IMPORTANT_ACTION_AUDIT_FOUNDATION_PASS`

Accepted implementation commit:

`8dd9782eec176dcebddd234a8ebc13d2184ecbd8`

Parent:

`c28afbbc90a59b358fa257070f11e176cf489e90`

Migration:

`0016_audit-events.sql`

## AuditEvent Foundation

Important application actions now use the canonical immutable AuditEvent mechanism.

Supported scope:

- `SCHOOL`
- `PLATFORM`

Supported actor classification includes:

- USER
- SYSTEM

Audit events identify:

- action
- occurrence time
- scope
- School where applicable
- actor
- resource type
- resource UUID
- bounded semantic metadata

Audit metadata is deliberately bounded.

Secrets, passwords, tokens and large before/after payloads must not be written into audit metadata.

## Atomicity

When both the business mutation and AuditEvent belong to the application database:

- they must commit atomically

A forced audit failure must roll back the associated application mutation.

The audit foundation does not provide:

- a generic public audit-write endpoint
- user-editable/deleteable audit events
- blanket SUPER_ADMIN bypasses

Domain-specific historical tables remain separate from AuditEvent where they already serve another purpose.

---

# 9. Task 055 — School Business-Time Consistency

Status:

`TASK_055_SCHOOL_BUSINESS_TIME_CONSISTENCY_PASS`

Accepted implementation commit:

`34d7b83e2f293179b8869c58685a533b53ccedeb`

Parent:

`8dd9782eec176dcebddd234a8ebc13d2184ecbd8`

Accepted dependency:

`temporal-polyfill@1.0.5`

## Accepted Time Semantics

School timezone is authoritative for School business wall time.

Real instants are stored/handled as UTC.

Date-only values remain date-only and must not be converted through UTC.

Browser/device timezone must not determine business dates.

Invalid IANA zones are rejected.

Nonexistent local wall times are rejected.

Ambiguous local wall times are rejected.

No custom timezone-offset arithmetic should be introduced where the shared School-time adapter already solves the problem.

## Accepted Corrected Areas

Task 055 corrected School-time handling in areas including:

- Attendance
- Teacher dashboard Attendance shortcut
- Announcements
- Homework
- current School context

`/me` exposes authoritative current-School timezone context.

There is no supported School-timezone update API in the accepted V1 repository, so a `SchoolTimezoneChanged` audit action was not invented.

---

# 10. Task 056 — Shared Accessible Management UX

Status:

`TASK_056_SHARED_ACCESSIBLE_MANAGEMENT_UX_PASS`

Accepted implementation commit:

`c3f62e3ae72a7dfa00863f3b182c9ff60887fa25`

Parent:

`34d7b83e2f293179b8869c58685a533b53ccedeb`

## Accessibility

Shared management fields now preserve:

- labels
- React Hook Form refs
- stable helper/error IDs
- invalid state
- required state
- first-invalid focus behavior

Success announcements use accessible polite status behavior.

Search interfaces avoid noisy keystroke announcements.

## Success Feedback

Ordinary successful actions use transient feedback of approximately:

`4 seconds`

Persistent:

- errors
- warnings
- incomplete setup state
- business-state notices

must not be automatically dismissed when user action or understanding is still required.

## Search

Accepted standardized search behavior includes:

- Subjects: existing server search
- Classes: server-backed name search
- Curricula: server-backed name search

Previously existing Student/Teacher/Parent search behavior was standardized but was not interpreted as new product search scope.

Common search behavior includes:

- approximately 350 ms server-search debounce
- immediate clear
- Enter support where appropriate
- pagination reset
- URL state where useful
- loading state
- stale-response safety

## Layout Containers

Accepted layout variants:

- `MANAGEMENT_WIDE`
- `FORM_DETAIL`
- `READING_CONTENT`

Existing application-shell padding remains authoritative.

No universal giant minimum-width layout was introduced.

---

# 11. Task 057 — Safe Account Recovery

Status:

`TASK_057_SAFE_ACCOUNT_RECOVERY_PASS`

Task 057 passed:

- focused acceptance
- canonical local acceptance
- corrective hosted CI remediation
- final CI
- final Deploy STAGING

The final accepted Task 057 state is the repository state immediately preceding the Task 058 base:

`386d99d5667c39a75c0a153d54c66474409fad0a`

## Public Recovery

Public recovery:

- uses supported Supabase password-recovery mechanisms
- returns generic non-enumerating responses
- preserves existing User/Auth identity
- does not reveal whether an account exists

Known, unknown, ineligible and provider-failure cases do not expose account-existence information through the public response.

## Invitation Recovery

Pending/expired invitation recovery operates against the existing identity.

Recovery must not create duplicate Users or SchoolMemberships merely because an invitation expired.

Activated accounts use the supported recovery path rather than account recreation.

## Callback Security

Supported recovery callback types:

- `invite`
- `recovery`

Supported callbacks retain:

- token-hash verification
- controlled canonical recovery origin
- fixed authorized password destination

Caller-supplied arbitrary redirects are not trusted.

A hosted CI regression discovered that unsupported callback types attempted to resolve recovery origin before rejection.

That regression was corrected.

Current invariant:

unsupported callback types are rejected safely before recovery-origin resolution and redirect with the safe invalid-invite behavior.

External `next` values remain ignored.

## Administrator-Assisted Recovery

Authorized School management may initiate recovery only for eligible linked School identities.

Requirements include:

- correct School
- active identity
- valid active membership
- matching role/profile
- verified Auth UUID/email mapping

Cross-tenant, mismatched, conflicting and inactive cases fail closed.

Administrators:

- do not choose passwords
- do not see passwords
- do not receive temporary plaintext passwords

## Audit

Accepted action:

`AccountRecoveryRequested`

Audit metadata excludes:

- email
- password
- token
- recovery URL
- provider secret

## Provider Acceptance Boundary

The following remain intentionally NOT independently verified against the real hosted Auth delivery flow:

- real recovery email delivery
- deployed recovery-template compatibility
- real recovery cookie/session establishment
- subsequent password login through real hosted recovery

These are later provider/release-readiness acceptance items.

They are not reasons to reopen Task 057 repository implementation.

---

# 12. Task 058 — Minimal Platform School Administration

Status:

`TASK_058_MINIMAL_PLATFORM_SCHOOL_ADMINISTRATION_PASS`

Accepted Task 058 repository state is the state immediately preceding Task 059 base:

`f6c0f9d2cab77ac373d8038a0d7cd6489233b62a`

Migration:

`0017_platform-authority.sql`

Architecture decision:

`ADR-023 — Explicit Platform Authority`

## Platform Authority

Before Task 058, `SUPER_ADMIN` existed only as a SchoolMembership-oriented role/placeholder and did not provide a safe explicit platform-authority model.

Task 058 introduced:

`users.is_platform_admin`

Default:

`false`

Platform authority is resolved independently from SchoolMembership.

No existing User or SchoolMembership was automatically promoted.

## Critical Authorization Invariant

Platform authority must never become:

`if platform admin => bypass tenant authorization`

Ordinary School application services continue requiring their normal:

- School membership
- role/permission
- relationship
- tenant scope

Platform administration uses dedicated platform services/routes instead.

## Platform Workspace

Accepted routes include:

- `/platform/schools`
- `/platform/schools/[schoolId]`

Supported V1 operations:

- list Schools
- create School
- open School management summary
- list School Admin memberships
- establish/invite/link School Admin
- deactivate School Admin membership
- reactivate eligible School Admin membership

Multiple active School Admins per School remain supported.

Membership uniqueness remains centered on:

`(school_id, user_id)`

not one administrator per School.

## Identity Safety

Provisioning reuses existing identity where eligible.

Existing Users are not duplicated.

Existing memberships in other Schools are preserved.

Conflicting same-School role states fail closed.

Inactive School Admin membership requires explicit reactivation.

Existing identity is not deleted merely to repair invitation/recovery state.

## Last-Admin Policy

No authoritative product/domain invariant currently requires at least one active School Admin.

Therefore Task 058 permits deactivating the last active School Admin.

The UI must communicate this clearly.

Do not invent a different hard constraint unless later product decisions explicitly change it.

## Platform Audit Actions

Accepted PLATFORM-scoped actions:

- `SchoolCreated`
- `SchoolAdminMembershipEstablished`
- `SchoolAdminMembershipDeactivated`
- `SchoolAdminMembershipReactivated`

Application mutations and corresponding audit events are atomic where both are database operations.

## Provider Boundary

Real School Admin invitation/email delivery was not independently accepted against the hosted provider during Task 058.

Application behavior was validated using supported local/mock boundaries.

---

# 13. Task 059 — Grading Configuration Administration

Status:

`TASK_059_GRADING_CONFIGURATION_ADMINISTRATION_PASS`

Task 059 passed:

- focused acceptance
- canonical local acceptance
- manual commit/push
- CI
- Deploy STAGING

## Administration Surface

School-owned `GradingConfiguration` and numbered configuration versions are administrable at:

`/grades/configuration`

The management entry is linked from Gradebook setup.

APIs live under:

`/api/v1/grading-configurations`

Supported V1 actions include:

- create configuration with initial draft
- edit eligible unused draft rules
- create subsequent versions
- activate versions
- archive versions
- deactivate/reactivate configurations
- permanently archive configurations where supported
- read retained historical settings

## Historical Integrity

Task 053 remains authoritative.

Only eligible unused `DRAFT` rules under an ACTIVE configuration are editable.

Historical-use detection includes references from relevant academic history such as:

- Gradebook
- Subject Results
- Period Results
- Annual Results
- publication/history records

Once grading configuration is historically significant:

- mutation that would reinterpret history is rejected

`ACTIVE` and `ARCHIVED` grading rules remain immutable.

Activating a new version archives the previous active version without rebinding historical academic records.

Historical versions remain readable.

## Calculation Semantics

Task 059 did not redesign existing grading formulas.

Accepted behavior remains:

- CurriculumSubject coefficient semantics unchanged
- assessment maximum-score semantics unchanged
- unsupported weighted annual calculation cannot be activated
- passing score remains metadata unless already consumed by an existing formula

New configuration-version calculations were verified against the intended output scale.

## Authorization

Grading configuration administration requires:

- authoritative current School context
- `grades.manage`

Unauthorized access includes:

- unauthenticated users
- Teacher where no management authority exists
- Parent
- foreign School authority
- forged School/resource IDs
- platform-only authority without applicable School authorization

Task 058 platform authority does not automatically bypass School grading authorization.

## Concurrency

Accepted locking order follows the grading configuration/version relationship.

Historical-use checks occur inside the mutation transaction.

Gradebook creation uses matching protection through eligibility validation and insertion.

Accepted limitation:

`LIVE_MULTI_CONNECTION_POSTGRES_RACE_NOT_INDEPENDENTLY_PROVEN`

Do not claim stronger concurrent guarantees than the repository has actually demonstrated.

Concurrent corrections to eligible unused draft configuration retain normal last-committed-write semantics.

## Audit Actions

Accepted School-scoped actions:

- `GradingConfigurationCreated`
- `GradingConfigurationStatusChanged`
- `GradingConfigurationVersionCreated`
- `GradingConfigurationRulesChanged`
- `GradingConfigurationVersionStatusChanged`

Mutation + audit event remain atomic for application-database operations.

Denied, invalid and unchanged/no-op actions must not generate false success events.

---

# 14. Important Accepted Cross-Cutting Invariants

These rules should be treated as repository-level contracts unless a later approved task explicitly changes them.

## Tenant Isolation

School-scoped operations must derive authority from authenticated server-side context.

Client-supplied School IDs, role values or resource IDs never establish authority by themselves.

Foreign-school relationship composition must fail closed.

## Platform Authority

`users.is_platform_admin` is independent platform authority.

It does not automatically authorize School APIs.

Platform operations should use explicit platform service boundaries.

## Identity Preservation

Account lifecycle operations should preserve identity whenever technically and product-wise possible.

Do not use delete/recreate workflows to solve:

- invitation expiry
- password recovery
- account assistance
- membership reactivation

unless an explicit future architecture decision requires it.

## Historical Integrity

Historical academic meaning must not be silently reinterpreted by later configuration changes.

This applies to areas including:

- Class/Curriculum binding
- grading configuration
- result/publication history

## Audit

Important business actions should use the Task 054 AuditEvent foundation where appropriate.

Audit metadata must remain bounded and must not contain secrets.

Application mutation + audit should be atomic when both are database operations.

## Business Time

School timezone is authoritative for School business wall time.

Real instants use UTC.

Date-only values remain date-only.

## Credential Safety

Passwords must never be sent through native GET submissions, URLs, logs, audit metadata or administrative interfaces.

Pre-hydration form behavior must fail safely.

## UX

Use shared Task 056 accessibility/search/layout conventions instead of introducing local alternatives without reason.

---

# 15. Known Remaining Verification Boundaries

These are known limitations or deferred acceptance items.

They should not be confused with open implementation bugs.

## Hosted Recovery Provider

Still not independently accepted against the real hosted provider:

- real recovery email delivery
- deployed recovery-template compatibility
- real recovery session/cookie establishment
- subsequent password login

Expected later handling:

release/provider-readiness validation.

## Grading Concurrency

Task 059 has transaction and lock-order evidence.

However:

`LIVE_MULTI_CONNECTION_POSTGRES_RACE_NOT_INDEPENDENTLY_PROVEN`

This should remain documented honestly unless a future test explicitly proves it.

## Deferred Product Scope

Task 051 intentionally deferred items include:

- Task 016 finding: dashboard redesign / advanced analytics → V1.1
- Task 026 finding: Teacher demographics → V1.1
- Student sex/gender → not required V1
- elaborate result-history analytics → not required V1
- rich-text Homework submission → not required V1
- free-form review comments/reviewer UI → not required V1
- billing/subscriptions/CRM/impersonation → not V1 platform scope

---

# 16. Next Task — Task 060

Next:

`Task 060 — Parent Attendance and Homework Journeys`

Task 060 depends on accepted earlier foundations including:

- Task 055 School business-time semantics
- existing Attendance domain
- existing Homework domain
- Parent/Student relationship authorization
- Task 056 shared accessible management/reading UX
- Task 054 audit foundation where important actions require audit

Task 060 should focus on the actual Parent-facing Attendance and Homework journeys required for V1.

Do not prematurely implement:

- Task 061 result-history work
- Task 062 announcement publication work
- Task 063 private file/attachment infrastructure
- Task 065 actual Homework hand-in

unless Task 060 exposes a genuine dependency that requires an explicit decision.

---

# 17. Remaining Roadmap Dependencies

Current planned dependency chain from Task 051:

- Task 052 → Task 057 → Task 058
- Task 053 → Task 054 → Task 055
- Task 053 + Task 054 → Task 059 → Task 061
- Task 055 → Task 060
- Task 054 + Task 055 → Task 062 → Task 063
- Task 055 → Task 064
- Task 054 + Task 055 + Task 060 → Task 065
- Task 063 attachment acceptance → Task 065
- Tasks 052–065 → Task 066
- Task 066 → Task 067
- Task 067 → Task 068

Completed prerequisite chain through Task 059 is currently satisfied.

---

# 18. Task Risk Notes

High-risk remaining V1 areas include:

## Historical/data correctness

- Task 061 — Published Result Understanding and Navigation

## Security / private data

- Task 063 — Private Application Files and Attachments

## Cross-cutting release completion

- Task 066 — Multilingual and Responsive V1 Completion
- Task 067 — V1 Regression and Documentation Closure
- Task 068 — V1 Release Readiness and Regression Acceptance

These tasks should retain focused implementation/validation boundaries before canonical acceptance.

---

# 19. Development / Validation Workflow

The current optimized task workflow is:

## A1 — Implementation + Focused Validation

Codex:

- inspects current repository truth
- implements only the current task
- runs focused affected tests
- runs lint/typecheck where appropriate
- runs `git diff --check`
- stops

No commit/push from Codex.

## A2 — Canonical Local Validation

For tasks whose risk justifies full acceptance:

Codex runs each expensive command once:

- full canonical tests
- production build
- ordinary local E2E

Then:

- verifies candidate unchanged
- runs final diff checks
- stops

Do not repeat already-green focused suites unless a canonical failure requires diagnosis.

## Commit / Push / Hosted Verification

Handled manually by the Product Owner.

Manual steps:

- stage accepted candidate
- commit
- push `main`
- inspect CI
- inspect Deploy STAGING

Do not spend Codex usage on routine commit/push/hosted polling.

If hosted CI fails:

- do not blindly rerun
- diagnose from the failure
- authorize a narrow remediation gate

## PROJECT-STATE.md

`docs/PROJECT-STATE.md` is the canonical cross-conversation handoff.

After every completed task:

1. synchronize this file;
2. record durable outcomes and invariants;
3. mark the next Task;
4. avoid copying long execution transcripts;
5. preserve only useful historical evidence and known limitations.

Routine PROJECT-STATE updates are prepared outside Codex and manually copied/committed by the Product Owner.

---

# 20. Prompt-Efficiency Rule

Codex prompts should be delta-focused.

Do not repeatedly restate every accepted project rule.

Future prompts should normally include only:

- current task
- objective
- owned audit findings
- critical task-specific invariants
- important dependencies by Task/ADR/document reference
- implementation boundary
- required focused validation
- PASS/BLOCKED output
- STOP condition

Previously accepted repository contracts should be referenced rather than rewritten unless the current task can directly violate them.

This is intended to reduce Codex usage while preserving correctness and reviewability.

---

# 21. Workflow Rule

`docs/PROJECT-STATE.md` remains the canonical cross-conversation handoff.

After every meaningful milestone, review and synchronize this document before moving to another meaningful implementation step.

Meaningful milestones include:

- implementation completion
- bug fixes
- Task/Stage checkpoints
- verification/test cycles
- architectural decisions
- operational decisions
- commits
- hosted acceptance
- blocker changes
- exact-next-step changes

Before ending a major work session or beginning another roadmap task, verify that this file reflects the actual accepted repository state.

---

# 22. Exact Next Step

Synchronize this file on `main`.

Replace:

`CURRENT_HEAD_AFTER_TASK_059`

with the exact current Task 059 commit SHA.

Then manually commit the state synchronization, recommended commit message:

`docs: synchronize project state through task 059`

After that, begin:

`TASK_060_PARENT_ATTENDANCE_AND_HOMEWORK_JOURNEYS`