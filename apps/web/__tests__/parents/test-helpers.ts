import * as schema from '@school/database';

import type { Role } from '@/lib/authorization/roles';
import type { Actor } from '@/lib/modules/parents/application';
import type { ParentsDb } from '@/lib/modules/parents/infrastructure/repositories/parent-repository';

import {
  createActor as createStudentActor,
  createStudentsTestContext,
  type StudentsTestContext,
} from '../students/test-helpers';

export interface ParentsTestContext extends StudentsTestContext { parentDb: ParentsDb }

export async function createParentsTestContext(): Promise<ParentsTestContext> {
  const context = await createStudentsTestContext();
  return { ...context, parentDb: context.db as unknown as ParentsDb };
}

export function createActor(context: ParentsTestContext, role: Role): Promise<Actor> {
  return createStudentActor(context.test, context.schoolId, role);
}

export async function seedParent(
  context: ParentsTestContext,
  input: { userId?: string | null; code?: string | null; status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' } = {},
) {
  const [parent] = await context.test.seed.insert(schema.parents).values({
    schoolId: context.schoolId,
    userId: input.userId,
    firstName: 'Sara',
    lastName: 'Benali',
    parentCode: input.code,
    status: input.status,
  }).returning();
  return parent;
}
