import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@school/database';

import * as app from '@/lib/modules/homework/application';
import {
  homeworkCreateSchema, homeworkPatchSchema, homeworkSubmissionCreateSchema,
  homeworkTargetsCreateSchema,
} from '@/lib/modules/homework/domain';
import type { HomeworkDb } from '@/lib/modules/homework/infrastructure/repositories/homework-repository';

import {
  createActor, createStudentsTestContext, seedParentRelationship, seedStudent, seedTeacherScope,
  type StudentsTestContext,
} from '../students/test-helpers';

let context: StudentsTestContext;
let db: HomeworkDb;
let periodId: string;
let teacher: Awaited<ReturnType<typeof createActor>>;

beforeEach(async () => {
  context = await createStudentsTestContext();
  db = context.test.seed as unknown as HomeworkDb;
  const [period] = await context.test.seed.insert(schema.academicPeriods).values({
    schoolId: context.schoolId,
    academicYearId: context.yearId,
    name: 'Term 1',
    sequence: 1,
    startDate: '2025-09-01',
    endDate: '2025-12-31',
    status: 'ACTIVE',
  }).returning();
  periodId = period.id;
  teacher = await createActor(context.test, context.schoolId, 'TEACHER');
  await seedTeacherScope(context, teacher, context.classAId);
});

async function draft(overrides: Partial<Parameters<typeof app.createHomework>[2]> = {}) {
  return app.createHomework(db, teacher, {
    subjectId: context.subjectId,
    academicYearId: context.yearId,
    academicPeriodId: periodId,
    title: 'Fractions practice',
    description: 'Complete the exercises.',
    dueDate: '2025-10-10',
    ...overrides,
  });
}

async function published() {
  const homework = await draft();
  await app.addHomeworkTargets(db, teacher, homework.id, { classIds: [context.classAId] });
  return app.patchHomework(db, teacher, homework.id, { status: 'PUBLISHED' });
}

async function enroll(
  studentId: string,
  classId = context.classAId,
  effectiveFrom = '2025-09-01',
  effectiveUntil: string | null = null,
) {
  await context.test.seed.insert(schema.studentEnrollments).values({
    schoolId: context.schoolId,
    studentId,
    academicYearId: context.yearId,
    classId,
    effectiveFrom,
    effectiveUntil,
    status: effectiveUntil ? 'ENDED' : 'ACTIVE',
  });
}

describe('Homework contracts and lifecycle', () => {
  it('strictly rejects authoritative and unrelated input', () => {
    const base = {
      subjectId: randomUUID(), academicYearId: randomUUID(), academicPeriodId: randomUUID(),
      title: 'Homework', dueDate: '2025-10-10',
    };
    expect(homeworkCreateSchema.safeParse(base).success).toBe(true);
    expect(homeworkCreateSchema.safeParse({ ...base, schoolId: randomUUID() }).success).toBe(false);
    expect(homeworkCreateSchema.safeParse({ ...base, teacherId: randomUUID() }).success).toBe(false);
    expect(homeworkCreateSchema.safeParse({ ...base, assessmentId: randomUUID() }).success).toBe(false);
    expect(homeworkPatchSchema.safeParse({}).success).toBe(false);
    expect(homeworkTargetsCreateSchema.safeParse({ classIds: [context.classAId, context.classAId] }).success)
      .toBe(false);
    expect(homeworkSubmissionCreateSchema.safeParse({ studentId: randomUUID(), status: 'SUBMITTED' }).success)
      .toBe(false);
  });

  it('creates an authoritative Teacher-authored DRAFT and lists only the current School', async () => {
    const homework = await draft();
    expect(homework).toMatchObject({
      subjectId: context.subjectId, academicYearId: context.yearId, status: 'DRAFT',
    });
    expect(homework).not.toHaveProperty('schoolId');
    const page = await app.listHomework(db, teacher, { page: 1, pageSize: 50 });
    expect(page.data).toHaveLength(1);
    const foreign = await createStudentsTestContext();
    expect((await app.listHomework(
      foreign.test.seed as unknown as HomeworkDb,
      foreign.admin,
      { page: 1, pageSize: 50 },
    )).data).toHaveLength(0);
    await foreign.test.client.close();
  });

  it('requires a valid same-School academic context and an authoritative active Teacher author', async () => {
    await expect(draft({ subjectId: randomUUID() })).rejects.toMatchObject({
      featureCode: 'INVALID_HOMEWORK_CONTEXT',
    });
    await expect(draft({ dueDate: '2026-01-01' })).rejects.toMatchObject({
      featureCode: 'INVALID_HOMEWORK_CONTEXT',
    });
    await expect(app.createHomework(db, context.admin, {
      subjectId: context.subjectId, academicYearId: context.yearId, academicPeriodId: periodId,
      title: 'Admin draft', dueDate: '2025-10-10',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.teachers).set({ status: 'INACTIVE' })
      .where(eq(schema.teachers.userId, teacher.userId!));
    await expect(draft()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows safe draft editing and only the conservative forward lifecycle', async () => {
    const homework = await draft();
    await expect(app.patchHomework(db, teacher, homework.id, { status: 'PUBLISHED' }))
      .rejects.toMatchObject({ featureCode: 'HOMEWORK_NOT_PUBLISHABLE' });
    await app.addHomeworkTargets(db, teacher, homework.id, { classIds: [context.classAId] });
    expect(await app.patchHomework(db, teacher, homework.id, { title: 'Updated', status: 'PUBLISHED' }))
      .toMatchObject({ title: 'Updated', status: 'PUBLISHED' });
    await expect(app.patchHomework(db, teacher, homework.id, { title: 'Rewrite' }))
      .rejects.toMatchObject({ featureCode: 'HOMEWORK_NOT_EDITABLE' });
    await expect(app.patchHomework(db, teacher, homework.id, { status: 'DRAFT' }))
      .rejects.toMatchObject({ featureCode: 'INVALID_HOMEWORK_STATUS_TRANSITION' });
    expect(await app.patchHomework(db, teacher, homework.id, { status: 'CLOSED' }))
      .toMatchObject({ status: 'CLOSED' });
    expect(await app.patchHomework(db, context.admin, homework.id, { status: 'ARCHIVED' }))
      .toMatchObject({ status: 'ARCHIVED' });
    await expect(app.patchHomework(db, context.admin, homework.id, { status: 'CLOSED' }))
      .rejects.toMatchObject({ featureCode: 'INVALID_HOMEWORK_STATUS_TRANSITION' });
  });

  it('denies inactive identity/membership and hides unknown School-scoped identifiers', async () => {
    const homework = await draft();
    await context.test.seed.update(schema.users).set({ status: 'SUSPENDED' })
      .where(eq(schema.users.id, teacher.userId!));
    await expect(app.getHomework(db, teacher, homework.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.users).set({ status: 'ACTIVE' })
      .where(eq(schema.users.id, teacher.userId!));
    await context.test.seed.update(schema.schoolMemberships).set({ status: 'INACTIVE' })
      .where(eq(schema.schoolMemberships.userId, teacher.userId!));
    await expect(app.listHomework(db, teacher, { page: 1, pageSize: 50 }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.schoolMemberships).set({ status: 'ACTIVE' })
      .where(eq(schema.schoolMemberships.userId, teacher.userId!));
    await expect(app.getHomework(db, teacher, randomUUID())).rejects.toMatchObject({
      featureCode: 'HOMEWORK_NOT_FOUND',
    });
  });
});

describe('Homework targets and Teacher scope', () => {
  it('supports multiple exact-scope Classes and freezes the target set after publication', async () => {
    await seedTeacherScope(context, teacher, context.classBId);
    const homework = await draft();
    const targets = await app.addHomeworkTargets(db, teacher, homework.id, {
      classIds: [context.classAId, context.classBId],
    });
    expect(targets).toHaveLength(2);
    await expect(app.addHomeworkTargets(db, teacher, homework.id, { classIds: [context.classAId] }))
      .rejects.toMatchObject({ featureCode: 'DUPLICATE_HOMEWORK_TARGET' });
    await app.patchHomework(db, teacher, homework.id, { status: 'PUBLISHED' });
    await expect(app.addHomeworkTargets(db, teacher, homework.id, { classIds: [context.classBId] }))
      .rejects.toMatchObject({ featureCode: 'HOMEWORK_NOT_EDITABLE' });
  });

  it('rejects foreign/closed Classes and exact Teacher Class+Subject+Year scope failures', async () => {
    const homework = await draft();
    await expect(app.addHomeworkTargets(db, teacher, homework.id, { classIds: [context.classBId] }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.classes).set({ status: 'CLOSED' })
      .where(eq(schema.classes.id, context.classBId));
    await expect(app.addHomeworkTargets(db, context.admin, homework.id, { classIds: [context.classBId] }))
      .rejects.toMatchObject({ featureCode: 'INVALID_HOMEWORK_CONTEXT' });
    await expect(app.addHomeworkTargets(db, context.admin, homework.id, { classIds: [randomUUID()] }))
      .rejects.toMatchObject({ featureCode: 'INVALID_HOMEWORK_CONTEXT' });
  });

  it('removes current Teacher access when the Assignment ends without changing history', async () => {
    const homework = await published();
    await context.test.seed.update(schema.teacherAssignments).set({ status: 'ENDED', effectiveUntil: '2025-10-01' });
    await expect(app.getHomework(db, teacher, homework.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await context.test.seed.select().from(schema.homeworkTargets)).toHaveLength(1);
    expect(await context.test.seed.select().from(schema.homework)).toMatchObject([{ id: homework.id }]);
  });
});

describe('Homework submission eligibility, review, and history', () => {
  it('uses due-date historical enrollment, derives LATE, and preserves one logical Submission', async () => {
    const homework = await published();
    const student = await seedStudent(context.test, context.schoolId);
    await enroll(student.id, context.classAId, '2025-09-01', '2025-10-10');
    await enroll(student.id, context.classBId, '2025-10-11');
    const submission = await app.createHomeworkSubmission(db, teacher, homework.id, {
      studentId: student.id, content: 'My answer',
    });
    expect(submission).toMatchObject({ studentId: student.id, status: 'LATE' });
    await expect(app.createHomeworkSubmission(db, teacher, homework.id, { studentId: student.id }))
      .rejects.toMatchObject({ featureCode: 'DUPLICATE_HOMEWORK_SUBMISSION' });
    expect(await context.test.seed.select().from(schema.homeworkSubmissions)).toHaveLength(1);
    expect(await context.test.seed.select().from(schema.homeworkTargets)).toMatchObject([
      { homeworkId: homework.id, classId: context.classAId },
    ]);
  });

  it('rejects ineligible Students and CLOSED Homework', async () => {
    const homework = await published();
    const outsider = await seedStudent(context.test, context.schoolId);
    await expect(app.createHomeworkSubmission(db, context.admin, homework.id, { studentId: outsider.id }))
      .rejects.toMatchObject({ featureCode: 'STUDENT_NOT_ELIGIBLE_FOR_HOMEWORK' });
    const student = await seedStudent(context.test, context.schoolId, 'eligible');
    await enroll(student.id);
    await app.patchHomework(db, teacher, homework.id, { status: 'CLOSED' });
    await expect(app.createHomeworkSubmission(db, context.admin, homework.id, { studentId: student.id }))
      .rejects.toMatchObject({ featureCode: 'HOMEWORK_SUBMISSION_NOT_ALLOWED' });
  });

  it('represents NOT_SUBMITTED with null and supports REVIEWED→RETURNED→resubmitted', async () => {
    const homework = await published();
    const student = await seedStudent(context.test, context.schoolId);
    await enroll(student.id);
    let roster = await app.listHomeworkStudents(db, teacher, homework.id, { page: 1, pageSize: 50 });
    expect(roster.data).toMatchObject([{ student: { id: student.id }, submission: null }]);
    const submission = await app.createHomeworkSubmission(db, teacher, homework.id, {
      studentId: student.id, content: 'First answer',
    });
    expect(await app.reviewHomeworkSubmission(db, teacher, submission.id, { status: 'REVIEWED' }))
      .toMatchObject({ status: 'REVIEWED' });
    expect(await app.reviewHomeworkSubmission(db, context.admin, submission.id, { status: 'RETURNED' }))
      .toMatchObject({ status: 'RETURNED' });
    expect(await app.patchHomeworkSubmission(db, teacher, submission.id, { content: 'Revised answer' }))
      .toMatchObject({ id: submission.id, status: 'LATE', content: 'Revised answer' });
    await expect(app.reviewHomeworkSubmission(db, teacher, submission.id, { status: 'RETURNED' }))
      .rejects.toMatchObject({ featureCode: 'INVALID_HOMEWORK_SUBMISSION_STATE' });
    roster = await app.listHomeworkStudents(db, teacher, homework.id, { page: 1, pageSize: 50 });
    expect(roster.data[0].submission).toMatchObject({ id: submission.id });
  });

  it('allows only active related Parents to read published child-scoped Homework and Submission', async () => {
    const homework = await published();
    const student = await seedStudent(context.test, context.schoolId);
    await enroll(student.id);
    const submission = await app.createHomeworkSubmission(db, teacher, homework.id, { studentId: student.id });
    const parent = await createActor(context.test, context.schoolId, 'PARENT');
    await seedParentRelationship(context, parent, student.id);
    await expect(app.getHomework(db, parent, homework.id)).resolves.toMatchObject({ id: homework.id });
    await expect(app.getHomeworkSubmission(db, parent, submission.id)).resolves.toMatchObject({ id: submission.id });
    await expect(app.listHomework(db, parent, { page: 1, pageSize: 50 }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    const unrelated = await createActor(context.test, context.schoolId, 'PARENT');
    await expect(app.getHomework(db, unrelated, homework.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.parentStudents).set({ status: 'ENDED' });
    await expect(app.getHomework(db, parent, homework.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.parentStudents).set({ status: 'ACTIVE' });
    await context.test.seed.update(schema.parents).set({ status: 'INACTIVE' });
    await expect(app.getHomework(db, parent, homework.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('creates no Grade, Assessment, Result, Attendance, Parent, Notification, or Outbox side effects', async () => {
    const homework = await published();
    const student = await seedStudent(context.test, context.schoolId);
    await enroll(student.id);
    const submission = await app.createHomeworkSubmission(db, teacher, homework.id, { studentId: student.id });
    await app.reviewHomeworkSubmission(db, teacher, submission.id, { status: 'REVIEWED' });
    expect(await context.test.seed.select().from(schema.assessments)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.grades)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.subjectResults)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.attendanceRecords)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.parentStudents)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.notifications)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.outboxEvents)).toHaveLength(0);
  });
});
