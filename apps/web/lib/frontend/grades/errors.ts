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
  INVALID_GRADE_SCORE: 'Each valid score must be between zero and the Assessment maximum.',
  GRADE_ENTRY_NOT_ALLOWED: 'Grade entry requires an OPEN Gradebook and a PUBLISHED Assessment.',
  STUDENT_NOT_ELIGIBLE_FOR_ASSESSMENT: 'A selected Student was not enrolled in this Class for the Assessment date.',
  CALCULATION_INCOMPLETE: 'The server could not calculate this Result because required academic inputs are incomplete.',
  CONFIGURATION_INVALID: 'The bound grading configuration cannot be used for this calculation.',
  GRADEBOOK_NOT_AVAILABLE: 'The Gradebook is not available for this Result calculation.',
  STUDENT_NOT_ENROLLED: 'The Student is not enrolled in the selected academic context.',
  RESULT_NOT_FOUND: 'This Result is unavailable or outside your current access.',
  RESULT_ALREADY_FINALIZED: 'This Result is already finalized and cannot be recalculated normally.',
  RESULT_NOT_FINALIZED: 'Only a finalized Result can be published or revised.',
  RESULT_ALREADY_PUBLISHED: 'This Result already has an initial publication. Use the explicit revision action.',
  RESULT_NOT_PUBLISHED: 'A revision requires an existing published Result.',
  INVALID_RESULT_STATE: 'The Result inputs do not form a valid calculation context.',
  PUBLICATION_CONFLICT: 'This publication attempt conflicts with an existing operation. Start a new intentional attempt.',
};

export function gradeErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'The request could not be completed. Please try again.';
  return messages[error.featureCode ?? ''] ?? (error.status < 500 ? error.message : 'The request could not be completed. Please try again.');
}

export function gradeErrorDetail(error: unknown): { reason?: string; details: string[] } | null {
  if (!(error instanceof ApiClientError)) return null;
  const payload = error.details as { incomplete?: { reason?: unknown; details?: unknown } } | undefined;
  const incomplete = payload?.incomplete;
  if (!incomplete) return null;
  return {
    reason: typeof incomplete.reason === 'string' ? incomplete.reason : undefined,
    details: Array.isArray(incomplete.details) ? incomplete.details.filter((value): value is string => typeof value === 'string') : [],
  };
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
