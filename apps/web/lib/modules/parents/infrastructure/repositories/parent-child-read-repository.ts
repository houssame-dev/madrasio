import { and, count, desc, eq, max, sql } from 'drizzle-orm';
import * as schema from '@school/database';

import type { ResultType } from '@/lib/modules/grades/domain';

import type { ParentsDb, Paging } from './parent-repository';

export interface ParentPublishedResultRow {
  publicationId: string;
  resultId: string;
  resultType: ResultType;
  resultValue: string;
  publicationVersion: number;
  publishedAt: Date;
  academicYearId: string;
  academicYearName: string;
  academicPeriodId: string | null;
  academicPeriodName: string | null;
  classId: string;
  className: string;
  subjectId: string | null;
  subjectName: string | null;
  subjectCode: string | null;
}

export async function parentCanReadChild(
  db: ParentsDb,
  schoolId: string,
  userId: string,
  studentId: string,
) {
  const [row] = await db.select({ id: schema.parentStudents.id })
    .from(schema.parentStudents)
    .innerJoin(schema.parents, and(
      eq(schema.parents.schoolId, schoolId),
      eq(schema.parents.id, schema.parentStudents.parentId),
      eq(schema.parents.userId, userId),
      eq(schema.parents.status, 'ACTIVE'),
    ))
    .where(and(
      eq(schema.parentStudents.schoolId, schoolId),
      eq(schema.parentStudents.studentId, studentId),
      eq(schema.parentStudents.status, 'ACTIVE'),
    )).limit(1);
  return row !== undefined;
}

export async function listChildAcademicYears(db: ParentsDb, schoolId: string, studentId: string) {
  return db.selectDistinct({
    id: schema.academicYears.id,
    name: schema.academicYears.name,
    status: schema.academicYears.status,
    startDate: schema.academicYears.startDate,
    endDate: schema.academicYears.endDate,
  }).from(schema.studentEnrollments)
    .innerJoin(schema.academicYears, and(
      eq(schema.academicYears.schoolId, schoolId),
      eq(schema.academicYears.id, schema.studentEnrollments.academicYearId),
    ))
    .where(and(
      eq(schema.studentEnrollments.schoolId, schoolId),
      eq(schema.studentEnrollments.studentId, studentId),
    ))
    .orderBy(desc(schema.academicYears.startDate), desc(schema.academicYears.endDate), desc(schema.academicYears.id));
}

export async function childHasAcademicYear(
  db: ParentsDb, schoolId: string, studentId: string, academicYearId: string,
) {
  const [row] = await db.select({ id: schema.studentEnrollments.id })
    .from(schema.studentEnrollments).where(and(
      eq(schema.studentEnrollments.schoolId, schoolId),
      eq(schema.studentEnrollments.studentId, studentId),
      eq(schema.studentEnrollments.academicYearId, academicYearId),
    )).limit(1);
  return row !== undefined;
}

export async function findChildPlacement(
  db: ParentsDb, schoolId: string, studentId: string, academicYearId: string,
) {
  const [row] = await db.select({
    effectiveFrom: schema.studentEnrollments.effectiveFrom,
    effectiveUntil: schema.studentEnrollments.effectiveUntil,
    academicYearId: schema.academicYears.id,
    academicYearName: schema.academicYears.name,
    classId: schema.classes.id,
    className: schema.classes.name,
    levelId: schema.levels.id,
    levelName: schema.levels.name,
    stageId: schema.stages.id,
    stageName: schema.stages.name,
    trackId: schema.tracks.id,
    trackName: schema.tracks.name,
  }).from(schema.studentEnrollments)
    .innerJoin(schema.academicYears, and(eq(schema.academicYears.schoolId, schoolId), eq(schema.academicYears.id, schema.studentEnrollments.academicYearId)))
    .innerJoin(schema.classes, and(eq(schema.classes.schoolId, schoolId), eq(schema.classes.id, schema.studentEnrollments.classId)))
    .innerJoin(schema.levels, and(eq(schema.levels.schoolId, schoolId), eq(schema.levels.id, schema.classes.levelId)))
    .innerJoin(schema.stages, and(eq(schema.stages.schoolId, schoolId), eq(schema.stages.id, schema.levels.stageId)))
    .leftJoin(schema.tracks, and(eq(schema.tracks.schoolId, schoolId), eq(schema.tracks.id, schema.classes.trackId)))
    .where(and(
      eq(schema.studentEnrollments.schoolId, schoolId),
      eq(schema.studentEnrollments.studentId, studentId),
      eq(schema.studentEnrollments.academicYearId, academicYearId),
      eq(schema.studentEnrollments.status, 'ACTIVE'),
    )).limit(1);
  return row ?? null;
}

function publishedResultSelection() {
  return {
    publicationId: schema.resultPublications.id,
    resultValue: schema.resultPublications.resultValue,
    publicationVersion: schema.resultPublications.publicationVersion,
    publishedAt: schema.resultPublications.publishedAt,
    academicYearId: schema.academicYears.id,
    academicYearName: schema.academicYears.name,
    academicPeriodId: schema.academicPeriods.id,
    academicPeriodName: schema.academicPeriods.name,
    classId: schema.classes.id,
    className: schema.classes.name,
  } as const;
}

export async function listPublishedSubjectResults(
  db: ParentsDb, schoolId: string, studentId: string, academicYearId: string,
  academicPeriodId: string | undefined, paging: Paging,
) {
  const latest = db.select({
    resultId: schema.resultPublications.subjectResultId,
    version: max(schema.resultPublications.publicationVersion).as('version'),
  }).from(schema.resultPublications).where(and(
    eq(schema.resultPublications.schoolId, schoolId),
    eq(schema.resultPublications.studentId, studentId),
    eq(schema.resultPublications.academicYearId, academicYearId),
    eq(schema.resultPublications.resultType, 'SUBJECT'),
    academicPeriodId ? eq(schema.resultPublications.academicPeriodId, academicPeriodId) : undefined,
  )).groupBy(schema.resultPublications.subjectResultId).as('latest_subject_publications');
  const condition = and(
    eq(schema.resultPublications.schoolId, schoolId),
    eq(schema.resultPublications.studentId, studentId),
    eq(schema.resultPublications.academicYearId, academicYearId),
    eq(schema.resultPublications.resultType, 'SUBJECT'),
    academicPeriodId ? eq(schema.resultPublications.academicPeriodId, academicPeriodId) : undefined,
  );
  const base = db.select({
    ...publishedResultSelection(),
    resultId: schema.subjectResults.id,
    resultType: schema.resultPublications.resultType,
    subjectId: schema.subjects.id,
    subjectName: schema.subjects.name,
    subjectCode: schema.subjects.code,
  }).from(schema.resultPublications)
    .innerJoin(latest, and(eq(latest.resultId, schema.resultPublications.subjectResultId), eq(latest.version, schema.resultPublications.publicationVersion)))
    .innerJoin(schema.subjectResults, and(eq(schema.subjectResults.schoolId, schoolId), eq(schema.subjectResults.id, schema.resultPublications.subjectResultId)))
    .innerJoin(schema.subjects, and(eq(schema.subjects.schoolId, schoolId), eq(schema.subjects.id, schema.subjectResults.subjectId)))
    .innerJoin(schema.academicYears, and(eq(schema.academicYears.schoolId, schoolId), eq(schema.academicYears.id, schema.resultPublications.academicYearId)))
    .innerJoin(schema.academicPeriods, and(eq(schema.academicPeriods.schoolId, schoolId), eq(schema.academicPeriods.id, schema.resultPublications.academicPeriodId)))
    .innerJoin(schema.classes, and(eq(schema.classes.schoolId, schoolId), eq(schema.classes.id, schema.resultPublications.classId)))
    .where(condition);
  const totals = await db.select({ value: count() }).from(latest);
  const rows = await base.orderBy(desc(schema.resultPublications.publishedAt), desc(schema.resultPublications.id)).limit(paging.limit).offset(paging.offset);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function listPublishedPeriodResults(
  db: ParentsDb, schoolId: string, studentId: string, academicYearId: string,
  academicPeriodId: string | undefined, paging: Paging,
) {
  const latest = db.select({ resultId: schema.resultPublications.periodResultId, version: max(schema.resultPublications.publicationVersion).as('version') })
    .from(schema.resultPublications).where(and(
      eq(schema.resultPublications.schoolId, schoolId), eq(schema.resultPublications.studentId, studentId),
      eq(schema.resultPublications.academicYearId, academicYearId), eq(schema.resultPublications.resultType, 'PERIOD'),
      academicPeriodId ? eq(schema.resultPublications.academicPeriodId, academicPeriodId) : undefined,
    )).groupBy(schema.resultPublications.periodResultId).as('latest_period_publications');
  const rows = await db.select({
    ...publishedResultSelection(), resultId: schema.periodResults.id, resultType: schema.resultPublications.resultType,
    subjectId: sql<string | null>`null`, subjectName: sql<string | null>`null`, subjectCode: sql<string | null>`null`,
  }).from(schema.resultPublications)
    .innerJoin(latest, and(eq(latest.resultId, schema.resultPublications.periodResultId), eq(latest.version, schema.resultPublications.publicationVersion)))
    .innerJoin(schema.periodResults, and(eq(schema.periodResults.schoolId, schoolId), eq(schema.periodResults.id, schema.resultPublications.periodResultId)))
    .innerJoin(schema.academicYears, and(eq(schema.academicYears.schoolId, schoolId), eq(schema.academicYears.id, schema.resultPublications.academicYearId)))
    .innerJoin(schema.academicPeriods, and(eq(schema.academicPeriods.schoolId, schoolId), eq(schema.academicPeriods.id, schema.resultPublications.academicPeriodId)))
    .innerJoin(schema.classes, and(eq(schema.classes.schoolId, schoolId), eq(schema.classes.id, schema.resultPublications.classId)))
    .where(and(
      eq(schema.resultPublications.schoolId, schoolId), eq(schema.resultPublications.studentId, studentId),
      eq(schema.resultPublications.academicYearId, academicYearId), eq(schema.resultPublications.resultType, 'PERIOD'),
      academicPeriodId ? eq(schema.resultPublications.academicPeriodId, academicPeriodId) : undefined,
    )).orderBy(desc(schema.resultPublications.publishedAt), desc(schema.resultPublications.id)).limit(paging.limit).offset(paging.offset);
  const totals = await db.select({ value: count() }).from(latest);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function listPublishedAnnualResults(
  db: ParentsDb, schoolId: string, studentId: string, academicYearId: string, paging: Paging,
) {
  const latest = db.select({ resultId: schema.resultPublications.annualResultId, version: max(schema.resultPublications.publicationVersion).as('version') })
    .from(schema.resultPublications).where(and(
      eq(schema.resultPublications.schoolId, schoolId), eq(schema.resultPublications.studentId, studentId),
      eq(schema.resultPublications.academicYearId, academicYearId), eq(schema.resultPublications.resultType, 'ANNUAL'),
    )).groupBy(schema.resultPublications.annualResultId).as('latest_annual_publications');
  const rows = await db.select({
    ...publishedResultSelection(), resultId: schema.annualResults.id, resultType: schema.resultPublications.resultType,
    subjectId: sql<string | null>`null`, subjectName: sql<string | null>`null`, subjectCode: sql<string | null>`null`,
  }).from(schema.resultPublications)
    .innerJoin(latest, and(eq(latest.resultId, schema.resultPublications.annualResultId), eq(latest.version, schema.resultPublications.publicationVersion)))
    .innerJoin(schema.annualResults, and(eq(schema.annualResults.schoolId, schoolId), eq(schema.annualResults.id, schema.resultPublications.annualResultId)))
    .innerJoin(schema.academicYears, and(eq(schema.academicYears.schoolId, schoolId), eq(schema.academicYears.id, schema.resultPublications.academicYearId)))
    .leftJoin(schema.academicPeriods, eq(schema.academicPeriods.id, schema.resultPublications.academicPeriodId))
    .innerJoin(schema.classes, and(eq(schema.classes.schoolId, schoolId), eq(schema.classes.id, schema.resultPublications.classId)))
    .where(and(
      eq(schema.resultPublications.schoolId, schoolId), eq(schema.resultPublications.studentId, studentId),
      eq(schema.resultPublications.academicYearId, academicYearId), eq(schema.resultPublications.resultType, 'ANNUAL'),
    )).orderBy(desc(schema.resultPublications.publishedAt), desc(schema.resultPublications.id)).limit(paging.limit).offset(paging.offset);
  const totals = await db.select({ value: count() }).from(latest);
  return { rows, total: totals[0]?.value ?? 0 };
}
