# Supabase Staging Deployment

> Task 041 — hosted staging deployment and integration verification performed
> on 2026-08-30. This document contains no connection strings, credentials,
> tokens, cookies, or user data.

## 1. Staging identity and region

- Environment: **STAGING**
- Safe project reference: `cqeaxlttezunirsmkrxz`
- Region: Central EU (`eu-central-1`, Frankfurt)
- Database: PostgreSQL 17.6, database `postgres`
- Runtime connection: Supabase Transaction Pooler on port `6543`
- Migration connection: Supabase Session Pooler fallback on port `5432`

The runtime, migration, browser Auth, and server Auth configuration all resolve
to the same staging project. The direct database endpoint was not usable from
the operator network, so the Supabase-provided IPv4 Session Pooler connection
was used for migrations. The Transaction Pooler was never used by Drizzle Kit.

## 2. Pre-migration checkpoint

The hosted database was inspected through a read-only transaction before any
migration ran:

- `auth` existed;
- `auth.users` existed, was owned by `supabase_auth_admin`, and its schema was
  owned by `supabase_admin`;
- `public` contained zero application tables and zero application enums;
- `drizzle.__drizzle_migrations` was absent;
- no repository application data existed;
- public signup was disabled;
- anonymous users were disabled;
- email/password Auth was enabled;
- the Data API exposed no usable schema.

The repository contains no Supabase `.from(...)`, `.rpc(...)`, `/rest/v1`, or
GraphQL application-table dependency. Application `.from(...)` calls found by
text search are Drizzle query-builder calls.

## 3. Auth configuration

The staging Auth settings endpoint reported:

- `disable_signup: true`;
- anonymous users disabled;
- email provider enabled;
- automatic email confirmation enabled for operator-provisioned identities.

The staging Site URL remains `http://localhost:3000` until Task 046 creates the
Vercel staging deployment. Required localhost redirect URLs are configured.
These URL settings were operator-confirmed; no Dashboard configuration was
changed by the migration run.

The real browser and server Supabase client configuration points to staging.
Both clients resolved an unauthenticated state without granting application
access. A password sign-in attempt using a nonexistent test identity reached
staging Auth and returned the expected authentication error. No temporary Auth
user or `public.users` row was created.

## 4. Migration execution

During Task 041, the canonical `pnpm db:migrate` command applied only the committed Drizzle
migrations `0000` through `0013`, using `MIGRATION_DATABASE_URL` through the
Session Pooler. No `drizzle-kit push`, generated migration, migration rewrite,
Dashboard SQL, or manual schema repair was used.

At that Task 041 checkpoint, the hosted journal contained exactly 14 entries. Every journal timestamp and
SHA-256 migration hash matches the committed `_journal.json` entry and SQL
file, in order, with no gap, duplicate, or unknown migration.

Task 045.1 subsequently applied the single reviewed
`0014_canonical-user-email` migration through the same Session Pooler after a
fail-closed identity preflight. The current hosted journal has 15 entries
(`0000`–`0014`), still 39 application tables, and three reconciled application
Users whose UUID and normalized email projections match their exact Auth
identities. Migration 0014 reads `auth.users` for the one-time projection
backfill but does not mutate or own any Supabase Auth object.

## 5. Hosted schema verification

The final `public` application schema contains exactly the expected 39 tables,
with no missing or unexpected table. All 39 application tables were empty at
the end of verification.

Repository-to-hosted catalog comparison found:

- 347 expected columns and 347 hosted columns, with matching types and
  nullability (PostgreSQL only removes display whitespace from numeric type
  modifiers);
- 39 application enums with exact names, values, and ordering;
- all 93 explicitly named indexes present;
- all 159 explicitly named foreign-key, unique, check, and composite-primary
  constraints present;
- 39 primary keys, 98 foreign keys, 37 unique constraints, and 24 check
  constraints in the hosted catalog;
- no application sequence;
- exactly one application outbox table: `outbox_events`.

Representative verified invariants include:

- active StudentEnrollment uniqueness;
- active TeacherAssignment academic-scope uniqueness;
- active ParentStudent pair uniqueness;
- exact Gradebook context uniqueness;
- Assessment and Grade score/state checks;
- Subject, Period, and Annual Result context constraints;
- Result and Announcement publication version/idempotency constraints;
- Homework submission logical uniqueness;
- publication recipient snapshot uniqueness;
- notification source-event/recipient idempotency;
- tenant-safe composite academic-context foreign keys.

## 6. Live Supabase Auth foreign key

The hosted database contains the required live constraint:

```text
public.users.id -> auth.users.id ON DELETE CASCADE
```

The target is the Supabase-managed `auth.users` table. Application migrations
did not create, alter, seed, or take ownership of `auth.users`.

## 7. Grants and default privileges

Supabase's existing `public` default privileges grant table, sequence, and
function privileges to `anon`, `authenticated`, and `service_role`. As a
result, all 39 newly created application tables inherited all standard table
privileges for those roles.

This is a **MEDIUM defense-in-depth finding**. It is not currently a browser
exposure path because the Data API is disabled and Supabase automatically
enabled RLS on every application table with no policies. The trusted Next.js
runtime connects directly as the database role and continues to enforce the
application authorization pipeline.

No one-off revocation was applied. Any grant/default-privilege hardening must
be reproducible, repository-controlled, reviewed for Supabase internal-service
compatibility, and handled as a separate approved migration/policy decision.

## 8. RLS posture and Data API

Task 040 expected RLS to remain deferred. Hosted Supabase has an enabled
`ensure_rls` DDL event trigger backed by `public.rls_auto_enable`, which enabled
RLS on all 39 new application tables automatically. The application created no
RLS policies; the hosted policy count is zero.

This is a **MEDIUM environment deviation**, not a direct-runtime incompatibility:
the application uses the trusted PostgreSQL connection and does not depend on
Data API roles. RLS was neither manually enabled nor disabled during Task 041.

The disabled Data API was verified both before and after migration. For current
Supabase gateway/PostgREST behavior, the Dashboard/management setting
`Enable Data API = OFF` is the authoritative configuration checkpoint. A safe
request for the normal `schools` table resource using the validated public
project key could not query application data and returned no rows or schema.
The check intentionally does not depend on one HTTP status or error code:
gateway responses such as `Access to schema is forbidden` may vary independently
of key validity. `Invalid API key` remains a distinct target/key failure, and any
successful application-table response is a hard isolation failure.

## 9. Runtime and transaction-pooler verification

An opt-in integration test exercised the application's actual `getDb()`
Drizzle singleton through `DATABASE_URL`:

- an ordinary unnamed Drizzle query succeeded through Transaction Pooler;
- no prepared-statement error occurred;
- a Drizzle transaction obtained a transaction ID and rolled back through the
  expected error path;
- no row was written or left behind;
- no session-affine behavior was used.

## 10. Advisor and drift review

The automated session did not have an authenticated Supabase Dashboard session,
so it did not capture the Dashboard Advisor presentation. The authoritative
database catalog showed RLS enabled on every application table and zero RLS
policies. Relevant catalog findings are the broad inherited grants/default
privileges and the automatic-RLS deviation documented above.

No unexplained application-schema drift was found across tables, columns,
enums, named indexes, named constraints, or the migration journal.

## 11. Findings

| Severity | Finding                                                                                          | Status                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| CRITICAL | None                                                                                             | No production target, secret exposure, or Auth ownership damage occurred.                                             |
| HIGH     | None                                                                                             | Migration, runtime pooler, target identity, and Data API isolation passed.                                            |
| MEDIUM   | API roles inherited broad application-table and future-object privileges.                        | Recorded for a separate repository-controlled hardening decision; no ad hoc revocation applied.                       |
| MEDIUM   | Supabase automatically enabled RLS on all 39 tables although Task 040 described RLS as deferred. | Safe with the current direct-server architecture; documented as hosted reality, with zero policies.                   |
| LOW      | Dashboard Advisor UI was not independently captured by the automated session.                    | Catalog-level security and drift checks completed; operator may retain an Advisor screenshot as operational evidence. |

## 12. Task 042 handoff

- [x] Staging target positively identified
- [x] Public signup disabled
- [x] Anonymous sign-in disabled
- [x] Data API disabled
- [x] `auth.users` verified Supabase-managed
- [x] Runtime Transaction Pooler connection verified
- [x] Migration Session Pooler connection verified
- [x] Migrations `0000`–`0013` applied
- [x] Migration journal clean
- [x] 39 application tables verified
- [x] `public.users -> auth.users` FK verified
- [x] Representative tenant constraints verified
- [x] Grants and default privileges audited
- [x] No browser Data API dependency
- [x] Real Drizzle runtime connectivity verified
- [x] Real Supabase Auth configuration verified
- [x] No domain seed or temporary Auth user created
- [x] No credential-bearing env file tracked
- [x] No unresolved CRITICAL or HIGH finding

Task 041 is **READY for Task 042**, subject to preserving the current staging
target and addressing the documented grant/RLS policy decisions through a
separate reviewed task rather than manual hosted SQL.
