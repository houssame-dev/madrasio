/**
 * Results use-case errors (Task 006D).
 *
 * Feature-specific error codes (CLAUDE.md §28) layered on top of the generic
 * cross-cutting `BUSINESS_RULE_VIOLATION`. Frontends depend on `featureCode`
 * (a stable machine-readable identifier), never on the English message.
 */

import { BusinessRuleViolationError } from '@/lib/errors';

import type { CalculationIncompleteDetail, ResultErrorCode } from '../domain';

export class ResultDomainError extends BusinessRuleViolationError {
  public readonly featureCode: ResultErrorCode;

  constructor(featureCode: ResultErrorCode, message: string, incomplete?: CalculationIncompleteDetail) {
    super(message, incomplete !== undefined ? { incomplete } : undefined);
    this.name = 'ResultDomainError';
    this.featureCode = featureCode;
  }
}