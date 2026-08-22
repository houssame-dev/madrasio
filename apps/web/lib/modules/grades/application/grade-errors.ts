import { AppError, type AppErrorCode } from '@/lib/errors';

export type GradeFeatureCode =
  | 'INVALID_GRADE_SCORE'
  | 'GRADE_ENTRY_NOT_ALLOWED'
  | 'STUDENT_NOT_ELIGIBLE_FOR_ASSESSMENT';

const genericCode: Record<GradeFeatureCode, AppErrorCode> = {
  INVALID_GRADE_SCORE: 'BUSINESS_RULE_VIOLATION',
  GRADE_ENTRY_NOT_ALLOWED: 'BUSINESS_RULE_VIOLATION',
  STUDENT_NOT_ELIGIBLE_FOR_ASSESSMENT: 'BUSINESS_RULE_VIOLATION',
};

export class GradeDomainError extends AppError {
  readonly featureCode: GradeFeatureCode;

  constructor(featureCode: GradeFeatureCode, message: string) {
    super(genericCode[featureCode], message);
    this.name = 'GradeDomainError';
    this.featureCode = featureCode;
  }
}
