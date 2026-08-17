/**
 * Grading Rules payload — the explicit, versioned ruleset snapshot stored in
 * `grading_configuration_versions.rules` (JSONB) (Task 006A, ADR-011).
 *
 * This is configuration metadata/rules ONLY. It must never contain Grade /
 * Assessment / Student / Result rows — those remain proper relational entities
 * owned by the Grades domain. The full school-specific calculation engine is
 * intentionally NOT hard-coded yet (it arrives with the Grades domain tasks);
 * this file defines the minimal explicit structure that can later support:
 *
 * - Assessment weighting
 * - Subject weighting / coefficient usage (CurriculumSubject, BR-SUBJECT-002)
 * - Period calculation strategy
 * - Annual calculation strategy
 * - Rounding rules
 * - Passing thresholds
 * - Required / optional assessment semantics
 *
 * SUBJECT COEFFICIENT SOURCE OF TRUTH (BR-SUBJECT-002/004, BR-GRADE-012):
 *
 * `CurriculumSubject.coefficient` is the AUTHORITATIVE source for a Subject's
 * coefficient VALUE. A GradingConfiguration must NEVER become a second source
 * of truth for actual coefficient values. The `coefficientUsage` category
 * therefore only describes HOW coefficients are used (a strategy/usage mode) —
 * it never carries subject → number mappings. Any payload attempting to carry
 * coefficient values (e.g. a legacy `subjectCoefficients` category or a
 * subject → number map) is rejected as an unknown category below.
 *
 * The exact shape is documented here and validated by `validateGradingRules`.
 * The database enforces structural JSONB integrity (the column must be a JSON
 * object); this helper enforces the controlled vocabulary and numeric ranges.
 */

export const GRADING_RULES_SCHEMA_VERSION = 1;

/**
 * Controlled calculation-mode enum. Deliberately minimal for the foundation;
 * the calculation engine task extends the vocabulary.
 */
export const CALCULATION_MODES = ['WEIGHTED_AVERAGE', 'SIMPLE_AVERAGE'] as const;
export type CalculationMode = (typeof CALCULATION_MODES)[number];

/** Standard rounding modes. */
export const ROUNDING_MODES = ['HALF_UP', 'HALF_DOWN', 'HALF_EVEN', 'TRUNCATE', 'NONE'] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

/** How assessment weights are combined. */
export const WEIGHTING_MODES = ['WEIGHTED', 'EQUAL'] as const;
export type WeightingMode = (typeof WEIGHTING_MODES)[number];

/**
 * How subject coefficients are used in calculations.
 *
 * ONLY a usage/strategy concept. Coefficient VALUES live exclusively on
 * CurriculumSubject (BR-SUBJECT-002/004, BR-GRADE-012). This configuration
 * must never carry subject → number mappings.
 */
export const COEFFICIENT_USAGE_MODES = ['USE_CURRICULUM_SUBJECT_COEFFICIENT', 'IGNORE'] as const;
export type CoefficientUsageMode = (typeof COEFFICIENT_USAGE_MODES)[number];

export const KNOWN_TOP_LEVEL_CATEGORIES = [
  'schemaVersion',
  'periodCalculation',
  'annualCalculation',
  'assessmentWeighting',
  'coefficientUsage',
  'rounding',
  'thresholds',
  'requiredAssessments',
] as const;

export interface GradingRules {
  /** Payload schema version. Must equal GRADING_RULES_SCHEMA_VERSION. */
  schemaVersion: 1;
  /** Period-result calculation strategy. */
  periodCalculation?: { mode: CalculationMode };
  /** Annual-result calculation strategy (PeriodResult is NOT AnnualResult). */
  annualCalculation?: { mode: CalculationMode };
  /** Assessment weighting configuration. */
  assessmentWeighting?: {
    mode: WeightingMode;
    /** Weight per assessment type (percentage, 0–100) when mode is WEIGHTED. */
    weightsByType?: Record<string, number>;
  };
  /**
   * How subject coefficients are used — NOT their values. The authoritative
   * coefficient values live on CurriculumSubject; this only selects the
   * usage strategy (e.g. apply the curriculum coefficient, or ignore
   * coefficients entirely).
   */
  coefficientUsage?: { mode: CoefficientUsageMode };
  rounding?: { mode: RoundingMode; scale: number };
  thresholds?: { maxScore: number; passingScore: number };
  requiredAssessments?: { types: string[] };
}

const KNOWN_CATEGORY_SET = new Set<string>(KNOWN_TOP_LEVEL_CATEGORIES);
const CALCULATION_MODE_SET = new Set<string>(CALCULATION_MODES);
const ROUNDING_MODE_SET = new Set<string>(ROUNDING_MODES);
const WEIGHTING_MODE_SET = new Set<string>(WEIGHTING_MODES);
const COEFFICIENT_USAGE_MODE_SET = new Set<string>(COEFFICIENT_USAGE_MODES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validates a grading rules payload. Returns an array of human-readable
 * validation errors; an empty array means the payload is valid.
 *
 * Pure and dependency-free. Server validation is mandatory before persisting;
 * this helper is the single source of truth for the payload vocabulary.
 */
export function validateGradingRules(value: unknown): string[] {
  if (!isRecord(value)) {
    return ['rules must be a JSON object'];
  }

  const errors: string[] = [];

  if (value.schemaVersion !== GRADING_RULES_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${GRADING_RULES_SCHEMA_VERSION}`);
  }

  for (const key of Object.keys(value)) {
    if (!KNOWN_CATEGORY_SET.has(key)) {
      errors.push(`unknown rule category: "${key}"`);
    }
  }

  const modeError = (category: string, mode: unknown) =>
    typeof mode !== 'string' || !CALCULATION_MODE_SET.has(mode)
      ? `${category}.mode must be one of: ${CALCULATION_MODES.join(', ')}`
      : null;

  for (const category of ['periodCalculation', 'annualCalculation']) {
    const entry = value[category];
    if (entry === undefined) continue;
    if (!isRecord(entry)) {
      errors.push(`${category} must be an object`);
      continue;
    }
    const modeErrorText = modeError(category, entry.mode);
    if (modeErrorText) errors.push(modeErrorText);
  }

  const weighting = value.assessmentWeighting;
  if (weighting !== undefined) {
    if (!isRecord(weighting)) {
      errors.push('assessmentWeighting must be an object');
    } else {
      if (typeof weighting.mode !== 'string' || !WEIGHTING_MODE_SET.has(weighting.mode)) {
        errors.push(`assessmentWeighting.mode must be one of: ${WEIGHTING_MODES.join(', ')}`);
      }
      if (weighting.weightsByType !== undefined) {
        if (!isRecord(weighting.weightsByType)) {
          errors.push('assessmentWeighting.weightsByType must be an object');
        } else {
          for (const [type, weight] of Object.entries(weighting.weightsByType)) {
            if (!isFiniteNumber(weight) || weight < 0 || weight > 100) {
              errors.push(`assessmentWeighting.weightsByType["${type}"] must be a number between 0 and 100`);
            }
          }
        }
      }
    }
  }

  const coefficientUsage = value.coefficientUsage;
  if (coefficientUsage !== undefined) {
    if (!isRecord(coefficientUsage)) {
      errors.push('coefficientUsage must be an object');
    } else if (
      typeof coefficientUsage.mode !== 'string' ||
      !COEFFICIENT_USAGE_MODE_SET.has(coefficientUsage.mode)
    ) {
      errors.push(`coefficientUsage.mode must be one of: ${COEFFICIENT_USAGE_MODES.join(', ')}`);
    }
  }

  const rounding = value.rounding;
  if (rounding !== undefined) {
    if (!isRecord(rounding)) {
      errors.push('rounding must be an object');
    } else {
      if (typeof rounding.mode !== 'string' || !ROUNDING_MODE_SET.has(rounding.mode)) {
        errors.push(`rounding.mode must be one of: ${ROUNDING_MODES.join(', ')}`);
      }
      if (!isFiniteNumber(rounding.scale) || !Number.isInteger(rounding.scale) || rounding.scale < 0 || rounding.scale > 6) {
        errors.push('rounding.scale must be an integer between 0 and 6');
      }
    }
  }

  const thresholds = value.thresholds;
  if (thresholds !== undefined) {
    if (!isRecord(thresholds)) {
      errors.push('thresholds must be an object');
    } else {
      if (!isFiniteNumber(thresholds.maxScore) || thresholds.maxScore <= 0) {
        errors.push('thresholds.maxScore must be a positive number');
      }
      if (!isFiniteNumber(thresholds.passingScore) || thresholds.passingScore <= 0) {
        errors.push('thresholds.passingScore must be a positive number');
      }
      if (
        isFiniteNumber(thresholds.maxScore) &&
        isFiniteNumber(thresholds.passingScore) &&
        thresholds.passingScore > thresholds.maxScore
      ) {
        errors.push('thresholds.passingScore must not exceed thresholds.maxScore');
      }
    }
  }

  const required = value.requiredAssessments;
  if (required !== undefined) {
    if (!isRecord(required)) {
      errors.push('requiredAssessments must be an object');
    } else if (!Array.isArray(required.types) || required.types.length === 0) {
      errors.push('requiredAssessments.types must be a non-empty array');
    } else {
      for (const type of required.types) {
        if (typeof type !== 'string' || type.trim().length === 0) {
          errors.push('requiredAssessments.types must contain non-empty strings');
        }
      }
    }
  }

  return errors;
}

/** Convenience predicate: the payload is valid when it has no validation errors. */
export function isValidGradingRules(value: unknown): boolean {
  return validateGradingRules(value).length === 0;
}