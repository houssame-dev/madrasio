/**
 * Result calculation engine (Task 006D Part A).
 *
 * PURE and dependency-free. The engine receives already-resolved, validated
 * inputs (Grade/Assessment records, SubjectResult values, configuration rules)
 * and computes a Result value — or a controlled `incomplete` outcome that
 * explains WHY no value can be produced.
 *
 * FUNDAMENTAL SEPARATIONS (CLAUDE.md §8, BR-GRADE-*):
 *
 *   Grade ≠ SubjectResult ≠ PeriodResult ≠ AnnualResult
 *
 *   - SubjectResult: computed from Grades/Assessments + the selected
 *     GradingConfigurationVersion. Output is on the `thresholds.maxScore`
 *     scale. Coefficients are REQUIRED (when `coefficientUsage` says so) but
 *     deliberately NOT applied to the subject value.
 *   - PeriodResult: computed from MULTIPLE SubjectResults (never raw Grades).
 *     No scale-up — SubjectResults are already on the score scale.
 *   - AnnualResult: computed from MULTIPLE PeriodResults. NOT the latest
 *     PeriodResult and NOT PeriodResult.
 *
 * UNRESOLVED POLICY = INCOMPLETE (never an invented default):
 *
 * The engine NEVER guesses academic semantics. A missing configuration field,
 * a non-VALID grade state (MISSING/ABSENT/EXCUSED), a missing required
 * assessment, zero usable values, an unsupported calculation mode, a
 * WEIGHTED_AVERAGE without coefficients, or a zero total weight all produce a
 * typed `incomplete` outcome. The Application layer decides what to do with
 * that outcome (for Task 006D it rejects the calculation with a domain error).
 *
 * COEFFICIENT SOURCE OF TRUTH (BR-SUBJECT-002/004, BR-GRADE-012):
 *
 * Coefficient VALUES are passed in from CurriculumSubject (the only
 * authoritative source). The configuration NEVER carries subject → number
 * mappings; it only selects the usage strategy via `coefficientUsage`.
 */

import type {
  CalculationMode,
  CoefficientUsageMode,
  RoundingMode,
  WeightingMode,
} from '../grading-rules';
import { DecimalValue } from './decimal';

/** Controlled grade-state vocabulary mirroring the `grade_state` DB enum. */
export const GRADE_STATES = ['VALID', 'MISSING', 'ABSENT', 'EXCUSED'] as const;
export type GradeState = (typeof GRADE_STATES)[number];

/** Controlled assessment-type vocabulary mirroring the `assessment_type` DB enum. */
export const ASSESSMENT_TYPES = ['QUIZ', 'TEST', 'EXAM', 'ORAL', 'PROJECT', 'HOMEWORK'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export interface AssessmentRecord {
  id: string;
  assessmentType: AssessmentType;
  /** Exact numeric string (max 2 dp in DB) — never a float. */
  maximumScore: string;
  /** Exact numeric string (max 2 dp in DB) — never a float. */
  weight: string;
}

export interface GradeRecord {
  assessmentId: string;
  /** Present only when `state === 'VALID'` (DB-enforced). */
  score: string | null;
  state: GradeState;
}

export interface RulesInput {
  periodCalculation?: { mode: CalculationMode };
  annualCalculation?: { mode: CalculationMode };
  assessmentWeighting?: {
    mode: WeightingMode;
    /** Weight per assessment type (0–100) when mode is WEIGHTED. */
    weightsByType?: Record<string, number>;
  };
  coefficientUsage?: { mode: CoefficientUsageMode };
  rounding?: { mode: RoundingMode; scale: number };
  thresholds?: { maxScore: number; passingScore: number };
  requiredAssessments?: { types: string[] };
}

export interface SubjectResultRecord {
  subjectId: string;
  /** Exact numeric string from CurriculumSubject, present when coefficient is used. */
  coefficient: string | null;
  /** SubjectResult value on the `thresholds.maxScore` scale. */
  value: string;
}

export interface PeriodResultRecord {
  academicPeriodId: string;
  /** PeriodResult value on the score scale. */
  value: string;
}

/**
 * Controlled vocabulary of WHY a calculation could not produce a value.
 * These are stable reasons the Application layer and API can map to
 * machine-readable errors without parsing English messages.
 */
export const INCOMPLETE_REASONS = [
  'UNCONFIGURED', // a required configuration category is missing (e.g. rounding, thresholds.maxScore, mode)
  'GRADE_STATE', // a Grade carries a non-VALID state (MISSING/ABSENT/EXCUSED)
  'REQUIRED_ASSESSMENT', // a required assessment type is missing / unresolved
  'NO_VALID_GRADES', // no usable values at all
  'ZERO_WEIGHT', // weighted aggregation with zero total weight
  'MISSING_COEFFICIENT', // WEIGHTED_AVERAGE requires CurriculumSubject coefficients and one is absent
  'UNSUPPORTED_MODE', // the configured mode has no defined calculation semantics
] as const;
export type IncompleteReason = (typeof INCOMPLETE_REASONS)[number];

export type CalculationOutcome =
  | { status: 'complete'; value: DecimalValue }
  | { status: 'incomplete'; reason: IncompleteReason; details: string[] };

function complete(value: DecimalValue): CalculationOutcome {
  return { status: 'complete', value };
}

function incomplete(reason: IncompleteReason, details: string[]): CalculationOutcome {
  return { status: 'incomplete', reason, details };
}

function toDecimal(input: string): DecimalValue {
  return DecimalValue.parse(input);
}

interface SubjectAggregateInput {
  assessments: AssessmentRecord[];
  grades: GradeRecord[];
  assessmentWeighting: NonNullable<RulesInput['assessmentWeighting']>;
  requiredTypes: string[];
}

/**
 * Computes the normalized [0, 1] aggregate of a Student's Grades for one
 * Gradebook. Shared by the SubjectResult stage (then scaled up by maxScore).
 */
function aggregateAssessments(input: SubjectAggregateInput): CalculationOutcome {
  if (input.assessments.length === 0) {
    return incomplete('NO_VALID_GRADES', ['No assessments are present in the gradebook.']);
  }

  const gradeByAssessment = new Map<string, GradeRecord>();
  for (const grade of input.grades) {
    gradeByAssessment.set(grade.assessmentId, grade);
  }

  // Every assessment that exists must have a VALID recorded score. A missing
  // Grade row is treated as an unresolved MISSING grade.
  for (const assessment of input.assessments) {
    const grade = gradeByAssessment.get(assessment.id);
    const state: GradeState = grade?.state ?? 'MISSING';
    if (state !== 'VALID' || grade?.score == null) {
      return incomplete('GRADE_STATE', [
        `Assessment "${assessment.id}" has grade state ${state}; all grades must be VALID to calculate a subject result.`,
      ]);
    }
  }

  // Required assessment types must each be present at least once.
  if (input.requiredTypes.length > 0) {
    const presentTypes = new Set(input.assessments.map((a) => a.assessmentType));
    for (const required of input.requiredTypes) {
      if (!presentTypes.has(required as AssessmentType)) {
        return incomplete('REQUIRED_ASSESSMENT', [
          `Required assessment type "${required}" has no assessment in the gradebook.`,
        ]);
      }
    }
  }

  if (input.assessmentWeighting.mode === 'EQUAL') {
    let sum = DecimalValue.ZERO;
    for (const assessment of input.assessments) {
      const grade = gradeByAssessment.get(assessment.id)!;
      const normalized = toDecimal(grade.score!).divide(toDecimal(assessment.maximumScore));
      sum = sum.add(normalized);
    }
    return complete(sum.divide(DecimalValue.fromInteger(input.assessments.length)));
  }

  // WEIGHTED: weights come from assessmentWeighting.weightsByType (the single
  // configured weight source). Assessment.weight is NOT used here — using two
  // weight sources would create ambiguity.
  const weightsByType = input.assessmentWeighting.weightsByType ?? {};
  let weightedSum = DecimalValue.ZERO;
  let totalWeight = DecimalValue.ZERO;
  const missingWeightTypes: string[] = [];
  for (const assessment of input.assessments) {
    const weight = weightsByType[assessment.assessmentType];
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      missingWeightTypes.push(assessment.assessmentType);
      continue;
    }
    const grade = gradeByAssessment.get(assessment.id)!;
    const normalized = toDecimal(grade.score!).divide(toDecimal(assessment.maximumScore));
    const weightValue = toDecimal(String(weight));
    weightedSum = weightedSum.add(normalized.multiply(weightValue));
    totalWeight = totalWeight.add(weightValue);
  }
  if (missingWeightTypes.length > 0) {
    return incomplete('UNCONFIGURED', [
      `WEIGHTED aggregation has no configured weight for assessment type(s): ${missingWeightTypes.join(', ')}.`,
    ]);
  }
  if (totalWeight.isZero()) {
    return incomplete('ZERO_WEIGHT', ['WEIGHTED aggregation has zero total weight.']);
  }
  return complete(weightedSum.divide(totalWeight));
}

export interface SubjectResultInput {
  assessments: AssessmentRecord[];
  grades: GradeRecord[];
  rules: RulesInput;
  /** CurriculumSubject coefficient; required when coefficientUsage is USE_CURRICULUM_SUBJECT_COEFFICIENT. */
  coefficient: string | null;
}

/**
 * SubjectResult stage (Part B):
 *   normalized aggregate × thresholds.maxScore
 *
 * The coefficient is validated (must be present and positive when the rules
 * demand it) but NOT applied to the subject value — it belongs to the Period
 * stage. Rounding is applied once, at the end.
 */
export function computeSubjectResult(input: SubjectResultInput): CalculationOutcome {
  const { rules } = input;
  if (rules.thresholds == null || !(rules.thresholds.maxScore > 0)) {
    return incomplete('UNCONFIGURED', ['thresholds.maxScore is required to calculate a subject result.']);
  }
  if (rules.rounding == null) {
    return incomplete('UNCONFIGURED', ['rounding is required to calculate a subject result.']);
  }
  if (rules.assessmentWeighting == null) {
    return incomplete('UNCONFIGURED', ['assessmentWeighting is required to calculate a subject result.']);
  }

  const usageMode = rules.coefficientUsage?.mode ?? 'IGNORE';
  if (usageMode === 'USE_CURRICULUM_SUBJECT_COEFFICIENT') {
    if (input.coefficient == null || !DecimalValue.parse(input.coefficient).isPositive()) {
      return incomplete('MISSING_COEFFICIENT', [
        'coefficientUsage is USE_CURRICULUM_SUBJECT_COEFFICIENT but the CurriculumSubject coefficient is missing.',
      ]);
    }
  }

  const aggregate = aggregateAssessments({
    assessments: input.assessments,
    grades: input.grades,
    assessmentWeighting: rules.assessmentWeighting,
    requiredTypes: rules.requiredAssessments?.types ?? [],
  });
  if (aggregate.status === 'incomplete') {
    return aggregate;
  }

  const scaled = aggregate.value.multiply(toDecimal(String(rules.thresholds.maxScore)));
  return complete(scaled.round(rules.rounding.mode, rules.rounding.scale));
}

export interface PeriodResultInput {
  subjectResults: SubjectResultRecord[];
  rules: RulesInput;
}

/**
 * PeriodResult stage (Part C):
 *   aggregate of MULTIPLE SubjectResults — never raw Grades.
 *
 * Subject values are already on the score scale, so there is NO scale-up here.
 * WEIGHTED_AVERAGE uses CurriculumSubject coefficients (the only authoritative
 * coefficient source). Any subject missing its coefficient → incomplete.
 */
export function computePeriodResult(input: PeriodResultInput): CalculationOutcome {
  const { rules } = input;
  if (rules.periodCalculation == null) {
    return incomplete('UNCONFIGURED', ['periodCalculation is required to calculate a period result.']);
  }
  if (rules.rounding == null) {
    return incomplete('UNCONFIGURED', ['rounding is required to calculate a period result.']);
  }
  if (input.subjectResults.length === 0) {
    return incomplete('NO_VALID_GRADES', ['No subject results are available for the period.']);
  }

  const mode = rules.periodCalculation.mode;
  if (mode === 'SIMPLE_AVERAGE') {
    let sum = DecimalValue.ZERO;
    for (const subject of input.subjectResults) {
      sum = sum.add(toDecimal(subject.value));
    }
    return complete(sum.divide(DecimalValue.fromInteger(input.subjectResults.length)).round(rules.rounding.mode, rules.rounding.scale));
  }

  if (mode === 'WEIGHTED_AVERAGE') {
    if (rules.coefficientUsage?.mode !== 'USE_CURRICULUM_SUBJECT_COEFFICIENT') {
      return incomplete('MISSING_COEFFICIENT', [
        'periodCalculation is WEIGHTED_AVERAGE but coefficientUsage is not USE_CURRICULUM_SUBJECT_COEFFICIENT.',
      ]);
    }
    let weightedSum = DecimalValue.ZERO;
    let totalCoefficient = DecimalValue.ZERO;
    const missing: string[] = [];
    for (const subject of input.subjectResults) {
      if (subject.coefficient == null || !DecimalValue.parse(subject.coefficient).isPositive()) {
        missing.push(subject.subjectId);
        continue;
      }
      const coefficient = toDecimal(subject.coefficient);
      weightedSum = weightedSum.add(toDecimal(subject.value).multiply(coefficient));
      totalCoefficient = totalCoefficient.add(coefficient);
    }
    if (missing.length > 0) {
      return incomplete('MISSING_COEFFICIENT', [
        `CurriculumSubject coefficient missing for subject(s): ${missing.join(', ')}.`,
      ]);
    }
    if (totalCoefficient.isZero()) {
      return incomplete('ZERO_WEIGHT', ['WEIGHTED_AVERAGE has zero total coefficient.']);
    }
    return complete(weightedSum.divide(totalCoefficient).round(rules.rounding.mode, rules.rounding.scale));
  }

  return incomplete('UNSUPPORTED_MODE', [`periodCalculation mode "${mode}" is not supported.`]);
}

export interface AnnualResultInput {
  periodResults: PeriodResultRecord[];
  rules: RulesInput;
}

/**
 * AnnualResult stage (Part D):
 *   aggregate of MULTIPLE PeriodResults — the annual result is NOT the latest
 *   PeriodResult and NOT PeriodResult.
 *
 * Only SIMPLE_AVERAGE is supported in V1: there is no per-period weight
 * vocabulary anywhere in the domain, so WEIGHTED_AVERAGE and an absent
 * annualCalculation are both controlled `incomplete` outcomes.
 */
export function computeAnnualResult(input: AnnualResultInput): CalculationOutcome {
  const { rules } = input;
  if (rules.annualCalculation == null) {
    return incomplete('UNCONFIGURED', ['annualCalculation is required to calculate an annual result.']);
  }
  if (rules.rounding == null) {
    return incomplete('UNCONFIGURED', ['rounding is required to calculate an annual result.']);
  }
  if (input.periodResults.length === 0) {
    return incomplete('NO_VALID_GRADES', ['No period results are available for the academic year.']);
  }

  const mode = rules.annualCalculation.mode;
  if (mode === 'SIMPLE_AVERAGE') {
    let sum = DecimalValue.ZERO;
    for (const period of input.periodResults) {
      sum = sum.add(toDecimal(period.value));
    }
    return complete(sum.divide(DecimalValue.fromInteger(input.periodResults.length)).round(rules.rounding.mode, rules.rounding.scale));
  }

  return incomplete('UNSUPPORTED_MODE', [
    `annualCalculation mode "${mode}" is not supported in V1; only SIMPLE_AVERAGE is defined.`,
  ]);
}