import { z } from 'zod';
import { isCalendarDate } from '@school/shared';

const name = z.string().trim().min(1).max(200);
const uuid = z.string().uuid();
export const calendarDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO calendar date (YYYY-MM-DD).')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Expected a valid calendar date.');

export const dateOfBirthSchema = z.string().refine(
  (value) => isCalendarDate(value) && !value.startsWith('0000-'),
  'Choose a valid date of birth (YYYY-MM-DD).',
);

export const studentCreateSchema = z.object({
  firstName: name,
  dateOfBirth: dateOfBirthSchema,
  lastName: name,
  studentCode: z.string().trim().min(1).max(100).nullable().optional(),
}).strict();

export const studentPatchSchema = z.object({
  firstName: name.optional(),
  // Omission preserves legacy NULL; a recorded DOB cannot be cleared to an invented unknown.
  dateOfBirth: dateOfBirthSchema.optional(),
  lastName: name.optional(),
  studentCode: z.string().trim().min(1).max(100).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'WITHDRAWN', 'ARCHIVED']).optional(),
}).strict();

export const enrollmentCreateSchema = z.object({
  academicYearId: uuid,
  classId: uuid,
  effectiveFrom: calendarDateSchema,
}).strict();

export const transferStudentSchema = z.object({
  academicYearId: uuid,
  toClassId: uuid,
  effectiveDate: calendarDateSchema,
}).strict();

export const endEnrollmentSchema = z.object({
  effectiveUntil: calendarDateSchema,
}).strict();

export type StudentCreate = z.output<typeof studentCreateSchema>;
export type StudentPatch = z.output<typeof studentPatchSchema>;
export type EnrollmentCreate = z.output<typeof enrollmentCreateSchema>;
export type TransferStudent = z.output<typeof transferStudentSchema>;
export type EndEnrollment = z.output<typeof endEnrollmentSchema>;

export interface PageInput { page: number; pageSize: number }
export interface PageResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
