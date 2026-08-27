import { describe, expect, it } from 'vitest';
import { calendarDateSchema, homeworkFormSchema, submissionStatuses, targetFormSchema } from '@/lib/frontend/homework/schemas';
import { classAId, periodId, subjectId, yearId } from './test-helpers';

describe('Homework client contracts', () => {
  it('preserves exact DATE strings and rejects malformed or impossible dates', () => {
    expect(calendarDateSchema.safeParse('2026-02-28').success).toBe(true);
    expect(calendarDateSchema.safeParse('2026-02-29').success).toBe(false);
    expect(calendarDateSchema.safeParse('2026-02-28T00:00:00.000Z').success).toBe(false);
  });

  it('requires the exact create fields and does not treat server identity as input', () => {
    const input = { academicYearId: yearId, academicPeriodId: periodId, subjectId, title: '  Practice  ', description: '', dueDate: '2025-10-10' };
    expect(homeworkFormSchema.parse(input).title).toBe('Practice');
    expect(homeworkFormSchema.safeParse({ ...input, title: '' }).success).toBe(false);
    expect(homeworkFormSchema.safeParse({ ...input, academicYearId: 'foreign' }).success).toBe(false);
  });

  it('rejects empty, duplicate, and over-limit CLASS target batches', () => {
    expect(targetFormSchema.safeParse({ classIds: [] }).success).toBe(false);
    expect(targetFormSchema.safeParse({ classIds: [classAId, classAId] }).success).toBe(false);
    expect(targetFormSchema.safeParse({ classIds: Array.from({ length: 101 }, () => classAId) }).success).toBe(false);
  });

  it('keeps NOT_SUBMITTED outside the persisted Submission status vocabulary', () => {
    expect(submissionStatuses).toEqual(['SUBMITTED', 'LATE', 'REVIEWED', 'RETURNED']);
    expect(submissionStatuses).not.toContain('NOT_SUBMITTED');
  });
});
