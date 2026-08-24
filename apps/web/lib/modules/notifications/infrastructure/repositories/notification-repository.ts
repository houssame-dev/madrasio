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

import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import * as schema from '@school/database';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type {
  NotificationInboxQuery, NotificationView,
} from '../../domain/contracts';

/** The minimal typed Drizzle surface the Notifications module needs. */
export type NotificationsDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The outbox event lifecycle (mirrors the `outbox_event_status` enum). */
export type OutboxEventStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

/** The outbox row the processor drains (event + lifecycle + payload). */
export interface OutboxEventRow {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: OutboxEventStatus;
}

/**
 * Operational outbox visibility row (Task 013 §15/§16/§19). Deliberately
 * carries NO payload — outbox payloads can contain recipient IDs and academic
 * context, so they are never exposed through operational views.
 */
export interface OutboxEventOperationalRow {
  id: string;
  eventType: string;
  status: OutboxEventStatus;
  createdAt: Date;
  processedAt: Date | null;
  lastError: string | null;
  attemptCount: number;
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

/** The ResultPublication row the processor needs (immutable source reference). */
export interface ResultPublicationRow {
  id: string;
  schoolId: string;
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

/**
 * Operational visibility for ONE outbox event (Task 013 §15). No payload is
 * returned — payloads may contain recipient IDs and academic context and are
 * never exposed through operational views (§19).
 */
export async function findOutboxEventOperational(db: NotificationsDb, id: string): Promise<OutboxEventOperationalRow | null> {
  const [row] = await db
    .select({
      id: schema.outboxEvents.id,
      eventType: schema.outboxEvents.eventType,
      status: schema.outboxEvents.status,
      createdAt: schema.outboxEvents.createdAt,
      processedAt: schema.outboxEvents.processedAt,
      lastError: schema.outboxEvents.lastError,
      attemptCount: schema.outboxEvents.attemptCount,
    })
    .from(schema.outboxEvents)
    .where(eq(schema.outboxEvents.id, id))
    .limit(1);

  return row ?? null;
}

/**
 * Bounded, deterministic selection of retryable outbox events (Task 013
 * §6/§9/§10/§12). Ordered by `created_at ASC, id ASC` (never unspecified row
 * order); limited so the operation stays safe as the Outbox grows. Only the
 * explicit statuses are selected — normal batches pass `['PENDING']` and an
 * operational retry batch adds `['FAILED']`; PROCESSING/PROCESSED are never
 * touched. Returns operational rows WITHOUT payload (§19).
 */
export async function listRetryableOutboxEvents(
  db: NotificationsDb,
  input: { statuses: readonly OutboxEventStatus[]; limit: number },
): Promise<OutboxEventOperationalRow[]> {
  if (input.limit <= 0) {
    return [];
  }
  return db
    .select({
      id: schema.outboxEvents.id,
      eventType: schema.outboxEvents.eventType,
      status: schema.outboxEvents.status,
      createdAt: schema.outboxEvents.createdAt,
      processedAt: schema.outboxEvents.processedAt,
      lastError: schema.outboxEvents.lastError,
      attemptCount: schema.outboxEvents.attemptCount,
    })
    .from(schema.outboxEvents)
    .where(inArray(schema.outboxEvents.status, [...input.statuses]))
    .orderBy(asc(schema.outboxEvents.createdAt), asc(schema.outboxEvents.id))
    .limit(input.limit);
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

/**
 * School-scoped ResultPublication lookup (Task 012 §15/§21). The processor
 * only needs to confirm the publication exists in the event's School so it can
 * enforce the school context for the insert and reference the exact
 * ResultPublication as the notification `source_id`. Recipients for Result
 * events come EXCLUSIVELY from the frozen `recipientUserIds` in the event
 * payload (Task 012 §7/§11) — never from ParentStudent queries.
 */
export async function findResultPublication(
  db: NotificationsDb,
  schoolId: string,
  publicationId: string,
): Promise<ResultPublicationRow | null> {
  const [row] = await db
    .select({ id: schema.resultPublications.id, schoolId: schema.resultPublications.schoolId })
    .from(schema.resultPublications)
    .where(and(eq(schema.resultPublications.schoolId, schoolId), eq(schema.resultPublications.id, publicationId)))
    .limit(1);

  return row ?? null;
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

const notificationViewSelection = {
  id: schema.notifications.id,
  notificationType: schema.notifications.notificationType,
  sourceType: schema.notifications.sourceType,
  sourceId: schema.notifications.sourceId,
  title: schema.notifications.title,
  body: schema.notifications.body,
  readAt: schema.notifications.readAt,
  createdAt: schema.notifications.createdAt,
};

function inboxConditions(
  schoolId: string,
  recipientUserId: string,
  input: NotificationInboxQuery,
) {
  const conditions = [
    eq(schema.notifications.schoolId, schoolId),
    eq(schema.notifications.recipientUserId, recipientUserId),
  ];
  if (input.status === 'READ') conditions.push(isNotNull(schema.notifications.readAt));
  if (input.status === 'UNREAD') conditions.push(isNull(schema.notifications.readAt));
  if (input.notificationType) conditions.push(eq(schema.notifications.notificationType, input.notificationType));
  if (input.sourceType) conditions.push(eq(schema.notifications.sourceType, input.sourceType));
  if (input.sourceId) conditions.push(eq(schema.notifications.sourceId, input.sourceId));
  if (input.createdFrom) conditions.push(gte(schema.notifications.createdAt, input.createdFrom));
  if (input.createdTo) conditions.push(lte(schema.notifications.createdAt, input.createdTo));
  return conditions;
}

export async function listNotifications(
  db: NotificationsDb,
  schoolId: string,
  recipientUserId: string,
  input: NotificationInboxQuery,
): Promise<{ rows: NotificationView[]; total: number }> {
  const where = and(...inboxConditions(schoolId, recipientUserId, input));
  const [rows, totals] = await Promise.all([
    db
      .select(notificationViewSelection)
      .from(schema.notifications)
      .where(where)
      .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(schema.notifications).where(where),
  ]);
  return { rows, total: Number(totals[0]?.value ?? 0) };
}

export async function findNotification(
  db: NotificationsDb,
  notificationId: string,
  schoolId: string,
  recipientUserId: string,
): Promise<NotificationView | null> {
  const [row] = await db
    .select(notificationViewSelection)
    .from(schema.notifications)
    .where(and(
      eq(schema.notifications.id, notificationId),
      eq(schema.notifications.schoolId, schoolId),
      eq(schema.notifications.recipientUserId, recipientUserId),
    ))
    .limit(1);
  return row ?? null;
}

export async function countUnreadNotifications(
  db: NotificationsDb,
  schoolId: string,
  recipientUserId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(schema.notifications)
    .where(and(
      eq(schema.notifications.schoolId, schoolId),
      eq(schema.notifications.recipientUserId, recipientUserId),
      isNull(schema.notifications.readAt),
    ));
  return Number(row?.value ?? 0);
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

/**
 * Marks the consumed outbox event PROCESSED inside the same transaction.
 *
 * PROCESSED is the terminal successful state (Task 013 §1): `last_error` is
 * cleared so a FAILED event that is later retried and succeeds does not carry
 * a stale failure message into its terminal state.
 */
export async function markOutboxEventProcessed(tx: NotificationsDb, eventId: string): Promise<void> {
  await tx
    .update(schema.outboxEvents)
    .set({ status: 'PROCESSED', processedAt: new Date(), lastError: null, updatedAt: new Date() })
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
 * Mark-READ (Task 010 §8/§26, Task 024 §30): conditionally sets `read_at`
 * only while it is NULL. An already-read or concurrently won row is fetched
 * without rewriting its first timestamp. Recipient + School scoped: a User
 * can only ever affect their OWN notifications in their current School
 * (BR-NOTIFICATION-007). Returns the safe row when it exists, or null.
 */
export async function markNotificationRead(
  db: NotificationsDb,
  notificationId: string,
  schoolId: string,
  recipientUserId: string,
): Promise<NotificationView | null> {
  const readAt = new Date();
  const [row] = await db
    .update(schema.notifications)
    .set({
      readAt,
    })
    .where(
      and(
        eq(schema.notifications.id, notificationId),
        eq(schema.notifications.schoolId, schoolId),
        eq(schema.notifications.recipientUserId, recipientUserId),
        isNull(schema.notifications.readAt),
      ),
    )
    .returning(notificationViewSelection);
  if (row) return row;
  return findNotification(db, notificationId, schoolId, recipientUserId);
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
  const readAt = new Date();
  const rows = await db
    .update(schema.notifications)
    .set({
      readAt,
    })
    .where(
      and(
        eq(schema.notifications.schoolId, schoolId),
        eq(schema.notifications.recipientUserId, recipientUserId),
        isNull(schema.notifications.readAt),
      ),
    )
    .returning({ id: schema.notifications.id });
  return rows.length;
}
