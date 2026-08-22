import { ParentDomainError } from '../application/parent-errors';

const transitions: Readonly<Record<string, readonly string[]>> = {
  ACTIVE: ['INACTIVE'],
  INACTIVE: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

export function assertParentStatusTransition(current: string, next: string): void {
  if (current === next) return;
  if (!transitions[current]?.includes(next)) {
    throw new ParentDomainError(
      'INVALID_PARENT_STATUS_TRANSITION',
      `Invalid Parent status transition from ${current} to ${next}.`,
    );
  }
}
