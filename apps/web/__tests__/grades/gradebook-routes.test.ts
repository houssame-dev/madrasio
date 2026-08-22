import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentContext } from '@/lib/authorization/context';
import { AuthError } from '@/lib/auth/auth-errors';
import { UnauthenticatedError } from '@/lib/errors';

import {
  assignTeacher, createGradebookTestContext, gradebookInput, type GradebookTestContext,
} from './gradebook-test-helpers';

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
  assessmentGET, assessmentPATCH, assessmentsGET, assessmentsPOST,
  gradebookGET, gradebookPATCH, gradebooksGET, gradebooksPOST,
} from '@/lib/api/gradebooks';

let seeded: GradebookTestContext;
beforeEach(async () => {
  seeded = await createGradebookTestContext();
  mocks.db = seeded.db;
  mocks.authError = null;
  mocks.context = contextFor(seeded.admin.userId!, seeded.school.schoolId, 'SCHOOL_ADMIN');
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
const assessment = () => ({
  title: 'Quiz 1', assessmentType: 'QUIZ', maximumScore: '20', weight: '1',
  assessmentDate: '2025-10-01',
});

describe('Gradebook and Assessment HTTP contracts', () => {
  it('covers Gradebook create, filtered list, detail, and lifecycle patch envelopes', async () => {
    const createdResponse = await gradebooksPOST(json('POST', gradebookInput(seeded)));
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()).data;
    expect(await (await gradebooksGET(new Request(
      `http://local/api/v1/gradebooks?subjectId=${seeded.school.subjectMathId}&pageSize=10`,
    ))).json()).toMatchObject({
      data: [{ id: created.id }], meta: { page: 1, pageSize: 10, total: 1 },
    });
    expect((await gradebookGET(new Request('http://local'), params(created.id))).status).toBe(200);
    expect(await (await gradebookPATCH(
      json('PATCH', { status: 'OPEN' }), params(created.id),
    )).json()).toMatchObject({ data: { status: 'OPEN' } });
  });

  it('covers nested Assessment create/list plus detail and patch', async () => {
    const gradebook = (await (await gradebooksPOST(json('POST', gradebookInput(seeded)))).json()).data;
    const createdResponse = await assessmentsPOST(json('POST', assessment()), params(gradebook.id));
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()).data;
    expect(await (await assessmentsGET(
      new Request('http://local?assessmentType=QUIZ&page=1&pageSize=10'), params(gradebook.id),
    )).json()).toMatchObject({ data: [{ id: created.id }], meta: { total: 1 } });
    expect((await assessmentGET(new Request('http://local'), params(created.id))).status).toBe(200);
    expect(await (await assessmentPATCH(
      json('PATCH', { status: 'PUBLISHED' }), params(created.id),
    )).json()).toMatchObject({ data: { status: 'PUBLISHED' } });
  });

  it('rejects malformed, invalid query, and authoritative inputs', async () => {
    expect((await gradebooksPOST(new Request('http://local', { method: 'POST', body: '{' }))).status)
      .toBe(400);
    expect((await gradebooksPOST(json('POST', {
      ...gradebookInput(seeded), schoolId: crypto.randomUUID(),
    }))).status).toBe(400);
    expect((await gradebooksGET(new Request('http://local?pageSize=101'))).status).toBe(400);
    const gradebook = (await (await gradebooksPOST(json('POST', gradebookInput(seeded)))).json()).data;
    expect((await assessmentsPOST(json('POST', {
      ...assessment(), gradebookId: gradebook.id, score: '12',
    }), params(gradebook.id))).status).toBe(400);
    expect((await gradebookPATCH(
      json('PATCH', { academicYearId: seeded.school.yearId }), params(gradebook.id),
    )).status).toBe(400);
  });

  it('enforces Teacher exact academic scope at HTTP level', async () => {
    await assignTeacher(seeded);
    mocks.context = contextFor(seeded.teacher.userId!, seeded.school.schoolId, 'TEACHER');
    const own = await gradebooksPOST(json('POST', gradebookInput(seeded)));
    expect(own.status).toBe(201);
    const forbidden = await gradebooksPOST(json('POST', {
      ...gradebookInput(seeded, seeded.school.subjectPhysicsId),
      academicPeriodId: seeded.school.period2Id,
    }));
    expect(forbidden.status).toBe(403);
  });

  it('maps authentication and School Context denials through shared errors', async () => {
    mocks.authError = new UnauthenticatedError();
    expect((await gradebooksGET(new Request('http://local'))).status).toBe(401);
    mocks.authError = new AuthError('SCHOOL_CONTEXT_REQUIRED', 'Select a School.');
    const response = await gradebooksGET(new Request('http://local'));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { featureCode: 'SCHOOL_CONTEXT_REQUIRED' },
    });
  });
});
