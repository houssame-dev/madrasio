import { AppError, type AppErrorCode } from '@/lib/errors';

export type AcademicStructureErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_STATUS_TRANSITION'
  | 'DUPLICATE_RESOURCE'
  | 'INVALID_ACADEMIC_CONTEXT'
  | 'CURRICULUM_VERSION_IMMUTABLE';

const genericCode: Record<AcademicStructureErrorCode, AppErrorCode> = {
  NOT_FOUND: 'NOT_FOUND',
  INVALID_STATUS_TRANSITION: 'BUSINESS_RULE_VIOLATION',
  DUPLICATE_RESOURCE: 'CONFLICT',
  INVALID_ACADEMIC_CONTEXT: 'BUSINESS_RULE_VIOLATION',
  CURRICULUM_VERSION_IMMUTABLE: 'BUSINESS_RULE_VIOLATION',
};

export class AcademicStructureError extends AppError {
  readonly featureCode: AcademicStructureErrorCode;

  constructor(featureCode: AcademicStructureErrorCode, message: string) {
    super(genericCode[featureCode], message);
    this.name = 'AcademicStructureError';
    this.featureCode = featureCode;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  return value?.code === '23505' || value?.cause?.code === '23505';
}
