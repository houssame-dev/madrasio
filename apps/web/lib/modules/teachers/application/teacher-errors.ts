import { AppError, type AppErrorCode } from '@/lib/errors';

export type TeacherFeatureCode =
  | 'TEACHER_NOT_FOUND'
  | 'TEACHER_NOT_ACTIVE'
  | 'DUPLICATE_TEACHER_CODE'
  | 'ASSIGNMENT_NOT_FOUND'
  | 'DUPLICATE_ASSIGNMENT'
  | 'INVALID_ASSIGNMENT_STATE'
  | 'INVALID_ACADEMIC_CONTEXT'
  | 'INVALID_USER_LINK'
  | 'INVALID_TEACHER_STATUS_TRANSITION';

const genericCode: Record<TeacherFeatureCode, AppErrorCode> = {
  TEACHER_NOT_FOUND: 'NOT_FOUND',
  TEACHER_NOT_ACTIVE: 'BUSINESS_RULE_VIOLATION',
  DUPLICATE_TEACHER_CODE: 'CONFLICT',
  ASSIGNMENT_NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ASSIGNMENT: 'CONFLICT',
  INVALID_ASSIGNMENT_STATE: 'BUSINESS_RULE_VIOLATION',
  INVALID_ACADEMIC_CONTEXT: 'BUSINESS_RULE_VIOLATION',
  INVALID_USER_LINK: 'BUSINESS_RULE_VIOLATION',
  INVALID_TEACHER_STATUS_TRANSITION: 'BUSINESS_RULE_VIOLATION',
};

export class TeacherDomainError extends AppError {
  readonly featureCode: TeacherFeatureCode;

  constructor(featureCode: TeacherFeatureCode, message: string) {
    super(genericCode[featureCode], message);
    this.name = 'TeacherDomainError';
    this.featureCode = featureCode;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  return value?.code === '23505' || value?.cause?.code === '23505';
}
