import { randomUUID } from 'node:crypto';

import type { User } from '@supabase/supabase-js';
import * as schema from '@school/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentContext } from '@/lib/authorization/context';
import { UnauthenticatedError } from '@/lib/errors';

import { seedAuthUser, seedMembership, seedUser } from '../auth/test-helpers';
import { createTeachersTestContext, seedTeacher, type TeachersTestContext } from '../teachers/test-helpers';

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  context: null as unknown,
  authError: null as unknown,
  authAdmin: { getUserById: vi.fn(), inviteUserByEmail: vi.fn(), deleteUser: vi.fn() },
}));
vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/lib/auth/require-context', () => ({
  requireCurrentContext: async () => {
    if (mocks.authError) throw mocks.authError;
    return mocks.context;
  },
}));
vi.mock('@/lib/auth/admin', () => ({ getAuthAdmin: () => mocks.authAdmin }));
vi.mock('@/lib/config/env', () => ({ getServerEnv: () => ({ APP_URL: 'http://localhost:3000' }) }));

import { parentInviteAccountPOST } from '@/lib/api/parents';
import { teacherInviteAccountPOST } from '@/lib/api/teachers';

let seeded: TeachersTestContext;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (body: unknown) => new Request('http://localhost', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
function context(userId: string, schoolId: string, role: CurrentContext['role']): CurrentContext {
  return { userId, userActive: true, membership: { schoolId, status: 'ACTIVE' },
    schoolContext: { schoolId, isValid: true }, role,
    scope: { teacherAssignments: [], parentStudents: [] } };
}
function user(id: string, email: string): User {
  return { id, email, aud: 'authenticated', role: 'authenticated', created_at: new Date(0).toISOString(),
    app_metadata: {}, user_metadata: {} } as User;
}

beforeEach(async () => {
  seeded = await createTeachersTestContext();
  mocks.db = seeded.test.seed;
  mocks.context = context(seeded.admin.userId!, seeded.schoolId, 'SCHOOL_ADMIN');
  mocks.authError = null;
  mocks.authAdmin.getUserById.mockReset();
  mocks.authAdmin.inviteUserByEmail.mockReset();
  mocks.authAdmin.deleteUser.mockReset().mockResolvedValue(undefined);
  mocks.authAdmin.inviteUserByEmail.mockImplementation(async (email: string, redirect: string) => {
    expect(redirect).toBe('http://localhost:3000/auth/confirm');
    const id = randomUUID();
    await seedAuthUser(seeded.test.seed, id, email);
    return user(id, email);
  });
});

describe('Teacher/Parent invite account HTTP contracts', () => {
  it('exposes narrow successful Teacher and Parent actions with server-derived roles', async () => {
    const teacher = await seedTeacher(seeded);
    const [parent] = await seeded.test.seed.insert(schema.parents).values({
      schoolId: seeded.schoolId, firstName: 'One', lastName: 'Parent', status: 'ACTIVE',
    }).returning();
    const teacherResponse = await teacherInviteAccountPOST(request({ email: 'teacher.new@example.com' }), params(teacher.id));
    const parentResponse = await parentInviteAccountPOST(request({ email: 'parent.new@example.com' }), params(parent.id));
    expect(teacherResponse.status).toBe(200);
    expect(parentResponse.status).toBe(200);
    expect(await teacherResponse.json()).toMatchObject({ data: { profileId: teacher.id, state: 'INVITED' } });
    expect(await parentResponse.json()).toMatchObject({ data: { profileId: parent.id, state: 'INVITED' } });
    const memberships = await seeded.test.seed.select().from(schema.schoolMemberships);
    expect(memberships.map((row) => row.role)).toEqual(expect.arrayContaining(['TEACHER', 'PARENT']));
  });

  it.each([
    { email: 'valid@example.com', role: 'SUPER_ADMIN' },
    { email: 'valid@example.com', schoolId: randomUUID() },
    { email: 'valid@example.com', userId: randomUUID() },
    { email: 'invalid' },
  ])('strictly rejects client authority and malformed email', async (body) => {
    const teacher = await seedTeacher(seeded);
    expect((await teacherInviteAccountPOST(request(body), params(teacher.id))).status).toBe(400);
    expect(mocks.authAdmin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('denies unauthenticated, Teacher, and Parent callers', async () => {
    const teacher = await seedTeacher(seeded);
    mocks.authError = new UnauthenticatedError();
    expect((await teacherInviteAccountPOST(request({ email: 'new@example.com' }), params(teacher.id))).status).toBe(401);
    mocks.authError = null;
    for (const role of ['TEACHER', 'PARENT'] as const) {
      const id = await seedUser(seeded.test.seed);
      await seedMembership(seeded.test.seed, id, seeded.schoolId, role);
      mocks.context = context(id, seeded.schoolId, role);
      expect((await teacherInviteAccountPOST(request({ email: `${role.toLowerCase()}@example.com` }), params(teacher.id))).status).toBe(403);
    }
    expect(mocks.authAdmin.inviteUserByEmail).not.toHaveBeenCalled();
  });
});

