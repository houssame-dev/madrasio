import * as schema from '@school/database';

import type { Role } from '@/lib/authorization/roles';
import type { Actor } from '@/lib/modules/teachers/application';
import type { TeachersDb } from '@/lib/modules/teachers/infrastructure/repositories/teacher-repository';

import {
  createActor as createStudentActor,
  createStudentsTestContext,
  type StudentsTestContext,
} from '../students/test-helpers';

export interface TeachersTestContext extends StudentsTestContext {
  teacherDb: TeachersDb;
}

export async function createTeachersTestContext(): Promise<TeachersTestContext> {
  const context = await createStudentsTestContext();
  return { ...context, teacherDb: context.db as unknown as TeachersDb };
}

export function createActor(context: TeachersTestContext, role: Role): Promise<Actor> {
  return createStudentActor(context.test, context.schoolId, role);
}

export async function seedTeacher(
  context: TeachersTestContext,
  input: { userId?: string | null; code?: string | null; status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' } = {},
) {
  const [teacher] = await context.test.seed.insert(schema.teachers).values({
    schoolId: context.schoolId,
    userId: input.userId,
    firstName: 'Karim',
    lastName: 'Alaoui',
    teacherCode: input.code,
    status: input.status,
  }).returning();
  return teacher;
}
