import { z } from 'zod';

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(200);
const calendarDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO calendar date (YYYY-MM-DD).')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Expected a valid calendar date.');
const decimal = z.union([
  z.number().positive().max(9999.99),
  z.string().regex(/^\d{1,4}(?:\.\d{1,2})?$/, 'Expected a positive decimal with at most two decimal places.'),
]).transform(String)
  .refine(
    (value) => /^\d{1,4}(?:\.\d{1,2})?$/.test(value),
    'Expected a positive decimal compatible with numeric(6,2).',
  )
  .refine((value) => Number(value) > 0, 'Value must be greater than zero.');

export const gradebookCreateSchema = z.object({
  academicYearId: uuid,
  academicPeriodId: uuid,
  classId: uuid,
  subjectId: uuid,
  gradingConfigurationVersionId: uuid,
  name: name.nullable().optional(),
}).strict();

export const gradebookPatchSchema = z.object({
  name: name.nullable().optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const assessmentCreateSchema = z.object({
  title: name,
  assessmentType: z.enum(['QUIZ', 'TEST', 'EXAM', 'ORAL', 'PROJECT', 'HOMEWORK']),
  maximumScore: decimal,
  weight: decimal,
  assessmentDate: calendarDate.nullable().optional(),
}).strict();

export const assessmentPatchSchema = z.object({
  title: name.optional(),
  assessmentType: z.enum(['QUIZ', 'TEST', 'EXAM', 'ORAL', 'PROJECT', 'HOMEWORK']).optional(),
  maximumScore: decimal.optional(),
  weight: decimal.optional(),
  assessmentDate: calendarDate.nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export type GradebookCreate = z.output<typeof gradebookCreateSchema>;
export type GradebookPatch = z.output<typeof gradebookPatchSchema>;
export type AssessmentCreate = z.output<typeof assessmentCreateSchema>;
export type AssessmentPatch = z.output<typeof assessmentPatchSchema>;
export interface PageInput { page: number; pageSize: number }
export interface PageResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
