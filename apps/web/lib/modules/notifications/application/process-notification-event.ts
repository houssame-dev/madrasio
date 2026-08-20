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
 * RESULTS (Task 012): ResultPublished / ResultRevisionPublished recipients
 * come EXCLUSIVELY from the frozen `recipientUserIds` frozen in the event
 * payload at publication time (Task 012 §7/§11) — the processor NEVER queries
 * ParentStudent. It validates the payload, deduplicates defensively, confirms
 * the exact ResultPublication in the event's School, and creates one
 * notification per frozen recipient (source_id = the ResultPublication).
 * Historical events keep their frozen recipient set even if ParentStudent or
 * SchoolMembership rows changed afterwards (Task 012 §17/§18) — the
 * notifications composite FK targets `school_memberships`, and INACTIVE rows
 * still satisfy it, so delayed processing never rewrites the historical
 * decision. A valid event with zero recipients processes successfully
 * (zero notifications, PROCESSED) — it is NOT an error (Task 012 §12).
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
import type { ResultEventPayload } from '@/lib/modules/grades/domain/results';

import {
  createAnnouncementPublishedNotificationContent,
  createResultPublishedNotificationContent,
  createResultRevisedNotificationContent,
} from '../domain/notification-content';
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
 * Validates the Result outbox payload contract (Task 012 §11/§20). The frozen
 * `recipientUserIds` array is part of the contract; a malformed payload is an
 * explicit FAILED outcome — never PROCESSED, never silently dropped.
 */
function validateResultEventPayload(payload: Record<string, unknown>): ResultEventPayload {
  if (
    !isNonEmptyString(payload.eventId) ||
    (payload.eventType !== 'ResultPublished' && payload.eventType !== 'ResultRevisionPublished') ||
    !isNonEmptyString(payload.schoolId) ||
    !isNonEmptyString(payload.studentId) ||
    (payload.resultType !== 'SUBJECT' && payload.resultType !== 'PERIOD' && payload.resultType !== 'ANNUAL') ||
    !isNonEmptyString(payload.resultValue) ||
    !isNonEmptyString(payload.publicationId) ||
    typeof payload.publicationVersion !== 'number' ||
    payload.publicationVersion <= 0 ||
    !isNonEmptyString(payload.publishedAt) ||
    !Array.isArray(payload.recipientUserIds) ||
    payload.recipientUserIds.some((id) => !isNonEmptyString(id))
  ) {
    throw new NotificationProcessingError(
      'EVENT_PAYLOAD_INVALID',
      'The result event payload is malformed.',
    );
  }
  return payload as unknown as ResultEventPayload;
}

/**
 * Processes one outbox event into persisted notifications.
 *
 * SUCCESS (supported event): notification inserts + the PROCESSED transition
 * happen in ONE transaction — a failure rolls the whole batch back and the
 * event stays retryable with no partial notifications (Task 010 §19).
 *
 * FAILURE (Task 010.1): a deterministic domain failure — unknown/unsupported
 * event type, a malformed payload, or an unresolvable source — is NEVER
 * silently dropped and NEVER marked PROCESSED. The error propagates to the
 * caller AND the event is explicitly moved to FAILED with a readable
 * `last_error` (the existing Outbox lifecycle). A FAILED event is still
 * retryable: it is only short-circuited when `PROCESSED`, so reprocessing
 * re-attempts it (and either resolves to PROCESSED or re-records the FAILED
 * state).
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

  if (event.eventType === 'ResultPublished' || event.eventType === 'ResultRevisionPublished') {
    return processResultPublished(db, event, notificationType, sourceType);
  }

  throw new NotificationProcessingError(
    'EVENT_TYPE_NOT_SUPPORTED',
    `Outbox event type "${event.eventType}" has no notification integration.`,
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

/**
 * Result events (Task 012): notification recipients come EXCLUSIVELY from the
 * frozen `recipientUserIds` in the event payload — the processor NEVER queries
 * ParentStudent (Task 012 §11). It validates the payload, confirms the exact
 * ResultPublication in the event's School (school-context enforcement, §7),
 * deduplicates defensively, and inserts one notification per recipient inside
 * the SAME transaction as the PROCESSED mark. Zero recipients processes
 * successfully — zero notifications, PROCESSED (Task 012 §12).
 *
 * Content is built ONLY from immutable event payload data (the frozen
 * `resultValue`); no live Result rows are read (Task 012 §14). The
 * notification `source_id` points at the exact ResultPublication that caused
 * the event (Task 012 §15).
 */
async function processResultPublished(
  db: NotificationsDb,
  event: repo.OutboxEventRow,
  notificationType: NotificationType,
  sourceType: NotificationSourceType,
): Promise<ProcessNotificationEventResult> {
  const payload = validateResultEventPayload(event.payload);
  const schoolId = payload.schoolId;

  // School-scoped lookup: a publication from another School can never resolve
  // (tenant isolation is server-side, CLAUDE.md §13). The publication row is
  // NOT used to recompute recipients — the frozen payload is the source of
  // truth (Task 012 §7).
  const publication = await repo.findResultPublication(db, schoolId, payload.publicationId);
  if (!publication) {
    throw new NotificationProcessingError(
      'PUBLICATION_NOT_FOUND',
      `Result publication ${payload.publicationId} was not found in this school.`,
    );
  }

  const content =
    event.eventType === 'ResultRevisionPublished'
      ? createResultRevisedNotificationContent({ resultValue: payload.resultValue })
      : createResultPublishedNotificationContent({ resultValue: payload.resultValue });

  // Defensive deduplication (Task 012 §11 step 3) — the frozen payload is
  // already deduplicated at publication time, but a tampered/legacy event must
  // still produce at most one notification per recipient.
  const seen = new Set<string>();
  const rows: NotificationInsert[] = [];
  for (const recipientUserId of payload.recipientUserIds) {
    if (seen.has(recipientUserId)) {
      continue;
    }
    seen.add(recipientUserId);
    rows.push({
      schoolId,
      recipientUserId,
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