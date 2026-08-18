/**
 * Calculation engine tests (Task 006D Part R) — PURE, no database.
 *
 * Verifies the exact decimal semantics and the controlled `incomplete`
 * outcomes. Grade ≠ SubjectResult ≠ PeriodResult ≠ AnnualResult, calculated
 * ≠ finalized ≠ published, and unresolved policies must never invent a
 * default (BR-GRADE-*).
 */

import { describe, expect, it } from 'vitest';

import {
  computeAnnualResult,
  computePeriodResult,
  computeSubjectResult,
  DecimalValue,
  type AssessmentRecord,
  type GradeRecord,
  type RulesInput,
} from '@/lib/modules/grades/domain/calculation';

const HALF_UP_2: RulesInput = {
  periodCalculation: { mode: 'SIMPLE_AVERAGE' },
  annualCalculation: { mode: 'SIMPLE_AVERAGE' },
  assessmentWeighting: { mode: 'EQUAL' },
  coefficientUsage: { mode: 'IGNORE' },
  rounding: { mode: 'HALF_UP', scale: 2 },
  thresholds: { maxScore: 20, passingScore: 10 },
};

function assessment(id: string, type: AssessmentRecord['assessmentType'], maximumScore: string): AssessmentRecord {
  return { id, assessmentType: type, maximumScore, weight: '1' };
}

function grade(assessmentId: string, score: string | null, state: GradeRecord['state']): GradeRecord {
  return { assessmentId, score, state };
}

describe('DecimalValue (Part A)', () => {
  it('parses and formats exact numeric strings', () => {
    expect(DecimalValue.parse('20').toExactString()).toBe('20');
    expect(DecimalValue.parse('16.25').toExactString()).toBe('16.25');
    expect(DecimalValue.parse('0.1').toExactString()).toBe('0.1');
    expect(DecimalValue.parse('7.50').toExactString()).toBe('7.5');
  });

  it('multiplies and divides without float drift', () => {
    const product = DecimalValue.parse('0.3').multiply(DecimalValue.parse('3'));
    expect(product.toExactString()).toBe('0.9');
    const quotient = DecimalValue.parse('1').divide(DecimalValue.parse('3'));
    expect(quotient.toExactString()).toBe('0.333333333333');
  });

  it('rounds HALF_UP away from zero', () => {
    expect(DecimalValue.parse('2.345').round('HALF_UP', 2).toFixed(2)).toBe('2.35');
    expect(DecimalValue.parse('2.344').round('HALF_UP', 2).toFixed(2)).toBe('2.34');
  });

  it('rounds HALF_DOWN toward zero on ties', () => {
    expect(DecimalValue.parse('2.345').round('HALF_DOWN', 2).toFixed(2)).toBe('2.34');
  });

  it('rounds HALF_EVEN to the even neighbor on ties', () => {
    expect(DecimalValue.parse('2.345').round('HALF_EVEN', 2).toFixed(2)).toBe('2.34');
    expect(DecimalValue.parse('2.355').round('HALF_EVEN', 2).toFixed(2)).toBe('2.36');
  });

  it('TRUNCATE drops extra digits and NONE keeps full precision', () => {
    expect(DecimalValue.parse('2.349').round('TRUNCATE', 2).toFixed(2)).toBe('2.34');
    expect(DecimalValue.parse('2.345678912345').round('NONE', 2).toExactString()).toBe('2.345678912345');
  });

  it('adds and subtracts without binary floating-point artifacts', () => {
    expect(DecimalValue.parse('0.1').add(DecimalValue.parse('0.2')).toExactString()).toBe('0.3');
    expect(DecimalValue.parse('1.00').subtract(DecimalValue.parse('0.99')).toExactString()).toBe('0.01');
  });
});

describe('SubjectResult (Part B)', () => {
  it('computes the EQUAL weighted average scaled to maxScore', () => {
    const outcome = computeSubjectResult({
      assessments: [
        assessment('a1', 'QUIZ', '20'),
        assessment('a2', 'EXAM', '20'),
      ],
      grades: [grade('a1', '16', 'VALID'), grade('a2', '18', 'VALID')],
      rules: HALF_UP_2,
      coefficient: null,
    });
    expect(outcome).toEqual({ status: 'complete', value: DecimalValue.parse('17') });
  });

  it('uses assessmentWeighting.weightsByType for WEIGHTED mode', () => {
    const outcome = computeSubjectResult({
      assessments: [assessment('a1', 'QUIZ', '20'), assessment('a2', 'EXAM', '20')],
      grades: [grade('a1', '20', 'VALID'), grade('a2', '10', 'VALID')],
      rules: {
        ...HALF_UP_2,
        assessmentWeighting: { mode: 'WEIGHTED', weightsByType: { QUIZ: 25, EXAM: 75 } },
      },
      coefficient: null,
    });
    // (1.0*25 + 0.5*75) / 100 = 0.625 → 12.5 on scale 20
    expect(outcome.status).toBe('complete');
    if (outcome.status === 'complete') {
      expect(outcome.value.toFixed(2)).toBe('12.50');
    }
  });

  it('requires the CurriculumSubject coefficient when USE_CURRICULUM_SUBJECT_COEFFICIENT', () => {
    const outcome = computeSubjectResult({
      assessments: [assessment('a1', 'QUIZ', '20')],
      grades: [grade('a1', '16', 'VALID')],
      rules: { ...HALF_UP_2, coefficientUsage: { mode: 'USE_CURRICULUM_SUBJECT_COEFFICIENT' } },
      coefficient: null,
    });
    expect(outcome).toEqual({
      status: 'incomplete',
      reason: 'MISSING_COEFFICIENT',
      details: expect.any(Array),
    });
  });

  it('does NOT apply the coefficient to the subject value (it belongs to Period)', () => {
    const outcome = computeSubjectResult({
      assessments: [assessment('a1', 'QUIZ', '20')],
      grades: [grade('a1', '16', 'VALID')],
      rules: { ...HALF_UP_2, coefficientUsage: { mode: 'USE_CURRICULUM_SUBJECT_COEFFICIENT' } },
      coefficient: '7',
    });
    expect(outcome.status).toBe('complete');
    if (outcome.status === 'complete') {
      expect(outcome.value.toFixed(2)).toBe('16.00');
    }
  });

  it('returns incomplete when a grade is not VALID (MISSING/ABSENT/EXCUSED)', () => {
    for (const state of ['MISSING', 'ABSENT', 'EXCUSED'] as const) {
      const outcome = computeSubjectResult({
        assessments: [assessment('a1', 'QUIZ', '20'), assessment('a2', 'EXAM', '20')],
        grades: [grade('a1', null, state), grade('a2', '18', 'VALID')],
        rules: HALF_UP_2,
        coefficient: null,
      });
      expect(outcome.status).toBe('incomplete');
      if (outcome.status === 'incomplete') expect(outcome.reason).toBe('GRADE_STATE');
    }
  });

  it('returns incomplete when a required assessment type is missing', () => {
    const outcome = computeSubjectResult({
      assessments: [assessment('a1', 'QUIZ', '20')],
      grades: [grade('a1', '16', 'VALID')],
      rules: { ...HALF_UP_2, requiredAssessments: { types: ['EXAM'] } },
      coefficient: null,
    });
    expect(outcome).toMatchObject({ status: 'incomplete', reason: 'REQUIRED_ASSESSMENT' });
  });

  it('returns incomplete when thresholds.maxScore or rounding is absent', () => {
    const base = {
      assessments: [assessment('a1', 'QUIZ', '20')],
      grades: [grade('a1', '16', 'VALID')],
      coefficient: null,
    };
    const noThresholds = computeSubjectResult({ ...base, rules: { ...HALF_UP_2, thresholds: undefined } });
    expect(noThresholds).toMatchObject({ status: 'incomplete', reason: 'UNCONFIGURED' });
    const noRounding = computeSubjectResult({ ...base, rules: { ...HALF_UP_2, rounding: undefined } });
    expect(noRounding).toMatchObject({ status: 'incomplete', reason: 'UNCONFIGURED' });
  });

  it('returns incomplete when there are no assessments at all', () => {
    const outcome = computeSubjectResult({
      assessments: [],
      grades: [],
      rules: HALF_UP_2,
      coefficient: null,
    });
    expect(outcome).toMatchObject({ status: 'incomplete', reason: 'NO_VALID_GRADES' });
  });

  it('SIMPLE_AVERAGE normalizes scores against their OWN maximum (no raw-score leakage)', () => {
    // QUIZ max 10 → 8 (0.8), EXAM max 20 → 18 (0.9). EQUAL → 0.85 → 17.00 on scale 20.
    // The raw average (8 + 18) / 2 = 13 would be wrong.
    const outcome = computeSubjectResult({
      assessments: [
        { id: 'a1', assessmentType: 'QUIZ', maximumScore: '10', weight: '1' },
        { id: 'a2', assessmentType: 'EXAM', maximumScore: '20', weight: '1' },
      ],
      grades: [grade('a1', '8', 'VALID'), grade('a2', '18', 'VALID')],
      rules: HALF_UP_2,
      coefficient: null,
    });
    expect(outcome.status).toBe('complete');
    if (outcome.status === 'complete') {
      expect(outcome.value.toFixed(2)).toBe('17.00');
    }
  });

  it('WEIGHTED uses normalized scores per assessment maximum (never raw)', () => {
    // QUIZ max 10 score 8 → 0.8 (weight 25); EXAM max 20 score 18 → 0.9 (weight 75).
    // (0.8*25 + 0.9*75) / 100 = 0.875 → 17.50 on scale 20. Raw would give 15.50.
    const outcome = computeSubjectResult({
      assessments: [
        { id: 'a1', assessmentType: 'QUIZ', maximumScore: '10', weight: '1' },
        { id: 'a2', assessmentType: 'EXAM', maximumScore: '20', weight: '1' },
      ],
      grades: [grade('a1', '8', 'VALID'), grade('a2', '18', 'VALID')],
      rules: {
        ...HALF_UP_2,
        assessmentWeighting: { mode: 'WEIGHTED', weightsByType: { QUIZ: 25, EXAM: 75 } },
      },
      coefficient: null,
    });
    expect(outcome.status).toBe('complete');
    if (outcome.status === 'complete') {
      expect(outcome.value.toFixed(2)).toBe('17.50');
    }
  });

  it('never mixes assessment weighting with CurriculumSubject coefficient at the Subject stage', () => {
    // WEIGHTED uses weightsByType; the coefficient is validated (present, positive)
    // but NOT applied to the subject value (it belongs to the Period stage).
    const outcome = computeSubjectResult({
      assessments: [assessment('a1', 'QUIZ', '20'), assessment('a2', 'EXAM', '20')],
      grades: [grade('a1', '20', 'VALID'), grade('a2', '10', 'VALID')],
      rules: {
        ...HALF_UP_2,
        assessmentWeighting: { mode: 'WEIGHTED', weightsByType: { QUIZ: 25, EXAM: 75 } },
        coefficientUsage: { mode: 'USE_CURRICULUM_SUBJECT_COEFFICIENT' },
      },
      coefficient: '7',
    });
    // (1.0*25 + 0.5*75) / 100 = 0.625 → 12.50 — coefficient '7' is never applied.
    expect(outcome.status).toBe('complete');
    if (outcome.status === 'complete') {
      expect(outcome.value.toFixed(2)).toBe('12.50');
    }
  });

  it('ignores a supplied CurriculumSubject coefficient when coefficientUsage is IGNORE', () => {
    const outcome = computeSubjectResult({
      assessments: [assessment('a1', 'QUIZ', '20')],
      grades: [grade('a1', '16', 'VALID')],
      rules: HALF_UP_2,
      coefficient: '7',
    });
    expect(outcome.status).toBe('complete');
    if (outcome.status === 'complete') {
      expect(outcome.value.toFixed(2)).toBe('16.00');
    }
  });

  it('rounds ONLY at the final stage — no cumulative intermediate rounding', () => {
    // 7/20, 7/20, 6/20 → normalized 0.35 + 0.35 + 0.30 = 1.0 → /3 = 0.3333… → ×20
    // = 6.6666… → HALF_UP 6.67. Rounding each fraction at 2 dp mid-way would
    // yield (0.33+0.33+0.30)/3×20 = 6.40 — a different, wrong value.
    const outcome = computeSubjectResult({
      assessments: [
        assessment('a1', 'QUIZ', '20'),
        assessment('a2', 'EXAM', '20'),
        assessment('a3', 'ORAL', '20'),
      ],
      grades: [grade('a1', '7', 'VALID'), grade('a2', '7', 'VALID'), grade('a3', '6', 'VALID')],
      rules: HALF_UP_2,
      coefficient: null,
    });
    expect(outcome.status).toBe('complete');
    if (outcome.status === 'complete') {
      expect(outcome.value.toFixed(2)).toBe('6.67');
    }
  });

  it('treats an assessment with NO grade row as an unresolved MISSING grade', () => {
    const outcome = computeSubjectResult({
      assessments: [assessment('a1', 'QUIZ', '20'), assessment('a2', 'EXAM', '20')],
      grades: [grade('a1', '16', 'VALID')],
      rules: HALF_UP_2,
      coefficient: null,
    });
    expect(outcome).toMatchObject({ status: 'incomplete', reason: 'GRADE_STATE' });
  });
});

describe('PeriodResult (Part C)', () => {
  it('aggregates SubjectResults with a simple average (no scale-up)', () => {
    const outcome = computePeriodResult({
      subjectResults: [
        { subjectId: 'm', coefficient: null, value: '16' },
        { subjectId: 'p', coefficient: null, value: '18' },
      ],
      rules: HALF_UP_2,
    });
    expect(outcome.status).toBe('complete');
    if (outcome.status === 'complete') expect(outcome.value.toFixed(2)).toBe('17.00');
  });

  it('uses CurriculumSubject coefficients for WEIGHTED_AVERAGE', () => {
    const outcome = computePeriodResult({
      subjectResults: [
        { subjectId: 'm', coefficient: '7', value: '16' },
        { subjectId: 'p', coefficient: '3', value: '20' },
      ],
      rules: {
        ...HALF_UP_2,
        periodCalculation: { mode: 'WEIGHTED_AVERAGE' },
        coefficientUsage: { mode: 'USE_CURRICULUM_SUBJECT_COEFFICIENT' },
      },
    });
    // (16*7 + 20*3) / 10 = 17.2
    expect(outcome.status).toBe('complete');
    if (outcome.status === 'complete') expect(outcome.value.toFixed(2)).toBe('17.20');
  });

  it('returns incomplete when WEIGHTED_AVERAGE lacks coefficients', () => {
    const outcome = computePeriodResult({
      subjectResults: [{ subjectId: 'm', coefficient: null, value: '16' }],
      rules: { ...HALF_UP_2, periodCalculation: { mode: 'WEIGHTED_AVERAGE' } },
    });
    expect(outcome).toMatchObject({ status: 'incomplete', reason: 'MISSING_COEFFICIENT' });
  });

  it('returns incomplete when there are no subject results', () => {
    const outcome = computePeriodResult({ subjectResults: [], rules: HALF_UP_2 });
    expect(outcome).toMatchObject({ status: 'incomplete', reason: 'NO_VALID_GRADES' });
  });
});

describe('AnnualResult (Part D)', () => {
  it('aggregates PeriodResults with a simple average — distinct from the latest period', () => {
    const outcome = computeAnnualResult({
      periodResults: [
        { academicPeriodId: 'p1', value: '14' },
        { academicPeriodId: 'p2', value: '16' },
        { academicPeriodId: 'p3', value: '18' },
      ],
      rules: HALF_UP_2,
    });
    expect(outcome.status).toBe('complete');
    if (outcome.status === 'complete') {
      expect(outcome.value.toFixed(2)).toBe('16.00');
    }
  });

  it('refuses WEIGHTED_AVERAGE (no per-period weight vocabulary in V1)', () => {
    const outcome = computeAnnualResult({
      periodResults: [
        { academicPeriodId: 'p1', value: '14' },
        { academicPeriodId: 'p2', value: '18' },
      ],
      rules: { ...HALF_UP_2, annualCalculation: { mode: 'WEIGHTED_AVERAGE' } },
    });
    expect(outcome).toMatchObject({ status: 'incomplete', reason: 'UNSUPPORTED_MODE' });
  });

  it('refuses an absent annualCalculation instead of defaulting to the latest period', () => {
    const outcome = computeAnnualResult({
      periodResults: [{ academicPeriodId: 'p1', value: '18' }],
      rules: { ...HALF_UP_2, annualCalculation: undefined },
    });
    expect(outcome).toMatchObject({ status: 'incomplete', reason: 'UNCONFIGURED' });
  });
});