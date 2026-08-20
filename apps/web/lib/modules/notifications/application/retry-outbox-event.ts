/**
 * Retry one outbox event (Task 013 §4/§5/§20/§23).
 *
 * The operational entry point to drain a single event safely. It REUSES the
 * existing `processNotificationEvent` (the approved processing entry point) —
 * no notification logic is duplicated here.
 *
 * Behavior:
 * - event not found          → controlled OUTBOX_EVENT_NOT_FOUND
 * - event PROCESSING         → controlled INVALID_RETRY_STATE (another worker
 *                              may hold it; do not double-drain)
 * - event PROCESSED          → idempotent no-op returning the current state
 * - event PENDING or FAILED  → invoke the notification processor, then return
 *                              the resulting event state
 *
 * Retry never mutates the SOURCE domain (§20): it only consumes the event's
 * historical data (Announcement `publication_recipient_snapshots`, frozen
 * Result `recipientUserIds`). A FAILED event is retried again — and can
 * resolve to PROCESSED once its underlying cause is repaired (§5).
 *
 * On a deterministic processing failure the processor already moves the event
 * to FAILED with a readable `last_error`; the NotificationProcessingError
 * (with its `featureCode`) propagates to the caller for observability
 * (Task 013 §24).
 */

import type { NotificationsDb } from '../infrastructure/repositories/notification-repository';
import * as repo from '../infrastructure/repositories/notification-repository';
import { OutboxOperationError } from './outbox-operations-errors';
import { processNotificationEvent } from './process-notification-event';

export interface RetryOutboxEventInput {
  outboxEventId: string;
}

export interface RetryOutboxEventResult {
  outboxEventId: string;
  eventType: string;
  previousState: repo.OutboxEventStatus;
  resultingState: repo.OutboxEventStatus;
  notificationsCreated: number;
  alreadyProcessed: boolean;
  lastError: string | null;
}

export async function retryOutboxEvent(
  db: NotificationsDb,
  input: RetryOutboxEventInput,
): Promise<RetryOutboxEventResult> {
  const event = await repo.findOutboxEvent(db, input.outboxEventId);
  if (!event) {
    throw new OutboxOperationError('OUTBOX_EVENT_NOT_FOUND', `Outbox event ${input.outboxEventId} was not found.`);
  }

  if (event.status === 'PROCESSING') {
    throw new OutboxOperationError(
      'INVALID_RETRY_STATE',
      `Outbox event ${input.outboxEventId} is PROCESSING and cannot be retried while in flight.`,
    );
  }

  if (event.status === 'PROCESSED') {
    const current = await repo.findOutboxEventOperational(db, event.id);
    return {
      outboxEventId: event.id,
      eventType: event.eventType,
      previousState: 'PROCESSED',
      resultingState: 'PROCESSED',
      notificationsCreated: 0,
      alreadyProcessed: true,
      lastError: current?.lastError ?? null,
    };
  }

  // PENDING or FAILED: reuse the approved processor (idempotent, transactional).
  const processed = await processNotificationEvent(db, { outboxEventId: event.id });
  const current = await repo.findOutboxEventOperational(db, event.id);

  return {
    outboxEventId: event.id,
    eventType: event.eventType,
    previousState: event.status,
    resultingState: current?.status ?? event.status,
    notificationsCreated: processed.notificationsCreated,
    alreadyProcessed: false,
    lastError: current?.lastError ?? null,
  };
}