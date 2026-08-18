/**
 * Result finalization use case (Task 006D Part E/S).
 *
 * CALCULATED → FINALIZED. A FINALIZED result is semantically immutable in the
 * Application layer: normal recalculation refuses to overwrite it, and only
 * the explicit revision flow may recompute it (Part K/L).
 *
 * The mutation blocking is intentionally enforced HERE (the Application
 * layer), not with SQL triggers — the schema documents this boundary
 * (Task 006C §21/§39). The database still guarantees referential integrity;
 * the Application guarantees lifecycle integrity.
 *
 * Authorized via grades.manage (school scope).
 */

import type { ResultType } from '../domain/results';
import type { GradesDb } from '../infrastructure/repositories/result-repository';
import * as repo from '../infrastructure/repositories/result-repository';
import { requireResultOperation } from './authorization';
import { ResultDomainError } from './result-errors';

export interface FinalizeResultInput {
  userId: string | null;
  schoolId: string;
  resultType: ResultType;
  resultId: string;
}

export interface FinalizeResultView {
  id: string;
  resultType: ResultType;
  value: string;
  status: 'FINALIZED';
}

export async function finalizeResult(
  db: GradesDb,
  input: FinalizeResultInput,
): Promise<FinalizeResultView> {
  await requireResultOperation(
    db,
    { userId: input.userId, schoolId: input.schoolId },
    { permission: 'grades.manage', scope: { kind: 'school' } },
  );

  const result = await repo.findResultRow(db, input.schoolId, input.resultType, input.resultId);
  if (!result) {
    throw new ResultDomainError('RESULT_NOT_FOUND', `Result ${input.resultId} was not found in this school.`);
  }
  if (result.status === 'FINALIZED') {
    throw new ResultDomainError(
      'RESULT_ALREADY_FINALIZED',
      'The result is already FINALIZED; it cannot be finalized again.',
    );
  }

  const updated = await repo.setResultFinalized(db, input.schoolId, input.resultType, input.resultId);
  if (!updated) {
    throw new ResultDomainError('RESULT_NOT_FOUND', `Result ${input.resultId} was not found in this school.`);
  }

  return {
    id: result.id,
    resultType: input.resultType,
    value: result.value,
    status: 'FINALIZED',
  };
}