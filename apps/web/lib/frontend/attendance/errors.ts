import { ApiClientError } from '@/lib/frontend/api-client';

const messages: Record<string, string> = {
  ATTENDANCE_NOT_FOUND: 'This Attendance context is unavailable or outside your current access.',
  INVALID_ATTENDANCE_DATE: 'The selected date is not valid for this Class and Academic Year.',
  ATTENDANCE_ENTRY_NOT_ALLOWED: 'Closed or archived Classes allow corrections to existing Attendance only.',
  STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE: 'A selected Student was not enrolled in this Class on the Attendance date.',
};

export function attendanceErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'The Attendance request could not be completed. Please try again.';
  return messages[error.featureCode ?? ''] ?? (error.status < 500 ? error.message : 'The Attendance request could not be completed. Please try again.');
}

