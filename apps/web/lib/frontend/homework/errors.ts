import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '@/lib/frontend/api-client';

const messages: Record<string, string> = {
  HOMEWORK_NOT_FOUND: 'This Homework is unavailable or outside your current access.',
  HOMEWORK_NOT_EDITABLE: 'Published Homework content and Class targets are frozen.',
  INVALID_HOMEWORK_STATUS_TRANSITION: 'That Homework lifecycle change is not available from the current status.',
  DUPLICATE_HOMEWORK_TARGET: 'One of the selected Classes is already targeted.',
  INVALID_HOMEWORK_CONTEXT: 'The selected academic context is no longer valid for this Homework.',
  HOMEWORK_NOT_PUBLISHABLE: 'Homework needs at least one currently ACTIVE Class target before publication.',
  HOMEWORK_SUBMISSION_NOT_FOUND: 'This Submission is unavailable or outside your current access.',
  DUPLICATE_HOMEWORK_SUBMISSION: 'This Student already has a Submission for the Homework.',
  STUDENT_NOT_ELIGIBLE_FOR_HOMEWORK: 'The Student was not enrolled in a targeted Class on the Homework due date.',
  HOMEWORK_SUBMISSION_NOT_ALLOWED: 'The current Homework lifecycle does not allow that Submission operation.',
  INVALID_HOMEWORK_SUBMISSION_STATE: 'That Submission lifecycle action is not available from its current status.',
};

export function homeworkErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'The Homework request could not be completed. Please try again.';
  if (error.code === 'FORBIDDEN' && error.message.includes('active Teacher profile')) return 'Homework creation requires your current User to have an ACTIVE linked Teacher profile and matching ACTIVE assignment.';
  return messages[error.featureCode ?? ''] ?? (error.status < 500 ? error.message : 'The Homework request could not be completed. Please try again.');
}

interface ValidationIssue { path?: string; message?: string }
export function mapHomeworkValidation<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
  if (!(error instanceof ApiClientError) || error.code !== 'VALIDATION_ERROR') return false;
  const details = error.details as { issues?: ValidationIssue[] } | undefined;
  let mapped = false;
  for (const issue of details?.issues ?? []) if (issue.path && issue.message) { setError(issue.path as Path<T>, { type: 'server', message: issue.message }); mapped = true; }
  return mapped;
}

