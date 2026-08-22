import { z } from 'zod';

const name = z.string().trim().min(1).max(200);
const optionalCode = z.string().trim().min(1).max(100).nullable().optional();
const uuid = z.string().uuid();

export const calendarDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO calendar date (YYYY-MM-DD).')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Expected a valid calendar date.');

export const teacherCreateSchema = z.object({
  firstName: name,
  lastName: name,
  teacherCode: optionalCode,
  userId: uuid.nullable().optional(),
}).strict();

export const teacherPatchSchema = z.object({
  firstName: name.optional(),
  lastName: name.optional(),
  teacherCode: optionalCode,
  userId: uuid.nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
}).strict();

export const assignmentCreateSchema = z.object({
  academicYearId: uuid,
  classId: uuid,
  subjectId: uuid,
  effectiveFrom: calendarDateSchema,
}).strict();

export const endAssignmentSchema = z.object({
  effectiveUntil: calendarDateSchema,
}).strict();

export type TeacherCreate = z.output<typeof teacherCreateSchema>;
export type TeacherPatch = z.output<typeof teacherPatchSchema>;
export type AssignmentCreate = z.output<typeof assignmentCreateSchema>;
export type EndAssignment = z.output<typeof endAssignmentSchema>;

export interface PageInput { page: number; pageSize: number }
export interface PageResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
