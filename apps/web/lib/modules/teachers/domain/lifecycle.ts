import { TeacherDomainError } from '../application/teacher-errors';

const transitions: Readonly<Record<string, readonly string[]>> = {
  ACTIVE: ['INACTIVE'],
  INACTIVE: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

export function assertTeacherStatusTransition(current: string, next: string): void {
  if (current === next) return;
  if (!transitions[current]?.includes(next)) {
    throw new TeacherDomainError(
      'INVALID_TEACHER_STATUS_TRANSITION',
      `Invalid Teacher status transition from ${current} to ${next}.`,
    );
  }
}
