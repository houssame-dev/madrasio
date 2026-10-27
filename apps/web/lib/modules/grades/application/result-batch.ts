import { resolveCurrentContext, type AuthorizationDb } from '@/lib/authorization/server';
import { AppError, ForbiddenError, ConflictError } from '@/lib/errors';
import { requireResultOperation } from './authorization';
import * as repo from '../infrastructure/repositories/result-repository';
import * as batch from '../infrastructure/repositories/result-batch';
import type { GradesDb } from '../infrastructure/repositories/result-repository';
import {
  calculateSubjectResult,
  calculatePeriodResult,
  calculateAnnualResult,
} from './calculate-result';
import { finalizeResult } from './finalize-result';
import {
  publishResultInTransaction,
  findIdempotentPublication,
  isPublicationUniqueViolation,
  recoverConcurrentPublication,
} from './publish-result';
import {
  RESULT_BATCH_LIMIT,
  resultBatchCommand,
  resultBatchQuery,
  type ResultBatchCommand,
} from '../domain/result-batch';
import type { z } from 'zod';
export type BatchActor = { userId: string | null; schoolId: string };
export interface BatchOutcome {
  studentId: string;
  resultId: string | null;
  status: 'COMPLETED' | 'INCOMPLETE' | 'CONFLICT' | 'FAILED';
  code: string;
  publicationId?: string;
  reason?: string;
}
async function authorize(db: GradesDb, actor: BatchActor, operation: string) {
  await requireResultOperation(db, actor, {
    permission: operation === 'PUBLISH' ? 'grades.publish' : 'grades.manage',
    scope: { kind: 'school' },
  });
  if (
    (await resolveCurrentContext(db as unknown as AuthorizationDb, actor)).role !== 'SCHOOL_ADMIN'
  )
    throw new ForbiddenError();
}
export async function previewResultBatch(
  db: GradesDb,
  actor: BatchActor,
  raw: z.input<typeof resultBatchQuery>,
) {
  const input = resultBatchQuery.parse(raw);
  await authorize(db, actor, input.operation);
  const context = await batch.batchContext(db, actor.schoolId, input.scope);
  const students = await batch.batchStudents(
    db,
    actor.schoolId,
    input.scope,
    context.from,
    context.through,
    input.page,
    RESULT_BATCH_LIMIT,
  );
  const data = [];
  for (const student of students.rows) {
    const result = await batch.scopedResult(
      db,
      actor.schoolId,
      input.scope,
      student.id,
      context.gradebook?.subjectId,
    );
    const { token, publicationId } = await batch.resultToken(
      db,
      actor.schoolId,
      input.scope,
      student.id,
      result,
    );
    const eligible =
      input.operation === 'CALCULATE'
        ? result?.status !== 'FINALIZED'
        : input.operation === 'FINALIZE'
          ? result?.status === 'CALCULATED'
          : result?.status === 'FINALIZED' && !publicationId;
    data.push({
      student,
      result,
      expectedToken: token,
      publicationId,
      eligible,
      reason: eligible
        ? 'READY'
        : publicationId
          ? 'ALREADY_PUBLISHED'
          : result?.status === 'FINALIZED'
            ? 'FINALIZED'
            : result
              ? 'CALCULATED'
              : 'NOT_CALCULATED',
    });
  }
  return {
    data,
    meta: { page: input.page, pageSize: RESULT_BATCH_LIMIT, total: students.total },
    limit: RESULT_BATCH_LIMIT,
  };
}
export async function executeResultBatch(db: GradesDb, actor: BatchActor, raw: ResultBatchCommand) {
  const input = resultBatchCommand.parse(raw);
  await authorize(db, actor, input.operation);
  const outcomes: BatchOutcome[] = [];
  for (const entry of input.entries) {
    const publicationInput = {
      ...actor,
      resultType: input.scope.resultType,
      resultId: entry.resultId!,
      idempotencyKey: entry.idempotencyKey!,
      revision: false,
    };
    try {
      const value = await db.transaction(
        async (tx) => {
          await batch.lockBatchSchool(tx, actor.schoolId);
          await authorize(tx, actor, input.operation);
          const context = await batch.batchContext(tx, actor.schoolId, input.scope);
          const student = await batch.batchStudents(
            tx,
            actor.schoolId,
            input.scope,
            context.from,
            context.through,
            1,
            1,
            entry.studentId,
          );
          if (!student.rows.length) throw new ForbiddenError();
          let result = await batch.scopedResult(
            tx,
            actor.schoolId,
            input.scope,
            entry.studentId,
            context.gradebook?.subjectId,
          );
          if (result)
            result = await repo.findResultRowForUpdate(
              tx,
              actor.schoolId,
              input.scope.resultType,
              result.id,
            );
          if ((result?.id ?? null) !== entry.resultId)
            throw new ConflictError('Result identity changed. Review the current state.');
          if (input.operation === 'PUBLISH') {
            const replay = await findIdempotentPublication(tx, publicationInput);
            if (replay)
              return {
                studentId: entry.studentId,
                resultId: entry.resultId,
                status: 'COMPLETED' as const,
                code: 'REPLAYED',
                publicationId: replay.publicationId,
              };
          }
          if (
            (await batch.resultToken(tx, actor.schoolId, input.scope, entry.studentId, result))
              .token !== entry.expectedToken
          )
            throw new ConflictError('Result changed. Review the current state.');
          if (input.operation === 'CALCULATE') {
            const scope = {
              ...actor,
              studentId: entry.studentId,
              academicYearId: input.scope.academicYearId,
              classId: input.scope.classId,
            };
            const computed =
              input.scope.resultType === 'SUBJECT'
                ? await calculateSubjectResult(tx, {
                    ...scope,
                    gradebookId: input.scope.gradebookId!,
                  })
                : input.scope.resultType === 'PERIOD'
                  ? await calculatePeriodResult(tx, {
                      ...scope,
                      academicPeriodId: input.scope.academicPeriodId!,
                    })
                  : await calculateAnnualResult(tx, scope);
            return {
              studentId: entry.studentId,
              resultId: computed.id,
              status: 'COMPLETED' as const,
              code: 'CALCULATED',
            };
          }
          if (!result) throw new ConflictError('Result unavailable.');
          if (input.operation === 'FINALIZE') {
            await finalizeResult(tx, {
              ...actor,
              resultType: input.scope.resultType,
              resultId: result.id,
            });
            return {
              studentId: entry.studentId,
              resultId: result.id,
              status: 'COMPLETED' as const,
              code: 'FINALIZED',
            };
          }
          const published = await publishResultInTransaction(tx, publicationInput);
          return {
            studentId: entry.studentId,
            resultId: result.id,
            status: 'COMPLETED' as const,
            code: 'PUBLISHED',
            publicationId: published.publicationId,
          };
        },
        { isolationLevel: 'serializable' },
      );
      outcomes.push(value);
    } catch (error) {
      if (input.operation === 'PUBLISH' && isPublicationUniqueViolation(error)) {
        try {
          const replay = await recoverConcurrentPublication(db, publicationInput);
          outcomes.push({
            studentId: entry.studentId,
            resultId: entry.resultId,
            status: 'COMPLETED',
            code: 'REPLAYED',
            publicationId: replay.publicationId,
          });
          continue;
        } catch {
          /* Controlled conflict below, never retry writes automatically. */
        }
      }
      const code =
        error instanceof AppError
          ? 'featureCode' in error
            ? String(error.featureCode)
            : error.code
          : 'FAILED';
      const pg = error as { code?: string; cause?: { code?: string } };
      const conflict =
        code === 'CONFLICT' ||
        code === 'PUBLICATION_CONFLICT' ||
        code === 'RESULT_ALREADY_FINALIZED' ||
        code === 'RESULT_ALREADY_PUBLISHED' ||
        pg.code === '40001' ||
        pg.cause?.code === '40001';
      const reason =
        error instanceof AppError
          ? (error.details as { incomplete?: { reason?: string } } | undefined)?.incomplete?.reason
          : undefined;
      outcomes.push({
        studentId: entry.studentId,
        resultId: entry.resultId,
        reason,
        status: code === 'CALCULATION_INCOMPLETE' ? 'INCOMPLETE' : conflict ? 'CONFLICT' : 'FAILED',
        code: conflict && code === 'FAILED' ? 'CONFLICT' : code,
      });
    }
  }
  return {
    operation: input.operation,
    resultType: input.scope.resultType,
    outcomes,
    limit: RESULT_BATCH_LIMIT,
  };
}
