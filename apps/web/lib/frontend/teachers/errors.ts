import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '@/lib/frontend/api-client';

const messages: Record<string, string> = {
  TEACHER_NOT_FOUND: 'This Teacher is unavailable or outside your current access.',
  TEACHER_NOT_ACTIVE: 'Only an ACTIVE Teacher can receive a new Assignment.',
  DUPLICATE_TEACHER_CODE: 'That Teacher code is already used in this School.',
  ASSIGNMENT_NOT_FOUND: 'This Assignment is no longer available.',
  DUPLICATE_ASSIGNMENT: 'This exact ACTIVE Assignment already exists.',
  INVALID_ASSIGNMENT_STATE: 'The Assignment date or lifecycle state is not valid.',
  INVALID_ACADEMIC_CONTEXT: 'The selected Academic Year, Class, and Subject are not a valid Assignment context.',
  INVALID_USER_LINK: 'The linked account must be an ACTIVE User with an ACTIVE membership in this School.',
  INVALID_TEACHER_STATUS_TRANSITION: 'That Teacher lifecycle change is not available from the current status.',
};

export function teacherErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'The request could not be completed. Please try again.';
  return messages[error.featureCode ?? ''] ?? (error.status < 500 ? error.message : 'The request could not be completed. Please try again.');
}

interface ValidationIssue { path?: string; message?: string }
export function mapTeacherValidation<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
  if (!(error instanceof ApiClientError) || error.code !== 'VALIDATION_ERROR') return false;
  const details = error.details as { issues?: ValidationIssue[] } | undefined;
  let mapped = false;
  for (const issue of details?.issues ?? []) {
    if (issue.path && issue.message) {
      setError(issue.path as Path<T>, { type: 'server', message: issue.message });
      mapped = true;
    }
  }
  return mapped;
}
