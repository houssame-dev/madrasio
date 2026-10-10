# Madrasio — Current Project State

## Current Task

`Task 061 — Published Result Understanding and Navigation`

## Current Stage

Tasks **050–060 are complete**.

Task 060 — Parent Attendance and Homework Journeys passed:

- focused implementation acceptance
- canonical local validation
- production build
- local E2E
- CI
- Deploy STAGING

The repository is ready to begin:

`TASK_061_PUBLISHED_RESULT_EXPERIENCE`

---

# Task 060 — Parent Attendance and Homework Journeys

Status:

`TASK_060_PARENT_ATTENDANCE_HOMEWORK_JOURNEYS_PASS`

Base SHA before Task 060 implementation:

`fe6c1287578fea438a9857641ca08a08d92d6a82`

Final Task 060 commit:

Use the current accepted Task 060 commit SHA from:

```bash
git rev-parse HEAD
```

Task 060 completed the two missing Parent child-scoped read journeys.

## Attendance Journey

Parents can navigate through the ordinary Parent portal:

Parent
→ My children
→ Child
→ Attendance

The Attendance experience includes:

- child-scoped history
- inclusive date filtering
- pagination
- historical Class context
- School-local calendar dates
- loading state
- empty state
- retry/error behavior
- navigation back to the child context

Task 055 School-time semantics remain authoritative.

Browser/device timezone does not redefine Attendance business dates.

## Homework Journey

Parents can navigate through the ordinary Parent portal:

Parent
→ My children
→ Child
→ Homework

The Homework experience includes:

- child-targeted discovery
- paginated read-only Homework lists
- expandable/readable Homework detail
- targeting/enrollment eligibility
- due-date eligibility
- loading state
- empty state
- retry/error behavior

Draft Homework is not exposed to Parents.

## Authorization

Every Parent read independently validates:

- current School
- authenticated Parent identity
- active Parent profile
- active Parent/child relationship
- relevant Academic Year/context

The following fail closed:

- unrelated child
- foreign-School child
- ended Parent relationship
- raw Student UUID substitution
- forged authority/context identifiers

A Student UUID alone never grants authority.

## Authority Boundaries

Task 060 does NOT grant Parents:

- Attendance management authority
- Homework management authority
- Homework authoring authority
- Homework submission/hand-in functionality

Actual Homework hand-in remains owned by:

`Task 065 — Homework Delivery and Actual Hand-In`

## Persistence

Task 060 introduced:

- migrations: `0`
- schema changes: `0`
- dependency changes: `0`
- lockfile changes: `0`

Accepted repository inventory remains:

- migrations: `18`
- application tables: `40`
- recovery tables: `42`

## Validation

Focused A1:

- `189` tests passed
- `16` files
- `0` failures
- lint: PASS
- typecheck: PASS
- `git diff --check`: PASS

Canonical A2:

- database: `364 passed / 0 failed / 0 skipped`
- application suite: PASS
- production build: PASS
- local E2E: PASS
- final `git diff --check`: PASS

Hosted acceptance:

- CI: PASS
- Deploy STAGING: PASS

---

# Next Task — Task 061

Next:

`Task 061 — Published Result Understanding and Navigation`

Task 061 owns:

- `V1-AUDIT-010`
- `V1-AUDIT-011`
- `V1-AUDIT-030`

Primary goals:

- minimal published-result history
- Parent result reachability
- contextual result notifications
- authorized published-result navigation

Task 061 has a mandatory verification-first subgate:

`TASK_061_V_PARENT_RESULTS_OVER_50_VERIFICATION`

Before implementing any result-pagination remediation:

- use isolated local synthetic data with more than 50 authorized published results;
- test the ordinary Parent navigation path;
- do not remediate before recording whether the issue reproduces.

Outcome rules:

- reproduced → include the demonstrated fix in Task 061
- not reproduced → close audit finding 011 with evidence; do not invent pagination work
- inconclusive → report the missing evidence and stop the remediation decision

Task 061 depends on accepted foundations from:

- Task 053 — Historical Academic Binding Integrity
- Task 054 — Important-Action Audit Foundation
- Task 055 — School Business-Time Consistency
- Task 056 — Shared Accessible Management UX
- Task 059 — Grading Configuration Administration
- Task 060 — Parent Attendance and Homework Journeys