import { z } from 'zod';

const uuid = z.string().uuid();
const score = z.union([
  z.number().nonnegative().max(9999.99),
  z.string().regex(/^\d{1,4}(?:\.\d{1,2})?$/, 'Expected a non-negative decimal with at most two decimal places.'),
]).transform(String).refine(
  (value) => /^\d{1,4}(?:\.\d{1,2})?$/.test(value),
  'Expected a non-negative decimal compatible with numeric(6,2).',
);

const validGrade = z.object({
  studentId: uuid,
  state: z.literal('VALID'),
  score,
}).strict();
const nonScoredGrade = z.object({
  studentId: uuid,
  state: z.enum(['MISSING', 'ABSENT', 'EXCUSED']),
  score: z.null(),
}).strict();

export const gradeEntrySchema = z.discriminatedUnion('state', [validGrade, nonScoredGrade]);
export const bulkGradeEntrySchema = z.object({
  grades: z.array(gradeEntrySchema).min(1).max(100),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  value.grades.forEach((grade, index) => {
    if (seen.has(grade.studentId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grades', index, 'studentId'],
        message: 'Each Student may appear only once in a Grade batch.',
      });
    }
    seen.add(grade.studentId);
  });
});

export type GradeEntry = z.output<typeof gradeEntrySchema>;
export type BulkGradeEntry = z.output<typeof bulkGradeEntrySchema>;

