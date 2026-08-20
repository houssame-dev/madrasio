/**
 * Results domain vocabulary (Task 006D).
 *
 * Pure vocabulary — no I/O, no framework dependencies. The calculation
 * engine lives in `./calculation`; repositories and use cases live in
 * `infrastructure/` and `application/` respectively.
 *
 * These types reflect the EXACT names stored in the database enums
 * (`result_status` in Task 006C, `result_type` in migration 0007) so that the
 * application layer, repositories and tests all share one source of truth.
 */

import type { IncompleteReason } from './calculation';

/** Result lifecycle (Task 006C). CALCULATED → FINALIZED. */
export const RESULT_STATUSES = ['CALCULATED', 'FINALIZED'] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

/** Which of the three Result entities a calculation/publication targets. */
export const RESULT_TYPES = ['SUBJECT', 'PERIOD', 'ANNUAL'] as const;
export type ResultType = (typeof RESULT_TYPES)[number];

/**
 * Machine-readable feature error codes for the Results domain (CLAUDE.md §28).
 * Feature-specific codes exist in addition to the generic cross-cutting codes.
 */
export const RESULT_ERROR_CODES = [
  'CALCULATION_INCOMPLETE',
  'CONFIGURATION_INVALID',
  'GRADEBOOK_NOT_AVAILABLE',
  'STUDENT_NOT_ENROLLED',
  'RESULT_NOT_FOUND',
  'RESULT_ALREADY_FINALIZED',
  'RESULT_NOT_FINALIZED',
  'RESULT_ALREADY_PUBLISHED',
  'RESULT_NOT_PUBLISHED',
  'INVALID_RESULT_STATE',
  'PUBLICATION_CONFLICT',
] as const;
export type ResultErrorCode = (typeof RESULT_ERROR_CODES)[number];

/**
 * A controlled, machine-readable explanation of WHY a calculation could not
 * produce a value. Carried on `CALCULATION_INCOMPLETE` errors and derived
 * from the engine's `IncompleteReason`.
 */
export interface CalculationIncompleteDetail {
  reason: IncompleteReason;
  details: string[];
}

/** Stable event names emitted by the Results module (Part M). */
export const RESULT_EVENTS = ['ResultPublished', 'ResultRevisionPublished'] as const;
export type ResultEventName = (typeof RESULT_EVENTS)[number];

/** Shared shape of the outbox payload for both result events. */
export interface ResultEventPayload {
  eventId: string;
  eventType: ResultEventName;
  schoolId: string;
  studentId: string;
  resultType: ResultType;
  subjectResultId: string | null;
  periodResultId: string | null;
  annualResultId: string | null;
  resultValue: string;
  publicationId: string;
  publicationVersion: number;
  publishedAt: string;
  /**
   * Immutable publication-time recipient snapshot (Task 012 §6/§7): the
   * deduplicated, canonical-ordered user ids of the eligible PARENT Users of
   * the Student, frozen when this ResultPublication was published. NEVER
   * recalculated by the Notification processor. May be empty — zero eligible
   * Parents does not block publication (Task 012 §5).
   */
  recipientUserIds: string[];
}