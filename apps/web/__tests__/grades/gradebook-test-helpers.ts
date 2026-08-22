import * as schema from '@school/database';

import type { GradebookActor } from '@/lib/modules/grades/application';
import type { GradebooksDb } from '@/lib/modules/grades/infrastructure/repositories/gradebook-repository';

import {
  createGradesTestDb, seedSchool, seedStudentAndActors, seedTeacherAssignment,
  type GradesTestDb, type SeededSchool,
} from './test-helpers';

export interface GradebookTestContext {
  test: GradesTestDb;
  db: GradebooksDb;
  school: SeededSchool;
  admin: GradebookActor;
  teacher: GradebookActor;
  teacherId: string;
}

export async function createGradebookTestContext(): Promise<GradebookTestContext> {
  const test = await createGradesTestDb();
  const school = await seedSchool(test.seed);
  const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  return {
    test,
    db: test.seed as unknown as GradebooksDb,
    school,
    admin: { userId: actors.schoolAdminUserId, schoolId: school.schoolId },
    teacher: { userId: actors.teacherUserId, schoolId: school.schoolId },
    teacherId: actors.teacherId,
  };
}

export function gradebookInput(context: GradebookTestContext, subjectId = context.school.subjectMathId) {
  return {
    academicYearId: context.school.yearId,
    academicPeriodId: context.school.period1Id,
    classId: context.school.classId,
    subjectId,
    gradingConfigurationVersionId: context.school.configVersionId,
    name: 'Mathematics Term 1',
  };
}

export async function assignTeacher(
  context: GradebookTestContext,
  subjectId = context.school.subjectMathId,
) {
  await seedTeacherAssignment(
    context.test.seed, context.school.schoolId, context.teacherId,
    context.school.classId, subjectId, context.school.yearId,
  );
}

export async function seedGrade(
  context: GradebookTestContext,
  gradebookId: string,
  assessmentId: string,
) {
  const [student] = await context.test.seed.select().from(schema.students).limit(1);
  await context.test.seed.insert(schema.grades).values({
    schoolId: context.school.schoolId,
    gradebookId,
    assessmentId,
    studentId: student.id,
    score: '15',
    state: 'VALID',
  });
}

