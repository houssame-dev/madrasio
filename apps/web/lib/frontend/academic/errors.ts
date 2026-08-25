import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '@/lib/frontend/api-client';

const messages: Record<string, string> = {
  NOT_FOUND: 'This resource is no longer available.',
  INVALID_STATUS_TRANSITION: 'That lifecycle change is not available from the current status.',
  DUPLICATE_RESOURCE: 'A resource with the same identity already exists.',
  INVALID_ACADEMIC_CONTEXT: 'The selected academic context or dates are not valid.',
  ACADEMIC_YEAR_DATES_IMMUTABLE: 'These academic year dates can no longer be changed because the year is operational or has dependent academic records.',
  ACADEMIC_PERIOD_DATES_IMMUTABLE: 'These period dates can no longer be changed because the period is operational or has dependent academic records.',
  CURRICULUM_VERSION_IMMUTABLE: 'Only a draft curriculum version can be structurally changed.',
};

export function academicErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'The request could not be completed. Please try again.';
  return messages[error.featureCode ?? ''] ?? (error.status < 500 ? error.message : 'The request could not be completed. Please try again.');
}

interface ValidationIssue { path?: string; message?: string }

export function mapValidationErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
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
