import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@school/database';
import { eq } from 'drizzle-orm';

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
  endRelationshipPOST, parentGET, parentPATCH, parentProfilesGET, parentsGET, parentsPOST,
  relationshipsGET, relationshipsPOST,
} from '@/lib/api/parents';
import { childAcademicYearsGET, childPlacementGET, childResultsGET } from '@/lib/api/parent-children';

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
const childParams = (studentId: string) => ({ params: Promise.resolve({ studentId }) });

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

  it('bootstraps only current-School ACTIVE self profiles and relationships', async () => {
    const parentUser = await seedUser(seeded.test.seed);
    await seedMembership(seeded.test.seed, parentUser, seeded.schoolId, 'PARENT');
    const [own, inactive] = await seeded.test.seed.insert(schema.parents).values([{
      schoolId: seeded.schoolId,
      userId: parentUser,
      firstName: 'Own',
      lastName: 'Parent',
    }, {
      schoolId: seeded.schoolId,
      userId: parentUser,
      firstName: 'Inactive',
      lastName: 'Parent',
      status: 'INACTIVE',
    }]).returning();
    const currentChild = await seedStudent(seeded.test, seeded.schoolId, 'Current');
    const oldChild = await seedStudent(seeded.test, seeded.schoolId, 'Old');
    const [currentRelationship] = await seeded.test.seed.insert(schema.parentStudents).values([{
      schoolId: seeded.schoolId,
      parentId: own.id,
      studentId: currentChild.id,
      status: 'ACTIVE',
    }, {
      schoolId: seeded.schoolId,
      parentId: own.id,
      studentId: oldChild.id,
      status: 'ENDED',
    }]).returning();
    const otherUser = await seedUser(seeded.test.seed);
    await seedMembership(seeded.test.seed, otherUser, seeded.schoolId, 'PARENT');
    await seeded.test.seed.insert(schema.parents).values({
      schoolId: seeded.schoolId,
      userId: otherUser,
      firstName: 'Other',
      lastName: 'Parent',
    });

    mocks.context = contextFor(parentUser, seeded.schoolId, 'PARENT');
    const response = await parentProfilesGET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      data: [{
        parent: {
          id: own.id,
          firstName: own.firstName,
          lastName: own.lastName,
          status: 'ACTIVE',
        },
        children: [{
          relationshipId: currentRelationship.id,
          student: {
            id: currentChild.id,
            firstName: currentChild.firstName,
            lastName: currentChild.lastName,
            studentCode: currentChild.studentCode,
          },
        }],
      }],
    });
    expect(payload.data.map((profile: { parent: { id: string } }) => profile.parent.id))
      .not.toContain(inactive.id);

    await seeded.test.seed.update(schema.parentStudents).set({ status: 'ENDED' })
      .where(eq(schema.parentStudents.id, currentRelationship.id));
    expect(await (await parentProfilesGET()).json()).toEqual({
      data: [{
        parent: {
          id: own.id,
          firstName: own.firstName,
          lastName: own.lastName,
          status: 'ACTIVE',
        },
        children: [],
      }],
    });
  });

  it('returns an empty bootstrap and maps authentication/context failures', async () => {
    const parentUser = await seedUser(seeded.test.seed);
    await seedMembership(seeded.test.seed, parentUser, seeded.schoolId, 'PARENT');
    mocks.context = contextFor(parentUser, seeded.schoolId, 'PARENT');
    expect(await (await parentProfilesGET()).json()).toEqual({ data: [] });

    mocks.authError = new UnauthenticatedError();
    expect((await parentProfilesGET()).status).toBe(401);
    mocks.authError = new AuthError('SCHOOL_CONTEXT_REQUIRED', 'Select a School.');
    expect((await parentProfilesGET()).status).toBe(403);
  });

  it('exposes validated Parent-only child academic read routes', async () => {
    const parentUser = await seedUser(seeded.test.seed);
    await seedMembership(seeded.test.seed, parentUser, seeded.schoolId, 'PARENT');
    const [parent] = await seeded.test.seed.insert(schema.parents).values({
      schoolId: seeded.schoolId, userId: parentUser, firstName: 'Route', lastName: 'Parent',
    }).returning();
    const student = await seedStudent(seeded.test, seeded.schoolId, 'RouteChild');
    await seeded.test.seed.insert(schema.parentStudents).values({ schoolId: seeded.schoolId, parentId: parent.id, studentId: student.id });
    await seeded.test.seed.insert(schema.studentEnrollments).values({
      schoolId: seeded.schoolId, studentId: student.id, academicYearId: seeded.yearId,
      classId: seeded.classAId, effectiveFrom: '2025-09-01', status: 'ACTIVE',
    });
    mocks.context = contextFor(parentUser, seeded.schoolId, 'PARENT');
    expect(await (await childAcademicYearsGET(new Request('http://local'), childParams(student.id))).json())
      .toMatchObject({ data: [{ id: seeded.yearId, name: '2025/2026' }] });
    expect((await childPlacementGET(new Request('http://local'), childParams(student.id))).status).toBe(400);
    expect(await (await childPlacementGET(new Request(`http://local?academicYearId=${seeded.yearId}`), childParams(student.id))).json())
      .toMatchObject({ data: { classId: seeded.classAId, academicYearId: seeded.yearId } });
    expect((await childResultsGET(new Request(`http://local?academicYearId=${seeded.yearId}&resultType=ANNUAL&academicPeriodId=${crypto.randomUUID()}`), childParams(student.id))).status).toBe(400);
    expect((await childResultsGET(new Request(`http://local?academicYearId=${seeded.yearId}&resultType=SUBJECT&pageSize=101`), childParams(student.id))).status).toBe(400);
    expect((await childAcademicYearsGET(new Request('http://local'), childParams(crypto.randomUUID()))).status).toBe(404);
    mocks.context = contextFor(seeded.admin.userId!, seeded.schoolId, 'SCHOOL_ADMIN');
    expect((await childAcademicYearsGET(new Request('http://local'), childParams(student.id))).status).toBe(403);
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
