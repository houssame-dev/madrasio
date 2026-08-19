/**
 * Notifications processing errors (Task 010 §13/§15).
 *
 * Feature-specific machine-readable codes (CLAUDE.md §28) layered on top of
 * the generic cross-cutting `BUSINESS_RULE_VIOLATION`. Frontends depend on
 * `featureCode`, never on the English message.
 */

import { BusinessRuleViolationError } from '@/lib/errors';

export const NOTIFICATION_ERROR_CODES = [
  'EVENT_NOT_FOUND',
  'EVENT_TYPE_NOT_SUPPORTED',
  'EVENT_PAYLOAD_INVALID',
  'PUBLICATION_NOT_FOUND',
  'VERSION_NOT_FOUND',
  'RESULT_RECIPIENT_POLICY_NOT_APPROVED',
] as const;
export type NotificationErrorCode = (typeof NOTIFICATION_ERROR_CODES)[number];

export class NotificationProcessingError extends BusinessRuleViolationError {
  public readonly featureCode: NotificationErrorCode;

  constructor(featureCode: NotificationErrorCode, message: string) {
    super(message, { featureCode });
    this.name = 'NotificationProcessingError';
    this.featureCode = featureCode;
  }
}