import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/lib/auth/auth-errors';
import type { CurrentContext } from '@/lib/authorization/context';
import { UnauthenticatedError } from '@/lib/errors';

import { seedMembership, seedSchool, seedUser } from '../auth/test-helpers';
import { createStudentsTestContext, type StudentsTestContext } from './test-helpers';

const mocks = vi.hoisted(() => ({ db: null as unknown, context: null as unknown, authError: null as unknown }));
vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/lib/auth/require-context', () => ({
  requireCurrentContext: async () => {
    if (mocks.authError) throw mocks.authError;
    return mocks.context;
  },
}));

import {
  currentEnrollmentGET, endEnrollmentPOST, enrollmentsGET, enrollmentsPOST,
  studentGET, studentPATCH, studentsGET, studentsPOST, transferPOST,
} from '@/lib/api/students';

let seeded: StudentsTestContext;
beforeEach(async () => {
  seeded = await createStudentsTestContext();
  mocks.db = seeded.db;
  mocks.authError = null;
  mocks.context = {
    userId: seeded.admin.userId,
    userActive: true,
    membership: { schoolId: seeded.schoolId, status: 'ACTIVE' },
    schoolContext: { schoolId: seeded.schoolId, isValid: true },
    role: 'SCHOOL_ADMIN',
    scope: { teacherAssignments: [], parentStudents: [] },
  } satisfies CurrentContext;
});

const json = (method: string, body: unknown) => new Request('http://local', {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('Students and Enrollment HTTP contracts', () => {
  it('covers Student create/list/detail/patch envelopes', async () => {
    const createdResponse = await studentsPOST(json('POST', {
      firstName: 'Amine', lastName: 'Benali', studentCode: 'S-1',
    }));
    expect(createdResponse.status).toBe(201);
    const student = (await createdResponse.json()).data;
    expect(await (await studentsGET(new Request('http://local/api/v1/students?pageSize=10'))).json()).toMatchObject({
      data: [{ id: student.id }], meta: { page: 1, pageSize: 10, total: 1 },
    });
    expect((await studentGET(new Request('http://local'), params(student.id))).status).toBe(200);
    const patched = await studentPATCH(json('PATCH', { status: 'INACTIVE' }), params(student.id));
    expect(await patched.json()).toMatchObject({ data: { status: 'INACTIVE' } });
  });

  it('covers initial enrollment, controlled duplicate, transfer, current, history, and end', async () => {
    const student = (await (await studentsPOST(json('POST', { firstName: 'A', lastName: 'B' }))).json()).data;
    const enrollmentResponse = await enrollmentsPOST(json('POST', {
      academicYearId: seeded.yearId, classId: seeded.classAId, effectiveFrom: '2025-09-01',
    }), params(student.id));
    expect(enrollmentResponse.status).toBe(201);
    const enrollment = (await enrollmentResponse.json()).data;
    const duplicate = await enrollmentsPOST(json('POST', {
      academicYearId: seeded.yearId, classId: seeded.classBId, effectiveFrom: '2025-10-01',
    }), params(student.id));
    expect(await duplicate.json()).toMatchObject({ error: { featureCode: 'DUPLICATE_ENROLLMENT' } });

    const transferred = await transferPOST(json('POST', {
      academicYearId: seeded.yearId, toClassId: seeded.classBId, effectiveDate: '2025-10-15',
    }), params(student.id));
    expect(await transferred.json()).toMatchObject({
      data: {
        previousEnrollment: { id: enrollment.id, status: 'ENDED', effectiveUntil: '2025-10-14' },
        currentEnrollment: { classId: seeded.classBId, status: 'ACTIVE' },
      },
    });
    const current = await currentEnrollmentGET(
      new Request(`http://local?academicYearId=${seeded.yearId}`),
      params(student.id),
    );
    const currentData = (await current.json()).data;
    expect(currentData.classId).toBe(seeded.classBId);
    expect((await (await enrollmentsGET(new Request('http://local'), params(student.id))).json()).data).toHaveLength(2);
    const ended = await endEnrollmentPOST(json('POST', { effectiveUntil: '2025-11-01' }), params(currentData.id));
    expect(await ended.json()).toMatchObject({ data: { status: 'ENDED' } });
  });

  it('rejects malformed/authoritative placement fields', async () => {
    expect((await studentsPOST(new Request('http://local', { method: 'POST', body: '{' }))).status).toBe(400);
    expect((await studentsPOST(json('POST', { firstName: 'A', lastName: 'B', schoolId: crypto.randomUUID() }))).status).toBe(400);
    const created = (await (await studentsPOST(json('POST', { firstName: 'A', lastName: 'B' }))).json()).data;
    expect((await studentPATCH(json('PATCH', { classId: seeded.classAId }), params(created.id))).status).toBe(400);
  });

  it('hides foreign-School Student detail', async () => {
    const student = (await (await studentsPOST(json('POST', { firstName: 'A', lastName: 'B' }))).json()).data;
    const otherSchool = await seedSchool(seeded.test.seed, 'Other');
    const otherUser = await seedUser(seeded.test.seed);
    await seedMembership(seeded.test.seed, otherUser, otherSchool.id, 'SCHOOL_ADMIN');
    mocks.context = {
      ...(mocks.context as CurrentContext),
      userId: otherUser,
      membership: { schoolId: otherSchool.id, status: 'ACTIVE' },
      schoolContext: { schoolId: otherSchool.id, isValid: true },
    };
    const response = await studentGET(new Request('http://local'), params(student.id));
    expect(response.status).toBe(404);
  });

  it('maps unauthenticated and missing School context denials', async () => {
    mocks.authError = new UnauthenticatedError();
    expect((await studentsGET(new Request('http://local'))).status).toBe(401);
    mocks.authError = new AuthError('SCHOOL_CONTEXT_REQUIRED', 'Select a School.');
    const missingSchool = await studentsGET(new Request('http://local'));
    expect(missingSchool.status).toBe(403);
    expect(await missingSchool.json()).toMatchObject({ error: { featureCode: 'SCHOOL_CONTEXT_REQUIRED' } });
  });
});
