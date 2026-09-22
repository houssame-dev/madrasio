/**
 * Outbox persistence (ADR-012, PRD.md §31/§32).
 *
 * `persistOutboxEvent` inserts a PENDING OutboxEvent row. It is called from
 * INSIDE the same database transaction that commits the domain state change
 * (e.g. publish + outbox insert in one transaction), so a committed business
 * event can never be lost if delivery fails afterwards.
 *
 * The database record is the source of truth for the event; realtime/queue
 * delivery is NOT (PRD.md §12). Consumers must be idempotent
 * (at-least-once; see PRD.md §32) — this helper deliberately does NOT
 * deduplicate; duplicate events are prevented at the domain layer via
 * publication idempotency keys and partial-unique constraints.
 *
 * The `GradesDb` type keeps this helper driver-agnostic: the production
 * node-postgres client and the PGlite test client both satisfy it, so the
 * same transaction-atomicity is testable.
 */

import * as schema from '@school/database';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export type OutboxDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Inserts one PENDING outbox event inside the caller's transaction.
 *
 * `payload` must be a plain JSON object (the table CHECK enforces
 * `jsonb_typeof(payload) = 'object'`).
 */
export async function persistOutboxEvent(
  db: OutboxDb,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(schema.outboxEvents).values({ eventType, payload });
}