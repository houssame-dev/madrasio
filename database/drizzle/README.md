# Drizzle migrations directory

Generated SQL migrations land here. Schema DDL is produced by
`drizzle-kit generate` from `database/drizzle/schema/`. Never rewrite a
migration after it has been applied or committed. When a new, unapplied schema
change requires a deterministic data backfill that Drizzle cannot generate,
the generated migration may receive the minimum reviewed SQL needed to reach
the final schema atomically; that SQL must have focused replay/failure tests.
Migration 0014 is such a case: its generated column/constraints surround a
read-only `auth.users` reconciliation and explicit fail-closed checks.

Migrations must be reviewed, tested, and version-controlled.

Hosted migration commands use `MIGRATION_DATABASE_URL` (direct PostgreSQL or
the Supabase session pooler), never the transaction-pooler `DATABASE_URL`.
Local commands may omit it and use the documented `DATABASE_URL` fallback.
