import { StudentDomainError } from '../application/student-errors';

const transitions: Readonly<Record<string, readonly string[]>> = {
  ACTIVE: ['INACTIVE', 'WITHDRAWN'],
  INACTIVE: ['ACTIVE', 'WITHDRAWN', 'ARCHIVED'],
  WITHDRAWN: ['ARCHIVED'],
  ARCHIVED: [],
};

export function assertStudentStatusTransition(current: string, next: string): void {
  if (current === next) return;
  if (!transitions[current]?.includes(next)) {
    throw new StudentDomainError(
      'INVALID_STUDENT_STATUS_TRANSITION',
      `Invalid Student status transition from ${current} to ${next}.`,
    );
  }
}

/** Returns the inclusive calendar day immediately before an ISO date. */
export function previousCalendarDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
