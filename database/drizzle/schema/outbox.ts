import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * OutboxEvent — the transactional outbox (ADR-012, domain-model §63,
 * CLAUDE.md §31).
 *
 * Critical cross-module events (e.g. ResultPublished, ResultRevisionPublished)
 * are persisted HERE inside the SAME database transaction as the domain state
 * change they describe. An asynchronous processor (a later task) drains the
 * PENDING rows; the database record is the durable guarantee that an event
 * that was committed was not lost if delivery fails afterwards.
 *
 * `event_type` is the stable event identifier (e.g. `ResultPublished`). The
 * `payload` JSONB carries the event data (school/student/result context) and
 * is validated as a JSON object by a CHECK. This is infrastructure data —
 * it must NEVER be used as a replacement for relational domain state, and the
 * Grades module never stores academic truth here.
 *
 * Lifecycle: PENDING → PROCESSING → PROCESSED | FAILED. The operational model
 * may be expanded by a later Notifications/Jobs task; this table only needs to
 * persist the event reliably for Task 006D.
 *
 * No tenant FK is stored here because the outbox is infrastructure, not a
 * school-scoped entity; the payload carries the School/Student context and
 * the processor resolves authorization against real domain records.
 */
export const outboxEventStatus = pgEnum('outbox_event_status', ['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED']);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: outboxEventStatus('status').notNull().default('PENDING'),
    attemptCount: integer('attempt_count').notNull().default(0),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('outbox_events_status_created_idx').on(table.status, table.createdAt),
    index('outbox_events_type_idx').on(table.eventType),
    check('outbox_events_payload_object_check', sql`jsonb_typeof(${table.payload}) = 'object'`),
  ],
);