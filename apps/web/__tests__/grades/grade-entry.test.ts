import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@school/database';

import * as app from '@/lib/modules/grades/application';
import { bulkGradeEntrySchema, gradeEntrySchema } from '@/lib/modules/grades/domain';

import { seedParentActor } from './test-helpers';
import {
  assignTeacher, createGradebookTestContext, gradebookInput, type GradebookTestContext,
} from './gradebook-test-helpers';

let context: GradebookTestContext;
beforeEach(async () => { context = await createGradebookTestContext(); });

async function openAssessment(
  subjectId = context.school.subjectMathId,
  assessmentDate: string | null = '2025-10-15',
) {
  const gradebook = await app.createGradebook(context.db, context.admin, gradebookInput(context, subjectId));
  await app.patchGradebook(context.db, context.admin, gradebook.id, { status: 'OPEN' });
  const assessment = await app.createAssessment(context.db, context.admin, gradebook.id, {
    title: 'Term assessment', assessmentType: 'TEST', maximumScore: '20', weight: '1',
    assessmentDate,
  });
  await app.patchAssessment(context.db, context.admin, assessment.id, { status: 'PUBLISHED' });
  return { gradebook, assessment };
}

async function firstStudent() {
  const [student] = await context.test.seed.select().from(schema.students)
    .where(eq(schema.students.schoolId, context.school.schoolId)).limit(1);
  return student;
}

async function seedEligibleStudent(suffix: string) {
  const [student] = await context.test.seed.insert(schema.students).values({
    schoolId: context.school.schoolId,
    firstName: `Student ${suffix}`, lastName: 'Grade', studentCode: suffix,
  }).returning();
  await context.test.seed.insert(schema.studentEnrollments).values({
    schoolId: context.school.schoolId,
    studentId: student.id,
    academicYearId: context.school.yearId,
    classId: context.school.classId,
    effectiveFrom: '2025-09-01',
    status: 'ACTIVE',
  });
  return student;
}

describe('Grade state, score, upsert, and transaction rules', () => {
  it('enforces the exact state/score contract and numeric(6,2) precision', () => {
    expect(gradeEntrySchema.safeParse({ studentId: randomUUID(), state: 'VALID', score: '15.50' }).success)
      .toBe(true);
    expect(gradeEntrySchema.safeParse({ studentId: randomUUID(), state: 'VALID', score: null }).success)
      .toBe(false);
    expect(gradeEntrySchema.safeParse({ studentId: randomUUID(), state: 'VALID', score: '-1' }).success)
      .toBe(false);
    expect(gradeEntrySchema.safeParse({ studentId: randomUUID(), state: 'VALID', score: 1.234 }).success)
      .toBe(false);
    for (const state of ['MISSING', 'ABSENT', 'EXCUSED']) {
      expect(gradeEntrySchema.safeParse({ studentId: randomUUID(), state, score: null }).success)
        .toBe(true);
      expect(gradeEntrySchema.safeParse({ studentId: randomUUID(), state, score: '0' }).success)
        .toBe(false);
    }
    expect(bulkGradeEntrySchema.safeParse({
      grades: [
        { studentId: context.school.subjectMathId, state: 'ABSENT', score: null },
        { studentId: context.school.subjectMathId, state: 'MISSING', score: null },
      ],
    }).success).toBe(false);
  });

  it('creates and then updates one logical Grade without duplication', async () => {
    const { assessment } = await openAssessment();
    const student = await firstStudent();
    const first = await app.putAssessmentGrades(context.db, context.admin, assessment.id, {
      grades: [{ studentId: student.id, state: 'VALID', score: '15.50' }],
    });
    const gradeId = first.grades[0].id;
    const second = await app.putAssessmentGrades(context.db, context.admin, assessment.id, {
      grades: [{ studentId: student.id, state: 'ABSENT', score: null }],
    });
    expect(second.grades[0]).toMatchObject({ id: gradeId, state: 'ABSENT', score: null });
    expect(await context.test.seed.select().from(schema.grades).where(and(
      eq(schema.grades.assessmentId, assessment.id), eq(schema.grades.studentId, student.id),
    ))).toHaveLength(1);
  });

  it('rejects a score above maximumScore without floating-point comparison', async () => {
    const { assessment } = await openAssessment();
    const student = await firstStudent();
    await expect(app.putAssessmentGrades(context.db, context.admin, assessment.id, {
      grades: [{ studentId: student.id, state: 'VALID', score: '20.01' }],
    })).rejects.toMatchObject({ featureCode: 'INVALID_GRADE_SCORE' });
  });

  it('rolls back the whole batch when a later Student is invalid', async () => {
    const { assessment } = await openAssessment();
    const student = await firstStudent();
    await expect(app.putAssessmentGrades(context.db, context.admin, assessment.id, {
      grades: [
        { studentId: student.id, state: 'VALID', score: '12' },
        { studentId: randomUUID(), state: 'VALID', score: '13' },
      ],
    })).rejects.toMatchObject({ featureCode: 'STUDENT_NOT_ELIGIBLE_FOR_ASSESSMENT' });
    expect(await context.test.seed.select().from(schema.grades)
      .where(eq(schema.grades.assessmentId, assessment.id))).toHaveLength(0);
  });

  it('preserves one Grade under concurrent same-Student upserts (last committed write wins)', async () => {
    const { assessment } = await openAssessment();
    const student = await firstStudent();
    const writes = await Promise.all([
      app.putAssessmentGrades(context.db, context.admin, assessment.id, {
        grades: [{ studentId: student.id, state: 'VALID', score: '11' }],
      }),
      app.putAssessmentGrades(context.db, context.admin, assessment.id, {
        grades: [{ studentId: student.id, state: 'VALID', score: '17' }],
      }),
    ]);
    expect(writes).toHaveLength(2);
    const rows = await context.test.seed.select().from(schema.grades).where(and(
      eq(schema.grades.assessmentId, assessment.id), eq(schema.grades.studentId, student.id),
    ));
    expect(rows).toHaveLength(1);
    expect(['11.00', '17.00']).toContain(rows[0].score);
  });
});

describe('Historical enrollment and lifecycle eligibility', () => {
  it('accepts a historically enrolled Student after transfer when the Assessment date was in Class A', async () => {
    const { gradebook, assessment } = await openAssessment();
    const student = await firstStudent();
    const [enrollment] = await context.test.seed.select().from(schema.studentEnrollments)
      .where(eq(schema.studentEnrollments.studentId, student.id)).limit(1);
    const [baseClass] = await context.test.seed.select().from(schema.classes)
      .where(eq(schema.classes.id, context.school.classId));
    const [classB] = await context.test.seed.insert(schema.classes).values({
      schoolId: context.school.schoolId, academicYearId: context.school.yearId,
      levelId: baseClass.levelId, curriculumVersionId: baseClass.curriculumVersionId, name: '5B',
    }).returning();
    await context.test.seed.update(schema.studentEnrollments).set({
      status: 'ENDED', effectiveUntil: '2025-10-31',
    }).where(eq(schema.studentEnrollments.id, enrollment.id));
    await context.test.seed.insert(schema.studentEnrollments).values({
      schoolId: context.school.schoolId, studentId: student.id,
      academicYearId: context.school.yearId, classId: classB.id,
      effectiveFrom: '2025-11-01', status: 'ACTIVE',
    });
    await expect(app.putAssessmentGrades(context.db, context.admin, assessment.id, {
      grades: [{ studentId: student.id, state: 'VALID', score: '16' }],
    })).resolves.toMatchObject({ grades: [{ studentId: student.id }] });
    expect((await app.getGradebookMatrix(context.db, context.admin, gradebook.id, {
      page: 1, pageSize: 50,
    })).data.students[0].grades).toHaveLength(1);
  });

  it('rejects Students outside the exact Class and foreign Students', async () => {
    const { assessment } = await openAssessment();
    const outsider = await context.test.seed.insert(schema.students).values({
      schoolId: context.school.schoolId, firstName: 'Outside', lastName: 'Student',
    }).returning().then((rows) => rows[0]);
    await expect(app.putAssessmentGrades(context.db, context.admin, assessment.id, {
      grades: [{ studentId: outsider.id, state: 'VALID', score: '10' }],
    })).rejects.toMatchObject({ featureCode: 'STUDENT_NOT_ELIGIBLE_FOR_ASSESSMENT' });
    await expect(app.putAssessmentGrades(context.db, context.admin, assessment.id, {
      grades: [{ studentId: randomUUID(), state: 'VALID', score: '10' }],
    })).rejects.toMatchObject({ featureCode: 'STUDENT_NOT_ELIGIBLE_FOR_ASSESSMENT' });
  });

  it('uses exact historical Class/Year enrollment as the null-date fallback', async () => {
    const { assessment } = await openAssessment(context.school.subjectMathId, null);
    const student = await firstStudent();
    await context.test.seed.update(schema.studentEnrollments).set({
      status: 'ENDED', effectiveUntil: '2025-10-01',
    }).where(eq(schema.studentEnrollments.studentId, student.id));
    await expect(app.putAssessmentGrades(context.db, context.admin, assessment.id, {
      grades: [{ studentId: student.id, state: 'EXCUSED', score: null }],
    })).resolves.toMatchObject({ grades: [{ state: 'EXCUSED', score: null }] });
  });

  it('requires OPEN Gradebook and PUBLISHED non-archived Assessment', async () => {
    const { gradebook, assessment } = await openAssessment();
    const student = await firstStudent();
    await app.patchGradebook(context.db, context.admin, gradebook.id, { status: 'CLOSED' });
    await expect(app.putAssessmentGrades(context.db, context.admin, assessment.id, {
      grades: [{ studentId: student.id, state: 'VALID', score: '10' }],
    })).rejects.toMatchObject({ featureCode: 'GRADE_ENTRY_NOT_ALLOWED' });

    const second = await openAssessment(context.school.subjectPhysicsId);
    await app.patchAssessment(context.db, context.admin, second.assessment.id, { status: 'ARCHIVED' });
    await expect(app.putAssessmentGrades(context.db, context.admin, second.assessment.id, {
      grades: [{ studentId: student.id, state: 'VALID', score: '10' }],
    })).rejects.toMatchObject({ featureCode: 'GRADE_ENTRY_NOT_ALLOWED' });
  });
});

describe('Grade authorization and matrix reads', () => {
  it('allows exact Teacher scope, denies Parent, ENDED assignment, and inactive profile', async () => {
    await assignTeacher(context);
    const { gradebook, assessment } = await openAssessment();
    const student = await firstStudent();
    await expect(app.putAssessmentGrades(context.db, context.teacher, assessment.id, {
      grades: [{ studentId: student.id, state: 'VALID', score: '18' }],
    })).resolves.toBeDefined();
    expect((await app.getGradebookMatrix(context.db, context.teacher, gradebook.id, {
      page: 1, pageSize: 50,
    })).data.students).toHaveLength(1);

    const { parentUserId } = await seedParentActor(context.test.seed, context.school.schoolId);
    await expect(app.getGradebookMatrix(context.db, {
      userId: parentUserId, schoolId: context.school.schoolId,
    }, gradebook.id, { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await context.test.seed.update(schema.teacherAssignments).set({ status: 'ENDED' })
      .where(eq(schema.teacherAssignments.teacherId, context.teacherId));
    await expect(app.putAssessmentGrades(context.db, context.teacher, assessment.id, {
      grades: [{ studentId: student.id, state: 'VALID', score: '19' }],
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.teacherAssignments).set({ status: 'ACTIVE' })
      .where(eq(schema.teacherAssignments.teacherId, context.teacherId));
    await context.test.seed.update(schema.teachers).set({ status: 'INACTIVE' })
      .where(eq(schema.teachers.id, context.teacherId));
    await expect(app.putAssessmentGrades(context.db, context.teacher, assessment.id, {
      grades: [{ studentId: student.id, state: 'VALID', score: '19' }],
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies a Teacher the same Subject in a different Class', async () => {
    await assignTeacher(context);
    const [baseClass] = await context.test.seed.select().from(schema.classes)
      .where(eq(schema.classes.id, context.school.classId));
    const [classB] = await context.test.seed.insert(schema.classes).values({
      schoolId: context.school.schoolId, academicYearId: context.school.yearId,
      levelId: baseClass.levelId, curriculumVersionId: baseClass.curriculumVersionId, name: '5B',
    }).returning();
    const gradebook = await app.createGradebook(context.db, context.admin, {
      ...gradebookInput(context), classId: classB.id, name: 'Math 5B',
    });
    await app.patchGradebook(context.db, context.admin, gradebook.id, { status: 'OPEN' });
    const assessment = await app.createAssessment(context.db, context.admin, gradebook.id, {
      title: '5B Exam', assessmentType: 'EXAM', maximumScore: '20', weight: '1',
      assessmentDate: '2025-10-15',
    });
    await app.patchAssessment(context.db, context.admin, assessment.id, { status: 'PUBLISHED' });
    await expect(app.putAssessmentGrades(context.db, context.teacher, assessment.id, {
      grades: [{ studentId: (await firstStudent()).id, state: 'VALID', score: '10' }],
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('paginates relevant Students and returns bounded Assessments without Results', async () => {
    const { gradebook, assessment } = await openAssessment();
    const first = await firstStudent();
    const second = await seedEligibleStudent('S-2');
    await app.putAssessmentGrades(context.db, context.admin, assessment.id, {
      grades: [
        { studentId: first.id, state: 'VALID', score: '12' },
        { studentId: second.id, state: 'MISSING', score: null },
      ],
    });
    const matrix = await app.getGradebookMatrix(context.db, context.admin, gradebook.id, {
      page: 1, pageSize: 1,
    });
    expect(matrix.meta).toMatchObject({ page: 1, pageSize: 1, total: 2, assessmentLimit: 100 });
    expect(matrix.data.assessments).toHaveLength(1);
    expect(matrix.data.students).toHaveLength(1);
    expect(matrix.data).not.toHaveProperty('results');
    expect(matrix.data.gradebook).not.toHaveProperty('schoolId');
  });

  it('denies inactive Users/memberships and foreign Assessment identifiers', async () => {
    const { assessment } = await openAssessment();
    const student = await firstStudent();
    await context.test.seed.update(schema.users).set({ status: 'SUSPENDED' })
      .where(eq(schema.users.id, context.admin.userId!));
    await expect(app.putAssessmentGrades(context.db, context.admin, assessment.id, {
      grades: [{ studentId: student.id, state: 'VALID', score: '10' }],
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.users).set({ status: 'ACTIVE' })
      .where(eq(schema.users.id, context.admin.userId!));
    await context.test.seed.update(schema.schoolMemberships).set({ status: 'INACTIVE' })
      .where(eq(schema.schoolMemberships.userId, context.admin.userId!));
    await expect(app.putAssessmentGrades(context.db, context.admin, assessment.id, {
      grades: [{ studentId: student.id, state: 'VALID', score: '10' }],
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.schoolMemberships).set({ status: 'ACTIVE' })
      .where(eq(schema.schoolMemberships.userId, context.admin.userId!));
    await expect(app.putAssessmentGrades(context.db, context.admin, randomUUID(), {
      grades: [{ studentId: student.id, state: 'VALID', score: '10' }],
    })).rejects.toMatchObject({ featureCode: 'ASSESSMENT_NOT_FOUND' });
  });
});
