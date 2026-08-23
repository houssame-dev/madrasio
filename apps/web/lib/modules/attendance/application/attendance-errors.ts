import { AppError, type AppErrorCode } from '@/lib/errors';

export type AttendanceFeatureCode =
  | 'ATTENDANCE_NOT_FOUND'
  | 'INVALID_ATTENDANCE_DATE'
  | 'ATTENDANCE_ENTRY_NOT_ALLOWED'
  | 'STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE';

const genericCode: Record<AttendanceFeatureCode, AppErrorCode> = {
  ATTENDANCE_NOT_FOUND: 'NOT_FOUND',
  INVALID_ATTENDANCE_DATE: 'BUSINESS_RULE_VIOLATION',
  ATTENDANCE_ENTRY_NOT_ALLOWED: 'BUSINESS_RULE_VIOLATION',
  STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE: 'BUSINESS_RULE_VIOLATION',
};

export class AttendanceDomainError extends AppError {
  readonly featureCode: AttendanceFeatureCode;

  constructor(featureCode: AttendanceFeatureCode, message: string) {
    super(genericCode[featureCode], message);
    this.name = 'AttendanceDomainError';
    this.featureCode = featureCode;
  }
}
