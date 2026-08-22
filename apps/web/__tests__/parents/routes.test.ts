import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@school/database';

import { AuthError } from '@/lib/auth/auth-errors';
import type { CurrentContext } from '@/lib/authorization/context';
import { UnauthenticatedError } from '@/lib/errors';

import { seedMembership, seedSchool, seedUser } from '../auth/test-helpers';
import { seedStudent } from '../students/test-helpers';
import { createParentsTestContext, type ParentsTestContext } from './test-helpers';

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
  endRelationshipPOST, parentGET, parentPATCH, parentsGET, parentsPOST,
  relationshipsGET, relationshipsPOST,
} from '@/lib/api/parents';

let seeded: ParentsTestContext;
beforeEach(async () => {
  seeded = await createParentsTestContext();
  mocks.db = seeded.parentDb;
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

describe('Parents and Relationships HTTP contracts', () => {
  it('covers Parent create/list/detail/patch envelopes', async () => {
    const createdResponse = await parentsPOST(json('POST', {
      firstName: 'Sara', lastName: 'Benali', parentCode: 'P-1',
    }));
    expect(createdResponse.status).toBe(201);
    const parent = (await createdResponse.json()).data;
    expect(await (await parentsGET(new Request('http://local/api/v1/parents?pageSize=10'))).json())
      .toMatchObject({
        data: [{ id: parent.id }], meta: { page: 1, pageSize: 10, total: 1 },
      });
    expect((await parentGET(new Request('http://local'), params(parent.id))).status).toBe(200);
    expect(await (await parentPATCH(
      json('PATCH', { status: 'INACTIVE' }), params(parent.id),
    )).json()).toMatchObject({ data: { status: 'INACTIVE' } });
  });

  it('covers Relationship create, controlled duplicate, history, and idempotent END', async () => {
    const parent = (await (await parentsPOST(json('POST', {
      firstName: 'A', lastName: 'B',
    }))).json()).data;
    const student = await seedStudent(seeded.test, seeded.schoolId);
    const created = await relationshipsPOST(json('POST', { studentId: student.id }), params(parent.id));
    expect(created.status).toBe(201);
    const relationship = (await created.json()).data;
    expect(await (await relationshipsPOST(
      json('POST', { studentId: student.id }), params(parent.id),
    )).json()).toMatchObject({
      error: { featureCode: 'DUPLICATE_PARENT_STUDENT_RELATIONSHIP' },
    });
    expect(await (await relationshipsGET(
      new Request(`http://local?status=ACTIVE&studentId=${student.id}`), params(parent.id),
    )).json()).toMatchObject({ data: [{ id: relationship.id }], meta: { total: 1 } });
    expect(await (await endRelationshipPOST(json('POST', {}), params(relationship.id))).json())
      .toMatchObject({ data: { status: 'ENDED' } });
    expect(await (await endRelationshipPOST(json('POST', {}), params(relationship.id))).json())
      .toMatchObject({ data: { status: 'ENDED' } });
  });

  it('rejects malformed and authoritative profile/relationship fields', async () => {
    expect((await parentsPOST(new Request('http://local', {
      method: 'POST', body: '{',
    }))).status).toBe(400);
    expect((await parentsPOST(json('POST', {
      firstName: 'A', lastName: 'B', schoolId: crypto.randomUUID(),
    }))).status).toBe(400);
    const parent = (await (await parentsPOST(json('POST', {
      firstName: 'A', lastName: 'B',
    }))).json()).data;
    expect((await parentPATCH(
      json('PATCH', { studentIds: [crypto.randomUUID()] }), params(parent.id),
    )).status).toBe(400);
    expect((await relationshipsPOST(json('POST', {
      studentId: 'bad-id', status: 'ACTIVE',
    }), params(parent.id))).status).toBe(400);
  });

  it('enforces Parent self ownership and conservative self-update policy', async () => {
    const parentUser = await seedUser(seeded.test.seed);
    await seedMembership(seeded.test.seed, parentUser, seeded.schoolId, 'PARENT');
    const own = (await (await parentsPOST(json('POST', {
      firstName: 'Own', lastName: 'Parent', userId: parentUser,
    }))).json()).data;
    const other = (await (await parentsPOST(json('POST', {
      firstName: 'Other', lastName: 'Parent',
    }))).json()).data;
    mocks.context = contextFor(parentUser, seeded.schoolId, 'PARENT');
    expect((await parentGET(new Request('http://local'), params(own.id))).status).toBe(200);
    expect((await parentGET(new Request('http://local'), params(other.id))).status).toBe(404);
    expect((await parentsGET(new Request('http://local'))).status).toBe(403);
    expect((await parentPATCH(json('PATCH', { firstName: 'Self' }), params(own.id))).status).toBe(200);
    expect((await parentPATCH(json('PATCH', { parentCode: 'ADMIN' }), params(own.id))).status)
      .toBe(403);
  });

  it('hides foreign-School resources and maps CurrentContext denials', async () => {
    const foreignSchool = await seedSchool(seeded.test.seed, 'Foreign');
    const [foreignParent] = await seeded.test.seed.insert(schema.parents).values({
      schoolId: foreignSchool.id, firstName: 'Foreign', lastName: 'Parent',
    }).returning();
    expect((await parentGET(new Request('http://local'), params(foreignParent.id))).status).toBe(404);
    mocks.authError = new UnauthenticatedError();
    expect((await parentsGET(new Request('http://local'))).status).toBe(401);
    mocks.authError = new AuthError('SCHOOL_CONTEXT_REQUIRED', 'Select a School.');
    const missing = await parentsGET(new Request('http://local'));
    expect(missing.status).toBe(403);
    expect(await missing.json()).toMatchObject({
      error: { featureCode: 'SCHOOL_CONTEXT_REQUIRED' },
    });
  });
});
