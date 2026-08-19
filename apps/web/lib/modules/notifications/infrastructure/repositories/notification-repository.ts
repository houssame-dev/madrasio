/**
 * Notification persistence — repository for the Notifications module
 * (Task 010 §13).
 *
 * This is the ONLY place Drizzle specifics touch the Notifications domain.
 * The processor consumes plain records; the engine never sees the database
 * (ADR-004, CLAUDE.md §24).
 *
 * The `NotificationsDb` surface mirrors `OutboxDb`/`GradesDb`: both the
 * node-postgres client (`lib/db/client.ts`) and the PGlite test client
 * satisfy it, keeping every function driver-agnostic and testable against the
 * committed migrations.
 *
 * Cross-module reads (Task 010 §13): the processor READS Announcement domain
 * rows (publication → version → snapshot) to build notifications, but it never
 * mutates Announcement data (CLAUDE.md §17). School tenant integrity is kept
 * server-side: every source lookup is filtered by `schoolId`, so a valid UUID
 * from another School can never resolve (CLAUDE.md §13/§26).
 */

import { and, eq, sql } from 'drizzle-orm';
import * as schema from '@school/database';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/** The minimal typed Drizzle surface the Notifications module needs. */
export type NotificationsDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The outbox row the processor drains (event + lifecycle + payload). */
export interface OutboxEventRow {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
}

/** The AnnouncementPublication row the processor needs (immutable snapshot). */
export interface AnnouncementPublicationRow {
  id: string;
  schoolId: string;
  announcementId: string;
  announcementVersionId: string;
  publicationVersion: number;
  status: 'SCHEDULED' | 'PUBLISHED';
  publishedAt: Date | null;
}

/** The immutable AnnouncementVersion content snapshot. */
export interface AnnouncementVersionRow {
  id: string;
  schoolId: string;
  title: string;
  body: string;
}

/** A historical snapshot recipient (never recomputed from live relationships). */
export interface PublicationRecipientRow {
  recipientUserId: string;
}

export async function findOutboxEvent(db: NotificationsDb, id: string): Promise<OutboxEventRow | null> {
  const [row] = await db
    .select()
    .from(schema.outboxEvents)
    .where(eq(schema.outboxEvents.id, id))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    eventType: row.eventType,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status,
  };
}

export async function findAnnouncementPublication(
  db: NotificationsDb,
  schoolId: string,
  publicationId: string,
): Promise<AnnouncementPublicationRow | null> {
  const [row] = await db
    .select()
    .from(schema.announcementPublications)
    .where(and(eq(schema.announcementPublications.schoolId, schoolId), eq(schema.announcementPublications.id, publicationId)))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    schoolId: row.schoolId,
    announcementId: row.announcementId,
    announcementVersionId: row.announcementVersionId,
    publicationVersion: row.publicationVersion,
    status: row.status,
    publishedAt: row.publishedAt,
  };
}

export async function findAnnouncementVersion(
  db: NotificationsDb,
  schoolId: string,
  versionId: string,
): Promise<AnnouncementVersionRow | null> {
  const [row] = await db
    .select({ id: schema.announcementVersions.id, schoolId: schema.announcementVersions.schoolId, title: schema.announcementVersions.title, body: schema.announcementVersions.body })
    .from(schema.announcementVersions)
    .where(and(eq(schema.announcementVersions.schoolId, schoolId), eq(schema.announcementVersions.id, versionId)))
    .limit(1);

  if (!row) return null;
  return { id: row.id, schoolId: row.schoolId, title: row.title, body: row.body };
}

/**
 * Recipients come EXCLUSIVELY from the immutable
 * `publication_recipient_snapshots` (Task 010 §14, BR-ANNOUNCEMENT-010) —
 * never recomputed from current ParentStudent/TeacherAssignment relationships.
 */
export async function findPublicationRecipients(
  db: NotificationsDb,
  publicationId: string,
): Promise<PublicationRecipientRow[]> {
  const rows = await db
    .select({ recipientUserId: schema.publicationRecipientSnapshots.recipientUserId })
    .from(schema.publicationRecipientSnapshots)
    .where(eq(schema.publicationRecipientSnapshots.publicationId, publicationId));

  return rows;
}

export interface NotificationInsert {
  schoolId: string;
  recipientUserId: string;
  notificationType: 'ANNOUNCEMENT_PUBLISHED' | 'RESULT_PUBLISHED' | 'RESULT_REVISED';
  title: string;
  body: string;
  sourceEventId: string;
  sourceType: 'ANNOUNCEMENT_PUBLICATION' | 'RESULT_PUBLICATION';
  sourceId: string;
}

/**
 * Bulk-inserts notifications inside the caller's transaction with
 * `ON CONFLICT DO NOTHING` on `(source_event_id, recipient_user_id)`
 * (Task 010 §25, BR-NOTIFICATION-005): a retry of an already-inserted
 * event+recipient is a safe no-op. Returns the number of rows actually
 * inserted (0 on a fully-replayed retry).
 */
export async function insertNotifications(tx: NotificationsDb, rows: NotificationInsert[]): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }
  const inserted = await tx
    .insert(schema.notifications)
    .values(rows)
    .onConflictDoNothing({
      target: [schema.notifications.sourceEventId, schema.notifications.recipientUserId],
    })
    .returning({ id: schema.notifications.id });
  return inserted.length;
}

/** Marks the consumed outbox event PROCESSED inside the same transaction. */
export async function markOutboxEventProcessed(tx: NotificationsDb, eventId: string): Promise<void> {
  await tx
    .update(schema.outboxEvents)
    .set({ status: 'PROCESSED', processedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.outboxEvents.id, eventId));
}

/**
 * Records an EXPLICIT processing failure on the outbox event (Task 010.1).
 *
 * Uses the existing Outbox lifecycle (ADR-012): a deterministic domain
 * failure moves the event PENDING → FAILED with a readable `last_error` so it
 * is NEVER silently dropped and NEVER marked PROCESSED as if it succeeded.
 * The event stays in the database, remains visible to operators, and is still
 * retryable — `processNotificationEvent` only short-circuits on `PROCESSED`,
 * so a FAILED event is attempted again on reprocessing (and re-marked FAILED
 * if the cause persists, or moved to PROCESSED once it resolves).
 */
export async function markOutboxEventFailed(db: NotificationsDb, eventId: string, lastError: string): Promise<void> {
  await db
    .update(schema.outboxEvents)
    .set({ status: 'FAILED', lastError, updatedAt: new Date() })
    .where(eq(schema.outboxEvents.id, eventId));
}

/**
 * Mark-READ (Task 010 §8/§26): sets `read_at` only when still NULL
 * (`COALESCE`), so an already-read notification is never rewritten and
 * `read_at` can never move backward. Recipient + School scoped: a User can
 * only ever affect their OWN notifications in their current School
 * (BR-NOTIFICATION-007). Returns the notification id when the scoped row
 * exists, or null otherwise.
 */
export async function markNotificationRead(
  db: NotificationsDb,
  notificationId: string,
  schoolId: string,
  recipientUserId: string,
): Promise<boolean> {
  const [row] = await db
    .update(schema.notifications)
    .set({
      readAt: sql`COALESCE(${schema.notifications.readAt}, now())`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.notifications.id, notificationId),
        eq(schema.notifications.schoolId, schoolId),
        eq(schema.notifications.recipientUserId, recipientUserId),
      ),
    )
    .returning({ id: schema.notifications.id });
  return row !== undefined;
}

/**
 * Marks ALL of the current User's unread notifications in the current School
 * as read (Task 010 §10). Never touches other Users or other Schools
 * (BR-NOTIFICATION-007). Returns the number of rows updated.
 */
export async function markAllNotificationsRead(
  db: NotificationsDb,
  schoolId: string,
  recipientUserId: string,
): Promise<number> {
  const rows = await db
    .update(schema.notifications)
    .set({
      readAt: sql`COALESCE(${schema.notifications.readAt}, now())`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.notifications.schoolId, schoolId),
        eq(schema.notifications.recipientUserId, recipientUserId),
        sql`${schema.notifications.readAt} IS NULL`,
      ),
    )
    .returning({ id: schema.notifications.id });
  return rows.length;
}