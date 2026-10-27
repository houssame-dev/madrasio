import { z } from 'zod';
export const RESULT_BATCH_LIMIT = 20;
const uuid = z.string().uuid();
export const resultBatchScope = z
  .object({
    resultType: z.enum(['SUBJECT', 'PERIOD', 'ANNUAL']),
    academicYearId: uuid,
    classId: uuid,
    academicPeriodId: uuid.optional(),
    gradebookId: uuid.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.resultType !== 'ANNUAL' && !v.academicPeriodId)
      ctx.addIssue({
        code: 'custom',
        message: 'An exact Period is required.',
        path: ['academicPeriodId'],
      });
    if (v.resultType === 'ANNUAL' && (v.academicPeriodId || v.gradebookId))
      ctx.addIssue({ code: 'custom', message: 'Annual scope has no Period or Gradebook.' });
    if (v.resultType === 'SUBJECT' && !v.gradebookId)
      ctx.addIssue({
        code: 'custom',
        message: 'An exact Gradebook is required.',
        path: ['gradebookId'],
      });
    if (v.resultType === 'PERIOD' && v.gradebookId)
      ctx.addIssue({ code: 'custom', message: 'Period scope has no Gradebook.' });
  });
export const resultBatchQuery = z
  .object({
    scope: resultBatchScope,
    operation: z.enum(['CALCULATE', 'FINALIZE', 'PUBLISH']),
    page: z.number().int().positive().max(100000).default(1),
  })
  .strict();
export const resultBatchEntry = z
  .object({
    studentId: uuid,
    resultId: uuid.nullable(),
    expectedToken: z.string().regex(/^[a-f0-9]{64}$/),
    idempotencyKey: uuid.optional(),
  })
  .strict();
export const resultBatchCommand = resultBatchQuery
  .omit({ page: true })
  .extend({
    confirm: z.literal(true),
    entries: z.array(resultBatchEntry).min(1).max(RESULT_BATCH_LIMIT),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      new Set(v.entries.map((e) => e.studentId)).size !== v.entries.length ||
      new Set(v.entries.filter((e) => e.resultId).map((e) => e.resultId)).size !==
        v.entries.filter((e) => e.resultId).length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate batch entries.' });
    if (v.operation !== 'CALCULATE' && v.entries.some((e) => !e.resultId))
      ctx.addIssue({ code: 'custom', message: 'Select existing Results.' });
    if (
      v.operation === 'PUBLISH' &&
      (v.entries.some((e) => !e.idempotencyKey) ||
        new Set(v.entries.map((e) => e.idempotencyKey)).size !== v.entries.length)
    )
      ctx.addIssue({ code: 'custom', message: 'Distinct stable publication keys are required.' });
  });
export type ResultBatchScope = z.infer<typeof resultBatchScope>;
export type ResultBatchCommand = z.infer<typeof resultBatchCommand>;
