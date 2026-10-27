import { and, asc, count, eq, exists, gte, lte, or, isNull, sql } from 'drizzle-orm';
import * as s from '@school/database';
import type { GradesDb, ResultRow } from './result-repository';
import * as repo from './result-repository';
import type { ResultBatchScope } from '../../domain/result-batch';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { createHash } from 'node:crypto';

export async function batchContext(db: GradesDb, schoolId: string, scope: ResultBatchScope) {
  const [klass] = await db
    .select()
    .from(s.classes)
    .where(
      and(
        eq(s.classes.schoolId, schoolId),
        eq(s.classes.id, scope.classId),
        eq(s.classes.academicYearId, scope.academicYearId),
      ),
    )
    .limit(1);
  const [year] = await db
    .select()
    .from(s.academicYears)
    .where(
      and(eq(s.academicYears.schoolId, schoolId), eq(s.academicYears.id, scope.academicYearId)),
    )
    .limit(1);
  if (!klass || !year) throw new NotFoundError('Academic context unavailable.');
  const [period] = scope.academicPeriodId
    ? await db
        .select()
        .from(s.academicPeriods)
        .where(
          and(
            eq(s.academicPeriods.schoolId, schoolId),
            eq(s.academicPeriods.academicYearId, year.id),
            eq(s.academicPeriods.id, scope.academicPeriodId),
          ),
        )
        .limit(1)
    : [];
  if (scope.resultType !== 'ANNUAL' && !period) throw new NotFoundError('Period unavailable.');
  const gradebook = scope.gradebookId
    ? await repo.findGradebookContext(db, schoolId, scope.gradebookId)
    : null;
  if (
    scope.resultType === 'SUBJECT' &&
    (!gradebook ||
      gradebook.academicYearId !== year.id ||
      gradebook.classId !== klass.id ||
      gradebook.academicPeriodId !== period?.id)
  )
    throw new ValidationError('Gradebook does not match the selected context.');
  return {
    klass,
    year,
    period,
    gradebook,
    from: period?.startDate ?? year.startDate,
    through: period?.endDate ?? year.endDate,
  };
}
export function enrollmentScope(
  db: GradesDb,
  schoolId: string,
  scope: ResultBatchScope,
  from: string,
  through: string,
) {
  return exists(
    db
      .select({ id: s.studentEnrollments.id })
      .from(s.studentEnrollments)
      .where(
        and(
          eq(s.studentEnrollments.schoolId, schoolId),
          eq(s.studentEnrollments.studentId, s.students.id),
          eq(s.studentEnrollments.classId, scope.classId),
          eq(s.studentEnrollments.academicYearId, scope.academicYearId),
          lte(s.studentEnrollments.effectiveFrom, through),
          or(
            isNull(s.studentEnrollments.effectiveUntil),
            gte(s.studentEnrollments.effectiveUntil, from),
          ),
        ),
      ),
  );
}
export async function batchStudents(
  db: GradesDb,
  schoolId: string,
  scope: ResultBatchScope,
  from: string,
  through: string,
  page: number,
  limit: number,
  studentId?: string,
) {
  const condition = and(
    eq(s.students.schoolId, schoolId),
    studentId ? eq(s.students.id, studentId) : undefined,
    enrollmentScope(db, schoolId, scope, from, through),
  );
  const rows = await db
    .select({
      id: s.students.id,
      firstName: s.students.firstName,
      lastName: s.students.lastName,
      studentCode: s.students.studentCode,
    })
    .from(s.students)
    .where(condition)
    .orderBy(asc(s.students.id))
    .limit(limit)
    .offset(studentId ? 0 : (page - 1) * limit);
  const [total] = await db.select({ n: count() }).from(s.students).where(condition);
  return { rows, total: total.n };
}
export async function scopedResult(
  db: GradesDb,
  schoolId: string,
  scope: ResultBatchScope,
  studentId: string,
  subjectId?: string,
) {
  const row =
    scope.resultType === 'SUBJECT'
      ? await repo.findSubjectResultByContext(
          db,
          schoolId,
          studentId,
          scope.academicYearId,
          scope.academicPeriodId!,
          scope.classId,
          subjectId!,
        )
      : scope.resultType === 'PERIOD'
        ? await repo.findPeriodResultByContext(
            db,
            schoolId,
            studentId,
            scope.academicYearId,
            scope.academicPeriodId!,
            scope.classId,
          )
        : await repo.findAnnualResultByContext(
            db,
            schoolId,
            studentId,
            scope.academicYearId,
            scope.classId,
          );
  return row ? repo.findResultRow(db, schoolId, scope.resultType, row.id) : null;
}
export async function resultToken(
  db: GradesDb,
  schoolId: string,
  scope: ResultBatchScope,
  studentId: string,
  row: ResultRow | null,
) {
  const table =
    scope.resultType === 'SUBJECT'
      ? s.subjectResults
      : scope.resultType === 'PERIOD'
        ? s.periodResults
        : s.annualResults;
  const [stamp] = row
    ? await db
        .select({ updatedAt: sql<string>`${table.updatedAt}::text` })
        .from(table)
        .where(and(eq(table.schoolId, schoolId), eq(table.id, row.id)))
        .limit(1)
    : [];
  const latest = row
    ? await repo.findLatestPublication(db, schoolId, scope.resultType, row.id)
    : null;
  const token = createHash('sha256')
    .update(
      JSON.stringify({
        schoolId,
        scope,
        studentId,
        row,
        updatedAt: stamp?.updatedAt ?? null,
        publicationId: latest?.id ?? null,
      }),
    )
    .digest('hex');
  return { token, publicationId: latest?.id ?? null };
}
export async function lockBatchSchool(db: GradesDb, schoolId: string) {
  await db
    .select({ id: s.schools.id })
    .from(s.schools)
    .where(eq(s.schools.id, schoolId))
    .for('update');
}
