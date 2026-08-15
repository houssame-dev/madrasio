# `@school/database`

Drizzle ORM foundation.

This package owns:
- `drizzle.config.ts` — Drizzle Kit configuration
- `drizzle/schema/` — domain schema entrypoint (empty at bootstrap)
- `drizzle/migrations/` — generated SQL migrations

Drizzle-specific imports **must not** leak outside this package or
`apps/web/lib/db/`. Domain code uses repository interfaces defined in each
module's `infrastructure/` layer.

## Scripts

- `pnpm --filter @school/database generate` — generate migrations from schema
- `pnpm --filter @school/database migrate` — apply migrations
- `pnpm --filter @school/database push` — push schema (development only)
- `pnpm --filter @school/database studio` — launch Drizzle Studio
