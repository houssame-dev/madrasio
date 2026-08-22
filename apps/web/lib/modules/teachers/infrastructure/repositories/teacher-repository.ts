import {
  and, asc, count, desc, eq, exists, ilike, or, type SQL,
} from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@school/database';

export type TeachersDb = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface Paging { limit: number; offset: number }
export interface TeacherFilters {
  status?: typeof schema.teacherStatus.enumValues[number];
  teacherCode?: string;
  search?: string;
  academicYearId?: string;
  classId?: string;
  subjectId?: string;
}
export interface AssignmentFilters {
  status?: typeof schema.teacherAssignmentStatus.enumValues[number];
  academicYearId?: string;
  classId?: string;
  subjectId?: string;
}

function where(conditions: (SQL | undefined)[]): SQL | undefined {
  return and(...conditions.filter((condition): condition is SQL => condition !== undefined));
}

function assignmentFilterCondition(
  db: TeachersDb,
  schoolId: string,
  filters: TeacherFilters,
): SQL | undefined {
  if (!filters.academicYearId && !filters.classId && !filters.subjectId) return undefined;
  return exists(
    db.select({ id: schema.teacherAssignments.id })
      .from(schema.teacherAssignments)
      .where(and(
        eq(schema.teacherAssignments.schoolId, schoolId),
        eq(schema.teacherAssignments.teacherId, schema.teachers.id),
        eq(schema.teacherAssignments.status, 'ACTIVE'),
        filters.academicYearId
          ? eq(schema.teacherAssignments.academicYearId, filters.academicYearId)
          : undefined,
        filters.classId ? eq(schema.teacherAssignments.classId, filters.classId) : undefined,
        filters.subjectId ? eq(schema.teacherAssignments.subjectId, filters.subjectId) : undefined,
      )),
  );
}

function teacherConditions(
  db: TeachersDb,
  schoolId: string,
  filters: TeacherFilters,
  userId?: string,
): (SQL | undefined)[] {
  return [
    eq(schema.teachers.schoolId, schoolId),
    userId ? eq(schema.teachers.userId, userId) : undefined,
    filters.status ? eq(schema.teachers.status, filters.status) : undefined,
    filters.teacherCode ? eq(schema.teachers.teacherCode, filters.teacherCode) : undefined,
    filters.search
      ? or(
          ilike(schema.teachers.firstName, `%${filters.search}%`),
          ilike(schema.teachers.lastName, `%${filters.search}%`),
          ilike(schema.teachers.teacherCode, `%${filters.search}%`),
        )
      : undefined,
    assignmentFilterCondition(db, schoolId, filters),
  ];
}

export async function listTeachers(
  db: TeachersDb,
  schoolId: string,
  paging: Paging,
  filters: TeacherFilters,
  userId?: string,
) {
  const condition = where(teacherConditions(db, schoolId, filters, userId));
  const [rows, totals] = await Promise.all([
    db.select().from(schema.teachers).where(condition)
      .orderBy(asc(schema.teachers.lastName), asc(schema.teachers.firstName), asc(schema.teachers.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.teachers).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function findTeacher(db: TeachersDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.teachers).where(and(
    eq(schema.teachers.schoolId, schoolId), eq(schema.teachers.id, id),
  )).limit(1);
  return row ?? null;
}

export async function insertTeacher(
  db: TeachersDb,
  schoolId: string,
  input: Omit<typeof schema.teachers.$inferInsert, 'schoolId'>,
) {
  const [row] = await db.insert(schema.teachers).values({ ...input, schoolId }).returning();
  return row;
}

export async function updateTeacher(
  db: TeachersDb,
  schoolId: string,
  id: string,
  input: Partial<typeof schema.teachers.$inferInsert>,
) {
  const [row] = await db.update(schema.teachers).set({ ...input, updatedAt: new Date() })
    .where(and(eq(schema.teachers.schoolId, schoolId), eq(schema.teachers.id, id))).returning();
  return row ?? null;
}

export async function findUser(db: TeachersDb, id: string) {
  const [row] = await db.select({ id: schema.users.id, status: schema.users.status })
    .from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return row ?? null;
}

export async function findMembership(db: TeachersDb, schoolId: string, userId: string) {
  const [row] = await db.select({
    id: schema.schoolMemberships.id,
    status: schema.schoolMemberships.status,
    role: schema.schoolMemberships.role,
  }).from(schema.schoolMemberships).where(and(
    eq(schema.schoolMemberships.schoolId, schoolId),
    eq(schema.schoolMemberships.userId, userId),
  )).limit(1);
  return row ?? null;
}

export async function findAcademicYear(db: TeachersDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.academicYears).where(and(
    eq(schema.academicYears.schoolId, schoolId), eq(schema.academicYears.id, id),
  )).limit(1);
  return row ?? null;
}

export async function findClass(db: TeachersDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.classes).where(and(
    eq(schema.classes.schoolId, schoolId), eq(schema.classes.id, id),
  )).limit(1);
  return row ?? null;
}

export async function findSubject(db: TeachersDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.subjects).where(and(
    eq(schema.subjects.schoolId, schoolId), eq(schema.subjects.id, id),
  )).limit(1);
  return row ?? null;
}

export async function listAssignments(
  db: TeachersDb,
  schoolId: string,
  teacherId: string,
  paging: Paging,
  filters: AssignmentFilters,
) {
  const condition = where([
    eq(schema.teacherAssignments.schoolId, schoolId),
    eq(schema.teacherAssignments.teacherId, teacherId),
    filters.status ? eq(schema.teacherAssignments.status, filters.status) : undefined,
    filters.academicYearId
      ? eq(schema.teacherAssignments.academicYearId, filters.academicYearId)
      : undefined,
    filters.classId ? eq(schema.teacherAssignments.classId, filters.classId) : undefined,
    filters.subjectId ? eq(schema.teacherAssignments.subjectId, filters.subjectId) : undefined,
  ]);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.teacherAssignments).where(condition)
      .orderBy(
        desc(schema.teacherAssignments.effectiveFrom),
        desc(schema.teacherAssignments.createdAt),
        desc(schema.teacherAssignments.id),
      ).limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.teacherAssignments).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function findAssignment(db: TeachersDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.teacherAssignments).where(and(
    eq(schema.teacherAssignments.schoolId, schoolId),
    eq(schema.teacherAssignments.id, id),
  )).limit(1);
  return row ?? null;
}

export async function findActiveLogicalAssignment(
  db: TeachersDb,
  input: {
    schoolId: string;
    teacherId: string;
    academicYearId: string;
    classId: string;
    subjectId: string;
  },
) {
  const [row] = await db.select().from(schema.teacherAssignments).where(and(
    eq(schema.teacherAssignments.schoolId, input.schoolId),
    eq(schema.teacherAssignments.teacherId, input.teacherId),
    eq(schema.teacherAssignments.academicYearId, input.academicYearId),
    eq(schema.teacherAssignments.classId, input.classId),
    eq(schema.teacherAssignments.subjectId, input.subjectId),
    eq(schema.teacherAssignments.status, 'ACTIVE'),
  )).limit(1);
  return row ?? null;
}

export async function insertAssignment(
  db: TeachersDb,
  input: typeof schema.teacherAssignments.$inferInsert,
) {
  const [row] = await db.insert(schema.teacherAssignments).values(input).returning();
  return row;
}

export async function endAssignmentIfActive(
  db: TeachersDb,
  schoolId: string,
  id: string,
  effectiveUntil: string,
) {
  const [row] = await db.update(schema.teacherAssignments)
    .set({ status: 'ENDED', effectiveUntil, updatedAt: new Date() })
    .where(and(
      eq(schema.teacherAssignments.schoolId, schoolId),
      eq(schema.teacherAssignments.id, id),
      eq(schema.teacherAssignments.status, 'ACTIVE'),
    )).returning();
  return row ?? null;
}
