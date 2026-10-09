import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@school/database';
import {
  createAuthTestDb,
  seedSchool,
  seedUser,
  seedMembership,
  type AuthTestDb,
} from '../auth/test-helpers';
import { UnauthenticatedError } from '@/lib/errors';
const mocks = vi.hoisted(() => ({ db: vi.fn(), session: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getDb: mocks.db }));
vi.mock('@/lib/auth/server-auth', () => ({ getAuthenticatedUserId: mocks.session }));
vi.mock('@/lib/auth/admin', () => ({ getAuthAdmin: mocks.admin }));
vi.mock('@/lib/config/env', () => ({
  getServerEnv: () => ({ APP_URL: 'https://app.example.test' }),
}));
import { GET, POST } from '@/app/api/v1/platform/schools/route';
import { POST as addAdmin } from '@/app/api/v1/platform/schools/[schoolId]/admins/route';
import { PATCH } from '@/app/api/v1/platform/schools/[schoolId]/admins/[membershipId]/route';
let test: AuthTestDb;
let actor: string;
let schoolId: string;
beforeEach(async () => {
  vi.clearAllMocks();
  test = await createAuthTestDb();
  actor = await seedUser(test.seed);
  schoolId = (await seedSchool(test.seed)).id;
  mocks.db.mockReturnValue(test.db);
  mocks.session.mockResolvedValue(actor);
  mocks.admin.mockImplementation(() => {
    throw new Error('Provider must not be constructed for invalid/denied input');
  });
});
afterEach(async () => {
  await test?.client.close();
});
const request = (method: string, body?: object) =>
  new Request('https://app.example.test/api/v1/platform/schools', {
    method,
    headers: { 'content-type': 'application/json', 'x-user-id': 'forged', 'x-role': 'SUPER_ADMIN' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
it('returns private 401 for an unauthenticated caller', async () => {
  mocks.session.mockRejectedValue(new UnauthenticatedError());
  const r = await GET(request('GET'));
  expect(r.status).toBe(401);
  expect(r.headers.get('cache-control')).toContain('no-store');
});
it.each(['SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'SUPER_ADMIN'] as const)(
  'denies %s membership despite forged authority headers/body',
  async (role) => {
    await seedMembership(test.seed, actor, schoolId, role);
    expect((await GET(request('GET'))).status).toBe(403);
    expect(
      (await POST(request('POST', { name: 'Denied', userId: actor, role: 'SUPER_ADMIN' }))).status,
    ).toBe(403);
    expect(
      (
        await addAdmin(request('POST', { email: 'new@example.test' }), {
          params: Promise.resolve({ schoolId }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await PATCH(request('PATCH', { status: 'INACTIVE' }), {
          params: Promise.resolve({ schoolId, membershipId: actor }),
        })
      ).status,
    ).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  },
);
it('authorized server identity can list/create, but cannot submit arbitrary account authority', async () => {
  await test.seed.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, actor));
  const r = await POST(request('POST', { name: 'New', timezone: 'UTC' }));
  expect(r.status).toBe(200);
  expect((await r.json()).data.name).toBe('New');
  expect((await GET(request('GET'))).status).toBe(200);
  for (const field of [
    'userId',
    'schoolId',
    'role',
    'permissions',
    'password',
    'isPlatformAdmin',
  ]) {
    const invalid = await addAdmin(request('POST', { email: 'new@example.test', [field]: actor }), {
      params: Promise.resolve({ schoolId }),
    });
    expect(invalid.status).toBe(400);
  }
  expect(mocks.admin).not.toHaveBeenCalled();
});
