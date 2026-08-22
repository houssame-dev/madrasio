import { AppError, type AppErrorCode } from '@/lib/errors';

export type GradebookFeatureCode =
  | 'GRADEBOOK_NOT_FOUND'
  | 'ASSESSMENT_NOT_FOUND'
  | 'DUPLICATE_GRADEBOOK'
  | 'INVALID_GRADEBOOK_CONTEXT'
  | 'INVALID_GRADEBOOK_STATUS_TRANSITION'
  | 'GRADEBOOK_NOT_EDITABLE'
  | 'ASSESSMENT_NOT_EDITABLE'
  | 'INVALID_ASSESSMENT_STATUS_TRANSITION'
  | 'INVALID_ASSESSMENT_DATE';

const genericCode: Record<GradebookFeatureCode, AppErrorCode> = {
  GRADEBOOK_NOT_FOUND: 'NOT_FOUND',
  ASSESSMENT_NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_GRADEBOOK: 'CONFLICT',
  INVALID_GRADEBOOK_CONTEXT: 'BUSINESS_RULE_VIOLATION',
  INVALID_GRADEBOOK_STATUS_TRANSITION: 'BUSINESS_RULE_VIOLATION',
  GRADEBOOK_NOT_EDITABLE: 'BUSINESS_RULE_VIOLATION',
  ASSESSMENT_NOT_EDITABLE: 'BUSINESS_RULE_VIOLATION',
  INVALID_ASSESSMENT_STATUS_TRANSITION: 'BUSINESS_RULE_VIOLATION',
  INVALID_ASSESSMENT_DATE: 'BUSINESS_RULE_VIOLATION',
};

export class GradebookDomainError extends AppError {
  readonly featureCode: GradebookFeatureCode;

  constructor(featureCode: GradebookFeatureCode, message: string) {
    super(genericCode[featureCode], message);
    this.name = 'GradebookDomainError';
    this.featureCode = featureCode;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  return value?.code === '23505' || value?.cause?.code === '23505';
}
