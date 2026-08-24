import { z } from 'zod';

import { HOMEWORK_STATUSES } from './homework-vocabulary';

const uuid = z.string().uuid();
export const homeworkCalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO calendar date (YYYY-MM-DD).')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Expected a valid calendar date.');
const title = z.string().trim().min(1).max(300);
const description = z.string().trim().max(20_000).nullable().optional();

export const homeworkCreateSchema = z.object({
  subjectId: uuid,
  academicYearId: uuid,
  academicPeriodId: uuid,
  title,
  description,
  dueDate: homeworkCalendarDateSchema,
}).strict();

export const homeworkPatchSchema = z.object({
  title: title.optional(),
  description,
  dueDate: homeworkCalendarDateSchema.optional(),
  status: z.enum(HOMEWORK_STATUSES).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const homeworkTargetsCreateSchema = z.object({
  classIds: z.array(uuid).min(1).max(100),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  value.classIds.forEach((classId, index) => {
    if (seen.has(classId)) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['classIds', index],
      message: 'Each Class may appear only once.',
    });
    seen.add(classId);
  });
});

export const homeworkSubmissionCreateSchema = z.object({
  studentId: uuid,
  content: z.string().trim().max(50_000).nullable().optional(),
}).strict();

export const homeworkSubmissionPatchSchema = z.object({
  content: z.string().trim().max(50_000).nullable(),
}).strict();

export const homeworkSubmissionReviewSchema = z.object({
  status: z.enum(['REVIEWED', 'RETURNED']),
}).strict();

export type HomeworkCreateInput = z.output<typeof homeworkCreateSchema>;
export type HomeworkPatchInput = z.output<typeof homeworkPatchSchema>;
export type HomeworkTargetsCreateInput = z.output<typeof homeworkTargetsCreateSchema>;
export type HomeworkSubmissionCreateInput = z.output<typeof homeworkSubmissionCreateSchema>;
export type HomeworkSubmissionPatchInput = z.output<typeof homeworkSubmissionPatchSchema>;
export type HomeworkSubmissionReviewInput = z.output<typeof homeworkSubmissionReviewSchema>;

export interface PageInput { page: number; pageSize: number }
export interface HomeworkListInput extends PageInput {
  status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';
  classId?: string;
  academicYearId?: string;
  dueFrom?: string;
  dueTo?: string;
  search?: string;
}
export interface SubmissionListInput extends PageInput {
  status?: 'SUBMITTED' | 'LATE' | 'REVIEWED' | 'RETURNED';
  studentId?: string;
}
