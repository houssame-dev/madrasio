import { describe, expect, it } from 'vitest';
import { attendanceBatchSchema, calendarDateSchema } from '@/lib/frontend/attendance/schemas';
import { studentId } from './test-helpers';

describe('Attendance client contracts', () => {
  it('accepts exact calendar DATE values and rejects malformed or impossible dates', () => {
    expect(calendarDateSchema.safeParse('2026-02-28').success).toBe(true);
    expect(calendarDateSchema.safeParse('2026-02-29').success).toBe(false);
    expect(calendarDateSchema.safeParse('2026-02-28T00:00:00.000Z').success).toBe(false);
  });

  it('rejects duplicate Students, batches over 100, and statuses outside the committed enum', () => {
    const entry = { studentId, status: 'PRESENT', note: null } as const;
    expect(attendanceBatchSchema.safeParse({ records: [entry, entry] }).success).toBe(false);
    expect(attendanceBatchSchema.safeParse({ records: Array.from({ length: 101 }, (_, index) => ({ ...entry, studentId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` })) }).success).toBe(false);
    expect(attendanceBatchSchema.safeParse({ records: [{ ...entry, status: 'NOT_MARKED' }] }).success).toBe(false);
  });
});
