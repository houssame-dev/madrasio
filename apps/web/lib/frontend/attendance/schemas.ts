import { z } from 'zod';
import { isCalendarDate, schoolDateFromInstant } from '@school/shared';

export const attendanceStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;

export const calendarDateSchema = z.string().refine(isCalendarDate, 'Choose a valid calendar date.');

export const attendanceEntrySchema = z.object({
  studentId: z.string().uuid(),
  status: z.enum(attendanceStatuses),
  note: z.string().trim().max(1000, 'Note must contain at most 1,000 characters.').nullable(),
}).strict();

export const attendanceBatchSchema = z.object({
  records: z.array(attendanceEntrySchema).min(1).max(100),
}).strict().superRefine(({ records }, context) => {
  const seen = new Set<string>();
  records.forEach((record, index) => {
    if (seen.has(record.studentId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['records', index, 'studentId'], message: 'Each Student may appear only once.' });
    seen.add(record.studentId);
  });
});

export function schoolCalendarToday(timezone: string, now = new Date()): string {
  return schoolDateFromInstant(now, timezone);
}
