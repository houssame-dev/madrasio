import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '@/lib/frontend/api-client';
const messages: Record<string, string> = {
  PARENT_NOT_FOUND: 'This Parent is unavailable or outside your current access.', PARENT_NOT_ACTIVE: 'Only an ACTIVE Parent can receive a new Student relationship.',
  DUPLICATE_PARENT_CODE: 'That Parent code is already used in this School.', PARENT_RELATIONSHIP_NOT_FOUND: 'This relationship is no longer available.',
  DUPLICATE_PARENT_STUDENT_RELATIONSHIP: 'This Parent and Student already have an ACTIVE relationship.', INVALID_RELATIONSHIP_CONTEXT: 'The selected Student is not eligible for a current relationship.',
  INVALID_USER_LINK: 'The linked account must be an ACTIVE User with an ACTIVE membership in this School.', INVALID_PARENT_STATUS_TRANSITION: 'That Parent lifecycle change is not available from the current status.',
};
export function parentErrorMessage(error: unknown): string { if (!(error instanceof ApiClientError)) return 'The request could not be completed. Please try again.'; return messages[error.featureCode ?? ''] ?? (error.status < 500 ? error.message : 'The request could not be completed. Please try again.'); }
interface ValidationIssue { path?: string; message?: string }
export function mapParentValidation<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean { if (!(error instanceof ApiClientError) || error.code !== 'VALIDATION_ERROR') return false; const details = error.details as { issues?: ValidationIssue[] } | undefined; let mapped = false; for (const issue of details?.issues ?? []) if (issue.path && issue.message) { setError(issue.path as Path<T>, { type: 'server', message: issue.message }); mapped = true; } return mapped; }
