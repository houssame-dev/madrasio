import { z } from 'zod';
import {
  CALCULATION_MODES,
  COEFFICIENT_USAGE_MODES,
  ROUNDING_MODES,
  WEIGHTING_MODES,
  validateGradingRules,
} from './grading-rules';

export const ASSESSMENT_TYPES = ['QUIZ', 'TEST', 'EXAM', 'ORAL', 'PROJECT', 'HOMEWORK'] as const;
const mode = z.object({ mode: z.enum(CALCULATION_MODES) }).strict();
/** Closed administration input; semantic/numeric validation remains shared with calculations. */
export const configurationRules = z
  .object({
    schemaVersion: z.literal(1),
    periodCalculation: mode.optional(),
    annualCalculation: mode.optional(),
    assessmentWeighting: z
      .object({
        mode: z.enum(WEIGHTING_MODES),
        weightsByType: z
          .record(z.enum(ASSESSMENT_TYPES), z.number().finite().min(0).max(100))
          .optional(),
      })
      .strict()
      .optional(),
    coefficientUsage: z
      .object({ mode: z.enum(COEFFICIENT_USAGE_MODES) })
      .strict()
      .optional(),
    rounding: z
      .object({ mode: z.enum(ROUNDING_MODES), scale: z.number().int().min(0).max(6) })
      .strict()
      .optional(),
    thresholds: z
      .object({
        maxScore: z.number().finite().positive(),
        passingScore: z.number().finite().positive(),
      })
      .strict()
      .optional(),
    requiredAssessments: z
      .object({ types: z.array(z.enum(ASSESSMENT_TYPES)) })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((rules, ctx) => {
    if (rules.thresholds && rules.thresholds.passingScore > rules.thresholds.maxScore)
      ctx.addIssue({
        code: 'custom',
        path: ['thresholds', 'passingScore'],
        message: 'Passing score cannot exceed the result maximum score.',
      });
    for (const message of validateGradingRules(rules)) ctx.addIssue({ code: 'custom', message });
    const types = rules.requiredAssessments?.types;
    if (types && new Set(types).size !== types.length)
      ctx.addIssue({ code: 'custom', message: 'Required assessment types must be unique.' });
  });
export type ConfigurationRules = z.infer<typeof configurationRules>;
export const configurationCreate = z
  .object({ name: z.string().trim().min(1).max(200), rules: configurationRules })
  .strict();
export const configurationStatus = z
  .object({ status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']) })
  .strict();
export const versionCreate = z.object({ rules: configurationRules }).strict();
export const versionPatch = z.union([
  versionCreate,
  z.object({ status: z.enum(['ACTIVE', 'ARCHIVED']) }).strict(),
]);
export const configurationPage = z.coerce.number().int().min(1).max(10000).default(1);

/** Activation must provide what the existing engine requires; percentages need not sum to 100. */
export function activationErrors(rules: ConfigurationRules): string[] {
  const errors: string[] = [];
  if (
    !rules.thresholds ||
    !rules.rounding ||
    !rules.assessmentWeighting ||
    !rules.periodCalculation ||
    !rules.annualCalculation
  )
    errors.push(
      'Provide score scale, rounding, assessment weighting, period and annual calculation settings.',
    );
  if (
    rules.periodCalculation?.mode === 'WEIGHTED_AVERAGE' &&
    rules.coefficientUsage?.mode !== 'USE_CURRICULUM_SUBJECT_COEFFICIENT'
  )
    errors.push('Weighted period calculation requires CurriculumSubject coefficients.');
  if (rules.annualCalculation?.mode === 'WEIGHTED_AVERAGE')
    errors.push('The V1 annual engine supports SIMPLE_AVERAGE only.');
  if (rules.assessmentWeighting?.mode === 'WEIGHTED') {
    const weights = rules.assessmentWeighting.weightsByType ?? {};
    if (!Object.values(weights).some((weight) => weight > 0))
      errors.push('Provide at least one positive assessment type weight.');
    if (rules.requiredAssessments?.types.some((type) => weights[type] === undefined))
      errors.push('Every required assessment type needs a configured weight.');
  }
  return errors;
}
