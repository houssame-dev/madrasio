import { describe, expect, it } from 'vitest';

import {
  HOMEWORK_STATUSES,
  HOMEWORK_SUBMISSION_STATUSES,
  HOMEWORK_TARGET_TYPES,
} from '@/lib/modules/homework';

describe('homework domain vocabulary (Task 008 §31)', () => {
  it('declares the four Homework lifecycle statuses', () => {
    expect(HOMEWORK_STATUSES).toEqual(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']);
  });

  it('declares the four submission statuses (NOT_SUBMITTED = absence of a row)', () => {
    expect(HOMEWORK_SUBMISSION_STATUSES).toEqual(['SUBMITTED', 'LATE', 'REVIEWED', 'RETURNED']);
    expect(HOMEWORK_SUBMISSION_STATUSES).not.toContain('NOT_SUBMITTED');
  });

  it('declares only the CLASS target type in V1', () => {
    expect(HOMEWORK_TARGET_TYPES).toEqual(['CLASS']);
  });
});