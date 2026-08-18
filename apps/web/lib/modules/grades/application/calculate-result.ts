/**
 * Result calculation use cases (Task 006D Parts B/C/D).
 *
 * Each use case: authorizes → loads the exact inputs the engine needs from
 * the owning repositories → runs the PURE engine → persists the computed
 * result (CALCULATED) via an upsert.
 *
 * REVISION MODE (`revision: true`): the FINALIZED guard is bypassed so the
 * explicit revision flow (Part K/L) can recompute a historically FINALIZED
 * result. This is the ONLY way a FINALIZED row is ever rewritten — never a
 * silent recalculation.
 *
 * CONFIGURATION BINDING: every result row binds the exact
 * GradingConfigurationVersion that produced it. For SubjectResults this is
 * the Gradebook's bound version. Period/Annual results inherit the SINGLE
 * version shared by all their aggregated inputs — if inputs disagree about
 * the version, the calculation is refused (INVALID_RESULT_STATE) rather than
 * silently choosing one (BR-GRADE-013 / BR-HISTORY-004).
 */

import { NotFoundError } from '@/lib/errors';

import { validateGradingRules } from '../domain';
import {
  computeSubjectResult as runSubjectEngine,
  computePeriodResult as runPeriodEngine,
  computeAnnualResult as runAnnualEngine,
  type RulesInput,
  type SubjectResultRecord,
  type PeriodResultRecord,
} from '../domain/calculation';
import type { ResultStatus, ResultType } from '../domain/results';
import type {
  AnnualResultRow,
  GradesDb,
  PeriodResultRow,
  SubjectResultRow,
} from '../infrastructure/repositories/result-repository';
import * as repo from '../infrastructure/repositories/result-repository';
import { ResultDomainError } from './result-errors';
import { requireAnyResultOperation, requireResultOperation } from './authorization';

export interface CalculateSubjectResultInput {
  userId: string | null;
  schoolId: string;
  gradebookId: string;
  studentId: string;
  revision?: boolean;
}

export interface CalculatePeriodResultInput {
  userId: string | null;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  academicPeriodId: string;
  classId: string;
  revision?: boolean;
}

export interface CalculateAnnualResultInput {
  userId: string | null;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  classId: string;
  revision?: boolean;
}

export interface ResultView {
  id: string;
  schoolId: string;
  resultType: ResultType;
  studentId: string;
  academicYearId: string;
  academicPeriodId: string | null;
  classId: string;
  subjectId: string | null;
  gradingConfigurationVersionId: string;
  value: string;
  status: ResultStatus;
}

function toSubjectView(row: SubjectResultRow): ResultView {
  return {
    id: row.id,
    schoolId: row.schoolId,
    resultType: 'SUBJECT',
    studentId: row.studentId,
    academicYearId: row.academicYearId,
    academicPeriodId: row.academicPeriodId,
    classId: row.classId,
    subjectId: row.subjectId,
    gradingConfigurationVersionId: row.gradingConfigurationVersionId,
    value: row.value,
    status: row.status,
  };
}

function toPeriodView(row: PeriodResultRow): ResultView {
  return {
    id: row.id,
    schoolId: row.schoolId,
    resultType: 'PERIOD',
    studentId: row.studentId,
    academicYearId: row.academicYearId,
    academicPeriodId: row.academicPeriodId,
    classId: row.classId,
    subjectId: null,
    gradingConfigurationVersionId: row.gradingConfigurationVersionId,
    value: row.value,
    status: row.status,
  };
}

function toAnnualView(row: AnnualResultRow): ResultView {
  return {
    id: row.id,
    schoolId: row.schoolId,
    resultType: 'ANNUAL',
    studentId: row.studentId,
    academicYearId: row.academicYearId,
    academicPeriodId: null,
    classId: row.classId,
    subjectId: null,
    gradingConfigurationVersionId: row.gradingConfigurationVersionId,
    value: row.value,
    status: row.status,
  };
}

async function loadRulesOrThrow(db: GradesDb, schoolId: string, versionId: string): Promise<RulesInput> {
  const raw = await repo.findConfigurationRules(db, schoolId, versionId);
  if (raw == null) {
    throw new ResultDomainError(
      'CONFIGURATION_INVALID',
      `GradingConfigurationVersion ${versionId} does not exist in this school.`,
    );
  }
  const errors = validateGradingRules(raw);
  if (errors.length > 0) {
    throw new ResultDomainError('CONFIGURATION_INVALID', 'The bound grading rules payload is invalid.', {
      reason: 'UNCONFIGURED',
      details: errors,
    });
  }
  return raw as unknown as RulesInput;
}

function guardFinalized(existing: { status: ResultStatus } | null | undefined, revision: boolean | undefined): void {
  if (!revision && existing?.status === 'FINALIZED') {
    throw new ResultDomainError(
      'RESULT_ALREADY_FINALIZED',
      'The result is already FINALIZED and cannot be silently recalculated. Use an explicit revision.',
    );
  }
}

/** Storage formatter: the V1 schema stores numeric(6,2); the engine keeps full precision. */
function toStorageValue(value: { toFixed(scale: number): string }): string {
  return value.toFixed(2);
}

/**
 * Calculates a SubjectResult for one Student in one Gradebook
 * (Part B). Authorized via grades.enter + Teacher scope OR grades.manage
 * (school scope). The Gradebook must be OPEN or CLOSED.
 */
export async function calculateSubjectResult(
  db: GradesDb,
  input: CalculateSubjectResultInput,
): Promise<ResultView> {
  const gradebook = await repo.findGradebookContext(db, input.schoolId, input.gradebookId);
  if (!gradebook) {
    throw new NotFoundError('Gradebook not found');
  }

  const enrolled = await repo.findStudentEnrollment(
    db,
    input.schoolId,
    input.studentId,
    gradebook.academicYearId,
    gradebook.classId,
  );
  if (!enrolled) {
    throw new ResultDomainError('STUDENT_NOT_ENROLLED', 'The student is not enrolled in this class for the academic year.');
  }

  const gradebookUsable = gradebook.status === 'OPEN' || gradebook.status === 'CLOSED';
  await requireAnyResultOperation(
    db,
    { userId: input.userId, schoolId: input.schoolId },
    [
      {
        permission: 'grades.enter',
        scope: {
          kind: 'teacher',
          classId: gradebook.classId,
          subjectId: gradebook.subjectId,
          academicYearId: gradebook.academicYearId,
        },
        resourceState: { allows: gradebookUsable },
      },
      {
        permission: 'grades.manage',
        scope: { kind: 'school' },
        resourceState: { allows: gradebookUsable },
      },
    ],
  );

  const assessments = await repo.findAssessments(db, input.schoolId, input.gradebookId);
  const assessmentIds = assessments.map((a) => a.id);
  const grades = await repo.findGrades(
    db,
    input.schoolId,
    input.gradebookId,
    assessmentIds,
    input.studentId,
  );

  const rules = await loadRulesOrThrow(db, input.schoolId, gradebook.gradingConfigurationVersionId);

  let coefficient: string | null = null;
  if (rules.coefficientUsage?.mode === 'USE_CURRICULUM_SUBJECT_COEFFICIENT') {
    if (!gradebook.curriculumVersionId) {
      throw new ResultDomainError(
        'INVALID_RESULT_STATE',
        'The class has no curriculum version to resolve the subject coefficient.',
      );
    }
    coefficient = await repo.findCurriculumCoefficient(
      db,
      input.schoolId,
      gradebook.curriculumVersionId,
      gradebook.subjectId,
    );
  }

  const outcome = runSubjectEngine({
    assessments,
    grades,
    rules,
    coefficient,
  });
  if (outcome.status === 'incomplete') {
    throw new ResultDomainError('CALCULATION_INCOMPLETE', 'The subject result could not be calculated.', {
      reason: outcome.reason,
      details: outcome.details,
    });
  }

  const existing = await repo.findSubjectResultByContext(
    db,
    input.schoolId,
    input.studentId,
    gradebook.academicYearId,
    gradebook.academicPeriodId,
    gradebook.classId,
    gradebook.subjectId,
  );
  guardFinalized(existing, input.revision);

  const row = await repo.upsertSubjectResult(db, input.schoolId, {
    studentId: input.studentId,
    academicYearId: gradebook.academicYearId,
    academicPeriodId: gradebook.academicPeriodId,
    classId: gradebook.classId,
    subjectId: gradebook.subjectId,
    gradingConfigurationVersionId: gradebook.gradingConfigurationVersionId,
    value: toStorageValue(outcome.value),
    status: 'CALCULATED',
  });

  return toSubjectView(row);
}

/**
 * Collects the single GradingConfigurationVersion shared by the aggregated
 * result inputs, or throws when they disagree or nothing exists yet.
 */
function resolveSharedVersion(rows: readonly { gradingConfigurationVersionId: string }[]): string {
  if (rows.length === 0) {
    throw new ResultDomainError('CALCULATION_INCOMPLETE', 'No aggregated inputs are available yet.', {
      reason: 'NO_VALID_GRADES',
      details: ['There are no inputs to aggregate.'],
    });
  }
  const distinct = new Set(rows.map((r) => r.gradingConfigurationVersionId));
  if (distinct.size > 1) {
    throw new ResultDomainError(
      'INVALID_RESULT_STATE',
      'The aggregated inputs reference different GradingConfigurationVersions; refusing an ambiguous calculation.',
    );
  }
  return rows[0].gradingConfigurationVersionId;
}

/**
 * Calculates a PeriodResult (Part C) from MULTIPLE SubjectResults.
 * Authorized via grades.manage (school scope).
 */
export async function calculatePeriodResult(
  db: GradesDb,
  input: CalculatePeriodResultInput,
): Promise<ResultView> {
  await requireResultOperation(
    db,
    { userId: input.userId, schoolId: input.schoolId },
    { permission: 'grades.manage', scope: { kind: 'school' } },
  );

  const enrolled = await repo.findStudentEnrollment(
    db,
    input.schoolId,
    input.studentId,
    input.academicYearId,
    input.classId,
  );
  if (!enrolled) {
    throw new ResultDomainError('STUDENT_NOT_ENROLLED', 'The student is not enrolled in this class for the academic year.');
  }

  const subjectRows = await repo.findSubjectResultsForPeriod(
    db,
    input.schoolId,
    input.studentId,
    input.academicYearId,
    input.academicPeriodId,
    input.classId,
  );

  const sharedVersion = resolveSharedVersion(subjectRows);
  const rules = await loadRulesOrThrow(db, input.schoolId, sharedVersion);

  const curriculumVersionId = await repo.findClassCurriculumVersionId(db, input.schoolId, input.classId);
  const subjects: SubjectResultRecord[] = [];
  for (const row of subjectRows) {
    let coefficient: string | null = null;
    if (rules.coefficientUsage?.mode === 'USE_CURRICULUM_SUBJECT_COEFFICIENT') {
      if (!curriculumVersionId) {
        throw new ResultDomainError(
          'INVALID_RESULT_STATE',
          'The class has no curriculum version to resolve subject coefficients.',
        );
      }
      coefficient = await repo.findCurriculumCoefficient(db, input.schoolId, curriculumVersionId, row.subjectId);
    }
    subjects.push({ subjectId: row.subjectId, coefficient, value: row.value });
  }

  const outcome = runPeriodEngine({ subjectResults: subjects, rules });
  if (outcome.status === 'incomplete') {
    throw new ResultDomainError('CALCULATION_INCOMPLETE', 'The period result could not be calculated.', {
      reason: outcome.reason,
      details: outcome.details,
    });
  }

  const existing = await repo.findPeriodResultByContext(
    db,
    input.schoolId,
    input.studentId,
    input.academicYearId,
    input.academicPeriodId,
    input.classId,
  );
  guardFinalized(existing, input.revision);

  const row = await repo.upsertPeriodResult(db, input.schoolId, {
    studentId: input.studentId,
    academicYearId: input.academicYearId,
    academicPeriodId: input.academicPeriodId,
    classId: input.classId,
    gradingConfigurationVersionId: sharedVersion,
    value: toStorageValue(outcome.value),
    status: 'CALCULATED',
  });

  return toPeriodView(row);
}

/**
 * Calculates an AnnualResult (Part D) from MULTIPLE PeriodResults. Annual is
 * a distinct business concept — NOT the latest PeriodResult. Authorized via
 * grades.manage (school scope).
 */
export async function calculateAnnualResult(
  db: GradesDb,
  input: CalculateAnnualResultInput,
): Promise<ResultView> {
  await requireResultOperation(
    db,
    { userId: input.userId, schoolId: input.schoolId },
    { permission: 'grades.manage', scope: { kind: 'school' } },
  );

  const enrolled = await repo.findStudentEnrollment(
    db,
    input.schoolId,
    input.studentId,
    input.academicYearId,
    input.classId,
  );
  if (!enrolled) {
    throw new ResultDomainError('STUDENT_NOT_ENROLLED', 'The student is not enrolled in this class for the academic year.');
  }

  const periodRows = await repo.findPeriodResultsForAnnual(
    db,
    input.schoolId,
    input.studentId,
    input.academicYearId,
    input.classId,
  );

  const sharedVersion = resolveSharedVersion(periodRows);
  const rules = await loadRulesOrThrow(db, input.schoolId, sharedVersion);

  const periods: PeriodResultRecord[] = periodRows.map((row) => ({
    academicPeriodId: row.academicPeriodId,
    value: row.value,
  }));

  const outcome = runAnnualEngine({ periodResults: periods, rules });
  if (outcome.status === 'incomplete') {
    throw new ResultDomainError('CALCULATION_INCOMPLETE', 'The annual result could not be calculated.', {
      reason: outcome.reason,
      details: outcome.details,
    });
  }

  const existing = await repo.findAnnualResultByContext(
    db,
    input.schoolId,
    input.studentId,
    input.academicYearId,
    input.classId,
  );
  guardFinalized(existing, input.revision);

  const row = await repo.upsertAnnualResult(db, input.schoolId, {
    studentId: input.studentId,
    academicYearId: input.academicYearId,
    classId: input.classId,
    gradingConfigurationVersionId: sharedVersion,
    value: toStorageValue(outcome.value),
    status: 'CALCULATED',
  });

  return toAnnualView(row);
}