import { GradebookDomainError } from '../application/gradebook-errors';

const gradebookTransitions: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ['OPEN'],
  OPEN: ['CLOSED'],
  CLOSED: ['ARCHIVED'],
  ARCHIVED: [],
};
const assessmentTransitions: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function assertGradebookStatusTransition(current: string, next: string): void {
  if (current === next) return;
  if (!gradebookTransitions[current]?.includes(next)) {
    throw new GradebookDomainError(
      'INVALID_GRADEBOOK_STATUS_TRANSITION',
      `Invalid Gradebook status transition from ${current} to ${next}.`,
    );
  }
}

export function assertAssessmentStatusTransition(current: string, next: string): void {
  if (current === next) return;
  if (!assessmentTransitions[current]?.includes(next)) {
    throw new GradebookDomainError(
      'INVALID_ASSESSMENT_STATUS_TRANSITION',
      `Invalid Assessment status transition from ${current} to ${next}.`,
    );
  }
}

