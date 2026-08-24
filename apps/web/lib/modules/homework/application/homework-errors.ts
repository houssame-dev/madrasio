import { AppError, type AppErrorCode } from '@/lib/errors';

export type HomeworkFeatureCode =
  | 'HOMEWORK_NOT_FOUND'
  | 'HOMEWORK_NOT_EDITABLE'
  | 'INVALID_HOMEWORK_STATUS_TRANSITION'
  | 'DUPLICATE_HOMEWORK_TARGET'
  | 'INVALID_HOMEWORK_CONTEXT'
  | 'HOMEWORK_NOT_PUBLISHABLE'
  | 'HOMEWORK_SUBMISSION_NOT_FOUND'
  | 'DUPLICATE_HOMEWORK_SUBMISSION'
  | 'STUDENT_NOT_ELIGIBLE_FOR_HOMEWORK'
  | 'HOMEWORK_SUBMISSION_NOT_ALLOWED'
  | 'INVALID_HOMEWORK_SUBMISSION_STATE';

const genericCode: Record<HomeworkFeatureCode, AppErrorCode> = {
  HOMEWORK_NOT_FOUND: 'NOT_FOUND',
  HOMEWORK_NOT_EDITABLE: 'BUSINESS_RULE_VIOLATION',
  INVALID_HOMEWORK_STATUS_TRANSITION: 'BUSINESS_RULE_VIOLATION',
  DUPLICATE_HOMEWORK_TARGET: 'CONFLICT',
  INVALID_HOMEWORK_CONTEXT: 'BUSINESS_RULE_VIOLATION',
  HOMEWORK_NOT_PUBLISHABLE: 'BUSINESS_RULE_VIOLATION',
  HOMEWORK_SUBMISSION_NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_HOMEWORK_SUBMISSION: 'CONFLICT',
  STUDENT_NOT_ELIGIBLE_FOR_HOMEWORK: 'BUSINESS_RULE_VIOLATION',
  HOMEWORK_SUBMISSION_NOT_ALLOWED: 'BUSINESS_RULE_VIOLATION',
  INVALID_HOMEWORK_SUBMISSION_STATE: 'BUSINESS_RULE_VIOLATION',
};

export class HomeworkDomainError extends AppError {
  readonly featureCode: HomeworkFeatureCode;

  constructor(featureCode: HomeworkFeatureCode, message: string) {
    super(genericCode[featureCode], message);
    this.name = 'HomeworkDomainError';
    this.featureCode = featureCode;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const value = error as { code?: string; cause?: { code?: string } } | null;
  return value?.code === '23505' || value?.cause?.code === '23505';
}
