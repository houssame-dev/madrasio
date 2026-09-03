import 'server-only';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '@school/database';
import { postgresConnectionConfig } from '@school/database/connection';

import { getServerEnv } from '@/lib/config/env';

/**
 * Singleton database client.
 *
 * Exposes a Drizzle-typed client backed by a node-postgres Pool. Domain code
 * must not import from this file directly — it consumes repositories defined
 * in each module's `infrastructure/` layer.
 *
 * The full domain schema is registered so typed repositories (and the
 * authorization resolvers in `lib/authorization/server`) can query it.
 * Hosted `DATABASE_URL` targets the Supabase transaction pooler. Drizzle's
 * node-postgres queries remain unnamed (the application does not call
 * `.prepare()`), which avoids transaction-pooler-incompatible named prepared
 * statements. Migration tooling uses its separate connection convention.
 */
type Database = NodePgDatabase<typeof schema>;

let cachedDb: Database | undefined;
let cachedPool: Pool | undefined;

export function getDb(): Database {
  if (cachedDb) return cachedDb;

  const env = getServerEnv();
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured. See .env.example.');
  }

  cachedPool = new Pool(postgresConnectionConfig(env.DATABASE_URL, process.env.DATABASE_SSL_CA));
  cachedDb = drizzle(cachedPool, { schema });
  return cachedDb;
}

export async function closeDb(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = undefined;
    cachedDb = undefined;
  }
}
