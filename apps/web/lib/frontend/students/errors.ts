import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '@/lib/frontend/api-client';

const messages: Record<string, string> = {
  STUDENT_NOT_FOUND: 'This Student is unavailable or outside your current access.',
  ENROLLMENT_NOT_FOUND: 'This enrollment is no longer available.',
  DUPLICATE_STUDENT_CODE: 'That Student code is already used in this School.',
  DUPLICATE_ENROLLMENT: 'This Student already has an active enrollment in the selected Academic Year.',
  INVALID_ACADEMIC_CONTEXT: 'The selected Academic Year and Class are not a valid placement.',
  INVALID_TRANSFER_DATE: 'The effective date is not valid for this enrollment history.',
  SAME_CLASS_TRANSFER: 'Choose a different Class for the transfer.',
  STUDENT_NOT_ENROLLABLE: 'Only an ACTIVE Student can be enrolled or transferred.',
  ENROLLMENT_CONFLICT: 'The placement changed during this operation. Refresh and try again.',
  INVALID_STUDENT_STATUS_TRANSITION: 'That Student lifecycle change is not available from the current status.',
};

export function studentErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'The request could not be completed. Please try again.';
  return messages[error.featureCode ?? ''] ?? (error.status < 500 ? error.message : 'The request could not be completed. Please try again.');
}

interface ValidationIssue { path?: string; message?: string }
export function mapStudentValidation<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
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
