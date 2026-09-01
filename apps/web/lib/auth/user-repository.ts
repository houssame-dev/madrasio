import { eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@school/database';

import { normalizeEmail } from './email';

export type UserIdentityProjection = {
  id: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
};

export type UserIdentityDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Deterministic application-owned identity lookup for provisioning.
 * Supabase Auth must still be verified by exact UUID before this User is reused.
 */
export async function findUserByNormalizedEmail(
  db: UserIdentityDb,
  email: string,
): Promise<UserIdentityProjection | null> {
  const normalizedEmail = normalizeEmail(email);
  const rows = await db
    .select({ id: schema.users.id, email: schema.users.email, status: schema.users.status })
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);
  return rows[0] ?? null;
}
