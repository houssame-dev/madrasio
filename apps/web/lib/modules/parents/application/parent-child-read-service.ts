import type { Role } from '@/lib/authorization/roles';
import { requireOperation, resolveCurrentContext, type AuthorizationDb } from '@/lib/authorization/server';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { childAttendanceQuery, childHomeworkQuery } from '../domain/child-journeys';
import type { ResultType } from '@/lib/modules/grades/domain';

import * as repo from '../infrastructure/repositories/parent-child-read-repository';
import type { ParentsDb } from '../infrastructure/repositories/parent-repository';
import type { Actor } from './parent-service';
import { ParentDomainError } from './parent-errors';

async function authorizeChild(db: ParentsDb, actor: Actor, studentId: string) {
  await requireOperation(db as unknown as AuthorizationDb, actor, { permission: 'parents.read', scope: { kind: 'school' } });
  const role = (await resolveCurrentContext(db as unknown as AuthorizationDb, actor)).role as Role;
  if (role !== 'PARENT' || !actor.userId) throw new ForbiddenError();
  if (!await repo.parentCanReadChild(db, actor.schoolId, actor.userId, studentId)) {
    throw new ParentDomainError('CHILD_NOT_AVAILABLE', 'Child is not available.');
  }
}

async function requireAcademicContext(db: ParentsDb, actor: Actor, studentId: string, academicYearId: string) {
  if (!await repo.childHasAcademicYear(db, actor.schoolId, studentId, academicYearId)) {
    throw new ParentDomainError('ACADEMIC_CONTEXT_NOT_AVAILABLE', 'Academic context is not available.');
  }
}

export async function listChildAcademicYears(db: ParentsDb, actor: Actor, studentId: string) {
  await authorizeChild(db, actor, studentId);
  return { data: await repo.listChildAcademicYears(db, actor.schoolId, studentId) };
}

export async function listChildAttendance(db: ParentsDb, actor: Actor, studentId: string, input: unknown) {
  await authorizeChild(db, actor, studentId);
  const parsed = childAttendanceQuery.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid attendance filters.');
  await requireAcademicContext(db, actor, studentId, parsed.data.academicYearId);
  return repo.listChildAttendance(db, actor.schoolId, studentId, parsed.data);
}

export async function listChildHomework(db: ParentsDb, actor: Actor, studentId: string, input: unknown) {
  await authorizeChild(db, actor, studentId);
  const parsed = childHomeworkQuery.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid homework filters.');
  await requireAcademicContext(db, actor, studentId, parsed.data.academicYearId);
  return repo.listChildHomework(db, actor.schoolId, studentId, parsed.data);
}

export async function getChildPlacement(db: ParentsDb, actor: Actor, studentId: string, academicYearId: string) {
  await authorizeChild(db, actor, studentId);
  await requireAcademicContext(db, actor, studentId, academicYearId);
  return repo.findChildPlacement(db, actor.schoolId, studentId, academicYearId);
}

export async function listChildPublishedResults(
  db: ParentsDb,
  actor: Actor,
  studentId: string,
  input: { academicYearId: string; academicPeriodId?: string; resultType: ResultType; page: number; pageSize: number },
) {
  await authorizeChild(db, actor, studentId);
  await requireAcademicContext(db, actor, studentId, input.academicYearId);
  const paging = { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
  const result = input.resultType === 'SUBJECT'
    ? await repo.listPublishedSubjectResults(db, actor.schoolId, studentId, input.academicYearId, input.academicPeriodId, paging)
    : input.resultType === 'PERIOD'
      ? await repo.listPublishedPeriodResults(db, actor.schoolId, studentId, input.academicYearId, input.academicPeriodId, paging)
      : await repo.listPublishedAnnualResults(db, actor.schoolId, studentId, input.academicYearId, paging);
  return {
    data: result.rows.map((row) => ({
      publicationId: row.publicationId,
      resultId: row.resultId,
      resultType: row.resultType,
      value: row.resultValue,
      publicationVersion: row.publicationVersion,
      publishedAt: row.publishedAt.toISOString(),
      academicYear: { id: row.academicYearId, name: row.academicYearName },
      academicPeriod: row.academicPeriodId && row.academicPeriodName ? { id: row.academicPeriodId, name: row.academicPeriodName } : null,
      class: { id: row.classId, name: row.className },
      subject: row.subjectId && row.subjectName ? { id: row.subjectId, name: row.subjectName, code: row.subjectCode } : null,
    })),
    meta: { page: input.page, pageSize: input.pageSize, total: result.total },
  };
}
