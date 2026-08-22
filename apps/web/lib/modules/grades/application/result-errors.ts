/**
 * Results use-case errors (Task 006D).
 *
 * Feature-specific error codes (CLAUDE.md §28) layered on top of the generic
 * cross-cutting `BUSINESS_RULE_VIOLATION`. Frontends depend on `featureCode`
 * (a stable machine-readable identifier), never on the English message.
 */

import { AppError, type AppErrorCode } from '@/lib/errors';

import type { CalculationIncompleteDetail, ResultErrorCode } from '../domain';

const genericCode: Record<ResultErrorCode, AppErrorCode> = {
  CALCULATION_INCOMPLETE: 'BUSINESS_RULE_VIOLATION',
  CONFIGURATION_INVALID: 'BUSINESS_RULE_VIOLATION',
  GRADEBOOK_NOT_AVAILABLE: 'BUSINESS_RULE_VIOLATION',
  STUDENT_NOT_ENROLLED: 'BUSINESS_RULE_VIOLATION',
  RESULT_NOT_FOUND: 'NOT_FOUND',
  RESULT_ALREADY_FINALIZED: 'CONFLICT',
  RESULT_NOT_FINALIZED: 'BUSINESS_RULE_VIOLATION',
  RESULT_ALREADY_PUBLISHED: 'CONFLICT',
  RESULT_NOT_PUBLISHED: 'BUSINESS_RULE_VIOLATION',
  INVALID_RESULT_STATE: 'BUSINESS_RULE_VIOLATION',
  PUBLICATION_CONFLICT: 'CONFLICT',
};

export class ResultDomainError extends AppError {
  public readonly featureCode: ResultErrorCode;

  constructor(featureCode: ResultErrorCode, message: string, incomplete?: CalculationIncompleteDetail) {
    super(
      genericCode[featureCode],
      message,
      incomplete !== undefined ? { details: { incomplete } } : undefined,
    );
    this.name = 'ResultDomainError';
    this.featureCode = featureCode;
  }
}
