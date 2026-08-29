# Supabase Hosting Readiness

> Task 040 — repository-only readiness review for Phase 4. No hosted project,
> hosted database, hosted Auth setting, deployment, tenant, or secret was
> created or changed.

## 1. Approved hosting architecture

The environment model is local development/testing plus separate Supabase
STAGING and PRODUCTION projects. The browser uses the Next.js UI and `/api/v1`;
application data flows through application services, repositories, Drizzle,
and Supabase PostgreSQL. Supabase provides PostgreSQL and Auth. The browser
does not query application tables through PostgREST or GraphQL.

Drizzle schema and reviewed Drizzle migrations remain the only application
schema source of truth. Supabase-managed `auth` objects are dependencies, not
application-owned schema. RLS is deliberately deferred and the Data API must
remain disabled while server-side application authorization is authoritative.

## 2. Environment model

| Purpose                  | Local                                      | Staging                                      | Production                                      |
| ------------------------ | ------------------------------------------ | -------------------------------------------- | ----------------------------------------------- |
| Supabase project         | Local/test values or a development project | Dedicated staging project                    | Dedicated production project                    |
| Next.js runtime          | Local process                              | Staging Vercel environment                   | Production Vercel environment                   |
| `DATABASE_URL`           | Local PostgreSQL-compatible URL            | Staging transaction pooler                   | Production transaction pooler                   |
| `MIGRATION_DATABASE_URL` | Optional; falls back to `DATABASE_URL`     | Staging direct connection, or session pooler | Production direct connection, or session pooler |
| Auth browser variables   | Development values                         | Staging project URL/key                      | Production project URL/key                      |
| Operator secrets         | Not required for normal runtime            | Operator/CI scope only                       | Operator/CI scope only                          |

Staging and production credentials must never be interchangeable. Database
migration credentials belong in an explicitly selected environment/job, not
in a generic Vercel build.

## 3. Migration inventory

The committed chain contains 14 SQL migrations and 14 matching snapshots. The
journal indices are continuous from `0` through `13`, tags are unique, every
journal entry has exactly one SQL file, and no SQL migration exists outside
the journal.

| Order | Migration                  | Purpose and affected objects                                                                                                                     | Fresh Supabase assumption                                                 |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 0000  | `0000_needy_romulus`       | Identity/tenant enums; `users`, `schools`, `school_memberships`; indexes and FKs                                                                 | Supabase already owns `auth.users`; core `gen_random_uuid()` is available |
| 0001  | `0001_even_shocker`        | Academic enums; Years, Periods, Stages, Levels, Tracks, Subjects, Curricula, Versions, CurriculumSubjects, Classes; composite tenant constraints | 0000 application tables exist                                             |
| 0002  | `0002_tricky_whizzer`      | Student/Teacher/Parent lifecycle enums and profiles; Enrollments, Assignments, ParentStudent; active-row partial unique indexes                  | 0000–0001 objects exist                                                   |
| 0003  | `0003_hot_lord_hawal`      | GradingConfiguration and GradingConfigurationVersion enums/tables/constraints                                                                    | Schools exist                                                             |
| 0004  | `0004_aspiring_dragon_man` | At-most-one ACTIVE GradingConfigurationVersion partial unique index                                                                              | 0003 version table exists                                                 |
| 0005  | `0005_living_wallow`       | Gradebook/Assessment enums and tables; exact Year/Period/Class/Subject/configuration binding                                                     | Academic and grading tables exist                                         |
| 0006  | `0006_oval_pretty_boy`     | Grade states; Grades plus distinct Subject/Period/Annual Results; exact numeric and context constraints                                          | 0002–0005 objects exist                                                   |
| 0007  | `0007_amazing_nekra`       | ResultPublication snapshots and the single `outbox_events` model; publication idempotency/version constraints                                    | Results and application Users exist                                       |
| 0008  | `0008_large_leader`        | Daily Attendance enum/table, historical Class/Year context and indexes                                                                           | Students and academic context exist                                       |
| 0009  | `0009_ambiguous_rockslide` | Homework, Class targets, Submissions, lifecycle enums and same-School constraints                                                                | People and academic context exist                                         |
| 0010  | `0010_shocking_wild_pack`  | Announcement, immutable Versions, Targets, Publications, recipient snapshots and publication constraints                                         | Users, Schools and Classes exist                                          |
| 0011  | `0011_last_ezekiel`        | Backfills recipient `audiences` JSONB, makes it required, then removes the old singular `audience` column                                        | 0010's old `audience` is non-null, so every existing row is backfilled    |
| 0012  | `0012_pretty_doomsday`     | Persisted Notifications, type/source checks, membership integrity and idempotency                                                                | Membership and User history exists                                        |
| 0013  | `0013_wonderful_cable`     | Adds global application User lifecycle enum/column with `ACTIVE` default                                                                         | Existing User rows can receive the non-null default                       |

Manual inspection confirmed enum creation precedes use, FK targets precede
FKs, later migrations depend only on earlier committed objects, and no object
depends on Dashboard-created application schema. The only cross-schema
dependency is the intentional `public.users.id -> auth.users.id` FK.

Migration 0011 is the only migration that drops a column. It performs a
complete non-null backfill before the `NOT NULL` change and drop. Future
production migrations should prefer expand, deploy compatible code, backfill,
and contract in a later reviewed migration.

## 4. Schema and migration parity

`drizzle-kit generate` reads the final `0013` snapshot and reports 39 tables
with no schema changes. The schema entrypoint deliberately excludes the
Supabase-managed `authUsers` reference while exporting every application
table. The committed migration chain and Drizzle schema therefore describe the
same final application schema; there is no missing migration or generated
noise to accept.

The hermetic database suite creates a minimal Supabase-compatible `auth.users`
dependency as test infrastructure before applying the production migrations
to a blank PGlite database. It does not add this fixture to hosted migrations.

## 5. Auth identity and ownership

The intended invariant is implemented exactly:

```text
auth.users.id
  -> public.users.id (same UUID, primary key, ON DELETE CASCADE)
  -> school_memberships.user_id (ON DELETE RESTRICT)
```

Migration 0000 creates only `public.users` and adds the FK to the pre-existing
Supabase table. No migration creates, drops, alters, seeds, or otherwise owns
`auth.users`. Creating the FK does not require existing Auth rows. Normal user
provisioning must create an Auth identity through Supabase Auth and then create
the matching application row; SQL migrations never seed Auth identities.

ADR-018's deletion behavior remains unchanged: deleting an Auth identity
cascades toward `public.users`, while existing memberships and historical User
references use `RESTRICT` and can prevent destructive deletion. Lifecycle
status/deactivation is the normal historical-safe path.

## 6. PostgreSQL and Supabase compatibility

The chain uses standard hosted PostgreSQL capabilities supported by Supabase:

- UUID columns and PostgreSQL core `gen_random_uuid()` defaults;
- enums, JSONB and `jsonb_typeof` checks;
- fixed-point `numeric`, `date`, and `timestamptz`;
- composite foreign keys and unique constraints;
- partial unique indexes;
- transactional DDL/data backfill in normal Drizzle migration execution.

It creates no extension, function, trigger, generated column, custom
collation, RLS policy, sequence, or custom role. Runtime code has no reliance
on `LISTEN/NOTIFY`, session `SET` state, temporary tables, advisory locks, or
other session-affine behavior. Test-only failure-injection triggers/functions
are not production migrations.

## 7. Runtime database connection

`DATABASE_URL` is runtime-only. Hosted Next.js uses the Supabase transaction
pooler for transient/serverless application queries. Runtime must not invoke
Drizzle Kit or migration scripts.

The current driver is `node-postgres`, not Postgres.js. Drizzle's ordinary
queries pass no query `name`, and the application contains no explicit
`.prepare()` use. This follows node-postgres's transaction-pooler requirement:
unnamed queries are not server-side named prepared statements. If the driver
is changed to Postgres.js later, the equivalent required setting is
`postgres(url, { prepare: false })`.

Transactions used by application services remain compatible with transaction
pooling: a backend connection is held for the transaction boundary and no
state is expected after commit. Official connection guidance:
[Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
and [disabling prepared statements](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL).

## 8. Migration connection

`MIGRATION_DATABASE_URL` is migration/administration-only. Drizzle Kit now
prefers it and falls back to `DATABASE_URL` to preserve the existing one-URL
local workflow. The application runtime schema deliberately does not validate
or require it.

For hosted projects it must target:

1. the direct PostgreSQL endpoint when the runner can reach its network; or
2. the Supabase session pooler when direct IPv6 connectivity is unavailable.

It must never target the transaction pooler. Task 041 must inspect the host and
port before any migration and record the selected environment explicitly.

## 9. Environment-variable matrix

| Variable                        | Class                        | Required by                        | Policy                                                                                      |
| ------------------------------- | ---------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | PUBLIC/browser-safe          | Browser Auth client                | Environment-specific project URL                                                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | PUBLIC/browser-safe          | Browser Auth client                | Publishable/anon credential only; never an admin secret                                     |
| `NEXT_PUBLIC_APP_URL`           | PUBLIC/browser-safe          | Optional UI origin                 | Exact environment origin                                                                    |
| `SUPABASE_URL`                  | Server runtime configuration | SSR Auth client                    | Same environment's project URL                                                              |
| `SUPABASE_ANON_KEY`             | Server runtime configuration | SSR Auth client                    | Publishable/anon credential; not administrative authority                                   |
| `DATABASE_URL`                  | SERVER SECRET                | Next.js repositories               | Hosted transaction pooler; never migration execution                                        |
| `MIGRATION_DATABASE_URL`        | MIGRATION SECRET             | Explicit Drizzle/CI operator job   | Direct DB or session pooler; never browser/runtime/transaction pooler                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | OPERATOR SECRET, future      | Later protected provisioning only  | Currently optional and unused; do not configure in browser or normal runtime until required |
| future job/Cron secret          | OPERATOR/JOB SECRET, future  | Protected processors in later task | Not named, validated, or configured by Task 040                                             |

Migration-only and future operator variables are intentionally absent from
the application's required Zod runtime schema. No secret uses a
`NEXT_PUBLIC_` prefix. Local environment files are ignored and their values
were not copied into this review.

## 10. Supabase Auth readiness

The browser client uses only the public project URL and anon/publishable key.
The request-scoped server client uses the server equivalents and Next.js
cookie adapters. Current login is `signInWithPassword`; logout is server-side,
clears Supabase cookies plus the current-School selector, and does not expose a
user-controlled return URL.

Hosted requirements:

- disable **Allow new users to sign up** and anonymous sign-ins;
- set each environment's exact Site URL;
- maintain exact staging/production redirect allowlists;
- current password login needs no callback route;
- Task 045 must define the invitation-acceptance route before adding it to the
  allowlist; no invitation behavior is implemented here.

See [Supabase Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration)
and [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## 11. Data API, RLS, and grants

The Data API must be disabled for both hosted projects. The application uses
trusted server-to-PostgreSQL connections, not browser-to-PostgREST/GraphQL.
RLS remains deferred because the complete authorization pipeline lives in the
Next.js server and no browser table access is approved. While RLS is deferred,
keeping the Data API disabled is mandatory. Any future direct browser data API
proposal requires a dedicated RLS and grants design first.

Task 041 and production readiness must verify, without relying only on
Dashboard defaults:

- Data API disabled and no application schema exposed;
- privileges on all application tables and any sequences/functions;
- `anon`, `authenticated`, and `service_role` grants;
- `public` schema/default privileges for future objects;
- no unintended application-table access by browser-facing roles.

No hosted grant is changed in Task 040. Supabase documents why both Data API
configuration and grants require review in
[Securing your API](https://supabase.com/docs/guides/api/securing-your-api).

## 12. Region principle

Choose staging and production Supabase regions near their corresponding
Vercel runtime regions to minimize application-to-database latency. Do not
hardcode a region until actual Supabase/Vercel availability and the target user
geography are evaluated in Tasks 041 and 046.

## 13. Build and CI separation

`build`, `start`, tests, and Playwright contain no migrate, push, or schema
mutation hook. Current GitHub Actions installs, lints, typechecks, tests,
builds, and runs smoke tests only. `db:migrate` is explicit. `drizzle-kit push`
remains documented local-only tooling and is not an approved staging or
production deployment mechanism.

The future Task 046 pipeline is:

```text
test -> explicitly select target -> migrate with MIGRATION_DATABASE_URL
     -> verify migration -> deploy -> smoke test
```

Production migration jobs need environment protection/approval and must not be
triggered by an arbitrary Vercel build.

## 14. Bootstrap and later dependencies

Task 040 creates no tenant and no public bootstrap endpoint. Task 042 must use
protected operator tooling for the first SchoolAdmin. Task 045 owns
Teacher/Parent invitation and invitation acceptance. Public signup remains
disabled before either workflow is introduced.

## 15. Findings

| Severity | Finding                                                                                                           | Resolution/status                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| MEDIUM   | Drizzle Kit used runtime `DATABASE_URL` for hosted and local migration purposes, leaving pooler intent ambiguous. | Fixed: prefer `MIGRATION_DATABASE_URL`, retain a documented local `DATABASE_URL` fallback. |
| LOW      | Environment and database docs did not state the hosted direct/session-vs-transaction connection boundary.         | Fixed in `.env.example` and database documentation.                                        |

No CRITICAL or HIGH finding remains. No schema drift, secret exposure, Auth
ownership defect, browser database connection, PostgREST application-table
access, build-time migration, or hosted dependency was found.

## 16. Task 041 prerequisites

- [x] migration chain understood
- [x] migration order valid
- [x] no unresolved schema drift
- [x] `auth.users` FK compatible
- [x] no hosted migration recreates `auth.users`
- [x] runtime pooler strategy defined
- [x] prepared statements handled for the current driver
- [x] migration connection strategy defined
- [x] environment separation defined
- [x] Data API policy documented
- [x] RLS policy documented
- [x] no secret exposure found
- [x] build does not migrate the database
- [x] no unresolved CRITICAL/HIGH readiness finding
- [ ] create/select a dedicated Supabase STAGING project
- [ ] record its region and pair it with the intended Vercel region
- [ ] disable public and anonymous signup
- [ ] set the exact staging Site URL and redirect allowlist
- [ ] disable the Data API and audit exposed schemas/grants/default privileges
- [ ] obtain staging runtime transaction-pooler `DATABASE_URL`
- [ ] obtain staging direct/session-pooler `MIGRATION_DATABASE_URL` and verify it is not transaction mode
- [ ] run the reviewed migration chain explicitly against staging
- [ ] verify the resulting 39 application tables, constraints, and `auth.users` FK
- [ ] perform staging smoke checks without creating a public bootstrap path

Repository readiness is **READY for Task 041**. Hosted readiness remains
conditional on completing the unchecked environment-specific items above.
