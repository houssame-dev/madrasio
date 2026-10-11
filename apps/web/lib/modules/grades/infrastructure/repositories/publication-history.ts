import { and, count, desc, eq } from 'drizzle-orm';
import { resultPublications as p } from '@school/database';
import type { GradesDb } from './result-repository';

export function publicationView(row: typeof p.$inferSelect) {
  return { publicationId: row.id, resultId: row.subjectResultId ?? row.periodResultId ?? row.annualResultId!,
    resultType: row.resultType, studentId: row.studentId, academicYearId: row.academicYearId,
    academicPeriodId: row.academicPeriodId, value: row.resultValue, publicationVersion: row.publicationVersion,
    publishedAt: row.publishedAt.toISOString(), gradingConfigurationVersionId: row.gradingConfigurationVersionId,
    displayContext: row.displayContext, state: row.publicationVersion === 1 ? 'PUBLISHED' as const : 'REVISED' as const };
}

export async function findPublishedSnapshot(db: GradesDb, schoolId: string, publicationId: string) {
  const [row] = await db.select().from(p).where(and(eq(p.schoolId, schoolId), eq(p.id, publicationId))).limit(1);
  return row ?? null;
}

export async function publicationHistory(db: GradesDb, schoolId: string, selected: typeof p.$inferSelect, page: number) {
  const column = selected.resultType === 'SUBJECT' ? p.subjectResultId : selected.resultType === 'PERIOD' ? p.periodResultId : p.annualResultId;
  const resultId = selected.subjectResultId ?? selected.periodResultId ?? selected.annualResultId!;
  const condition = and(eq(p.schoolId, schoolId), eq(p.studentId, selected.studentId), eq(p.resultType, selected.resultType), eq(column, resultId));
  const rows = await db.select().from(p).where(condition).orderBy(desc(p.publicationVersion)).limit(20).offset((page - 1) * 20);
  const [total] = await db.select({ value: count() }).from(p).where(condition);
  return { selected: publicationView(selected), data: rows.map(publicationView), meta: { page, pageSize: 20, total: total.value } };
}
