# Madrasio — Current Project State

# Task 061 — Published Result Understanding and Navigation

Status:

`TASK_061_PUBLISHED_RESULT_EXPERIENCE_PASS`

Task 061 owns:

- `V1-AUDIT-010`
- `V1-AUDIT-011`
- `V1-AUDIT-030`

## Verification-first finding

The mandatory:

`TASK_061_V_PARENT_RESULTS_OVER_50_VERIFICATION`

reproduced the Parent result reachability defect.

Synthetic authorized fixture:

- 55 published results
- active Parent–Child relationship
- valid School/Academic context

Observed before remediation:

- Parent UI reached exactly 50 results
- backend reported total 55
- remaining 5 existed on page 2
- frontend had no pagination/load-more traversal

Therefore:

`V1-AUDIT-011 = REPRODUCED_AND_FIXED`

## Parent Result Reachability

The Parent published-result journey now supports traversal beyond the original 50-result boundary using normal application navigation.

The fix uses the existing paginated backend contract rather than increasing a hard-coded page size.

Authorization remains child- and School-scoped.

The following fail closed:

- unrelated child
- ended Parent relationship
- foreign School
- forged Student/result identifiers
- raw UUID substitution

## Published Result History

Task 061 exposes the approved minimal result publication/history experience.

Users can distinguish supported states including:

- calculated
- finalized
- published
- revised

Historical publication context is preserved using immutable/reconstructable publication data.

The implementation does not create an elaborate analytics/history system.

Historical display must not be reconstructed dishonestly from mutable current records.

Legacy records without immutable historical context remain truthful rather than being backfilled from current names/configuration.

## Notification Context

Published-result notifications now carry enough context to understand the result event where applicable, including:

- Student
- result/subject context
- Academic Year / Period
- result value/state
- initial vs revised publication state
- authorized published-result destination

Class remains optional.

Teacher identity is not required notification context.

Notification replay remains idempotent.

Legacy notification payloads remain safely readable.

Malformed new contextual payloads fail safely rather than persisting misleading notification data.

## Authorization-Safe Navigation

Notification destinations authorize the current recipient before result access.

A notification cannot be used to bypass:

- Parent-child relationship rules
- School scope
- publication visibility
- active profile requirements

Unpublished result identifiers/history are not exposed to Parent users.

## Persistence

Task 061 introduced migration:

`0018_result-publication-context`

The migration adds the narrow nullable publication display-context persistence required for immutable historical presentation.

Legacy rows are not populated with unverifiable current-state data.

Accepted inventory remains:

- application tables: `40`
- recovery tables: `42`

The new publication context is included in recovery fingerprint coverage.

## Hosted Typecheck Remediation

Initial CI and Deploy STAGING failed during `pnpm typecheck` because new Task 061 tests contained:

- unsupported Testing Library `ByRoleOptions.exact`
- notification payload values typed as `unknown` without narrowing

The remediation changed test typing/query code only.

Production result behavior, migration, authorization, and notification implementation were unchanged.

Local remediation validation:

- `pnpm typecheck`: PASS
- focused published-result tests: `14 passed`
- `git diff --check`: PASS

Final hosted validation:

- CI: PASS
- Deploy STAGING: PASS

## Task 061 Closure

Task 061 is complete.

Next:

`Task 062 — Announcement Publication and Recipient Experience`