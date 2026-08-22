import {
  and, asc, count, desc, eq, exists, gte, lte, type SQL,
} from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@school/database';

export type GradebooksDb = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface Paging { limit: number; offset: number }
export interface GradebookFilters {
  academicYearId?: string;
  academicPeriodId?: string;
  classId?: string;
  subjectId?: string;
  gradingConfigurationVersionId?: string;
  status?: typeof schema.gradebookStatus.enumValues[number];
}
export interface AssessmentFilters {
  status?: typeof schema.assessmentStatus.enumValues[number];
  assessmentType?: typeof schema.assessmentType.enumValues[number];
  dateFrom?: string;
  dateTo?: string;
}

function where(conditions: (SQL | undefined)[]): SQL | undefined {
  return and(...conditions.filter((condition): condition is SQL => condition !== undefined));
}

function teacherScope(
  db: GradebooksDb,
  schoolId: string,
  userId: string | undefined,
  gradebook: typeof schema.gradebooks,
): SQL | undefined {
  if (!userId) return undefined;
  return exists(
    db.select({ id: schema.teacherAssignments.id })
      .from(schema.teacherAssignments)
      .innerJoin(schema.teachers, and(
        eq(schema.teachers.id, schema.teacherAssignments.teacherId),
        eq(schema.teachers.schoolId, schema.teacherAssignments.schoolId),
      ))
      .where(and(
        eq(schema.teacherAssignments.schoolId, schoolId),
        eq(schema.teachers.userId, userId),
        eq(schema.teachers.status, 'ACTIVE'),
        eq(schema.teacherAssignments.status, 'ACTIVE'),
        eq(schema.teacherAssignments.classId, gradebook.classId),
        eq(schema.teacherAssignments.subjectId, gradebook.subjectId),
        eq(schema.teacherAssignments.academicYearId, gradebook.academicYearId),
      )),
  );
}

function gradebookConditions(
  db: GradebooksDb,
  schoolId: string,
  filters: GradebookFilters,
  teacherUserId?: string,
): (SQL | undefined)[] {
  return [
    eq(schema.gradebooks.schoolId, schoolId),
    filters.academicYearId ? eq(schema.gradebooks.academicYearId, filters.academicYearId) : undefined,
    filters.academicPeriodId ? eq(schema.gradebooks.academicPeriodId, filters.academicPeriodId) : undefined,
    filters.classId ? eq(schema.gradebooks.classId, filters.classId) : undefined,
    filters.subjectId ? eq(schema.gradebooks.subjectId, filters.subjectId) : undefined,
    filters.gradingConfigurationVersionId
      ? eq(schema.gradebooks.gradingConfigurationVersionId, filters.gradingConfigurationVersionId)
      : undefined,
    filters.status ? eq(schema.gradebooks.status, filters.status) : undefined,
    teacherScope(db, schoolId, teacherUserId, schema.gradebooks),
  ];
}

export async function listGradebooks(
  db: GradebooksDb,
  schoolId: string,
  paging: Paging,
  filters: GradebookFilters,
  teacherUserId?: string,
) {
  const condition = where(gradebookConditions(db, schoolId, filters, teacherUserId));
  const [rows, totals] = await Promise.all([
    db.select().from(schema.gradebooks).where(condition)
      .orderBy(desc(schema.gradebooks.createdAt), desc(schema.gradebooks.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.gradebooks).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function findGradebook(
  db: GradebooksDb,
  schoolId: string,
  id: string,
  teacherUserId?: string,
) {
  const [row] = await db.select().from(schema.gradebooks).where(and(
    eq(schema.gradebooks.schoolId, schoolId),
    eq(schema.gradebooks.id, id),
    teacherScope(db, schoolId, teacherUserId, schema.gradebooks),
  )).limit(1);
  return row ?? null;
}

export async function findGradebookByContext(
  db: GradebooksDb,
  schoolId: string,
  input: Pick<typeof schema.gradebooks.$inferInsert,
    'academicYearId' | 'academicPeriodId' | 'classId' | 'subjectId'>,
) {
  const [row] = await db.select({ id: schema.gradebooks.id }).from(schema.gradebooks).where(and(
    eq(schema.gradebooks.schoolId, schoolId),
    eq(schema.gradebooks.academicYearId, input.academicYearId),
    eq(schema.gradebooks.academicPeriodId, input.academicPeriodId),
    eq(schema.gradebooks.classId, input.classId),
    eq(schema.gradebooks.subjectId, input.subjectId),
  )).limit(1);
  return row ?? null;
}

export async function insertGradebook(
  db: GradebooksDb,
  input: typeof schema.gradebooks.$inferInsert,
) {
  const [row] = await db.insert(schema.gradebooks).values(input).returning();
  return row;
}

export async function updateGradebook(
  db: GradebooksDb,
  schoolId: string,
  id: string,
  input: Partial<typeof schema.gradebooks.$inferInsert>,
) {
  const [row] = await db.update(schema.gradebooks).set({ ...input, updatedAt: new Date() })
    .where(and(eq(schema.gradebooks.schoolId, schoolId), eq(schema.gradebooks.id, id))).returning();
  return row ?? null;
}

export async function findAcademicContext(db: GradebooksDb, schoolId: string, input: {
  academicYearId: string;
  academicPeriodId: string;
  classId: string;
  subjectId: string;
  gradingConfigurationVersionId: string;
}) {
  const [year, period, klass, subject, configuration] = await Promise.all([
    db.select().from(schema.academicYears).where(and(
      eq(schema.academicYears.schoolId, schoolId), eq(schema.academicYears.id, input.academicYearId),
    )).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(schema.academicPeriods).where(and(
      eq(schema.academicPeriods.schoolId, schoolId), eq(schema.academicPeriods.id, input.academicPeriodId),
    )).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(schema.classes).where(and(
      eq(schema.classes.schoolId, schoolId), eq(schema.classes.id, input.classId),
    )).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(schema.subjects).where(and(
      eq(schema.subjects.schoolId, schoolId), eq(schema.subjects.id, input.subjectId),
    )).limit(1).then((rows) => rows[0] ?? null),
    db.select({
      id: schema.gradingConfigurationVersions.id,
      status: schema.gradingConfigurationVersions.status,
      configurationStatus: schema.gradingConfigurations.status,
    }).from(schema.gradingConfigurationVersions)
      .innerJoin(schema.gradingConfigurations, and(
        eq(schema.gradingConfigurations.id, schema.gradingConfigurationVersions.gradingConfigurationId),
        eq(schema.gradingConfigurations.schoolId, schema.gradingConfigurationVersions.schoolId),
      )).where(and(
        eq(schema.gradingConfigurationVersions.schoolId, schoolId),
        eq(schema.gradingConfigurationVersions.id, input.gradingConfigurationVersionId),
      )).limit(1).then((rows) => rows[0] ?? null),
  ]);
  return { year, period, klass, subject, configuration };
}

export async function listAssessments(
  db: GradebooksDb,
  schoolId: string,
  gradebookId: string,
  paging: Paging,
  filters: AssessmentFilters,
) {
  const condition = where([
    eq(schema.assessments.schoolId, schoolId),
    eq(schema.assessments.gradebookId, gradebookId),
    filters.status ? eq(schema.assessments.status, filters.status) : undefined,
    filters.assessmentType ? eq(schema.assessments.assessmentType, filters.assessmentType) : undefined,
    filters.dateFrom ? gte(schema.assessments.assessmentDate, filters.dateFrom) : undefined,
    filters.dateTo ? lte(schema.assessments.assessmentDate, filters.dateTo) : undefined,
  ]);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.assessments).where(condition)
      .orderBy(asc(schema.assessments.assessmentDate), asc(schema.assessments.createdAt), asc(schema.assessments.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.assessments).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function findAssessment(db: GradebooksDb, schoolId: string, id: string) {
  const [row] = await db.select({
    assessment: schema.assessments,
    gradebook: schema.gradebooks,
    periodStartDate: schema.academicPeriods.startDate,
    periodEndDate: schema.academicPeriods.endDate,
  }).from(schema.assessments)
    .innerJoin(schema.gradebooks, and(
      eq(schema.gradebooks.id, schema.assessments.gradebookId),
      eq(schema.gradebooks.schoolId, schema.assessments.schoolId),
    ))
    .innerJoin(schema.academicPeriods, and(
      eq(schema.academicPeriods.id, schema.gradebooks.academicPeriodId),
      eq(schema.academicPeriods.schoolId, schema.gradebooks.schoolId),
    ))
    .where(and(eq(schema.assessments.schoolId, schoolId), eq(schema.assessments.id, id)))
    .limit(1);
  return row ?? null;
}

export async function findPeriodDates(db: GradebooksDb, schoolId: string, gradebookId: string) {
  const [row] = await db.select({
    startDate: schema.academicPeriods.startDate,
    endDate: schema.academicPeriods.endDate,
    status: schema.academicPeriods.status,
  }).from(schema.gradebooks).innerJoin(schema.academicPeriods, and(
    eq(schema.academicPeriods.id, schema.gradebooks.academicPeriodId),
    eq(schema.academicPeriods.schoolId, schema.gradebooks.schoolId),
  )).where(and(eq(schema.gradebooks.schoolId, schoolId), eq(schema.gradebooks.id, gradebookId))).limit(1);
  return row ?? null;
}

export async function insertAssessment(
  db: GradebooksDb,
  input: typeof schema.assessments.$inferInsert,
) {
  const [row] = await db.insert(schema.assessments).values(input).returning();
  return row;
}

export async function updateAssessment(
  db: GradebooksDb,
  schoolId: string,
  id: string,
  input: Partial<typeof schema.assessments.$inferInsert>,
) {
  const [row] = await db.update(schema.assessments).set({ ...input, updatedAt: new Date() })
    .where(and(eq(schema.assessments.schoolId, schoolId), eq(schema.assessments.id, id))).returning();
  return row ?? null;
}

export async function assessmentHasGrades(db: GradebooksDb, schoolId: string, assessmentId: string) {
  const [row] = await db.select({ value: count() }).from(schema.grades).where(and(
    eq(schema.grades.schoolId, schoolId), eq(schema.grades.assessmentId, assessmentId),
  ));
  return (row?.value ?? 0) > 0;
}
