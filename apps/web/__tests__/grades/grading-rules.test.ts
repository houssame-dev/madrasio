import { describe, expect, it } from 'vitest';

import {
  CALCULATION_MODES,
  COEFFICIENT_USAGE_MODES,
  ROUNDING_MODES,
  WEIGHTING_MODES,
  isValidGradingRules,
  validateGradingRules,
} from '@/lib/modules/grades/domain/grading-rules';

const VALID_RULES = {
  schemaVersion: 1,
  periodCalculation: { mode: 'WEIGHTED_AVERAGE' },
  annualCalculation: { mode: 'SIMPLE_AVERAGE' },
  assessmentWeighting: {
    mode: 'WEIGHTED',
    weightsByType: { EXAM: 60, CONTINUOUS_ASSESSMENT: 40 },
  },
  coefficientUsage: { mode: 'USE_CURRICULUM_SUBJECT_COEFFICIENT' },
  rounding: { mode: 'HALF_UP', scale: 2 },
  thresholds: { maxScore: 20, passingScore: 10 },
  requiredAssessments: { types: ['EXAM'] },
};

describe('validateGradingRules (Task 006A §7/§8)', () => {
  it('accepts the minimal documented payload shape', () => {
    expect(validateGradingRules(VALID_RULES)).toEqual([]);
    expect(isValidGradingRules(VALID_RULES)).toBe(true);
  });

  it('rejects a non-object payload', () => {
    expect(validateGradingRules(null)).toContain('rules must be a JSON object');
    expect(validateGradingRules('{"a":1}')).toContain('rules must be a JSON object');
    expect(validateGradingRules([1, 2, 3])).toContain('rules must be a JSON object');
  });

  it('requires the schemaVersion to be the controlled value', () => {
    const errors = validateGradingRules({ schemaVersion: 2 });
    expect(errors).toContain('schemaVersion must be 1');
    expect(isValidGradingRules({ schemaVersion: 2 })).toBe(false);
  });

  it('rejects unknown top-level rule categories', () => {
    const errors = validateGradingRules({ schemaVersion: 1, somethingWeird: true });
    expect(errors).toContain('unknown rule category: "somethingWeird"');
  });

  it('rejects an unsupported period/annual calculation mode', () => {
    const errors = validateGradingRules({
      schemaVersion: 1,
      periodCalculation: { mode: 'RANDOM_FORMULA' },
    });
    expect(errors).toContain(`periodCalculation.mode must be one of: ${CALCULATION_MODES.join(', ')}`);
  });

  it('rejects an unsupported annual calculation mode', () => {
    const errors = validateGradingRules({
      schemaVersion: 1,
      annualCalculation: { mode: 'MAGIC' },
    });
    expect(errors).toContain(`annualCalculation.mode must be one of: ${CALCULATION_MODES.join(', ')}`);
  });

  it('accepts every controlled calculation mode', () => {
    for (const mode of CALCULATION_MODES) {
      expect(isValidGradingRules({ schemaVersion: 1, periodCalculation: { mode } })).toBe(true);
    }
  });

  it('rejects an unknown rounding mode', () => {
    const errors = validateGradingRules({ schemaVersion: 1, rounding: { mode: 'BANKERISH_WIZARDRY', scale: 2 } });
    expect(errors).toContain(`rounding.mode must be one of: ${ROUNDING_MODES.join(', ')}`);
  });

  it('accepts every controlled rounding mode', () => {
    for (const mode of ROUNDING_MODES) {
      expect(isValidGradingRules({ schemaVersion: 1, rounding: { mode, scale: 2 } })).toBe(true);
    }
  });

  it('rejects a rounding scale outside the valid range', () => {
    expect(validateGradingRules({ schemaVersion: 1, rounding: { mode: 'HALF_UP', scale: -1 } })).not.toEqual([]);
    expect(validateGradingRules({ schemaVersion: 1, rounding: { mode: 'HALF_UP', scale: 7 } })).not.toEqual([]);
    expect(validateGradingRules({ schemaVersion: 1, rounding: { mode: 'HALF_UP', scale: 2.5 } })).not.toEqual([]);
  });

  it('rejects an assessment weighting mode outside the controlled enum', () => {
    const errors = validateGradingRules({ schemaVersion: 1, assessmentWeighting: { mode: 'SECRET' } });
    expect(errors).toContain(`assessmentWeighting.mode must be one of: ${WEIGHTING_MODES.join(', ')}`);
  });

  it('rejects assessment weights outside 0–100', () => {
    const errors = validateGradingRules({
      schemaVersion: 1,
      assessmentWeighting: { mode: 'WEIGHTED', weightsByType: { EXAM: 150 } },
    });
    expect(errors).toContain('assessmentWeighting.weightsByType["EXAM"] must be a number between 0 and 100');
  });

  it('rejects a passing threshold above the maximum score', () => {
    const errors = validateGradingRules({
      schemaVersion: 1,
      thresholds: { maxScore: 20, passingScore: 21 },
    });
    expect(errors).toContain('thresholds.passingScore must not exceed thresholds.maxScore');
  });

  it('rejects non-positive threshold values', () => {
    expect(
      validateGradingRules({ schemaVersion: 1, thresholds: { maxScore: 0, passingScore: 10 } }),
    ).not.toEqual([]);
    expect(
      validateGradingRules({ schemaVersion: 1, thresholds: { maxScore: 20, passingScore: -1 } }),
    ).not.toEqual([]);
  });

  it('rejects an empty requiredAssessments types list', () => {
    const errors = validateGradingRules({ schemaVersion: 1, requiredAssessments: { types: [] } });
    expect(errors).toContain('requiredAssessments.types must be a non-empty array');
  });

  it('rejects non-string assessment type names', () => {
    const errors = validateGradingRules({
      schemaVersion: 1,
      requiredAssessments: { types: ['EXAM', 42] },
    });
    expect(errors).toContain('requiredAssessments.types must contain non-empty strings');
  });

  it('accepts every controlled coefficient usage mode', () => {
    for (const mode of COEFFICIENT_USAGE_MODES) {
      expect(isValidGradingRules({ schemaVersion: 1, coefficientUsage: { mode } })).toBe(true);
    }
  });

  it('rejects an unknown coefficient usage mode', () => {
    const errors = validateGradingRules({ schemaVersion: 1, coefficientUsage: { mode: 'SECRET_WEIGHTS' } });
    expect(errors).toContain(`coefficientUsage.mode must be one of: ${COEFFICIENT_USAGE_MODES.join(', ')}`);
  });

  it('rejects a non-object coefficientUsage', () => {
    const errors = validateGradingRules({ schemaVersion: 1, coefficientUsage: 'USE_CURRICULUM_SUBJECT_COEFFICIENT' });
    expect(errors).toContain('coefficientUsage must be an object');
  });

  it('rejects the legacy subjectCoefficients category (cannot become an alternative coefficient source of truth)', () => {
    const errors = validateGradingRules({ schemaVersion: 1, subjectCoefficients: { MATHEMATICS: 7 } });
    expect(errors).toContain('unknown rule category: "subjectCoefficients"');
    expect(isValidGradingRules({ schemaVersion: 1, subjectCoefficients: { enabled: true } })).toBe(false);
  });

  it('rejects any payload carrying subject → number coefficient mappings', () => {
    const errors = validateGradingRules({ schemaVersion: 1, coefficients: { MATHEMATICS: 7, FRENCH: 4 } });
    expect(errors).toContain('unknown rule category: "coefficients"');
    expect(errors).not.toEqual([]);
  });

  it('rejects categories that are not objects', () => {
    expect(validateGradingRules({ schemaVersion: 1, rounding: 'HALF_UP' })).toContain('rounding must be an object');
    expect(validateGradingRules({ schemaVersion: 1, thresholds: [] })).toContain('thresholds must be an object');
  });
});