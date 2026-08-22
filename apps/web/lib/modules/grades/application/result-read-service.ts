import type { Role } from '@/lib/authorization/roles';
import {
  requireOperation, resolveCurrentContext, type AuthorizationDb,
} from '@/lib/authorization/server';
import { ForbiddenError } from '@/lib/errors';

import type { ResultType } from '../domain/results';
import * as repo from '../infrastructure/repositories/result-repository';
import type {
  GradesDb, ResultFilters,
} from '../infrastructure/repositories/result-repository';
import { ResultDomainError } from './result-errors';

export interface ResultReadActor { userId: string | null; schoolId: string }
export interface ResultReadInput extends ResultFilters { page: number; pageSize: number }

async function readRole(db: GradesDb, actor: ResultReadActor): Promise<Role> {
  await requireOperation(db as unknown as AuthorizationDb, actor, {
    permission: 'grades.read', scope: { kind: 'school' },
  });
  const role = (await resolveCurrentContext(db as unknown as AuthorizationDb, actor)).role as Role;
  if (role === 'PARENT') throw new ForbiddenError();
  return role;
}

function view<T extends { schoolId: string }>(row: T, resultType: ResultType) {
  const { schoolId: _schoolId, ...data } = row;
  return { ...data, resultType };
}

export async function listResults(
  db: GradesDb,
  actor: ResultReadActor,
  resultType: ResultType,
  input: ResultReadInput,
) {
  const role = await readRole(db, actor);
  if (role === 'TEACHER' && resultType !== 'SUBJECT') throw new ForbiddenError();
  const paging = { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
  const result = resultType === 'SUBJECT'
    ? await repo.listSubjectResults(
        db, actor.schoolId, paging, input, role === 'TEACHER' ? actor.userId! : undefined,
      )
    : resultType === 'PERIOD'
      ? await repo.listPeriodResults(db, actor.schoolId, paging, input)
      : await repo.listAnnualResults(db, actor.schoolId, paging, input);
  return {
    data: result.rows.map((row) => view(row, resultType)),
    meta: { page: input.page, pageSize: input.pageSize, total: result.total },
  };
}

export async function getResult(
  db: GradesDb,
  actor: ResultReadActor,
  resultType: ResultType,
  resultId: string,
) {
  const result = await repo.findResultRow(db, actor.schoolId, resultType, resultId);
  if (!result) throw new ResultDomainError('RESULT_NOT_FOUND', 'Result was not found.');
  const role = await readRole(db, actor);
  if (role === 'TEACHER') {
    if (resultType !== 'SUBJECT' || !result.subjectId) throw new ForbiddenError();
    await requireOperation(db as unknown as AuthorizationDb, actor, {
      permission: 'grades.read',
      scope: {
        kind: 'teacher', classId: result.classId,
        subjectId: result.subjectId, academicYearId: result.academicYearId,
      },
    });
  }
  return view(result, resultType);
}

