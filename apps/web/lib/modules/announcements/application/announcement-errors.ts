/**
 * Announcements use-case errors (Task 011).
 *
 * Feature-specific machine-readable codes (PRD.md §28) layered on top of
 * the generic cross-cutting `BUSINESS_RULE_VIOLATION`. Frontends depend on
 * `featureCode`, never on the English message.
 *
 * Codes:
 * - ANNOUNCEMENT_NOT_FOUND     — the logical Announcement does not exist in
 *   the School context
 * - VERSION_NOT_FOUND          — the requested AnnouncementVersion does not
 *   belong to the Announcement / School
 * - NOT_PUBLISHABLE            — the Announcement/Publication is in a state
 *   that cannot be published (e.g. ARCHIVED, not yet due)
 * - ALREADY_PUBLISHED          — the exact Version already has a publication
 *   (BR-ANNOUNCEMENT-014: a revision requires a NEW Version)
 * - NO_VALID_TARGETS           — the Version has no valid audience/target
 *   combinations to publish to
 * - NO_ELIGIBLE_RECIPIENTS     — targets exist but resolve to zero eligible
 *   recipients (a controlled failure — never a silent publish-to-nobody)
 * - PUBLICATION_CONFLICT       — the idempotency key was reused for a
 *   different logical publication (or a concurrent same-sequence collision)
 * - PUBLICATION_NOT_FOUND      — the Publication could not be resolved for
 *   due-work processing
 */

import { AppError, type AppErrorCode } from '@/lib/errors';

export const ANNOUNCEMENT_ERROR_CODES = [
  'ANNOUNCEMENT_NOT_FOUND',
  'VERSION_NOT_FOUND',
  'NOT_PUBLISHABLE',
  'ALREADY_PUBLISHED',
  'NO_VALID_TARGETS',
  'NO_ELIGIBLE_RECIPIENTS',
  'PUBLICATION_CONFLICT',
  'PUBLICATION_NOT_FOUND',
  'ANNOUNCEMENT_NOT_EDITABLE',
  'ANNOUNCEMENT_VERSION_IMMUTABLE',
  'INVALID_ANNOUNCEMENT_STATUS_TRANSITION',
  'DUPLICATE_ANNOUNCEMENT_TARGET',
  'INVALID_ANNOUNCEMENT_CONTEXT',
  'ANNOUNCEMENT_VERSION_CONFLICT',
] as const;
export type AnnouncementErrorCode = (typeof ANNOUNCEMENT_ERROR_CODES)[number];

const genericCode: Record<AnnouncementErrorCode, AppErrorCode> = {
  ANNOUNCEMENT_NOT_FOUND: 'NOT_FOUND',
  VERSION_NOT_FOUND: 'NOT_FOUND',
  NOT_PUBLISHABLE: 'BUSINESS_RULE_VIOLATION',
  ALREADY_PUBLISHED: 'CONFLICT',
  NO_VALID_TARGETS: 'BUSINESS_RULE_VIOLATION',
  NO_ELIGIBLE_RECIPIENTS: 'BUSINESS_RULE_VIOLATION',
  PUBLICATION_CONFLICT: 'CONFLICT',
  PUBLICATION_NOT_FOUND: 'NOT_FOUND',
  ANNOUNCEMENT_NOT_EDITABLE: 'BUSINESS_RULE_VIOLATION',
  ANNOUNCEMENT_VERSION_IMMUTABLE: 'BUSINESS_RULE_VIOLATION',
  INVALID_ANNOUNCEMENT_STATUS_TRANSITION: 'BUSINESS_RULE_VIOLATION',
  DUPLICATE_ANNOUNCEMENT_TARGET: 'CONFLICT',
  INVALID_ANNOUNCEMENT_CONTEXT: 'BUSINESS_RULE_VIOLATION',
  ANNOUNCEMENT_VERSION_CONFLICT: 'CONFLICT',
};

export class AnnouncementDomainError extends AppError {
  public readonly featureCode: AnnouncementErrorCode;

  constructor(featureCode: AnnouncementErrorCode, message: string) {
    super(genericCode[featureCode], message);
    this.name = 'AnnouncementDomainError';
    this.featureCode = featureCode;
  }
}
