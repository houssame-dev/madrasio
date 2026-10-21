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

export const sessionQuerySchema = z.object({ date: calendarDateSchema }).strict();
export const sessionIdentitySchema = sessionQuerySchema.extend({ publicationId: uuid, lessonKey: uuid }).strict();
export const sessionAttendanceSchema = z.object({
  records: z.array(attendanceEntrySchema.extend({ expectedVersion: z.number().int().positive().nullable() }).strict()).min(1).max(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.records.map(r => r.studentId)).size !== value.records.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['records'], message: 'Duplicate Students.' });
});
export type SessionIdentity = z.output<typeof sessionIdentitySchema>;

export interface PageInput { page: number; pageSize: number }
export interface AttendanceHistoryInput extends PageInput {
  academicYearId?: string;
  classId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
}
