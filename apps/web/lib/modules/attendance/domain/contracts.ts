import { z } from 'zod';
import { isCalendarDate } from '@school/shared';

export const calendarDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO calendar date (YYYY-MM-DD).')
  .refine(isCalendarDate, 'Expected a valid calendar date.');

const uuid = z.string().uuid();
const note = z.string().trim().min(1).max(1000).nullable().optional();

export const attendanceEntrySchema = z.object({
  studentId: uuid,
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  note,
}).strict();

export const bulkAttendanceSchema = z.object({
  records: z.array(attendanceEntrySchema).min(1).max(100),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  value.records.forEach((record, index) => {
    if (seen.has(record.studentId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records', index, 'studentId'],
        message: 'Each Student may appear only once in an Attendance batch.',
      });
    }
    seen.add(record.studentId);
  });
});

export type AttendanceEntry = z.output<typeof attendanceEntrySchema>;
export type BulkAttendance = z.output<typeof bulkAttendanceSchema>;

export interface PageInput { page: number; pageSize: number }
export interface AttendanceHistoryInput extends PageInput {
  academicYearId?: string;
  classId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
}
