import { z } from 'zod';

export const assessmentTypes = ['QUIZ', 'TEST', 'EXAM', 'ORAL', 'PROJECT', 'HOMEWORK'] as const;
const decimal = z.string().trim()
  .regex(/^\d{1,4}(?:\.\d{1,2})?$/, 'Use a positive decimal with at most two decimal places.')
  .refine((value) => Number(value) > 0, 'Value must be greater than zero.');
const optionalDate = z.string().refine((value) => {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date.');

export const assessmentFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(200, 'Title must be 200 characters or fewer.'),
  assessmentType: z.enum(assessmentTypes),
  maximumScore: decimal,
  weight: decimal,
  assessmentDate: optionalDate,
});

export type AssessmentFormValues = z.input<typeof assessmentFormSchema>;

export const gradebookFormSchema = z.object({
  name: z.string().trim().max(200, 'Name must be 200 characters or fewer.'),
  academicYearId: z.string().uuid('Select an Academic Year.'),
  academicPeriodId: z.string().uuid('Select an Academic Period.'),
  classId: z.string().uuid('Select a Class.'),
  subjectId: z.string().uuid('Select a Subject.'),
  gradingConfigurationVersionId: z.string().uuid('Select an exact Grading Configuration Version.'),
});

export type GradebookFormValues = z.input<typeof gradebookFormSchema>;
