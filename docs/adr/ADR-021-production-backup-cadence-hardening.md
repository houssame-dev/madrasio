# ADR-021: Production Backup Cadence Hardening

- Status: Accepted
- Date: 2026-09-28

## Context

Task 050 requires a Production recovery-point objective of at most six hours.

The Production backup workflow originally attempted a frequent recovery point at
minute 23 every four hours:

`23 1,5,9,13,17,21 * * *`

Cronitor independently expects at least one verified recovery point every four
hours with one hour of grace. The resulting monitoring/freshness failure window
is five hours.

After recurring Production backup automation was enabled, one natural scheduled
Production recovery point completed successfully. A later expected frequent
window from `2026-09-28T09:23:00Z` through `2026-09-28T13:23:00Z` produced no
Backup Production workflow run at all.

The repository, GitHub Actions, hosted workflow, accepted workflow blob, and
`PRODUCTION_BACKUP_AUTOMATION_ENABLED=true` authority remained intact. The
failure boundary was therefore classified as:

`HOSTED_SCHEDULE_TRIGGER_GAP_BEFORE_WORKFLOW_RUN_CREATION`

With a four-hour attempt cadence, one missed trigger can create an approximately
eight-hour interval between verified recovery points. Eight hours exceeds both:

- the six-hour Production RPO; and
- the five-hour Cronitor monitoring/freshness window.

The recurring schedule therefore needs additional timing resilience before
Production RPO can be accepted.

## Decision

The Production frequent backup-attempt cadence is hardened from every four hours
to every two hours, still at minute 23:

`23 1,3,5,7,9,11,13,15,17,19,21,23 * * *`

The weekly Sunday recovery-point schedule remains unchanged:

`47 2 * * 0`

The existing Cronitor contract also remains unchanged:

- expected verified recovery-point interval: four hours;
- grace: one hour;
- effective monitoring/freshness failure window: five hours.

The two-hour schedule is an attempt cadence. It does not redefine the RPO or the
monitoring threshold.

This produces two nominal backup opportunities inside each four-hour Cronitor
expectation. If one two-hour trigger is missed, the next nominal trigger is four
hours after the previous successful opportunity. Four hours remains within both
the six-hour RPO and five-hour monitoring window.

The following boundaries remain unchanged:

- `.github/workflows/backup-production.yml` remains the sole Production backup
  workflow;
- scheduled execution remains fail-closed behind exact lowercase
  `PRODUCTION_BACKUP_AUTOMATION_ENABLED=true`;
- manual `workflow_dispatch` remains available only under its existing explicit
  confirmation/SHA contract;
- no `repository_dispatch` trigger is introduced;
- the GitHub `Production` environment remains unchanged;
- existing permissions, non-cancelling concurrency, and bounded timeout remain
  unchanged;
- database snapshot creation, age encryption, R2 immutable upload/readback,
  recovery verification, cleanup, and heartbeat behavior remain unchanged;
- Production variables and secrets remain unchanged;
- Cronitor provider configuration remains unchanged;
- frequent retention remains eight days;
- weekly retention remains unchanged;
- `madrasio-recovery-v1` remains the recovery format.

No new scheduler provider or authentication credential is introduced by this
decision.

## Evidence required before Production RPO acceptance

The repository change alone does not accept the Production RPO.

After the exact implementation commit is reviewed, committed, pushed, and
accepted by repository CI, hosted provider verification must prove that the
default-branch workflow contains the new two-hour cron while all protected
Production backup contracts remain intact.

Recurring-cadence proof must then use natural `schedule` events only. Manual
`workflow_dispatch` runs are not valid recurring-cadence evidence.

At least two post-change naturally scheduled verified recovery points must be
observed because two timestamps are the mathematical minimum needed to measure
one real operating interval; this is not an arbitrary policy count.

Every accepted point must:

- complete the Production backup job successfully;
- complete create/upload/readback/verification successfully;
- complete temporary recovery cleanup successfully;
- emit exactly one `production_backup_verified` event;
- classify the point as `PRODUCTION_BACKUP_RECOVERY_POINT_VERIFIED`.

Final RPO review additionally requires:

- observed recovery-point interval at or below six hours;
- observed success-heartbeat interval at or below five hours;
- latest accepted recovery point fresh within six hours;
- no failed natural Production backup run in the acceptance observation window;
- accepted Production RTO evidence preserved.

## Alternatives rejected

### Keep the four-hour GitHub schedule unchanged

Rejected.

One missed trigger can produce an approximately eight-hour recovery-point gap,
which exceeds both the six-hour RPO and five-hour monitoring/freshness window.
This failure mode has already been observed in Production scheduling evidence.

### Add an independent automatic scheduler now

Not selected for the first remediation.

An independent scheduler would add a separate scheduling failure domain, but it
would also add:

- another provider integration;
- another authenticated credential or token;
- another security boundary;
- more operational and monitoring complexity.

It remains the explicit escalation path if the hardened two-hour GitHub-native
schedule still demonstrates unacceptable trigger gaps.

### Three-hour GitHub-native cadence

Not selected.

A single missed three-hour trigger can create an approximately six-hour interval.
That can remain inside the six-hour RPO boundary but exceeds the existing
five-hour Cronitor monitoring/freshness window.

## Operational and storage consequences

The nominal frequent attempt count increases from approximately six to twelve
per day.

Under the existing eight-day `frequent/` retention contract, the approximate
steady-state frequent-object count increases from 48 to 96 objects, assuming
successful execution of every nominal attempt.

No absolute storage or provider cost is asserted by this ADR.

The increased attempt rate is accepted in exchange for additional tolerance to a
single missed GitHub scheduled trigger.

## Rollback

Before commit, any failed implementation checkpoint must restore only the
authorized remediation files to their exact pre-change bytes.

After commit/push, rollback must use normal repository authority to revert the
exact cadence-hardening change.

Restoring the previous four-hour cron restores only the previous known operating
configuration. It does not restore Production RPO acceptance.

Any provider-side automation disablement, Cronitor mutation, secret/variable
change, manual Production backup dispatch, or independent-trigger introduction
requires separate explicit authorization.

## Consequences

Production backup scheduling remains operationally simple and retains the
existing GitHub Actions, Production environment, R2, encryption, recovery, and
Cronitor architecture.

The design remains dependent on GitHub scheduled-event delivery and therefore
does not create a truly independent scheduler failure domain.

The two-hour attempt cadence materially reduces the effect of one missed trigger,
but repeated missed triggers can still violate the RPO. Natural operating
evidence is therefore mandatory before Production RPO acceptance.

If that evidence demonstrates continued unacceptable schedule gaps, the
independent automatic trigger alternative must be reopened.

Production RPO remains `NOT ACCEPTED` until the required post-change natural
scheduled evidence is accepted.

Production customer onboarding remains blocked until the remaining Task 050
Production recovery gates are accepted.
