import {
  and, asc, countDistinct, eq, gte, inArray, isNull, lte, or,
} from 'drizzle-orm';
import * as schema from '@school/database';

import type { GradebooksDb } from './gradebook-repository';

export interface MatrixPaging { limit: number; offset: number }

export async function findEligibleStudent(
  db: GradebooksDb,
  input: {
    schoolId: string;
    studentId: string;
    academicYearId: string;
    classId: string;
    assessmentDate: string | null;
  },
) {
  const [row] = await db.select({ id: schema.students.id })
    .from(schema.students)
    .innerJoin(schema.studentEnrollments, and(
      eq(schema.studentEnrollments.schoolId, schema.students.schoolId),
      eq(schema.studentEnrollments.studentId, schema.students.id),
    ))
    .where(and(
      eq(schema.students.schoolId, input.schoolId),
      eq(schema.students.id, input.studentId),
      eq(schema.studentEnrollments.academicYearId, input.academicYearId),
      eq(schema.studentEnrollments.classId, input.classId),
      input.assessmentDate
        ? and(
            lte(schema.studentEnrollments.effectiveFrom, input.assessmentDate),
            or(
              isNull(schema.studentEnrollments.effectiveUntil),
              gte(schema.studentEnrollments.effectiveUntil, input.assessmentDate),
            ),
          )
        : undefined,
    )).limit(1);
  return row ?? null;
}

export async function upsertGrade(
  db: GradebooksDb,
  input: typeof schema.grades.$inferInsert,
) {
  const [row] = await db.insert(schema.grades).values(input).onConflictDoUpdate({
    target: [schema.grades.assessmentId, schema.grades.studentId],
    set: { score: input.score, state: input.state, updatedAt: new Date() },
  }).returning();
  return row;
}

export async function listMatrixStudents(
  db: GradebooksDb,
  schoolId: string,
  academicYearId: string,
  classId: string,
  paging: MatrixPaging,
) {
  const condition = and(
    eq(schema.students.schoolId, schoolId),
    eq(schema.studentEnrollments.schoolId, schoolId),
    eq(schema.studentEnrollments.academicYearId, academicYearId),
    eq(schema.studentEnrollments.classId, classId),
  );
  const [rows, totals] = await Promise.all([
    db.selectDistinct({
      id: schema.students.id,
      firstName: schema.students.firstName,
      lastName: schema.students.lastName,
      studentCode: schema.students.studentCode,
      status: schema.students.status,
    }).from(schema.students).innerJoin(
      schema.studentEnrollments,
      and(
        eq(schema.studentEnrollments.studentId, schema.students.id),
        eq(schema.studentEnrollments.schoolId, schema.students.schoolId),
      ),
    ).where(condition)
      .orderBy(asc(schema.students.lastName), asc(schema.students.firstName), asc(schema.students.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: countDistinct(schema.students.id) }).from(schema.students).innerJoin(
      schema.studentEnrollments,
      and(
        eq(schema.studentEnrollments.studentId, schema.students.id),
        eq(schema.studentEnrollments.schoolId, schema.students.schoolId),
      ),
    ).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function listMatrixAssessments(
  db: GradebooksDb,
  schoolId: string,
  gradebookId: string,
  limit: number,
) {
  return db.select().from(schema.assessments).where(and(
    eq(schema.assessments.schoolId, schoolId),
    eq(schema.assessments.gradebookId, gradebookId),
  )).orderBy(asc(schema.assessments.assessmentDate), asc(schema.assessments.createdAt), asc(schema.assessments.id))
    .limit(limit);
}

export async function countMatrixAssessments(
  db: GradebooksDb,
  schoolId: string,
  gradebookId: string,
) {
  const [row] = await db.select({ value: countDistinct(schema.assessments.id) })
    .from(schema.assessments).where(and(
      eq(schema.assessments.schoolId, schoolId),
      eq(schema.assessments.gradebookId, gradebookId),
    ));
  return row?.value ?? 0;
}

export async function findMatrixGrades(
  db: GradebooksDb,
  schoolId: string,
  gradebookId: string,
  studentIds: string[],
  assessmentIds: string[],
) {
  if (studentIds.length === 0 || assessmentIds.length === 0) return [];
  return db.select().from(schema.grades).where(and(
    eq(schema.grades.schoolId, schoolId),
    eq(schema.grades.gradebookId, gradebookId),
    inArray(schema.grades.studentId, studentIds),
    inArray(schema.grades.assessmentId, assessmentIds),
  )).orderBy(asc(schema.grades.studentId), asc(schema.grades.assessmentId));
}
