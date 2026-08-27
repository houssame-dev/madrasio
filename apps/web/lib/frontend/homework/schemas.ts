import { z } from 'zod';

const uuid = z.string().uuid('Choose a valid option.');
export const homeworkStatuses = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'] as const;
export const submissionStatuses = ['SUBMITTED', 'LATE', 'REVIEWED', 'RETURNED'] as const;
export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid calendar date.').refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Choose a valid calendar date.');

export const homeworkFormSchema = z.object({
  academicYearId: uuid,
  academicPeriodId: uuid,
  subjectId: uuid,
  title: z.string().trim().min(1, 'Title is required.').max(300),
  description: z.string().max(20_000),
  dueDate: calendarDateSchema,
});
export type HomeworkFormValues = z.infer<typeof homeworkFormSchema>;

export const homeworkEditSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(300),
  description: z.string().max(20_000),
  dueDate: calendarDateSchema,
});
export type HomeworkEditValues = z.infer<typeof homeworkEditSchema>;

export const targetFormSchema = z.object({ classIds: z.array(uuid).min(1, 'Choose at least one Class.').max(100) }).superRefine(({ classIds }, context) => {
  if (new Set(classIds).size !== classIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['classIds'], message: 'Each Class may be selected only once.' });
});

export const submissionFormSchema = z.object({ content: z.string().max(50_000, 'Content must contain at most 50,000 characters.') });
export type SubmissionFormValues = z.infer<typeof submissionFormSchema>;

