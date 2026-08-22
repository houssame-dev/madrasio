import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@school/database';

import { AuthError } from '@/lib/auth/auth-errors';
import type { CurrentContext } from '@/lib/authorization/context';
import { UnauthenticatedError } from '@/lib/errors';

import { seedMembership, seedSchool, seedUser } from '../auth/test-helpers';
import { createTeachersTestContext, type TeachersTestContext } from './test-helpers';

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  context: null as unknown,
  authError: null as unknown,
}));
vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/lib/auth/require-context', () => ({
  requireCurrentContext: async () => {
    if (mocks.authError) throw mocks.authError;
    return mocks.context;
  },
}));

import {
  assignmentsGET, assignmentsPOST, endAssignmentPOST,
  teacherGET, teacherPATCH, teachersGET, teachersPOST,
} from '@/lib/api/teachers';

let seeded: TeachersTestContext;
beforeEach(async () => {
  seeded = await createTeachersTestContext();
  mocks.db = seeded.teacherDb;
  mocks.authError = null;
  mocks.context = contextFor(seeded.admin.userId!, seeded.schoolId, 'SCHOOL_ADMIN');
});

function contextFor(userId: string, schoolId: string, role: CurrentContext['role']): CurrentContext {
  return {
    userId,
    userActive: true,
    membership: { schoolId, status: 'ACTIVE' },
    schoolContext: { schoolId, isValid: true },
    role,
    scope: { teacherAssignments: [], parentStudents: [] },
  };
}
const json = (method: string, body: unknown) => new Request('http://local', {
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('Teachers and Assignment HTTP contracts', () => {
  it('covers Teacher create/list/detail/patch envelopes', async () => {
    const createdResponse = await teachersPOST(json('POST', {
      firstName: 'Karim', lastName: 'Alaoui', teacherCode: 'T-1',
    }));
    expect(createdResponse.status).toBe(201);
    const teacher = (await createdResponse.json()).data;
    expect(await (await teachersGET(new Request('http://local/api/v1/teachers?pageSize=10'))).json())
      .toMatchObject({
        data: [{ id: teacher.id }], meta: { page: 1, pageSize: 10, total: 1 },
      });
    expect((await teacherGET(new Request('http://local'), params(teacher.id))).status).toBe(200);
    expect(await (await teacherPATCH(
      json('PATCH', { status: 'INACTIVE' }), params(teacher.id),
    )).json()).toMatchObject({ data: { status: 'INACTIVE' } });
  });

  it('covers Assignment create, controlled duplicate, filtered history, and idempotent end', async () => {
    const teacher = (await (await teachersPOST(json('POST', {
      firstName: 'A', lastName: 'B',
    }))).json()).data;
    const payload = {
      academicYearId: seeded.yearId,
      classId: seeded.classAId,
      subjectId: seeded.subjectId,
      effectiveFrom: '2025-09-01',
    };
    const created = await assignmentsPOST(json('POST', payload), params(teacher.id));
    expect(created.status).toBe(201);
    const assignment = (await created.json()).data;
    expect(await (await assignmentsPOST(json('POST', payload), params(teacher.id))).json())
      .toMatchObject({ error: { featureCode: 'DUPLICATE_ASSIGNMENT' } });
    expect(await (await assignmentsGET(
      new Request(`http://local?status=ACTIVE&academicYearId=${seeded.yearId}`),
      params(teacher.id),
    )).json()).toMatchObject({ data: [{ id: assignment.id }], meta: { total: 1 } });
    const ended = await endAssignmentPOST(
      json('POST', { effectiveUntil: '2025-10-01' }), params(assignment.id),
    );
    expect(await ended.json()).toMatchObject({ data: { status: 'ENDED' } });
    expect(await (await endAssignmentPOST(
      json('POST', { effectiveUntil: '2025-12-01' }), params(assignment.id),
    )).json()).toMatchObject({ data: { effectiveUntil: '2025-10-01' } });
  });

  it('rejects malformed and authoritative profile/assignment fields', async () => {
    expect((await teachersPOST(new Request('http://local', {
      method: 'POST', body: '{',
    }))).status).toBe(400);
    expect((await teachersPOST(json('POST', {
      firstName: 'A', lastName: 'B', schoolId: crypto.randomUUID(),
    }))).status).toBe(400);
    const teacher = (await (await teachersPOST(json('POST', {
      firstName: 'A', lastName: 'B',
    }))).json()).data;
    expect((await teacherPATCH(
      json('PATCH', { classId: seeded.classAId }), params(teacher.id),
    )).status).toBe(400);
    expect((await assignmentsPOST(json('POST', {
      academicYearId: seeded.yearId,
      classId: seeded.classAId,
      subjectId: seeded.subjectId,
      effectiveFrom: 'not-a-date',
      status: 'ACTIVE',
    }), params(teacher.id))).status).toBe(400);
  });

  it('enforces Teacher self ownership and denies Parent access', async () => {
    const teacherUser = await seedUser(seeded.test.seed);
    await seedMembership(seeded.test.seed, teacherUser, seeded.schoolId, 'TEACHER');
    const own = (await (await teachersPOST(json('POST', {
      firstName: 'Own', lastName: 'Profile', userId: teacherUser,
    }))).json()).data;
    const other = (await (await teachersPOST(json('POST', {
      firstName: 'Other', lastName: 'Profile',
    }))).json()).data;
    mocks.context = contextFor(teacherUser, seeded.schoolId, 'TEACHER');
    expect((await teacherGET(new Request('http://local'), params(own.id))).status).toBe(200);
    expect((await teacherGET(new Request('http://local'), params(other.id))).status).toBe(404);
    expect((await teachersPOST(json('POST', { firstName: 'No', lastName: 'Write' }))).status)
      .toBe(403);

    const parentUser = await seedUser(seeded.test.seed);
    await seedMembership(seeded.test.seed, parentUser, seeded.schoolId, 'PARENT');
    mocks.context = contextFor(parentUser, seeded.schoolId, 'PARENT');
    expect((await teachersGET(new Request('http://local'))).status).toBe(403);
  });

  it('hides foreign-School resources and maps CurrentContext denials', async () => {
    const foreignSchool = await seedSchool(seeded.test.seed, 'Foreign');
    const [foreignTeacher] = await seeded.test.seed.insert(schema.teachers).values({
      schoolId: foreignSchool.id, firstName: 'Foreign', lastName: 'Teacher',
    }).returning();
    expect((await teacherGET(new Request('http://local'), params(foreignTeacher.id))).status).toBe(404);

    mocks.authError = new UnauthenticatedError();
    expect((await teachersGET(new Request('http://local'))).status).toBe(401);
    mocks.authError = new AuthError('SCHOOL_CONTEXT_REQUIRED', 'Select a School.');
    const missingSchool = await teachersGET(new Request('http://local'));
    expect(missingSchool.status).toBe(403);
    expect(await missingSchool.json()).toMatchObject({
      error: { featureCode: 'SCHOOL_CONTEXT_REQUIRED' },
    });
  });
});
