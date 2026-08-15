import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { getServerEnv } from '@/lib/config/env';

/**
 * Singleton database client.
 *
 * Exposes a Drizzle-typed client backed by a node-postgres Pool. Domain code
 * must not import from this file directly — it consumes repositories defined
 * in each module's `infrastructure/` layer.
 *
 * Note: the schema argument is intentionally empty at this stage. The full
 * domain schema will be registered once the database schema task lands.
 */
type Database = NodePgDatabase<Record<string, never>>;

let cachedDb: Database | undefined;
let cachedPool: Pool | undefined;

export function getDb(): Database {
  if (cachedDb) return cachedDb;

  const env = getServerEnv();
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured. See .env.example.');
  }

  cachedPool = new Pool({ connectionString: env.DATABASE_URL });
  cachedDb = drizzle(cachedPool);
  return cachedDb;
}

export async function closeDb(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = undefined;
    cachedDb = undefined;
  }
}
