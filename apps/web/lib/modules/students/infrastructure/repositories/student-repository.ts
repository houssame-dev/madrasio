import {
  and, asc, count, countDistinct, desc, eq, exists, gte, ilike, isNull, lte, or, type SQL,
} from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@school/database';

export type StudentsDb = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface Paging { limit: number; offset: number }
export interface StudentFilters {
  status?: typeof schema.studentStatus.enumValues[number];
  studentCode?: string;
  search?: string;
  academicYearId?: string;
  classId?: string;
}

function where(conditions: (SQL | undefined)[]): SQL | undefined {
  return and(...conditions.filter((condition): condition is SQL => condition !== undefined));
}

function studentConditions(schoolId: string, filters: StudentFilters): (SQL | undefined)[] {
  return [
    eq(schema.students.schoolId, schoolId),
    filters.status ? eq(schema.students.status, filters.status) : undefined,
    filters.studentCode ? eq(schema.students.studentCode, filters.studentCode) : undefined,
    filters.search
      ? or(
          ilike(schema.students.firstName, `%${filters.search}%`),
          ilike(schema.students.lastName, `%${filters.search}%`),
          ilike(schema.students.studentCode, `%${filters.search}%`),
        )
      : undefined,
  ];
}

function placementCondition(db: StudentsDb, schoolId: string, filters: StudentFilters): SQL | undefined {
  if (!filters.academicYearId) return undefined;
  return exists(
    db.select({ id: schema.studentEnrollments.id })
      .from(schema.studentEnrollments)
      .where(and(
        eq(schema.studentEnrollments.schoolId, schoolId),
        eq(schema.studentEnrollments.studentId, schema.students.id),
        eq(schema.studentEnrollments.academicYearId, filters.academicYearId),
        eq(schema.studentEnrollments.status, 'ACTIVE'),
        filters.classId ? eq(schema.studentEnrollments.classId, filters.classId) : undefined,
      )),
  );
}

export async function listStudents(
  db: StudentsDb,
  schoolId: string,
  paging: Paging,
  filters: StudentFilters,
) {
  const condition = where([
    ...studentConditions(schoolId, filters),
    placementCondition(db, schoolId, filters),
  ]);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.students).where(condition)
      .orderBy(asc(schema.students.lastName), asc(schema.students.firstName), asc(schema.students.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.students).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

/** Teacher list scope is applied in SQL, never after loading school-wide rows. */
export async function listTeacherStudents(
  db: StudentsDb,
  userId: string,
  schoolId: string,
  paging: Paging,
  filters: StudentFilters,
) {
  const condition = where([
    ...studentConditions(schoolId, filters),
    eq(schema.students.id, schema.studentEnrollments.studentId),
    eq(schema.studentEnrollments.schoolId, schoolId),
    eq(schema.studentEnrollments.status, 'ACTIVE'),
    filters.academicYearId ? eq(schema.studentEnrollments.academicYearId, filters.academicYearId) : undefined,
    filters.classId ? eq(schema.studentEnrollments.classId, filters.classId) : undefined,
    eq(schema.teacherAssignments.schoolId, schoolId),
    eq(schema.teacherAssignments.classId, schema.studentEnrollments.classId),
    eq(schema.teacherAssignments.academicYearId, schema.studentEnrollments.academicYearId),
    eq(schema.teacherAssignments.status, 'ACTIVE'),
    eq(schema.teachers.schoolId, schoolId),
    eq(schema.teachers.id, schema.teacherAssignments.teacherId),
    eq(schema.teachers.userId, userId),
    eq(schema.teachers.status, 'ACTIVE'),
  ]);
  const from = db.selectDistinct({
    id: schema.students.id,
    schoolId: schema.students.schoolId,
    firstName: schema.students.firstName,
    lastName: schema.students.lastName,
    studentCode: schema.students.studentCode,
    status: schema.students.status,
    createdAt: schema.students.createdAt,
    updatedAt: schema.students.updatedAt,
  }).from(schema.students)
    .innerJoin(schema.studentEnrollments, eq(schema.studentEnrollments.studentId, schema.students.id))
    .innerJoin(schema.teacherAssignments, eq(schema.teacherAssignments.classId, schema.studentEnrollments.classId))
    .innerJoin(schema.teachers, eq(schema.teachers.id, schema.teacherAssignments.teacherId));
  const totalFrom = db.select({ value: countDistinct(schema.students.id) }).from(schema.students)
    .innerJoin(schema.studentEnrollments, eq(schema.studentEnrollments.studentId, schema.students.id))
    .innerJoin(schema.teacherAssignments, eq(schema.teacherAssignments.classId, schema.studentEnrollments.classId))
    .innerJoin(schema.teachers, eq(schema.teachers.id, schema.teacherAssignments.teacherId));
  const [rows, totals] = await Promise.all([
    from.where(condition).orderBy(asc(schema.students.lastName), asc(schema.students.firstName), asc(schema.students.id)).limit(paging.limit).offset(paging.offset),
    totalFrom.where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function findStudent(db: StudentsDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.students)
    .where(and(eq(schema.students.schoolId, schoolId), eq(schema.students.id, id))).limit(1);
  return row ?? null;
}

export async function insertStudent(
  db: StudentsDb,
  schoolId: string,
  input: Omit<typeof schema.students.$inferInsert, 'schoolId'>,
) {
  const [row] = await db.insert(schema.students).values({ ...input, schoolId }).returning();
  return row;
}

export async function updateStudent(
  db: StudentsDb,
  schoolId: string,
  id: string,
  input: Partial<typeof schema.students.$inferInsert>,
) {
  const [row] = await db.update(schema.students).set({ ...input, updatedAt: new Date() })
    .where(and(eq(schema.students.schoolId, schoolId), eq(schema.students.id, id))).returning();
  return row ?? null;
}

export async function teacherCanReadStudent(db: StudentsDb, userId: string, schoolId: string, studentId: string) {
  const [row] = await db.select({ id: schema.students.id }).from(schema.students)
    .innerJoin(schema.studentEnrollments, and(
      eq(schema.studentEnrollments.schoolId, schoolId),
      eq(schema.studentEnrollments.studentId, schema.students.id),
      eq(schema.studentEnrollments.status, 'ACTIVE'),
    ))
    .innerJoin(schema.teacherAssignments, and(
      eq(schema.teacherAssignments.schoolId, schoolId),
      eq(schema.teacherAssignments.classId, schema.studentEnrollments.classId),
      eq(schema.teacherAssignments.academicYearId, schema.studentEnrollments.academicYearId),
      eq(schema.teacherAssignments.status, 'ACTIVE'),
    ))
    .innerJoin(schema.teachers, and(
      eq(schema.teachers.schoolId, schoolId),
      eq(schema.teachers.id, schema.teacherAssignments.teacherId),
      eq(schema.teachers.userId, userId),
      eq(schema.teachers.status, 'ACTIVE'),
    ))
    .where(and(eq(schema.students.schoolId, schoolId), eq(schema.students.id, studentId))).limit(1);
  return row !== undefined;
}

export async function teacherCanReadPlacement(
  db: StudentsDb,
  userId: string,
  schoolId: string,
  classId: string,
  academicYearId: string,
) {
  const [row] = await db.select({ id: schema.teacherAssignments.id }).from(schema.teacherAssignments)
    .innerJoin(schema.teachers, and(
      eq(schema.teachers.schoolId, schoolId),
      eq(schema.teachers.id, schema.teacherAssignments.teacherId),
      eq(schema.teachers.userId, userId),
      eq(schema.teachers.status, 'ACTIVE'),
    ))
    .where(and(
      eq(schema.teacherAssignments.schoolId, schoolId),
      eq(schema.teacherAssignments.classId, classId),
      eq(schema.teacherAssignments.academicYearId, academicYearId),
      eq(schema.teacherAssignments.status, 'ACTIVE'),
    )).limit(1);
  return row !== undefined;
}

export async function parentCanReadStudent(db: StudentsDb, userId: string, schoolId: string, studentId: string) {
  const [row] = await db.select({ id: schema.parentStudents.id }).from(schema.parentStudents)
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

export async function findAcademicYear(db: StudentsDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.academicYears)
    .where(and(eq(schema.academicYears.schoolId, schoolId), eq(schema.academicYears.id, id))).limit(1);
  return row ?? null;
}

export async function findClass(db: StudentsDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.classes)
    .where(and(eq(schema.classes.schoolId, schoolId), eq(schema.classes.id, id))).limit(1);
  return row ?? null;
}

export async function findActiveEnrollment(db: StudentsDb, schoolId: string, studentId: string, academicYearId: string) {
  const [row] = await db.select().from(schema.studentEnrollments).where(and(
    eq(schema.studentEnrollments.schoolId, schoolId),
    eq(schema.studentEnrollments.studentId, studentId),
    eq(schema.studentEnrollments.academicYearId, academicYearId),
    eq(schema.studentEnrollments.status, 'ACTIVE'),
  )).limit(1);
  return row ?? null;
}

export async function findEnrollment(db: StudentsDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.studentEnrollments).where(and(
    eq(schema.studentEnrollments.schoolId, schoolId), eq(schema.studentEnrollments.id, id),
  )).limit(1);
  return row ?? null;
}

export async function listEnrollments(
  db: StudentsDb,
  schoolId: string,
  studentId: string,
  paging: Paging,
  academicYearId?: string,
) {
  const condition = where([
    eq(schema.studentEnrollments.schoolId, schoolId),
    eq(schema.studentEnrollments.studentId, studentId),
    academicYearId ? eq(schema.studentEnrollments.academicYearId, academicYearId) : undefined,
  ]);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.studentEnrollments).where(condition)
      .orderBy(desc(schema.studentEnrollments.effectiveFrom), desc(schema.studentEnrollments.createdAt), desc(schema.studentEnrollments.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.studentEnrollments).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function findEnrollmentOnDate(
  db: StudentsDb,
  schoolId: string,
  studentId: string,
  classId: string,
  date: string,
) {
  const [row] = await db.select().from(schema.studentEnrollments).where(and(
    eq(schema.studentEnrollments.schoolId, schoolId),
    eq(schema.studentEnrollments.studentId, studentId),
    eq(schema.studentEnrollments.classId, classId),
    // Inclusive effective-date semantics match Attendance validity.
    lte(schema.studentEnrollments.effectiveFrom, date),
    or(
      isNull(schema.studentEnrollments.effectiveUntil),
      gte(schema.studentEnrollments.effectiveUntil, date),
    ),
  )).orderBy(desc(schema.studentEnrollments.effectiveFrom), desc(schema.studentEnrollments.id)).limit(1);
  return row ?? null;
}

export async function insertEnrollment(
  db: StudentsDb,
  input: typeof schema.studentEnrollments.$inferInsert,
) {
  const [row] = await db.insert(schema.studentEnrollments).values(input).returning();
  return row;
}

export async function endEnrollmentIfActive(
  db: StudentsDb,
  schoolId: string,
  id: string,
  effectiveUntil: string,
) {
  const [row] = await db.update(schema.studentEnrollments)
    .set({ status: 'ENDED', effectiveUntil, updatedAt: new Date() })
    .where(and(
      eq(schema.studentEnrollments.schoolId, schoolId),
      eq(schema.studentEnrollments.id, id),
      eq(schema.studentEnrollments.status, 'ACTIVE'),
    )).returning();
  return row ?? null;
}
