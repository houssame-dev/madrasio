import { AppError, type AppErrorCode } from '@/lib/errors';

export type ParentFeatureCode =
  | 'CHILD_NOT_AVAILABLE'
  | 'ACADEMIC_CONTEXT_NOT_AVAILABLE'
  | 'PARENT_NOT_FOUND'
  | 'PARENT_NOT_ACTIVE'
  | 'DUPLICATE_PARENT_CODE'
  | 'PARENT_RELATIONSHIP_NOT_FOUND'
  | 'DUPLICATE_PARENT_STUDENT_RELATIONSHIP'
  | 'INVALID_RELATIONSHIP_CONTEXT'
  | 'INVALID_USER_LINK'
  | 'INVALID_PARENT_STATUS_TRANSITION';

const genericCode: Record<ParentFeatureCode, AppErrorCode> = {
  CHILD_NOT_AVAILABLE: 'NOT_FOUND',
  ACADEMIC_CONTEXT_NOT_AVAILABLE: 'NOT_FOUND',
  PARENT_NOT_FOUND: 'NOT_FOUND',
  PARENT_NOT_ACTIVE: 'BUSINESS_RULE_VIOLATION',
  DUPLICATE_PARENT_CODE: 'CONFLICT',
  PARENT_RELATIONSHIP_NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_PARENT_STUDENT_RELATIONSHIP: 'CONFLICT',
  INVALID_RELATIONSHIP_CONTEXT: 'BUSINESS_RULE_VIOLATION',
  INVALID_USER_LINK: 'BUSINESS_RULE_VIOLATION',
  INVALID_PARENT_STATUS_TRANSITION: 'BUSINESS_RULE_VIOLATION',
};

export class ParentDomainError extends AppError {
  readonly featureCode: ParentFeatureCode;
  constructor(featureCode: ParentFeatureCode, message: string) {
    super(genericCode[featureCode], message);
    this.name = 'ParentDomainError';
    this.featureCode = featureCode;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  return value?.code === '23505' || value?.cause?.code === '23505';
}
