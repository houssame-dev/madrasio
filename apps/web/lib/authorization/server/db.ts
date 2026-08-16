import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/**
 * The minimal Drizzle database surface the authorization resolvers need.
 *
 * Both the Node-postgres client (`lib/db`) and the PGlite test client satisfy
 * it, keeping resolvers driver-agnostic. Drizzle specifics stay inside this
 * infrastructure boundary (ADR-004); the pure engine never sees the database.
 */
export type AuthorizationDb = PgDatabase<PgQueryResultHKT, Record<string, never>>;