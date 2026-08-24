/**
 * Result revision use case (Task 006D Parts K/L).
 *
 * An EXPLICIT revision recomputes a FINALIZED result, re-finalizes it and
 * publishes a NEW version of the historical snapshot:
 *
 *   idempotency → row lock → recalc → finalize → publication + outbox → commit
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
import { finalizeResult } from './finalize-result';
import {
  findIdempotentPublication,
  isPublicationUniqueViolation,
  publishResultInTransaction,
  recoverConcurrentPublication,
  type PublishResultView,
} from './publish-result';
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

  if (!input.userId) {
    throw new ResultDomainError('RESULT_NOT_FOUND', 'A publisher identity is required to revise a result.');
  }

  const publicationInput = {
    userId: input.userId,
    schoolId: input.schoolId,
    resultType: input.resultType,
    resultId: input.resultId,
    idempotencyKey: input.idempotencyKey,
    revision: true,
  } as const;

  // Fast replay path: authorization is still enforced, but no Result/input or
  // recipient query and no transaction/mutation is needed for a completed key.
  const replay = await findIdempotentPublication(db, publicationInput);
  if (replay) return replay;

  try {
    return await db.transaction(async (tx) => {
      // Serialize all revisions of this logical Result. The idempotency key is
      // rechecked only after the lock is acquired so a waiting same-key request
      // observes the winner before any recalculation.
      const result = await repo.findResultRowForUpdate(
        tx,
        input.schoolId,
        input.resultType,
        input.resultId,
      );
      if (!result) {
        throw new ResultDomainError(
          'RESULT_NOT_FOUND',
          `Result ${input.resultId} was not found in this school.`,
        );
      }

      const transactionalReplay = await findIdempotentPublication(tx, publicationInput);
      if (transactionalReplay) return transactionalReplay;

      if (result.status !== 'FINALIZED') {
        throw new ResultDomainError(
          'RESULT_NOT_FINALIZED',
          'Only FINALIZED results can be revised. Finalize the result first.',
        );
      }
      if (!await repo.findLatestPublication(tx, input.schoolId, input.resultType, input.resultId)) {
        throw new ResultDomainError(
          'RESULT_NOT_PUBLISHED',
          'A revision requires a previously published version of the result.',
        );
      }

      // Reuse the existing calculation engine and validation paths. Passing
      // the transaction executor keeps every authoritative input read and the
      // Result upsert inside this one transaction.
      if (input.resultType === 'SUBJECT') {
        const gradebook = await repo.findGradebookByContext(
          tx,
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
        await calculateSubjectResult(tx, {
          userId: input.userId,
          schoolId: input.schoolId,
          gradebookId: gradebook.gradebookId,
          studentId: result.studentId,
          revision: true,
        });
      } else if (input.resultType === 'PERIOD') {
        await calculatePeriodResult(tx, {
          userId: input.userId,
          schoolId: input.schoolId,
          studentId: result.studentId,
          academicYearId: result.academicYearId,
          academicPeriodId: result.academicPeriodId!,
          classId: result.classId,
          revision: true,
        });
      } else {
        await calculateAnnualResult(tx, {
          userId: input.userId,
          schoolId: input.schoolId,
          studentId: result.studentId,
          academicYearId: result.academicYearId,
          classId: result.classId,
          revision: true,
        });
      }

      // Reuse the normal CALCULATED → FINALIZED validation rather than a
      // revision-specific lifecycle bypass.
      await finalizeResult(tx, {
        userId: input.userId,
        schoolId: input.schoolId,
        resultType: input.resultType,
        resultId: input.resultId,
      });

      // Publication snapshot, current recipient resolution and outbox event
      // share this same transaction. No nested transaction is opened.
      return publishResultInTransaction(tx, publicationInput);
    });
  } catch (error) {
    // Any uniqueness race aborts and rolls back the complete revision first;
    // only then may the winning canonical publication be returned.
    if (isPublicationUniqueViolation(error)) {
      return recoverConcurrentPublication(db, publicationInput);
    }
    throw error;
  }
}
