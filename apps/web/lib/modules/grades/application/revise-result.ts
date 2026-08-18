/**
 * Result revision use case (Task 006D Parts K/L).
 *
 * An EXPLICIT revision recomputes a FINALIZED result, re-finalizes it and
 * publishes a NEW version of the historical snapshot:
 *
 *   recalc (revision mode) → finalize → publish(revision: true)
 *
 * The old publication rows are never mutated or deleted — the new value is a
 * new `publication_version` snapshot (Part H3/I). A revision never happens
 * silently: it is an explicit, authorized operation with its own idempotency
 * key and its own outbox event (`ResultRevisionPublished`).
 *
 * NOTE on configuration: the recalculation uses the SAME
 * GradingConfigurationVersion the result is already bound to. A revision
 * re-applies the same rules to the (possibly corrected) underlying data; it
 * does NOT silently adopt a newer configuration (BR-GRADE-013 /
 * BR-HISTORY-004). Adopting new rules is a separate, explicit decision.
 *
 * Authorized via grades.publish (school scope) for the overall operation; the
 * internal recalculation still requires the same authorization paths as the
 * calculation use case (grades.enter + scope OR grades.manage).
 */

import type { ResultType } from '../domain/results';
import type { GradesDb } from '../infrastructure/repositories/result-repository';
import * as repo from '../infrastructure/repositories/result-repository';
import {
  calculateAnnualResult,
  calculatePeriodResult,
  calculateSubjectResult,
} from './calculate-result';
import { publishResult, type PublishResultView } from './publish-result';
import { requireResultOperation } from './authorization';
import { ResultDomainError } from './result-errors';

export interface ReviseResultInput {
  userId: string | null;
  schoolId: string;
  resultType: ResultType;
  resultId: string;
  idempotencyKey: string;
}

/**
 * Revises a FINALIZED result and publishes the next version. Returns the new
 * publication snapshot.
 */
export async function reviseResult(
  db: GradesDb,
  input: ReviseResultInput,
): Promise<PublishResultView> {
  await requireResultOperation(
    db,
    { userId: input.userId, schoolId: input.schoolId },
    { permission: 'grades.publish', scope: { kind: 'school' } },
  );

  const result = await repo.findResultRow(db, input.schoolId, input.resultType, input.resultId);
  if (!result) {
    throw new ResultDomainError('RESULT_NOT_FOUND', `Result ${input.resultId} was not found in this school.`);
  }
  if (result.status !== 'FINALIZED') {
    throw new ResultDomainError(
      'RESULT_NOT_FINALIZED',
      'Only FINALIZED results can be revised. Finalize the result first.',
    );
  }
  if (!input.userId) {
    throw new ResultDomainError('RESULT_NOT_FOUND', 'A publisher identity is required to revise a result.');
  }

  // 1. Recalculate in revision mode (bypasses the FINALIZED guard; updates the
  //    value while keeping the same configuration version binding).
  if (input.resultType === 'SUBJECT') {
    const gradebook = await repo.findGradebookByContext(
      db,
      input.schoolId,
      result.academicYearId,
      result.academicPeriodId!,
      result.classId,
      result.subjectId!,
    );
    if (!gradebook) {
      throw new ResultDomainError(
        'RESULT_NOT_FOUND',
        'The gradebook context for this subject result no longer exists.',
      );
    }
    await calculateSubjectResult(db, {
      userId: input.userId,
      schoolId: input.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId: result.studentId,
      revision: true,
    });
  } else if (input.resultType === 'PERIOD') {
    await calculatePeriodResult(db, {
      userId: input.userId,
      schoolId: input.schoolId,
      studentId: result.studentId,
      academicYearId: result.academicYearId,
      academicPeriodId: result.academicPeriodId!,
      classId: result.classId,
      revision: true,
    });
  } else {
    await calculateAnnualResult(db, {
      userId: input.userId,
      schoolId: input.schoolId,
      studentId: result.studentId,
      academicYearId: result.academicYearId,
      classId: result.classId,
      revision: true,
    });
  }

  // 2. Finalize the recomputed value.
  const finalized = await repo.setResultFinalized(db, input.schoolId, input.resultType, input.resultId);
  if (!finalized) {
    throw new ResultDomainError('RESULT_NOT_FOUND', `Result ${input.resultId} was not found in this school.`);
  }

  // 3. Publish the next version (revision semantics; ResultRevisionPublished).
  return publishResult(db, {
    userId: input.userId,
    schoolId: input.schoolId,
    resultType: input.resultType,
    resultId: input.resultId,
    idempotencyKey: input.idempotencyKey,
    revision: true,
  });
}