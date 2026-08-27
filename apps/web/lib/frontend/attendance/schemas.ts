import { z } from 'zod';

export const attendanceStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;

export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, 'Choose a valid calendar date.');

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

export function localCalendarToday(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

