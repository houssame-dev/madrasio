/**
 * Notification processing use case (Task 010 §13/§14/§15/§25).
 *
 * The Notifications processor is the ONLY producer of notifications. It
 * consumes durable `outbox_events` (ADR-012): one logical domain event → zero
 * or more persisted notifications.
 *
 * PROCESSING IS IDEMPOTENT (Task 010 §25, BR-NOTIFICATION-005, CLAUDE.md §32):
 * an event already marked PROCESSED is a no-op, and the notification inserts
 * use `ON CONFLICT DO NOTHING` on `(source_event_id, recipient_user_id)`. The
 * insert + PROCESSED mark happen inside ONE transaction, so a failure rolls
 * the whole batch back and the event stays retryable — no recipient is ever
 * silently dropped and no duplicate is ever created (Task 010 §18/§19).
 *
 * ANNOUNCEMENT (Task 010 §14/§21): recipients come EXCLUSIVELY from the
 * immutable `publication_recipient_snapshots` of the publication — never
 * recomputed from current ParentStudent/TeacherAssignment relationships
 * (BR-ANNOUNCEMENT-010). Content comes from the immutable AnnouncementVersion
 * the publication references.
 *
 * RESULTS (Task 010 §15): ResultPublished / ResultRevisionPublished are a
 * BOUNDARY. No Result recipient policy is approved yet, so processing THROWS
 * `RESULT_RECIPIENT_POLICY_NOT_APPROVED` and the event is explicitly marked
 * FAILED — it is never marked PROCESSED, never silently dropped, and never
 * partially processed (a later Result policy task enables these events).
 *
 * UNSUPPORTED EVENTS (Task 010.1): an unknown event type is likewise an
 * explicit failure — `EVENT_TYPE_NOT_SUPPORTED` is thrown and the event is
 * marked FAILED with a readable `last_error`, so no event is ever silently
 * ignored.
 *
 * SOURCE AUTHORIZATION (Task 010 §31): producing a notification NEVER grants
 * access to the source record. The processor only reads what it needs to
 * build content; resolving the source still requires the normal school-scoped
 * authorization pipeline.
 */

import type { AnnouncementEventPayload } from '@/lib/modules/announcements/domain/announcement-events';

import { createAnnouncementPublishedNotificationContent } from '../domain/notification-content';
import {
  notificationSourceTypeForEvent,
  notificationTypeForEvent,
  type NotificationType,
  type NotificationSourceType,
} from '../domain/notification-vocabulary';
import type { NotificationInsert, NotificationsDb } from '../infrastructure/repositories/notification-repository';
import * as repo from '../infrastructure/repositories/notification-repository';
import { NotificationProcessingError } from './notification-errors';

export interface ProcessNotificationEventInput {
  outboxEventId: string;
}

export interface ProcessNotificationEventResult {
  outboxEventId: string;
  eventType: string;
  notificationType: NotificationType | null;
  notificationsCreated: number;
  alreadyProcessed: boolean;
}

/**
 * Shape of the announcement outbox payload produced by the announcements
 * module's publish use case. Both `AnnouncementPublished` (sequence 1) and
 * `AnnouncementRevisionPublished` (sequence > 1) share this contract
 * (`domain/announcement-events.ts`).
 */
export type AnnouncementPublishedPayload = AnnouncementEventPayload;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validateAnnouncementEventPayload(payload: Record<string, unknown>): AnnouncementEventPayload {
  if (
    !isNonEmptyString(payload.eventId) ||
    (payload.eventType !== 'AnnouncementPublished' && payload.eventType !== 'AnnouncementRevisionPublished') ||
    !isNonEmptyString(payload.schoolId) ||
    !isNonEmptyString(payload.announcementId) ||
    !isNonEmptyString(payload.announcementVersionId) ||
    !isNonEmptyString(payload.publicationId) ||
    typeof payload.publicationVersion !== 'number' ||
    payload.publicationVersion <= 0 ||
    !isNonEmptyString(payload.publishedAt)
  ) {
    throw new NotificationProcessingError(
      'EVENT_PAYLOAD_INVALID',
      'The announcement event payload is malformed.',
    );
  }
  return payload as unknown as AnnouncementEventPayload;
}

/**
 * Processes one outbox event into persisted notifications.
 *
 * SUCCESS (supported event): notification inserts + the PROCESSED transition
 * happen in ONE transaction — a failure rolls the whole batch back and the
 * event stays retryable with no partial notifications (Task 010 §19).
 *
 * FAILURE (Task 010.1): a deterministic domain failure — unknown/unsupported
 * event type, a Result event whose recipient policy is not approved, a
 * malformed payload, or an unresolvable source — is NEVER silently dropped
 * and NEVER marked PROCESSED. The error propagates to the caller AND the
 * event is explicitly moved to FAILED with a readable `last_error` (the
 * existing Outbox lifecycle). A FAILED event is still retryable: it is only
 * short-circuited when `PROCESSED`, so reprocessing re-attempts it (and
 * either resolves to PROCESSED or re-records the FAILED state).
 *
 * Unexpected/infrastructure errors (NOT a `NotificationProcessingError`) are
 * left as-is (the event stays PENDING) so a transient failure remains
 * retryable without being recorded as a permanent domain failure.
 */
export async function processNotificationEvent(
  db: NotificationsDb,
  input: ProcessNotificationEventInput,
): Promise<ProcessNotificationEventResult> {
  const event = await repo.findOutboxEvent(db, input.outboxEventId);
  if (!event) {
    throw new NotificationProcessingError('EVENT_NOT_FOUND', `Outbox event ${input.outboxEventId} was not found.`);
  }

  if (event.status === 'PROCESSED') {
    return {
      outboxEventId: event.id,
      eventType: event.eventType,
      notificationType: null,
      notificationsCreated: 0,
      alreadyProcessed: true,
    };
  }

  try {
    return await processEvent(db, event);
  } catch (error) {
    if (error instanceof NotificationProcessingError) {
      await repo.markOutboxEventFailed(db, event.id, error.message);
    }
    throw error;
  }
}

async function processEvent(
  db: NotificationsDb,
  event: repo.OutboxEventRow,
): Promise<ProcessNotificationEventResult> {
  const notificationType = notificationTypeForEvent(event.eventType);
  const sourceType = notificationSourceTypeForEvent(event.eventType);
  if (!notificationType || !sourceType) {
    throw new NotificationProcessingError(
      'EVENT_TYPE_NOT_SUPPORTED',
      `Outbox event type "${event.eventType}" has no notification integration.`,
    );
  }

  if (event.eventType === 'AnnouncementPublished' || event.eventType === 'AnnouncementRevisionPublished') {
    return processAnnouncementPublished(db, event, notificationType, sourceType);
  }

  // ResultPublished / ResultRevisionPublished — boundary (Task 010 §15). No
  // Result recipient policy is approved yet, so the event is explicitly
  // marked FAILED (never PROCESSED, never silently dropped) and must remain
  // retryable until a Result recipient policy task enables it.
  throw new NotificationProcessingError(
    'RESULT_RECIPIENT_POLICY_NOT_APPROVED',
    `Result notification integration requires an approved recipient policy (${event.eventType}).`,
  );
}

async function processAnnouncementPublished(
  db: NotificationsDb,
  event: repo.OutboxEventRow,
  notificationType: NotificationType,
  sourceType: NotificationSourceType,
): Promise<ProcessNotificationEventResult> {
  const payload = validateAnnouncementEventPayload(event.payload);
  const schoolId = payload.schoolId;

  // School-scoped lookup: a publication from another School can never resolve
  // (tenant isolation is server-side, CLAUDE.md §13).
  const publication = await repo.findAnnouncementPublication(db, schoolId, payload.publicationId);
  if (!publication) {
    throw new NotificationProcessingError(
      'PUBLICATION_NOT_FOUND',
      `Announcement publication ${payload.publicationId} was not found in this school.`,
    );
  }

  const version = await repo.findAnnouncementVersion(db, schoolId, publication.announcementVersionId);
  if (!version) {
    throw new NotificationProcessingError(
      'VERSION_NOT_FOUND',
      `Announcement version ${publication.announcementVersionId} was not found in this school.`,
    );
  }

  const recipients = await repo.findPublicationRecipients(db, publication.id);

  const content = createAnnouncementPublishedNotificationContent(version.title);
  const seen = new Set<string>();
  const rows: NotificationInsert[] = [];
  for (const recipient of recipients) {
    if (seen.has(recipient.recipientUserId)) {
      continue;
    }
    seen.add(recipient.recipientUserId);
    rows.push({
      schoolId,
      recipientUserId: recipient.recipientUserId,
      notificationType,
      title: content.title,
      body: content.body,
      sourceEventId: event.id,
      sourceType,
      sourceId: publication.id,
    });
  }

  // INSERT + PROCESSED mark in ONE transaction (Task 010 §19): a failure rolls
  // back both, leaving the event retryable with no partially-created batch.
  const notificationsCreated = await db.transaction(async (tx) => {
    const created = await repo.insertNotifications(tx, rows);
    await repo.markOutboxEventProcessed(tx, event.id);
    return created;
  });

  return {
    outboxEventId: event.id,
    eventType: event.eventType,
    notificationType,
    notificationsCreated,
    alreadyProcessed: false,
  };
}