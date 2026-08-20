/**
 * Hermetic PGlite test helpers for the Authentication / Current Context layer
 * (Task 014).
 *
 * Mirrors the `authorization/test-helpers` pattern: a fresh PGlite database
 * with the Supabase-compatible `auth` schema, all committed production
 * migrations applied, plus minimal identity seeding (auth user, application
 * user, school, membership).
 *
 * Every test gets an isolated database (no cross-test state).
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { authUsers } from 'drizzle-orm/supabase';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import * as schema from '@school/database';

import type { AuthDb } from '@/lib/auth/current-context';
import type { Role } from '@/lib/authorization/roles';

export const migrationsFolder = path.resolve(process.cwd(), '../../database/drizzle/migrations');

export interface AuthTestDb {
  /** Schema-typed client for seeding test data. */
  seed: ReturnType<typeof drizzle<typeof schema>>;
  /** The AuthDb surface the resolvers consume. */
  db: AuthDb;
  client: PGlite;
}

export async function createAuthTestDb(): Promise<AuthTestDb> {
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

  return { seed, db: seed as unknown as AuthDb, client };
}

/** Seeds a Supabase auth User (identity only — no application User row). */
export async function seedAuthUser(
  seed: AuthTestDb['seed'],
  id: string = randomUUID(),
  email?: string,
): Promise<string> {
  await seed.insert(authUsers).values({ id, ...(email ? { email } : {}) });
  return id;
}

/** Seeds an application User (auth + users, ADR-018 shared UUID). */
export async function seedUser(
  seed: AuthTestDb['seed'],
  id: string = randomUUID(),
  email?: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED' = 'ACTIVE',
): Promise<string> {
  const userId = await seedAuthUser(seed, id, email);
  await seed.insert(schema.users).values({ id: userId, status });
  return userId;
}

export async function seedSchool(seed: AuthTestDb['seed'], name = 'School'): Promise<{ id: string; name: string }> {
  const [school] = await seed.insert(schema.schools).values({ name }).returning();
  return school;
}

export async function seedMembership(
  seed: AuthTestDb['seed'],
  userId: string,
  schoolId: string,
  role: Role,
  status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
): Promise<{ id: string; schoolId: string }> {
  const [membership] = await seed
    .insert(schema.schoolMemberships)
    .values({ schoolId, userId, role, status })
    .returning();
  return membership;
}