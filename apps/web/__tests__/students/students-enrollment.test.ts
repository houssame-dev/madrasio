import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@school/database';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { ForbiddenError } from '@/lib/errors';
import { validateAttendanceContext } from '@/lib/modules/attendance';
import * as app from '@/lib/modules/students/application';
import { studentPatchSchema } from '@/lib/modules/students/domain';

import {
  createActor, createStudentsTestContext, seedParentRelationship, seedStudent,
  seedTeacherScope, type StudentsTestContext,
} from './test-helpers';
import { seedMembership, seedSchool, seedUser } from '../auth/test-helpers';

let context: StudentsTestContext;
beforeEach(async () => { context = await createStudentsTestContext(); });

async function enroll(studentId: string, classId = context.classAId, effectiveFrom = '2025-09-01') {
  return app.createEnrollment(context.db, context.admin, studentId, {
    academicYearId: context.yearId, classId, effectiveFrom,
  });
}

describe('Student identity and lifecycle', () => {
  it('creates, lists, searches, safely patches, and hides foreign School students', async () => {
    const student = await app.createStudent(context.db, context.admin, {
      firstName: 'Amine', lastName: 'Benali', studentCode: 'S-001',
    });
    expect(student).not.toHaveProperty('classId');
    expect((await app.listStudents(context.db, context.admin, { page: 1, pageSize: 50, search: 'amine' })).data).toHaveLength(1);
    expect((await app.patchStudent(context.db, context.admin, student.id, { firstName: 'Amin' })).firstName).toBe('Amin');

    const other = await createStudentsTestContext();
    await expect(app.getStudent(other.db, other.admin, student.id)).rejects.toMatchObject({ featureCode: 'STUDENT_NOT_FOUND' });
  });

  it('rejects placement and authoritative fields in Student PATCH', () => {
    for (const field of ['schoolId', 'classId', 'academicYearId', 'currentEnrollment', 'userId']) {
      expect(studentPatchSchema.safeParse({ [field]: randomUUID() }).success).toBe(false);
    }
  });

  it('surfaces duplicate optional Student codes and preserves NULL-code semantics', async () => {
    await app.createStudent(context.db, context.admin, { firstName: 'A', lastName: 'One', studentCode: 'S-1' });
    await expect(app.createStudent(context.db, context.admin, { firstName: 'B', lastName: 'Two', studentCode: 'S-1' })).rejects.toMatchObject({ featureCode: 'DUPLICATE_STUDENT_CODE' });
    await app.createStudent(context.db, context.admin, { firstName: 'C', lastName: 'Three' });
    await app.createStudent(context.db, context.admin, { firstName: 'D', lastName: 'Four' });
  });

  it('uses the conservative lifecycle graph without mutating enrollment history', async () => {
    const student = await seedStudent(context.test, context.schoolId);
    const enrollment = await enroll(student.id);
    expect((await app.patchStudent(context.db, context.admin, student.id, { status: 'INACTIVE' })).status).toBe('INACTIVE');
    await expect(app.patchStudent(context.db, context.admin, student.id, { status: 'ARCHIVED' })).resolves.toMatchObject({ status: 'ARCHIVED' });
    const [preserved] = await context.test.seed.select().from(schema.studentEnrollments).where(eq(schema.studentEnrollments.id, enrollment.id));
    expect(preserved.status).toBe('ACTIVE');
    await expect(app.patchStudent(context.db, context.admin, student.id, { status: 'ACTIVE' })).rejects.toMatchObject({ featureCode: 'INVALID_STUDENT_STATUS_TRANSITION' });
  });
});

describe('Initial enrollment and exact academic context', () => {
  it('creates one ACTIVE year-specific enrollment and derives list/current placement from it', async () => {
    const student = await seedStudent(context.test, context.schoolId);
    const enrollment = await enroll(student.id);
    expect(enrollment).toMatchObject({ studentId: student.id, academicYearId: context.yearId, classId: context.classAId, status: 'ACTIVE' });
    const filtered = await app.listStudents(context.db, context.admin, { page: 1, pageSize: 50, academicYearId: context.yearId, classId: context.classAId });
    expect(filtered.data.map((row) => row.id)).toEqual([student.id]);
    expect(await app.getCurrentEnrollment(context.db, context.admin, student.id, context.yearId)).toMatchObject({ id: enrollment.id });
  });

  it('requires academicYearId with classId filters', async () => {
    await expect(app.listStudents(context.db, context.admin, { page: 1, pageSize: 50, classId: context.classAId })).rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });
  });

  it('rejects duplicate ACTIVE enrollment and non-ACTIVE Students', async () => {
    const student = await seedStudent(context.test, context.schoolId);
    await enroll(student.id);
    await expect(enroll(student.id, context.classBId)).rejects.toMatchObject({ featureCode: 'DUPLICATE_ENROLLMENT' });
    await app.patchStudent(context.db, context.admin, student.id, { status: 'INACTIVE' });
    const year2 = randomUUID();
    await context.test.seed.insert(schema.academicYears).values({ id: year2, schoolId: context.schoolId, name: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-01' });
    const [class2] = await context.test.seed.insert(schema.classes).values({ schoolId: context.schoolId, academicYearId: year2, levelId: context.levelId, curriculumVersionId: context.curriculumVersionId, name: 'Class 2' }).returning();
    await expect(app.createEnrollment(context.db, context.admin, student.id, { academicYearId: year2, classId: class2.id, effectiveFrom: '2026-09-01' })).rejects.toMatchObject({ featureCode: 'STUDENT_NOT_ENROLLABLE' });
  });

  it('rejects cross-year/cross-school and non-operational placement targets', async () => {
    const student = await seedStudent(context.test, context.schoolId);
    const otherYear = randomUUID();
    await context.test.seed.insert(schema.academicYears).values({ id: otherYear, schoolId: context.schoolId, name: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-01' });
    await expect(app.createEnrollment(context.db, context.admin, student.id, { academicYearId: otherYear, classId: context.classAId, effectiveFrom: '2026-09-01' })).rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });

    await context.test.seed.update(schema.classes).set({ status: 'CLOSED' }).where(eq(schema.classes.id, context.classAId));
    await expect(enroll(student.id)).rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });
    await context.test.seed.update(schema.classes).set({ status: 'ACTIVE' }).where(eq(schema.classes.id, context.classAId));
    await context.test.seed.update(schema.academicYears).set({ status: 'CLOSED' }).where(eq(schema.academicYears.id, context.yearId));
    await expect(enroll(student.id)).rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });

    const foreign = await createStudentsTestContext();
    await expect(app.createEnrollment(context.db, context.admin, student.id, { academicYearId: foreign.yearId, classId: foreign.classAId, effectiveFrom: '2025-09-01' })).rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });
  });
});

describe('Transfer, end, history, rollback, and concurrency', () => {
  it('transfers atomically with inclusive previous-day semantics and preserves deterministic history', async () => {
    const student = await seedStudent(context.test, context.schoolId); const first = await enroll(student.id);
    const result = await app.transferStudent(context.db, context.admin, student.id, { academicYearId: context.yearId, toClassId: context.classBId, effectiveDate: '2025-10-15' });
    expect(result.previousEnrollment).toMatchObject({ id: first.id, classId: context.classAId, status: 'ENDED', effectiveUntil: '2025-10-14' });
    expect(result.currentEnrollment).toMatchObject({ classId: context.classBId, status: 'ACTIVE', effectiveFrom: '2025-10-15' });
    const history = await app.listEnrollmentHistory(context.db, context.admin, student.id, { page: 1, pageSize: 50 });
    expect(history.data.map((row) => row.classId)).toEqual([context.classBId, context.classAId]);
    expect(await app.getEnrollmentOnDate(context.db, context.admin, { studentId: student.id, classId: context.classAId, date: '2025-10-14' })).toMatchObject({ id: first.id });
  });

  it('rejects same-Class and same-day/backdated transfers', async () => {
    const student = await seedStudent(context.test, context.schoolId); await enroll(student.id);
    await expect(app.transferStudent(context.db, context.admin, student.id, { academicYearId: context.yearId, toClassId: context.classAId, effectiveDate: '2025-10-01' })).rejects.toMatchObject({ featureCode: 'SAME_CLASS_TRANSFER' });
    await expect(app.transferStudent(context.db, context.admin, student.id, { academicYearId: context.yearId, toClassId: context.classBId, effectiveDate: '2025-09-01' })).rejects.toMatchObject({ featureCode: 'INVALID_TRANSFER_DATE' });
  });

  it('rolls back ending the old enrollment when the new insert fails', async () => {
    const student = await seedStudent(context.test, context.schoolId); const first = await enroll(student.id);
    await context.test.client.exec(`
      CREATE FUNCTION reject_target_transfer() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced transfer insert failure'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_target_transfer BEFORE INSERT ON student_enrollments
      FOR EACH ROW WHEN (NEW.class_id = '${context.classBId}') EXECUTE FUNCTION reject_target_transfer();
    `);
    await expect(app.transferStudent(context.db, context.admin, student.id, { academicYearId: context.yearId, toClassId: context.classBId, effectiveDate: '2025-10-15' })).rejects.toThrow('forced transfer insert failure');
    const [after] = await context.test.seed.select().from(schema.studentEnrollments).where(eq(schema.studentEnrollments.id, first.id));
    expect(after).toMatchObject({ status: 'ACTIVE', effectiveUntil: null, classId: context.classAId });
  });

  it('keeps one logical ACTIVE placement under concurrent initial enrollment and transfer attempts', async () => {
    const student = await seedStudent(context.test, context.schoolId);
    const initial = await Promise.allSettled([enroll(student.id), enroll(student.id)]);
    expect(initial.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const transfers = await Promise.allSettled([
      app.transferStudent(context.db, context.admin, student.id, { academicYearId: context.yearId, toClassId: context.classBId, effectiveDate: '2025-10-15' }),
      app.transferStudent(context.db, context.admin, student.id, { academicYearId: context.yearId, toClassId: context.classBId, effectiveDate: '2025-10-15' }),
    ]);
    expect(transfers.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rows = await context.test.seed.select().from(schema.studentEnrollments).where(and(eq(schema.studentEnrollments.studentId, student.id), eq(schema.studentEnrollments.academicYearId, context.yearId)));
    expect(rows.filter((row) => row.status === 'ACTIVE')).toHaveLength(1);
    expect(rows.filter((row) => row.status === 'ENDED')).toHaveLength(1);
  });

  it('ends enrollment idempotently and rejects an invalid end date', async () => {
    const student = await seedStudent(context.test, context.schoolId); const enrollment = await enroll(student.id);
    await expect(app.endEnrollment(context.db, context.admin, enrollment.id, { effectiveUntil: '2025-08-31' })).rejects.toMatchObject({ featureCode: 'INVALID_TRANSFER_DATE' });
    const ended = await app.endEnrollment(context.db, context.admin, enrollment.id, { effectiveUntil: '2025-10-01' });
    expect(ended.status).toBe('ENDED');
    expect(await app.endEnrollment(context.db, context.admin, enrollment.id, { effectiveUntil: '2025-12-01' })).toEqual(ended);
  });
});

describe('Teacher and Parent read policy', () => {
  it('returns only ACTIVE-assignment Class scope to Teachers and denies management', async () => {
    const inScope = await seedStudent(context.test, context.schoolId, 'A'); const outOfScope = await seedStudent(context.test, context.schoolId, 'B');
    await enroll(inScope.id, context.classAId); await enroll(outOfScope.id, context.classBId);
    const teacher = await createActor(context.test, context.schoolId, 'TEACHER'); await seedTeacherScope(context, teacher, context.classAId);
    const list = await app.listStudents(context.db, teacher, { page: 1, pageSize: 50 });
    expect(list.data.map((student) => student.id)).toEqual([inScope.id]);
    expect(await app.getStudent(context.db, teacher, inScope.id)).toMatchObject({ id: inScope.id });
    await expect(app.getStudent(context.db, teacher, outOfScope.id)).rejects.toMatchObject({ featureCode: 'STUDENT_NOT_FOUND' });
    await expect(app.createStudent(context.db, teacher, { firstName: 'No', lastName: 'Write' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('ENDED assignments grant no scope; Parents have related detail but no general list', async () => {
    const student = await seedStudent(context.test, context.schoolId); await enroll(student.id);
    const teacher = await createActor(context.test, context.schoolId, 'TEACHER'); await seedTeacherScope(context, teacher, context.classAId, 'ENDED');
    expect((await app.listStudents(context.db, teacher, { page: 1, pageSize: 50 })).data).toEqual([]);
    const parent = await createActor(context.test, context.schoolId, 'PARENT'); await seedParentRelationship(context, parent, student.id);
    await expect(app.listStudents(context.db, parent, { page: 1, pageSize: 50 })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await app.getStudent(context.db, parent, student.id)).toMatchObject({ id: student.id });
    expect(await app.getCurrentEnrollment(context.db, parent, student.id, context.yearId)).toMatchObject({ classId: context.classAId });
  });
});

describe('Real authentication/current-context denial stages', () => {
  it('denies unauthenticated, suspended, and inactive-membership actors', async () => {
    await expect(app.listStudents(context.db, { userId: null, schoolId: context.schoolId }, { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    const suspended = await seedUser(context.test.seed, randomUUID(), undefined, 'SUSPENDED');
    await seedMembership(context.test.seed, suspended, context.schoolId, 'SCHOOL_ADMIN');
    await expect(app.listStudents(context.db, { userId: suspended, schoolId: context.schoolId }, { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const inactive = await seedUser(context.test.seed);
    await seedMembership(context.test.seed, inactive, context.schoolId, 'SCHOOL_ADMIN', 'INACTIVE');
    await expect(app.listStudents(context.db, { userId: inactive, schoolId: context.schoolId }, { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('the real Task 014 resolver refuses to guess among multiple Schools', async () => {
    const userId = await seedUser(context.test.seed);
    const otherSchool = await seedSchool(context.test.seed, 'Other School');
    await seedMembership(context.test.seed, userId, context.schoolId, 'SCHOOL_ADMIN');
    await seedMembership(context.test.seed, userId, otherSchool.id, 'SCHOOL_ADMIN');
    await expect(requireCurrentContext(context.test.db, {
      sessionResolver: async () => ({ id: userId }),
      readSelectedSchoolId: async () => null,
    })).rejects.toMatchObject({ featureCode: 'SCHOOL_CONTEXT_REQUIRED' });
  });
});

describe('Cross-module historical preservation', () => {
  it('transfer preserves Class A Attendance validity and HomeworkSubmission history', async () => {
    const student = await seedStudent(context.test, context.schoolId);
    const enrollmentA = await enroll(student.id);
    const [attendance] = await context.test.seed.insert(schema.attendanceRecords).values({
      schoolId: context.schoolId,
      studentId: student.id,
      classId: context.classAId,
      academicYearId: context.yearId,
      attendanceDate: '2025-10-10',
      status: 'PRESENT',
    }).returning();
    const [period] = await context.test.seed.insert(schema.academicPeriods).values({
      schoolId: context.schoolId,
      academicYearId: context.yearId,
      name: 'Term 1', sequence: 1,
      startDate: '2025-09-01', endDate: '2025-12-20',
    }).returning();
    const [teacher] = await context.test.seed.insert(schema.teachers).values({
      schoolId: context.schoolId, firstName: 'Karim', lastName: 'Alaoui',
    }).returning();
    const [homework] = await context.test.seed.insert(schema.homework).values({
      schoolId: context.schoolId,
      teacherId: teacher.id,
      subjectId: context.subjectId,
      academicYearId: context.yearId,
      academicPeriodId: period.id,
      title: 'Class A work', dueDate: '2025-10-12', status: 'PUBLISHED',
    }).returning();
    await context.test.seed.insert(schema.homeworkTargets).values({
      schoolId: context.schoolId,
      homeworkId: homework.id,
      academicYearId: context.yearId,
      classId: context.classAId,
    });
    const [submission] = await context.test.seed.insert(schema.homeworkSubmissions).values({
      schoolId: context.schoolId, homeworkId: homework.id, studentId: student.id,
    }).returning();

    await app.transferStudent(context.db, context.admin, student.id, {
      academicYearId: context.yearId,
      toClassId: context.classBId,
      effectiveDate: '2025-10-15',
    });

    const [oldEnrollment] = await context.test.seed.select().from(schema.studentEnrollments)
      .where(eq(schema.studentEnrollments.id, enrollmentA.id));
    const [attendanceAfter] = await context.test.seed.select().from(schema.attendanceRecords)
      .where(eq(schema.attendanceRecords.id, attendance.id));
    const [submissionAfter] = await context.test.seed.select().from(schema.homeworkSubmissions)
      .where(eq(schema.homeworkSubmissions.id, submission.id));
    expect(attendanceAfter).toMatchObject({ classId: context.classAId, studentId: student.id });
    expect(validateAttendanceContext(
      { schoolId: context.schoolId, classId: attendanceAfter.classId, attendanceDate: attendanceAfter.attendanceDate },
      { schoolId: context.schoolId, classId: oldEnrollment.classId, effectiveFrom: oldEnrollment.effectiveFrom, effectiveUntil: oldEnrollment.effectiveUntil },
    )).toEqual({ valid: true });
    expect(submissionAfter).toMatchObject({ id: submission.id, homeworkId: homework.id, studentId: student.id });
  });
});
