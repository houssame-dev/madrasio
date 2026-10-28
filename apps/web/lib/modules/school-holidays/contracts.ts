import { z } from 'zod';
import { calendarDateSchema } from '@/lib/modules/attendance/domain/contracts';

export const holidayFields = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.enum(['PUBLIC_HOLIDAY', 'SCHOOL_HOLIDAY']),
  startDate: calendarDateSchema, endDate: calendarDateSchema,
  description: z.string().trim().max(2000).nullable().optional(),
});
const ordered = (v: { startDate: string; endDate: string }) => v.startDate <= v.endDate;
export const createHolidaySchema = holidayFields.strict().refine(ordered, { path: ['endDate'], message: 'End date must follow start date.' });
export const updateHolidaySchema = holidayFields.extend({ expectedRevision: z.number().int().positive() }).strict().refine(ordered, { path: ['endDate'], message: 'End date must follow start date.' });
export const removeHolidaySchema = z.object({ expectedRevision: z.number().int().positive(), confirmed: z.literal(true) }).strict();
export const holidayQuerySchema = z.object({
  search: z.string().trim().max(160).default(''), type: z.enum(['PUBLIC_HOLIDAY', 'SCHOOL_HOLIDAY']).optional(),
  academicYearId: z.string().uuid().optional(),
  dateFrom: calendarDateSchema.optional(), dateTo: calendarDateSchema.optional(),
  page: z.coerce.number().int().positive().max(100000).default(1),
}).strict().refine(v => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo);
export type HolidayView = { id: string; name: string; type: 'PUBLIC_HOLIDAY' | 'SCHOOL_HOLIDAY'; startDate: string; endDate: string; description: string | null; revision: number };
