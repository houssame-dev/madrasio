import { z } from 'zod';

const name = z.string().trim().min(1).max(200);
const uuid = z.string().uuid();
const date = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO calendar date (YYYY-MM-DD).')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Expected a valid calendar date.');
const sequence = z.number().int().nonnegative();
const optionalCode = z.string().trim().min(1).max(50).nullable().optional();

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
}).strict();

export const academicYearCreateSchema = z.object({
  name, startDate: date, endDate: date,
  status: z.enum(['PLANNED', 'ACTIVE', 'CLOSED', 'ARCHIVED']).optional(),
}).strict();
export const academicYearPatchSchema = academicYearCreateSchema.partial().strict();

export const academicPeriodCreateSchema = z.object({
  name, sequence, startDate: date, endDate: date,
  status: z.enum(['PLANNED', 'ACTIVE', 'CLOSED']).optional(),
}).strict();
export const academicPeriodPatchSchema = academicPeriodCreateSchema.partial().strict();

export const orderedStructureCreateSchema = z.object({
  name, sequence,
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).strict();
export const orderedStructurePatchSchema = orderedStructureCreateSchema.partial().strict();
export const levelCreateSchema = orderedStructureCreateSchema.extend({ stageId: uuid }).strict();
export const levelPatchSchema = levelCreateSchema.partial().strict();

export const subjectCreateSchema = z.object({
  name, code: optionalCode,
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).strict();
export const subjectPatchSchema = subjectCreateSchema.partial().strict();

export const curriculumCreateSchema = z.object({
  name, status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
}).strict();
export const curriculumPatchSchema = curriculumCreateSchema.partial().strict();

export const curriculumVersionCreateSchema = z.object({
  name, status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
}).strict();
export const curriculumVersionPatchSchema = curriculumVersionCreateSchema.partial().strict();

const coefficient = z.union([
  z.number().positive().max(99.99),
  z.string().regex(/^\d{1,2}(?:\.\d{1,2})?$/, 'Expected a positive decimal with at most two decimal places.'),
]).transform(String).refine((value) => Number(value) > 0, 'Coefficient must be greater than zero.');

export const curriculumSubjectCreateSchema = z.object({
  subjectId: uuid,
  coefficient,
  displayOrder: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).strict();
export const curriculumSubjectPatchSchema = z.object({
  coefficient: coefficient.optional(),
  displayOrder: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).strict();

export const classCreateSchema = z.object({
  academicYearId: uuid,
  levelId: uuid,
  trackId: uuid.nullable().optional(),
  curriculumVersionId: uuid,
  name,
  status: z.enum(['ACTIVE', 'CLOSED', 'ARCHIVED']).optional(),
}).strict();
export const classPatchSchema = z.object({
  levelId: uuid.optional(),
  trackId: uuid.nullable().optional(),
  curriculumVersionId: uuid.optional(),
  name: name.optional(),
  status: z.enum(['ACTIVE', 'CLOSED', 'ARCHIVED']).optional(),
}).strict();

export type AcademicYearCreate = z.infer<typeof academicYearCreateSchema>;
export type AcademicYearPatch = z.infer<typeof academicYearPatchSchema>;
export type AcademicPeriodCreate = z.infer<typeof academicPeriodCreateSchema>;
export type AcademicPeriodPatch = z.infer<typeof academicPeriodPatchSchema>;
export type OrderedStructureCreate = z.infer<typeof orderedStructureCreateSchema>;
export type OrderedStructurePatch = z.infer<typeof orderedStructurePatchSchema>;
export type LevelCreate = z.infer<typeof levelCreateSchema>;
export type LevelPatch = z.infer<typeof levelPatchSchema>;
export type SubjectCreate = z.infer<typeof subjectCreateSchema>;
export type SubjectPatch = z.infer<typeof subjectPatchSchema>;
export type CurriculumCreate = z.infer<typeof curriculumCreateSchema>;
export type CurriculumPatch = z.infer<typeof curriculumPatchSchema>;
export type CurriculumVersionCreate = z.infer<typeof curriculumVersionCreateSchema>;
export type CurriculumVersionPatch = z.infer<typeof curriculumVersionPatchSchema>;
export type CurriculumSubjectCreate = z.infer<typeof curriculumSubjectCreateSchema>;
export type CurriculumSubjectPatch = z.infer<typeof curriculumSubjectPatchSchema>;
export type ClassCreate = z.infer<typeof classCreateSchema>;
export type ClassPatch = z.infer<typeof classPatchSchema>;

export interface PageInput { page: number; pageSize: number }
export interface PageResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
