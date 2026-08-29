# Drizzle migrations directory

Generated SQL migrations land here. Do not hand-edit migration files — they
are produced by `drizzle-kit generate` from the schema in
`database/drizzle/schema/`.

Migrations must be reviewed, tested, and version-controlled.

Hosted migration commands use `MIGRATION_DATABASE_URL` (direct PostgreSQL or
the Supabase session pooler), never the transaction-pooler `DATABASE_URL`.
Local commands may omit it and use the documented `DATABASE_URL` fallback.
