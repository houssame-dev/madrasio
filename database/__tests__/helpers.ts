import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';

import * as schema from '../drizzle/schema';

export const migrationsFolder = fileURLToPath(new URL('../drizzle/migrations', import.meta.url));

export type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Mirrors the Supabase-managed `auth` schema in the in-memory test database.
 *
 * The production migration must NOT create `auth` / `auth.users` — those are
 * owned by Supabase Auth (ADR-018). PGlite starts blank, so the test creates a
 * Supabase-compatible `auth.users` here BEFORE running migrations, mirroring
 * the columns declared by `authUsers` from `drizzle-orm/supabase`.
 * This is test-only infrastructure, kept clearly separate from the production
 * migration.
 */
export async function createSupabaseAuth(client: PGlite) {
  await client.exec('CREATE SCHEMA IF NOT EXISTS auth');
  await client.exec(
    `CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY NOT NULL,
      email varchar(255),
      phone text UNIQUE,
      email_confirmed_at timestamp with time zone,
      phone_confirmed_at timestamp with time zone,
      last_sign_in_at timestamp with time zone,
      created_at timestamp with time zone,
      updated_at timestamp with time zone
    )`,
  );
}

/**
 * Creates a fresh hermetic PGlite database, applies the Supabase-compatible
 * auth infrastructure, then runs the committed production migrations.
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await createSupabaseAuth(client);
  await migrate(db, { migrationsFolder });
  return { client, db };
}