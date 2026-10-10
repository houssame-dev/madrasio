import { z } from 'zod';
import { calendarDateSchema } from '@/lib/modules/attendance/domain/contracts';

export const childHomeworkQuery = z.object({
  academicYearId: z.string().uuid(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
export const childAttendanceQuery = childHomeworkQuery.extend({
  dateFrom: calendarDateSchema.optional(),
  dateTo: calendarDateSchema.optional(),
}).strict().refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, {
  message: 'Start date must not follow end date.', path: ['dateTo'],
});
