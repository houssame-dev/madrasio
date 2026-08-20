/**
 * Outbox operational errors (Task 013 §29).
 *
 * Controlled, machine-readable codes (CLAUDE.md §28) for the operational
 * layer that drives retries/batches over the existing Outbox. These are
 * distinct from NotificationProcessingError: they describe OPERATIONAL
 * preconditions, not downstream processing failures. A PROCESSED replay is
 * intentionally an idempotent no-op rather than an error; a FAILED event is
 * always retryable (never interpreted as permanently dead).
 */

import { BusinessRuleViolationError } from '@/lib/errors';

export const OUTBOX_OPERATION_ERROR_CODES = ['OUTBOX_EVENT_NOT_FOUND', 'INVALID_RETRY_STATE'] as const;
export type OutboxOperationErrorCode = (typeof OUTBOX_OPERATION_ERROR_CODES)[number];

export class OutboxOperationError extends BusinessRuleViolationError {
  public readonly featureCode: OutboxOperationErrorCode;

  constructor(featureCode: OutboxOperationErrorCode, message: string) {
    super(message, { featureCode });
    this.name = 'OutboxOperationError';
    this.featureCode = featureCode;
  }
}