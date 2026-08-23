import {
  and, asc, count, countDistinct, desc, eq, exists, gte, inArray, isNull, lte, or,
  type SQL,
} from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@school/database';

export type AttendanceDb = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface Paging { limit: number; offset: number }
export interface AttendanceFilters {
  academicYearId?: string;
  classId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: typeof schema.attendanceStatus.enumValues[number];
}

function where(conditions: (SQL | undefined)[]): SQL | undefined {
  return and(...conditions.filter((condition): condition is SQL => condition !== undefined));
}

export async function findClassContext(db: AttendanceDb, schoolId: string, classId: string) {
  const [row] = await db.select({
    class: schema.classes,
    academicYear: schema.academicYears,
  }).from(schema.classes).innerJoin(
    schema.academicYears,
    and(
      eq(schema.academicYears.schoolId, schema.classes.schoolId),
      eq(schema.academicYears.id, schema.classes.academicYearId),
    ),
  ).where(and(
    eq(schema.classes.schoolId, schoolId),
    eq(schema.classes.id, classId),
  )).limit(1);
  return row ?? null;
}

export async function findStudent(db: AttendanceDb, schoolId: string, studentId: string) {
  const [row] = await db.select({ id: schema.students.id }).from(schema.students).where(and(
    eq(schema.students.schoolId, schoolId), eq(schema.students.id, studentId),
  )).limit(1);
  return row ?? null;
}

export async function findEligibleEnrollment(
  db: AttendanceDb,
  input: { schoolId: string; studentId: string; classId: string; academicYearId: string; date: string },
) {
  const [row] = await db.select({ id: schema.studentEnrollments.id })
    .from(schema.studentEnrollments).where(and(
      eq(schema.studentEnrollments.schoolId, input.schoolId),
      eq(schema.studentEnrollments.studentId, input.studentId),
      eq(schema.studentEnrollments.classId, input.classId),
      eq(schema.studentEnrollments.academicYearId, input.academicYearId),
      lte(schema.studentEnrollments.effectiveFrom, input.date),
      or(
        isNull(schema.studentEnrollments.effectiveUntil),
        gte(schema.studentEnrollments.effectiveUntil, input.date),
      ),
    )).limit(1);
  return row ?? null;
}

export async function findExistingStudentIds(
  db: AttendanceDb, schoolId: string, classId: string, date: string, studentIds: string[],
) {
  if (studentIds.length === 0) return [];
  return db.select({ studentId: schema.attendanceRecords.studentId })
    .from(schema.attendanceRecords).where(and(
      eq(schema.attendanceRecords.schoolId, schoolId),
      eq(schema.attendanceRecords.classId, classId),
      eq(schema.attendanceRecords.attendanceDate, date),
      inArray(schema.attendanceRecords.studentId, studentIds),
    ));
}

export async function upsertAttendance(
  db: AttendanceDb,
  input: typeof schema.attendanceRecords.$inferInsert,
) {
  const [row] = await db.insert(schema.attendanceRecords).values(input).onConflictDoUpdate({
    target: [
      schema.attendanceRecords.schoolId,
      schema.attendanceRecords.classId,
      schema.attendanceRecords.studentId,
      schema.attendanceRecords.attendanceDate,
    ],
    set: { status: input.status, note: input.note ?? null, updatedAt: new Date() },
  }).returning();
  return row;
}

export async function listDailyRoster(
  db: AttendanceDb,
  input: { schoolId: string; classId: string; academicYearId: string; date: string },
  paging: Paging,
) {
  const enrollmentCondition = and(
    eq(schema.studentEnrollments.schoolId, input.schoolId),
    eq(schema.studentEnrollments.classId, input.classId),
    eq(schema.studentEnrollments.academicYearId, input.academicYearId),
    lte(schema.studentEnrollments.effectiveFrom, input.date),
    or(
      isNull(schema.studentEnrollments.effectiveUntil),
      gte(schema.studentEnrollments.effectiveUntil, input.date),
    ),
  );
  const attendanceJoin = and(
    eq(schema.attendanceRecords.schoolId, input.schoolId),
    eq(schema.attendanceRecords.studentId, schema.students.id),
    eq(schema.attendanceRecords.classId, input.classId),
    eq(schema.attendanceRecords.attendanceDate, input.date),
  );
  const [rows, totals] = await Promise.all([
    db.selectDistinct({
      studentId: schema.students.id,
      firstName: schema.students.firstName,
      lastName: schema.students.lastName,
      studentCode: schema.students.studentCode,
      studentStatus: schema.students.status,
      attendanceId: schema.attendanceRecords.id,
      attendanceStatus: schema.attendanceRecords.status,
      note: schema.attendanceRecords.note,
      createdAt: schema.attendanceRecords.createdAt,
      updatedAt: schema.attendanceRecords.updatedAt,
    }).from(schema.students).innerJoin(
      schema.studentEnrollments,
      and(
        eq(schema.studentEnrollments.studentId, schema.students.id),
        eq(schema.studentEnrollments.schoolId, schema.students.schoolId),
      ),
    ).leftJoin(schema.attendanceRecords, attendanceJoin)
      .where(and(eq(schema.students.schoolId, input.schoolId), enrollmentCondition))
      .orderBy(asc(schema.students.lastName), asc(schema.students.firstName), asc(schema.students.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: countDistinct(schema.students.id) }).from(schema.students).innerJoin(
      schema.studentEnrollments,
      and(
        eq(schema.studentEnrollments.studentId, schema.students.id),
        eq(schema.studentEnrollments.schoolId, schema.students.schoolId),
      ),
    ).where(and(eq(schema.students.schoolId, input.schoolId), enrollmentCondition)),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

function teacherHistoryScope(db: AttendanceDb, schoolId: string, userId?: string): SQL | undefined {
  if (!userId) return undefined;
  return exists(
    db.select({ id: schema.teacherAssignments.id }).from(schema.teacherAssignments)
      .innerJoin(schema.teachers, and(
        eq(schema.teachers.schoolId, schoolId),
        eq(schema.teachers.id, schema.teacherAssignments.teacherId),
      )).where(and(
        eq(schema.teacherAssignments.schoolId, schoolId),
        eq(schema.teacherAssignments.status, 'ACTIVE'),
        eq(schema.teacherAssignments.classId, schema.attendanceRecords.classId),
        eq(schema.teacherAssignments.academicYearId, schema.attendanceRecords.academicYearId),
        eq(schema.teachers.userId, userId),
        eq(schema.teachers.status, 'ACTIVE'),
      )),
  );
}

export async function listStudentHistory(
  db: AttendanceDb,
  schoolId: string,
  studentId: string,
  paging: Paging,
  filters: AttendanceFilters,
  teacherUserId?: string,
) {
  const condition = where([
    eq(schema.attendanceRecords.schoolId, schoolId),
    eq(schema.attendanceRecords.studentId, studentId),
    filters.academicYearId ? eq(schema.attendanceRecords.academicYearId, filters.academicYearId) : undefined,
    filters.classId ? eq(schema.attendanceRecords.classId, filters.classId) : undefined,
    filters.dateFrom ? gte(schema.attendanceRecords.attendanceDate, filters.dateFrom) : undefined,
    filters.dateTo ? lte(schema.attendanceRecords.attendanceDate, filters.dateTo) : undefined,
    filters.status ? eq(schema.attendanceRecords.status, filters.status) : undefined,
    teacherHistoryScope(db, schoolId, teacherUserId),
  ]);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.attendanceRecords).where(condition)
      .orderBy(desc(schema.attendanceRecords.attendanceDate), desc(schema.attendanceRecords.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.attendanceRecords).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}
