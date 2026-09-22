/**
 * Process a bounded batch of retryable outbox events (Task 013 §6–§14).
 *
 * A SMALL operational layer over the existing Outbox — no new queue, no Redis,
 * no locks (PRD.md §33, ADR-015). It is safe to call repeatedly (a future
 * scheduled runner may invoke it periodically, Task 013 §27).
 *
 * Semantics:
 * - Normal batch selects PENDING only (default `includeFailed: false`) — a
 *   deterministic FAILED row is NOT hammered continuously (§7/§8).
 * - `includeFailed: true` explicitly adds FAILED events for an operational
 *   retry batch; a FAILED event may re-fail until its cause is repaired.
 * - Bounded work: at most `limit` events (default 25, maximum 100), selected
 *   deterministically by `created_at ASC, id ASC` (§9/§10).
 * - Per-event failure isolation (§13): one event's failure never aborts the
 *   batch; each event processor owns its own transactional correctness.
 * - Transient (infrastructure) errors leave the event PENDING and never mark
 *   it FAILED (§2/§14); the attempt is reported at the operational layer.
 * - Idempotency/concurrency (§11/§23): the existing processor short-circuits
 *   PROCESSED and inserts with `UNIQUE(source_event_id, recipient_user_id)`,
 *   so concurrent drains cannot duplicate notifications.
 * - No payload is exposed in the summary (§19).
 */

import { NotificationProcessingError } from './notification-errors';
import type { NotificationsDb, OutboxEventStatus } from '../infrastructure/repositories/notification-repository';
import * as repo from '../infrastructure/repositories/notification-repository';
import { processClaimedNotificationEvent } from './process-notification-event';

export const OUTBOX_BATCH_DEFAULT_LIMIT = 25;
export const OUTBOX_BATCH_MAX_LIMIT = 100;

export function normalizeOutboxBatchLimit(requested?: number): number {
  const candidate = Math.floor(requested ?? OUTBOX_BATCH_DEFAULT_LIMIT);
  return Math.max(
    1,
    Math.min(
      Number.isFinite(candidate) ? candidate : OUTBOX_BATCH_DEFAULT_LIMIT,
      OUTBOX_BATCH_MAX_LIMIT,
    ),
  );
}

export interface ProcessRetryableOutboxEventsInput {
  /** Maximum events to attempt in this run. Default 25, clamped to 100. */
  limit?: number;
  /** When true, FAILED events are ALSO selected (operational retry). Default false. */
  includeFailed?: boolean;
}

export interface OutboxBatchEventOutcome {
  eventId: string;
  eventType: string;
  previousState: OutboxEventStatus;
  resultingState: OutboxEventStatus;
  notificationsCreated: number;
  /** Controlled error code when the event failed deterministically. */
  featureCode?: string;
}

export interface ProcessRetryableOutboxEventsResult {
  attempted: number;
  processed: number;
  failed: number;
  pending: number;
  remaining: number;
  results: OutboxBatchEventOutcome[];
}

export async function processRetryableOutboxEvents(
  db: NotificationsDb,
  input: ProcessRetryableOutboxEventsInput = {},
): Promise<ProcessRetryableOutboxEventsResult> {
  const limit = normalizeOutboxBatchLimit(input.limit);
  const statuses: readonly OutboxEventStatus[] = input.includeFailed ? ['PENDING', 'FAILED'] : ['PENDING'];

  const events = await repo.listRetryableOutboxEvents(db, { statuses, limit });

  const results: OutboxBatchEventOutcome[] = [];
  let processed = 0;
  let failed = 0;
  let pending = 0;

  for (const event of events) {
    let outcome: OutboxBatchEventOutcome;
    try {
      const transactionOutcome = await db.transaction(async (tx) => {
        const claim = await repo.claimOutboxEvent(tx, { eventId: event.id, statuses });
        if (!claim) return null;
        try {
          const result = await processClaimedNotificationEvent(tx, claim.event);
          return {
            eventId: event.id,
            eventType: event.eventType,
            previousState: claim.previousStatus,
            resultingState: 'PROCESSED' as const,
            notificationsCreated: result.notificationsCreated,
          };
        } catch (error) {
          if (!(error instanceof NotificationProcessingError)) throw error;
          await repo.markOutboxEventFailed(tx, event.id, error.message);
          return {
            eventId: event.id,
            eventType: event.eventType,
            previousState: claim.previousStatus,
            resultingState: 'FAILED' as const,
            notificationsCreated: 0,
            featureCode: error.featureCode,
          };
        }
      });
      if (!transactionOutcome) continue;
      outcome = transactionOutcome;
    } catch (error) {
      const resultingState = event.status;
      if (error instanceof NotificationProcessingError) {
        outcome = {
          eventId: event.id,
          eventType: event.eventType,
          previousState: event.status,
          resultingState,
          notificationsCreated: 0,
          featureCode: error.featureCode,
        };
      } else {
        // Transient/infrastructure failure — event stays PENDING (existing
        // processor semantics, §2); never falsely marked FAILED (§14).
        outcome = {
          eventId: event.id,
          eventType: event.eventType,
          previousState: event.status,
          resultingState,
          notificationsCreated: 0,
        };
      }
    }

    if (outcome.resultingState === 'PROCESSED') {
      processed += 1;
    } else if (outcome.resultingState === 'FAILED') {
      failed += 1;
    } else {
      pending += 1;
    }
    results.push(outcome);
  }

  const remaining = await repo.countOutboxEventsByStatuses(db, statuses);

  return {
    attempted: results.length,
    processed,
    failed,
    pending,
    remaining,
    results,
  };
}
