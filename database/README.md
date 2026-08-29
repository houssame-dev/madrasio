# `@school/database`

Drizzle ORM foundation.

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
