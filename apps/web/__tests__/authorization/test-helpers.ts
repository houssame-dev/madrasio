import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';

import * as schema from '@school/database';

import type { AuthorizationDb } from '@/lib/authorization/server/db';

/**
 * The production migrations live at the workspace root. Vitest runs with the
 * package as CWD, so resolve from there. (Vite rewrites the
 * `new URL(..., import.meta.url)` idiom into a dev-server asset URL, so it
 * cannot be used to locate files on disk.)
 */
export const migrationsFolder = path.resolve(process.cwd(), '../../database/drizzle/migrations');

export interface AuthzTestDb {
  /** Schema-typed client for seeding test data. */
  seed: ReturnType<typeof drizzle<typeof schema>>;
  /** The AuthorizationDb surface the server resolvers consume. */
  db: AuthorizationDb;
  client: PGlite;
}

/**
 * Creates a fresh hermetic PGlite database, mirrors the Supabase-managed
 * `auth` schema (ADR-018 test infrastructure), then applies all committed
 * production migrations — the same approach the `database` package tests use.
 */
export async function createAuthzTestDb(): Promise<AuthzTestDb> {
  const client = new PGlite();
  const seed = drizzle(client, { schema });

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

  await migrate(seed, { migrationsFolder });

  return { seed, db: seed as unknown as AuthorizationDb, client };
}