import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '@/lib/frontend/api-client';

const messages: Record<string, string> = {
  GRADEBOOK_NOT_FOUND: 'This Gradebook is unavailable or outside your current access.',
  ASSESSMENT_NOT_FOUND: 'This Assessment is no longer available.',
  DUPLICATE_GRADEBOOK: 'A Gradebook already exists for this exact Year, Period, Class, and Subject.',
  INVALID_GRADEBOOK_CONTEXT: 'The selected Gradebook academic context is no longer eligible.',
  INVALID_GRADEBOOK_STATUS_TRANSITION: 'That Gradebook lifecycle change is not available from the current status.',
  GRADEBOOK_NOT_EDITABLE: 'This Gradebook or its Academic Period no longer permits Assessment changes.',
  ASSESSMENT_NOT_EDITABLE: 'This Assessment can no longer be changed because it is published, archived, or grades already depend on it.',
  INVALID_ASSESSMENT_STATUS_TRANSITION: 'That Assessment lifecycle change is not available from the current status.',
  INVALID_ASSESSMENT_DATE: 'Assessment date must fall inside the Gradebook Academic Period.',
};

export function gradeErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'The request could not be completed. Please try again.';
  return messages[error.featureCode ?? ''] ?? (error.status < 500 ? error.message : 'The request could not be completed. Please try again.');
}

interface ValidationIssue { path?: string; message?: string }
export function mapGradeValidation<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
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
