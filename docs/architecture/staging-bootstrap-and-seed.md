# Staging Bootstrap and Demo Seed

> Task 042 — operator-controlled first-tenant provisioning and a separate,
> STAGING-only deterministic fixture set. Neither mechanism is a public API or
> browser feature.

## Purpose and boundary

The first-tenant bootstrap creates one Supabase Auth identity, its matching
`public.users` identity, one School, and one active `SCHOOL_ADMIN` membership.
It is a reusable operator workflow whose Production confirmation policy can be
strengthened before a Production project exists.

The demo seed is a different command with a different purpose: it creates only
the small STAGING fixture set needed for Task 043 hosted integration testing.
It refuses every environment other than the approved STAGING project and has
no force or bypass option.

Neither command enables signup, exposes an HTTP route, changes RLS or the Data
API, modifies schema, or implements Teacher/Parent invitations. Task 045 owns
normal account invitation and acceptance.

## Operator commands

Run from the repository root after placing operator values in the ignored
`apps/web/.env.local` file:

```text
pnpm bootstrap:first-tenant
pnpm seed:staging-demo
```

Passwords are environment input only. They are never accepted in command-line
arguments. Both commands emit structured, value-safe events and never emit
passwords, service-role credentials, access/refresh tokens, database URLs, or
cookies.

## Required configuration categories

Both commands require:

- explicit target-environment designation;
- exact expected Supabase project reference;
- the environment's Auth URL and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- a server/operator-only `SUPABASE_SECRET_KEY`;
- the reviewed runtime Transaction Pooler URL and operator Session Pooler URL;
- first-admin email and strong password;
- School name and timezone.

The demo seed additionally requires separate ignored Teacher and Parent test
emails and strong passwords. No operator credential may use a `NEXT_PUBLIC_`
name. The Auth Admin secret remains optional for normal Next.js reads and is
used only by explicitly privileged Auth operations.

## Target and hosted preflight

Before Auth or database writes, each command positively verifies:

- the explicit environment is `staging`;
- the expected ref and Auth URL identify the approved STAGING project;
- `DATABASE_URL` identifies that project's Transaction Pooler on port `6543`;
- `MIGRATION_DATABASE_URL` identifies that project's Session Pooler on port
  `5432`, never transaction mode;
- `auth.users` exists, the database is the reviewed database, all 39 public
  application tables exist, and the Drizzle journal contains all 15 entries;
- public signup and anonymous sign-in remain disabled through the safe public
  Auth settings endpoint;
- the operator has positively confirmed in Dashboard/management configuration
  that Enable Data API is OFF, and a normal `schools` table request cannot
  query application data. Gateway/PostgREST status codes are not treated as a
  stable configuration contract; a successful table response is always a hard
  failure, while an invalid public key is reported separately.

Ambiguity fails with a controlled operator error before writes. Database
emptiness is never used to infer an environment.

## Auth and application identity

Auth identities are created only through the supported Supabase Auth Admin
API with confirmed email behavior appropriate to controlled test identities.
The tooling never inserts into or mutates `auth.users` with SQL. Auth metadata
does not carry authoritative roles, School context, permissions, Teacher data,
or Parent data.

The returned Auth UUID is used unchanged as `public.users.id`, preserving
ADR-018. The canonical email returned by that same Auth operation is normalized
with trim plus lowercase and stored as `public.users.email`, preserving
ADR-019:

```text
auth.users.id = public.users.id
normalize(auth.users.email) = public.users.email
```

After Auth creation, one Drizzle transaction creates `public.users`, the
School, and its active `SCHOOL_ADMIN` membership. No `SUPER_ADMIN`, Teacher,
Parent, or Student profile is created by first-tenant bootstrap.

Completed bootstrap and demo-seed reruns verify both projections against the
intended Auth identities. An email mismatch is a partial-state blocker; the
operator does not silently rewrite it. This preserves deterministic future
multi-School identity reuse.

## Auth/database compensation

Auth Admin and PostgreSQL cannot share a distributed transaction. The guarded
sequence is therefore:

```text
create new Auth identity
  -> create application rows in one DB transaction
  -> verify
```

If the database transaction fails, the command attempts to delete only the
exact Auth UUID created by that execution. It never deletes a pre-existing
identity. A failed compensation stops execution with
`BOOTSTRAP_COMPENSATION_REQUIRED`; demo seeding must not continue until an
operator reconciles that safe identifier.

The Teacher and Parent fixture identities follow the same rule. If either
fixture's database phase fails, only identities newly created by that seed
attempt are compensation candidates.

## Idempotency and partial state

An exact completed bootstrap—Auth identity, same application UUID, intended
active School, and active `SCHOOL_ADMIN` membership—is a controlled no-op.
The commands never create duplicates on rerun.

An Auth-only identity, application-only user, missing membership, mismatched
role, ambiguous School, pre-existing test email, or partial deterministic seed
is a hard reconciliation blocker. The tooling does not adopt, repair, delete,
truncate, reset, or guess ownership of ambiguous data.

Demo entities use stable Task 042 UUIDs plus existing database business keys.
This avoids unsafe name-only matching. The exact complete fixture set is a
no-op; zero fixture rows is fresh; any subset or conflicting link stops.

The one reviewed legacy exception is the original hosted Task 042 grading
version. Its exact rules used `WEIGHTED` Assessment aggregation without
`weightsByType` and unsupported V1 Annual `WEIGHTED_AVERAGE`. When—and only
when—the complete deterministic fixture has that exact ACTIVE version 1 and no
successor, `seed:staging-demo` performs one atomic reconciliation: archive the
legacy version without changing its rules, then create deterministic ACTIVE
version 2 with the supported rules below. The at-most-one-ACTIVE database
constraint remains intact. Any variation is a partial-state refusal.

An exact reconciled rerun is a no-op. Existing Gradebooks remain bound to
version 1; the operator never updates, deletes, or rebinds historical academic
rows. Fresh databases continue to receive the supported rules directly as
version 1 and need no successor.

## Demo fixture scope

The deterministic dataset contains:

- one active `STAGING 2026/2027` AcademicYear and two periods;
- one Stage and one Level; no Track because Class tracks are optional;
- two Subjects;
- one Curriculum, one active CurriculumVersion, and two CurriculumSubjects
  whose positive decimal coefficients remain the sole coefficient source;
- one active Class bound to the exact AcademicYear, Level, and version;
- two Students with active enrollments and no Auth identities;
- one confirmed Teacher Auth/application identity, active `TEACHER`
  membership, Teacher profile, and one active assignment;
- one confirmed Parent Auth/application identity, active `PARENT` membership,
  Parent profile, and one active relationship to the first Student;
- one active GradingConfiguration and active version whose fixture rules use
  equal Assessment weighting, CurriculumSubject coefficients for the weighted
  Period average, and the V1-supported simple Annual average. Exact rule
  equality is part of seed rerun inspection so an incompatible fixture is a
  controlled partial-state finding rather than a false idempotent no-op.

The Teacher and Parent accounts are controlled STAGING test fixtures only.
They are not invitations and do not define the Task 045 lifecycle.

## Intentionally unseeded workflows

The seed creates no Gradebook, Assessment, Grade, SubjectResult, PeriodResult,
AnnualResult, ResultPublication, Attendance, Homework, HomeworkSubmission,
AnnouncementPublication, Notification, or OutboxEvent. Task 043 must exercise
those workflows through the application. Creating prerequisites must not cause
notification, outbox, announcement-publication, or result-publication side
effects.

## Verification and tenant behavior

Each command performs a real password sign-in with its ignored credential and
checks only the safe returned Auth UUID. Tokens are discarded and never
logged. Hosted completion also requires Task 042 integration verification of:

- admin `/api/v1/me`, the canonical current-School cookie, and current-school
  selection;
- Teacher `/me`, self profile, and assignment-derived scope;
- Parent `/me`, `/me/parent-profiles`, and relationship-derived child scope;
- negative management and unrelated-resource access for Teacher and Parent;
- zero unexpected publication, notification, and outbox rows.

The current-School selector remains an HTTP-only server cookie that is
revalidated against membership; no localStorage tenant authority is added.

## Secret handling

Real operator inputs live only in ignored local/operator configuration.
`.env`, `.env.local`, and `.env.*.local` remain ignored. Never persist passwords
in application tables, test snapshots, documentation, shell history, or
reports. Never log service keys, database credentials, sessions, tokens, or
cookies. Final reports mask fixture emails and use only safe UUIDs/counts.

## Production restriction and cleanup limit

The demo seed has an unconditional STAGING-only guard and no Production bypass.
The current bootstrap implementation also stops at Production until a separate
stronger confirmation contract is reviewed. There is no reset command. Once
referenced, lifecycle/historical data is not deleted; ambiguous or partially
provisioned states require explicit operator reconciliation rather than an
automated destructive cleanup.

## Task 043 handoff

Task 043 may begin only after hosted execution verifies all three real logins,
the application identity/membership chain, deterministic fixture relationships,
Student non-authentication, grading prerequisite, rerun idempotency, role
negative checks, side-effect absence, and a clean secret/git audit with no
CRITICAL or HIGH finding.

## Hosted execution outcome

Task 042 was executed against the approved STAGING project. First-tenant
bootstrap created one active SchoolAdmin identity/tenant chain and its immediate
rerun was an exact controlled no-op. Demo seeding then created one Teacher and
one Parent Auth/application identity, three active role memberships in total,
the documented deterministic academic prerequisites, and two Students without
Auth identities; its immediate rerun was also an exact controlled no-op.

Real browser/server verification passed for SchoolAdmin current-School
selection and cookie behavior, Teacher self/assignment scope with administrative
scope denied, and Parent related-child scope with unrelated and broad student
scope denied. The final hosted audit found no unexpected Auth identities and
zero Gradebook, Assessment, Grade, Result, ResultPublication, Attendance,
Homework, HomeworkSubmission, Announcement, AnnouncementPublication,
Notification, or OutboxEvent rows. No secret value is recorded here.

## Task 043.1 reconciliation outcome

The approved STAGING project contained the exact legacy grading state described
above. The guarded operator preflight passed, version 1 became `ARCHIVED` with
its JSON rules semantically unchanged, and deterministic version 2 became the
sole `ACTIVE` version. An immediate operator rerun returned
`already-complete` and created no duplicate. The original Gradebook stayed
bound to version 1 and was later moved through the canonical `OPEN → CLOSED`
lifecycle; it was not rebound or deleted.

Version 2 uses `EQUAL` Assessment weighting, CurriculumSubject coefficients for
weighted Period results, and V1-supported simple Annual averaging. Task 043.1
created new successor-bound Gradebooks and completed Subject, Period, Annual,
publication, and revision workflows through application APIs. Direct SQL was
used only for read-only auditing; no historical repair or domain write bypassed
the operator/application boundaries.
