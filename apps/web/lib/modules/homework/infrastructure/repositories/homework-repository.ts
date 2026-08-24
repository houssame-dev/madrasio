import {
  and, asc, count, desc, eq, exists, gte, ilike, inArray, isNull, lte, or,
  type SQL,
} from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@school/database';

import type { HomeworkListInput, SubmissionListInput } from '../../domain/contracts';

export type HomeworkDb = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface Paging { limit: number; offset: number }

function where(conditions: (SQL | undefined)[]): SQL | undefined {
  return and(...conditions.filter((condition): condition is SQL => condition !== undefined));
}

function teacherScope(db: HomeworkDb, schoolId: string, userId: string): SQL {
  return or(
    exists(
      db.select({ id: schema.homeworkTargets.id }).from(schema.homeworkTargets)
        .innerJoin(schema.teacherAssignments, and(
          eq(schema.teacherAssignments.schoolId, schoolId),
          eq(schema.teacherAssignments.classId, schema.homeworkTargets.classId),
          eq(schema.teacherAssignments.academicYearId, schema.homework.academicYearId),
          eq(schema.teacherAssignments.subjectId, schema.homework.subjectId),
          eq(schema.teacherAssignments.status, 'ACTIVE'),
        ))
        .innerJoin(schema.teachers, and(
          eq(schema.teachers.schoolId, schoolId),
          eq(schema.teachers.id, schema.teacherAssignments.teacherId),
          eq(schema.teachers.userId, userId),
          eq(schema.teachers.status, 'ACTIVE'),
        ))
        .where(and(
          eq(schema.homeworkTargets.schoolId, schoolId),
          eq(schema.homeworkTargets.homeworkId, schema.homework.id),
        )),
    ),
    and(
      eq(schema.homework.status, 'DRAFT'),
      exists(
        db.select({ id: schema.teachers.id }).from(schema.teachers)
          .innerJoin(schema.teacherAssignments, and(
            eq(schema.teacherAssignments.schoolId, schoolId),
            eq(schema.teacherAssignments.teacherId, schema.teachers.id),
            eq(schema.teacherAssignments.subjectId, schema.homework.subjectId),
            eq(schema.teacherAssignments.academicYearId, schema.homework.academicYearId),
            eq(schema.teacherAssignments.status, 'ACTIVE'),
          ))
          .where(and(
            eq(schema.teachers.schoolId, schoolId),
            eq(schema.teachers.id, schema.homework.teacherId),
            eq(schema.teachers.userId, userId),
            eq(schema.teachers.status, 'ACTIVE'),
          )),
      ),
    ),
  )!;
}

export async function listHomework(
  db: HomeworkDb,
  schoolId: string,
  paging: Paging,
  filters: HomeworkListInput,
  teacherUserId?: string,
) {
  const condition = where([
    eq(schema.homework.schoolId, schoolId),
    filters.status ? eq(schema.homework.status, filters.status) : undefined,
    filters.academicYearId ? eq(schema.homework.academicYearId, filters.academicYearId) : undefined,
    filters.dueFrom ? gte(schema.homework.dueDate, filters.dueFrom) : undefined,
    filters.dueTo ? lte(schema.homework.dueDate, filters.dueTo) : undefined,
    filters.search ? ilike(schema.homework.title, `%${filters.search}%`) : undefined,
    filters.classId ? exists(
      db.select({ id: schema.homeworkTargets.id }).from(schema.homeworkTargets).where(and(
        eq(schema.homeworkTargets.schoolId, schoolId),
        eq(schema.homeworkTargets.homeworkId, schema.homework.id),
        eq(schema.homeworkTargets.classId, filters.classId),
      )),
    ) : undefined,
    teacherUserId ? teacherScope(db, schoolId, teacherUserId) : undefined,
  ]);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.homework).where(condition)
      .orderBy(desc(schema.homework.dueDate), desc(schema.homework.createdAt), desc(schema.homework.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.homework).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function findHomework(db: HomeworkDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.homework).where(and(
    eq(schema.homework.schoolId, schoolId), eq(schema.homework.id, id),
  )).limit(1);
  return row ?? null;
}

export async function findAcademicContext(
  db: HomeworkDb,
  schoolId: string,
  input: { subjectId: string; academicYearId: string; academicPeriodId: string },
) {
  const [row] = await db.select({
    subject: schema.subjects,
    academicYear: schema.academicYears,
    academicPeriod: schema.academicPeriods,
    timezone: schema.schools.timezone,
  }).from(schema.academicPeriods)
    .innerJoin(schema.academicYears, and(
      eq(schema.academicYears.schoolId, schema.academicPeriods.schoolId),
      eq(schema.academicYears.id, schema.academicPeriods.academicYearId),
    ))
    .innerJoin(schema.subjects, and(
      eq(schema.subjects.schoolId, schoolId), eq(schema.subjects.id, input.subjectId),
    ))
    .innerJoin(schema.schools, eq(schema.schools.id, schoolId))
    .where(and(
      eq(schema.academicPeriods.schoolId, schoolId),
      eq(schema.academicPeriods.id, input.academicPeriodId),
      eq(schema.academicPeriods.academicYearId, input.academicYearId),
    )).limit(1);
  return row ?? null;
}

export async function findActiveAuthorTeacher(
  db: HomeworkDb,
  schoolId: string,
  userId: string,
  subjectId: string,
  academicYearId: string,
) {
  const [row] = await db.select({ id: schema.teachers.id }).from(schema.teachers)
    .innerJoin(schema.teacherAssignments, and(
      eq(schema.teacherAssignments.schoolId, schoolId),
      eq(schema.teacherAssignments.teacherId, schema.teachers.id),
      eq(schema.teacherAssignments.subjectId, subjectId),
      eq(schema.teacherAssignments.academicYearId, academicYearId),
      eq(schema.teacherAssignments.status, 'ACTIVE'),
    ))
    .where(and(
      eq(schema.teachers.schoolId, schoolId),
      eq(schema.teachers.userId, userId),
      eq(schema.teachers.status, 'ACTIVE'),
    )).orderBy(asc(schema.teachers.id)).limit(1);
  return row ?? null;
}

export async function insertHomework(
  db: HomeworkDb,
  input: typeof schema.homework.$inferInsert,
) {
  const [row] = await db.insert(schema.homework).values(input).returning();
  return row;
}

export async function updateHomework(
  db: HomeworkDb,
  schoolId: string,
  id: string,
  input: Partial<typeof schema.homework.$inferInsert>,
) {
  const [row] = await db.update(schema.homework).set({ ...input, updatedAt: new Date() }).where(and(
    eq(schema.homework.schoolId, schoolId), eq(schema.homework.id, id),
  )).returning();
  return row ?? null;
}

export async function listTargets(db: HomeworkDb, schoolId: string, homeworkId: string) {
  return db.select().from(schema.homeworkTargets).where(and(
    eq(schema.homeworkTargets.schoolId, schoolId),
    eq(schema.homeworkTargets.homeworkId, homeworkId),
  )).orderBy(asc(schema.homeworkTargets.createdAt), asc(schema.homeworkTargets.id));
}

export async function findClasses(db: HomeworkDb, schoolId: string, classIds: string[]) {
  if (classIds.length === 0) return [];
  return db.select().from(schema.classes).where(and(
    eq(schema.classes.schoolId, schoolId), inArray(schema.classes.id, classIds),
  ));
}

export async function insertTargets(
  db: HomeworkDb,
  values: (typeof schema.homeworkTargets.$inferInsert)[],
) {
  return db.insert(schema.homeworkTargets).values(values).returning();
}

export async function findParentEligibleStudent(
  db: HomeworkDb,
  input: { schoolId: string; userId: string; homeworkId: string; dueDate: string; studentId?: string },
) {
  const [row] = await db.select({ studentId: schema.students.id }).from(schema.students)
    .innerJoin(schema.parentStudents, and(
      eq(schema.parentStudents.schoolId, input.schoolId),
      eq(schema.parentStudents.studentId, schema.students.id),
      eq(schema.parentStudents.status, 'ACTIVE'),
    ))
    .innerJoin(schema.parents, and(
      eq(schema.parents.schoolId, input.schoolId),
      eq(schema.parents.id, schema.parentStudents.parentId),
      eq(schema.parents.userId, input.userId),
      eq(schema.parents.status, 'ACTIVE'),
    ))
    .innerJoin(schema.studentEnrollments, and(
      eq(schema.studentEnrollments.schoolId, input.schoolId),
      eq(schema.studentEnrollments.studentId, schema.students.id),
      lte(schema.studentEnrollments.effectiveFrom, input.dueDate),
      or(isNull(schema.studentEnrollments.effectiveUntil), gte(schema.studentEnrollments.effectiveUntil, input.dueDate)),
    ))
    .innerJoin(schema.homeworkTargets, and(
      eq(schema.homeworkTargets.schoolId, input.schoolId),
      eq(schema.homeworkTargets.homeworkId, input.homeworkId),
      eq(schema.homeworkTargets.classId, schema.studentEnrollments.classId),
      eq(schema.homeworkTargets.academicYearId, schema.studentEnrollments.academicYearId),
    ))
    .where(and(
      eq(schema.students.schoolId, input.schoolId),
      input.studentId ? eq(schema.students.id, input.studentId) : undefined,
    )).orderBy(asc(schema.students.id)).limit(1);
  return row ?? null;
}

export async function eligibleTargetClassIds(
  db: HomeworkDb,
  input: { schoolId: string; homeworkId: string; studentId: string; dueDate: string },
) {
  return db.selectDistinct({ classId: schema.homeworkTargets.classId })
    .from(schema.homeworkTargets)
    .innerJoin(schema.studentEnrollments, and(
      eq(schema.studentEnrollments.schoolId, input.schoolId),
      eq(schema.studentEnrollments.classId, schema.homeworkTargets.classId),
      eq(schema.studentEnrollments.academicYearId, schema.homeworkTargets.academicYearId),
      eq(schema.studentEnrollments.studentId, input.studentId),
      lte(schema.studentEnrollments.effectiveFrom, input.dueDate),
      or(isNull(schema.studentEnrollments.effectiveUntil), gte(schema.studentEnrollments.effectiveUntil, input.dueDate)),
    ))
    .where(and(
      eq(schema.homeworkTargets.schoolId, input.schoolId),
      eq(schema.homeworkTargets.homeworkId, input.homeworkId),
    ));
}

export async function findSchoolTimezone(db: HomeworkDb, schoolId: string) {
  const [row] = await db.select({ timezone: schema.schools.timezone }).from(schema.schools)
    .where(eq(schema.schools.id, schoolId)).limit(1);
  return row?.timezone ?? 'UTC';
}

export async function insertSubmission(
  db: HomeworkDb,
  input: typeof schema.homeworkSubmissions.$inferInsert,
) {
  const [row] = await db.insert(schema.homeworkSubmissions).values(input).returning();
  return row;
}

export async function findSubmission(db: HomeworkDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.homeworkSubmissions).where(and(
    eq(schema.homeworkSubmissions.schoolId, schoolId), eq(schema.homeworkSubmissions.id, id),
  )).limit(1);
  return row ?? null;
}

export async function updateSubmission(
  db: HomeworkDb,
  schoolId: string,
  id: string,
  input: Partial<typeof schema.homeworkSubmissions.$inferInsert>,
) {
  const [row] = await db.update(schema.homeworkSubmissions).set({ ...input, updatedAt: new Date() }).where(and(
    eq(schema.homeworkSubmissions.schoolId, schoolId), eq(schema.homeworkSubmissions.id, id),
  )).returning();
  return row ?? null;
}

export async function listSubmissions(
  db: HomeworkDb,
  schoolId: string,
  homeworkId: string,
  paging: Paging,
  filters: SubmissionListInput,
  parentScopeInput?: { userId: string; dueDate: string },
) {
  const parentScope = parentScopeInput ? and(exists(
    db.select({ id: schema.parentStudents.id }).from(schema.parentStudents)
      .innerJoin(schema.parents, and(
        eq(schema.parents.schoolId, schoolId),
        eq(schema.parents.id, schema.parentStudents.parentId),
        eq(schema.parents.userId, parentScopeInput.userId),
        eq(schema.parents.status, 'ACTIVE'),
      )).where(and(
        eq(schema.parentStudents.schoolId, schoolId),
        eq(schema.parentStudents.studentId, schema.homeworkSubmissions.studentId),
        eq(schema.parentStudents.status, 'ACTIVE'),
      )),
  ), exists(
    db.select({ id: schema.studentEnrollments.id }).from(schema.studentEnrollments)
      .innerJoin(schema.homeworkTargets, and(
        eq(schema.homeworkTargets.schoolId, schoolId),
        eq(schema.homeworkTargets.homeworkId, homeworkId),
        eq(schema.homeworkTargets.classId, schema.studentEnrollments.classId),
        eq(schema.homeworkTargets.academicYearId, schema.studentEnrollments.academicYearId),
      )).where(and(
        eq(schema.studentEnrollments.schoolId, schoolId),
        eq(schema.studentEnrollments.studentId, schema.homeworkSubmissions.studentId),
        lte(schema.studentEnrollments.effectiveFrom, parentScopeInput.dueDate),
        or(
          isNull(schema.studentEnrollments.effectiveUntil),
          gte(schema.studentEnrollments.effectiveUntil, parentScopeInput.dueDate),
        ),
      )),
  )) : undefined;
  const condition = where([
    eq(schema.homeworkSubmissions.schoolId, schoolId),
    eq(schema.homeworkSubmissions.homeworkId, homeworkId),
    filters.status ? eq(schema.homeworkSubmissions.status, filters.status) : undefined,
    filters.studentId ? eq(schema.homeworkSubmissions.studentId, filters.studentId) : undefined,
    parentScope,
  ]);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.homeworkSubmissions).where(condition)
      .orderBy(desc(schema.homeworkSubmissions.submittedAt), desc(schema.homeworkSubmissions.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.homeworkSubmissions).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function listEligibleStudents(
  db: HomeworkDb,
  input: { schoolId: string; homeworkId: string; dueDate: string },
  paging: Paging,
) {
  const eligible = and(
    eq(schema.studentEnrollments.schoolId, input.schoolId),
    lte(schema.studentEnrollments.effectiveFrom, input.dueDate),
    or(isNull(schema.studentEnrollments.effectiveUntil), gte(schema.studentEnrollments.effectiveUntil, input.dueDate)),
    exists(db.select({ id: schema.homeworkTargets.id }).from(schema.homeworkTargets).where(and(
      eq(schema.homeworkTargets.schoolId, input.schoolId),
      eq(schema.homeworkTargets.homeworkId, input.homeworkId),
      eq(schema.homeworkTargets.classId, schema.studentEnrollments.classId),
      eq(schema.homeworkTargets.academicYearId, schema.studentEnrollments.academicYearId),
    ))),
  );
  const submissionJoin = and(
    eq(schema.homeworkSubmissions.schoolId, input.schoolId),
    eq(schema.homeworkSubmissions.homeworkId, input.homeworkId),
    eq(schema.homeworkSubmissions.studentId, schema.students.id),
  );
  const [rows, totals] = await Promise.all([
    db.selectDistinct({
      studentId: schema.students.id,
      firstName: schema.students.firstName,
      lastName: schema.students.lastName,
      studentCode: schema.students.studentCode,
      studentStatus: schema.students.status,
      submissionId: schema.homeworkSubmissions.id,
      submittedAt: schema.homeworkSubmissions.submittedAt,
      content: schema.homeworkSubmissions.content,
      submissionStatus: schema.homeworkSubmissions.status,
      submissionUpdatedAt: schema.homeworkSubmissions.updatedAt,
    }).from(schema.students)
      .innerJoin(schema.studentEnrollments, and(
        eq(schema.studentEnrollments.schoolId, schema.students.schoolId),
        eq(schema.studentEnrollments.studentId, schema.students.id),
      ))
      .leftJoin(schema.homeworkSubmissions, submissionJoin)
      .where(and(eq(schema.students.schoolId, input.schoolId), eligible))
      .orderBy(asc(schema.students.lastName), asc(schema.students.firstName), asc(schema.students.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.students)
      .where(and(
        eq(schema.students.schoolId, input.schoolId),
        exists(db.select({ id: schema.studentEnrollments.id }).from(schema.studentEnrollments).where(and(
          eq(schema.studentEnrollments.studentId, schema.students.id), eligible,
        ))),
      )),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}
