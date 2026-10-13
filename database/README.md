# `@school/database`

Drizzle ORM foundation.

Task 065 adds `0022_homework-actual-handin-attachments`: **23 migrations,
43 application/RLS tables, 45 recovery tables** including durable Auth.
`homework_submissions.actual_handed_in_at` is nullable TIMESTAMPTZ, with no
backfill/default. The existing server recording timestamps retain their meaning.
`homework_submission_attachments` binds a private File to a same-School logical
Submission and its recording instant. Composite FKs/RESTRICT, unique File binding,
RLS and explicit public/Data API revocation protect the new association. Recovery
includes full metadata rows, never R2 bytes. Application validation owns dynamic
future-time and School-local lateness rules. Fresh and populated migration tests
are authored; A1 does not claim executed validation.

Task 064 adds `0021_student-date-of-birth`: its chain had 22 migrations
and still 42 application tables. Nullable `students.date_of_birth DATE` has no
default/backfill; Drizzle reads/writes a YYYY-MM-DD string, not a JS timestamp.
Normal application creation requires DOB; legacy rows and unrelated updates
remain valid without one. Server School-local validation owns the dynamic
not-in-the-future rule. RLS, tenant constraints and grants remain unchanged.

Task 063 adds `0020_private-application-files`: 21 migrations, 42 application tables.
`files` stores private object metadata; `announcement_attachments` enforces exact-Version,
same-School association. Both are RLS-enabled with no Data API grants. Existing rows are
not backfilled with invented attachments. That migration introduced an inventory of 44 tables including
durable Auth, but does not archive R2 object bytes. See
[private application files](../docs/architecture/private-application-files-and-attachments.md).

This package owns:

- `drizzle.config.ts` — Drizzle Kit configuration
- `drizzle/schema/` — committed application domain schema
- `drizzle/migrations/` — generated SQL migrations

Drizzle-specific imports **must not** leak outside this package or
`apps/web/lib/db/`. Domain code uses repository interfaces defined in each
module's `infrastructure/` layer.

## Scripts

- `pnpm --filter @school/database generate` — generate migrations from schema
- `pnpm --filter @school/database migrate` — apply migrations
- `pnpm --filter @school/database push` — push schema (development only)
- `pnpm --filter @school/database studio` — launch Drizzle Studio

## Connection purpose

Drizzle Kit prefers `MIGRATION_DATABASE_URL` and falls back to `DATABASE_URL`
for the existing local workflow. In hosted environments, migration and schema
commands must use a direct PostgreSQL connection or Supabase session pooler;
they must never use the serverless transaction-pooler runtime URL.

`push` is local-development tooling only. Staging and production changes use
reviewed, committed migrations through the explicit `migrate` command.
