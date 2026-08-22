import { AppError, type AppErrorCode } from '@/lib/errors';

export type StudentFeatureCode =
  | 'STUDENT_NOT_FOUND'
  | 'ENROLLMENT_NOT_FOUND'
  | 'DUPLICATE_STUDENT_CODE'
  | 'DUPLICATE_ENROLLMENT'
  | 'INVALID_ACADEMIC_CONTEXT'
  | 'INVALID_TRANSFER_DATE'
  | 'SAME_CLASS_TRANSFER'
  | 'STUDENT_NOT_ENROLLABLE'
  | 'ENROLLMENT_CONFLICT'
  | 'INVALID_STUDENT_STATUS_TRANSITION';

const genericCode: Record<StudentFeatureCode, AppErrorCode> = {
  STUDENT_NOT_FOUND: 'NOT_FOUND',
  ENROLLMENT_NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_STUDENT_CODE: 'CONFLICT',
  DUPLICATE_ENROLLMENT: 'CONFLICT',
  INVALID_ACADEMIC_CONTEXT: 'BUSINESS_RULE_VIOLATION',
  INVALID_TRANSFER_DATE: 'BUSINESS_RULE_VIOLATION',
  SAME_CLASS_TRANSFER: 'BUSINESS_RULE_VIOLATION',
  STUDENT_NOT_ENROLLABLE: 'BUSINESS_RULE_VIOLATION',
  ENROLLMENT_CONFLICT: 'CONFLICT',
  INVALID_STUDENT_STATUS_TRANSITION: 'BUSINESS_RULE_VIOLATION',
};

export class StudentDomainError extends AppError {
  readonly featureCode: StudentFeatureCode;

  constructor(featureCode: StudentFeatureCode, message: string) {
    super(genericCode[featureCode], message);
    this.name = 'StudentDomainError';
    this.featureCode = featureCode;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  return value?.code === '23505' || value?.cause?.code === '23505';
}
