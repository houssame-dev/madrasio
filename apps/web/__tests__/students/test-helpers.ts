import { randomUUID } from 'node:crypto';
import * as schema from '@school/database';

import type { Role } from '@/lib/authorization/roles';
import type { Actor } from '@/lib/modules/students/application';
import type { StudentsDb } from '@/lib/modules/students/infrastructure/repositories/student-repository';

import {
  createAuthTestDb, seedMembership, seedSchool, seedUser, type AuthTestDb,
} from '../auth/test-helpers';

export interface StudentsTestContext {
  test: AuthTestDb;
  db: StudentsDb;
  schoolId: string;
  yearId: string;
  classAId: string;
  classBId: string;
  levelId: string;
  curriculumVersionId: string;
  subjectId: string;
  admin: Actor;
}

export async function createStudentsTestContext(): Promise<StudentsTestContext> {
  const test = await createAuthTestDb();
  const db = test.seed as unknown as StudentsDb;
  const school = await seedSchool(test.seed);
  const yearId = randomUUID();
  await test.seed.insert(schema.academicYears).values({
    id: yearId, schoolId: school.id, name: '2025/2026',
    startDate: '2025-09-01', endDate: '2026-07-01', status: 'ACTIVE',
  });
  const curriculumId = randomUUID();
  await test.seed.insert(schema.curricula).values({ id: curriculumId, schoolId: school.id, name: 'National' });
  const curriculumVersionId = randomUUID();
  await test.seed.insert(schema.curriculumVersions).values({
    id: curriculumVersionId, schoolId: school.id, curriculumId, name: 'v1', status: 'ACTIVE',
  });
  const stageId = randomUUID();
  await test.seed.insert(schema.stages).values({ id: stageId, schoolId: school.id, name: 'Primary', sequence: 1 });
  const levelId = randomUUID();
  await test.seed.insert(schema.levels).values({ id: levelId, schoolId: school.id, stageId, name: 'Year 1', sequence: 1 });
  const classAId = randomUUID(); const classBId = randomUUID();
  await test.seed.insert(schema.classes).values([
    { id: classAId, schoolId: school.id, academicYearId: yearId, levelId, curriculumVersionId, name: 'Class A' },
    { id: classBId, schoolId: school.id, academicYearId: yearId, levelId, curriculumVersionId, name: 'Class B' },
  ]);
  const subjectId = randomUUID();
  await test.seed.insert(schema.subjects).values({ id: subjectId, schoolId: school.id, name: 'Mathematics' });
  const admin = await createActor(test, school.id, 'SCHOOL_ADMIN');
  return {
    test, db, schoolId: school.id, yearId, classAId, classBId, levelId,
    curriculumVersionId, subjectId, admin,
  };
}

export async function createActor(test: AuthTestDb, schoolId: string, role: Role): Promise<Actor> {
  const userId = await seedUser(test.seed);
  await seedMembership(test.seed, userId, schoolId, role);
  return { userId, schoolId };
}

export async function seedStudent(test: AuthTestDb, schoolId: string, suffix = '') {
  const [student] = await test.seed.insert(schema.students).values({
    schoolId, firstName: `Amine${suffix}`, lastName: 'Benali',
    studentCode: suffix ? `S-${suffix}` : null,
  }).returning();
  return student;
}

export async function seedTeacherScope(
  context: StudentsTestContext,
  actor: Actor,
  classId: string,
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
) {
  const [teacher] = await context.test.seed.insert(schema.teachers).values({
    schoolId: context.schoolId, userId: actor.userId!, firstName: 'Karim', lastName: 'Alaoui',
  }).returning();
  const [assignment] = await context.test.seed.insert(schema.teacherAssignments).values({
    schoolId: context.schoolId,
    teacherId: teacher.id,
    classId,
    subjectId: context.subjectId,
    academicYearId: context.yearId,
    effectiveFrom: '2025-09-01',
    effectiveUntil: status === 'ENDED' ? '2025-10-01' : null,
    status,
  }).returning();
  return { teacher, assignment };
}

export async function seedParentRelationship(
  context: StudentsTestContext,
  actor: Actor,
  studentId: string,
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
) {
  const [parent] = await context.test.seed.insert(schema.parents).values({
    schoolId: context.schoolId, userId: actor.userId!, firstName: 'Sara', lastName: 'Benali',
  }).returning();
  await context.test.seed.insert(schema.parentStudents).values({
    schoolId: context.schoolId, parentId: parent.id, studentId, status,
  });
}
