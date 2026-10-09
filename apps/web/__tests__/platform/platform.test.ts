import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@school/database';
import type { User } from '@supabase/supabase-js';
import {
  createAuthTestDb,
  seedAuthUser,
  seedMembership,
  seedSchool,
  seedUser,
  type AuthTestDb,
} from '../auth/test-helpers';
import {
  createPlatformSchool,
  listPlatformSchools,
  openPlatformSchool,
  listSchoolAdmins,
  establishSchoolAdmin,
  changeSchoolAdminStatus,
  type AdminDependencies,
} from '@/lib/modules/platform/service';
import { requirePlatformAuthority } from '@/lib/authorization/server/platform';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';
import { resolveMeContext, toMeResponse } from '@/lib/api/me';
import * as auditRepo from '@/lib/audit/repository';
import { platformAuditSchema } from '@/lib/audit/platform';

let test: AuthTestDb;
let actor: string;
let schoolId: string;
let deps: AdminDependencies;
const records = new Map<string, User>();
const getUserById = vi.fn();
const inviteUserByEmail = vi.fn();
const deleteUser = vi.fn();
beforeEach(async () => {
  test = await createAuthTestDb();
  actor = await seedUser(test.seed);
  await test.seed
    .update(schema.users)
    .set({ isPlatformAdmin: true })
    .where(eq(schema.users.id, actor));
  schoolId = (await seedSchool(test.seed)).id;
  records.clear();
  getUserById.mockReset().mockImplementation(async (id: string) => records.get(id) ?? null);
  inviteUserByEmail.mockReset().mockImplementation(async (email: string) => {
    const id = await seedAuthUser(test.seed, undefined, email);
    const user = { id, email } as User;
    records.set(id, user);
    return user;
  });
  deleteUser.mockReset().mockImplementation(async (id: string) => {
    await test.client.query('delete from auth.users where id=$1', [id]);
    records.delete(id);
  });
  deps = {
    db: test.db,
    authAdmin: { getUserById, inviteUserByEmail, deleteUser },
    inviteRedirectTo: 'https://app.example.test/auth/confirm',
  };
});
afterEach(async () => {
  vi.restoreAllMocks();
  await test?.client.close();
});
async function existing(email = 'admin@example.test') {
  const id = await seedUser(test.seed, undefined, email);
  records.set(id, { id, email } as User);
  return id;
}
const add = (email = 'admin@example.test') =>
  establishSchoolAdmin(deps, actor, schoolId, { email });
const events = () => test.seed.select().from(schema.auditEvents);

it.each(['SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'SUPER_ADMIN', null] as const)(
  'denies all platform actions for membership role %s / unauthenticated',
  async (role) => {
    const userId = role ? await seedUser(test.seed) : null;
    if (role) await seedMembership(test.seed, userId!, schoolId, role);
    const calls = [
      () => listPlatformSchools(test.db, userId),
      () => createPlatformSchool(test.db, userId, { name: 'Denied' }),
      () => openPlatformSchool(test.db, userId, schoolId),
      () => listSchoolAdmins(test.db, userId, schoolId),
      () =>
        establishSchoolAdmin(deps, userId, schoolId, {
          email: 'new@example.test',
          role: 'SUPER_ADMIN',
        }),
      () => changeSchoolAdminStatus(deps, userId, schoolId, randomUUID(), { status: 'INACTIVE' }),
      () => changeSchoolAdminStatus(deps, userId, schoolId, randomUUID(), { status: 'ACTIVE' }),
    ];
    for (const call of calls)
      await expect(call()).rejects.toMatchObject({ status: role ? 403 : 401 });
    expect(await events()).toHaveLength(0);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  },
);

it('lists, creates, opens Schools and attributes atomic PLATFORM audit without School membership', async () => {
  const created = await createPlatformSchool(test.db, actor, {
    name: '  New School  ',
    timezone: 'Africa/Casablanca',
  });
  expect(created).toMatchObject({
    name: 'New School',
    timezone: 'Africa/Casablanca',
    status: 'ACTIVE',
  });
  expect((await listPlatformSchools(test.db, actor)).data).toHaveLength(2);
  expect(await openPlatformSchool(test.db, actor, created.id)).toEqual(created);
  expect(await listSchoolAdmins(test.db, actor, created.id)).toEqual([]);
  expect(await test.seed.select().from(schema.schoolMemberships)).toEqual([]);
  expect(await events()).toEqual([
    expect.objectContaining({
      action: 'SchoolCreated',
      scope: 'PLATFORM',
      schoolId: null,
      actorUserId: actor,
      resourceId: created.id,
      resourceType: 'School',
      metadata: { schoolId: created.id },
    }),
  ]);
});
it('resolves platform-only /me without granting ordinary School operations', async () => {
  const me = toMeResponse(await resolveMeContext(test.db, actor, null));
  expect(me).toMatchObject({
    platformAuthority: 'SUPER_ADMIN',
    currentSchool: null,
    memberships: [],
  });
  await expect(
    requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: actor }),
      readSelectedSchoolId: async () => schoolId,
    }),
  ).rejects.toMatchObject({ featureCode: 'SCHOOL_CONTEXT_REQUIRED' });
  for (const permission of [
    'students.manage',
    'attendance.manage',
    'homework.manage',
    'grades.manage',
  ] as const) {
    // Exercise the shared pipeline; no membership means denial before permission/scope.
    await expect(
      requireOperation(
        test.db as unknown as AuthorizationDb,
        { userId: actor, schoolId },
        { scope: { kind: 'school' }, permission },
      ),
    ).rejects.toMatchObject({ status: 403 });
  }
});
it.each(['SUSPENDED', 'DISABLED'] as const)(
  'denies globally %s platform operators',
  async (status) => {
    await test.seed.update(schema.users).set({ status }).where(eq(schema.users.id, actor));
    await expect(requirePlatformAuthority(test.db, actor)).rejects.toMatchObject({ status: 403 });
  },
);
it('keeps a platform operator with a Parent membership subject to its School permissions', async () => {
  await seedMembership(test.seed, actor, schoolId, 'PARENT');
  await expect(listPlatformSchools(test.db, actor)).resolves.toBeDefined();
  await expect(requireOperation(test.db as unknown as AuthorizationDb, { userId: actor, schoolId }, { scope: { kind: 'school' }, permission: 'students.manage' })).rejects.toMatchObject({ status: 403 });
  expect(toMeResponse(await resolveMeContext(test.db, actor, schoolId)).currentSchool?.role).toBe('PARENT');
});
it('serializes concurrent existing-user links without duplicate memberships or audits', async () => {
  await existing();
  const results = await Promise.all([add(), add(' ADMIN@example.test ')]);
  expect(results.map((r) => r.state).sort()).toEqual(['ALREADY_LINKED', 'LINKED']);
  expect(new Set(results.map((r) => r.membershipId)).size).toBe(1);
  expect(await listSchoolAdmins(test.db, actor, schoolId)).toHaveLength(1);
  expect(await events()).toHaveLength(1);
  expect(inviteUserByEmail).not.toHaveBeenCalled();
});
it('invites one new identity, defaults authority false, retries without delivery, supports second Admin', async () => {
  const first = await add(' New.Admin@Example.test ');
  expect(first.state).toBe('INVITED');
  expect(inviteUserByEmail).toHaveBeenCalledWith('new.admin@example.test', deps.inviteRedirectTo);
  const [membership] = await test.seed.select().from(schema.schoolMemberships);
  const [user] = await test.seed
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, membership.userId));
  expect(user).toMatchObject({ email: 'new.admin@example.test', isPlatformAdmin: false });
  expect(await add('NEW.ADMIN@example.test')).toEqual({
    membershipId: first.membershipId,
    state: 'ALREADY_LINKED',
  });
  expect(inviteUserByEmail).toHaveBeenCalledOnce();
  await existing();
  await add();
  expect(await listSchoolAdmins(test.db, actor, schoolId)).toHaveLength(2);
  expect((await events()).map((e) => e.action)).toEqual([
    'SchoolAdminMembershipEstablished',
    'SchoolAdminMembershipEstablished',
  ]);
});
it('reuses exact identity and preserves another School membership', async () => {
  const userId = await existing();
  const other = await seedSchool(test.seed, 'Other');
  const prior = await seedMembership(test.seed, userId, other.id, 'PARENT', 'INACTIVE');
  const before = await test.seed
    .select()
    .from(schema.schoolMemberships)
    .where(eq(schema.schoolMemberships.id, prior.id));
  expect((await add()).state).toBe('LINKED');
  expect(getUserById).toHaveBeenCalledWith(userId);
  expect(inviteUserByEmail).not.toHaveBeenCalled();
  expect(
    await test.seed
      .select()
      .from(schema.schoolMemberships)
      .where(eq(schema.schoolMemberships.id, prior.id)),
  ).toEqual(before);
});
it('fails closed for same-School conflicting role without mutations', async () => {
  const userId = await existing();
  await seedMembership(test.seed, userId, schoolId, 'PARENT');
  const before = await test.seed.select().from(schema.schoolMemberships);
  await expect(add()).rejects.toMatchObject({ featureCode: 'ACCOUNT_ROLE_CONFLICT' });
  expect(await test.seed.select().from(schema.schoolMemberships)).toEqual(before);
  expect(await events()).toEqual([]);
  expect(inviteUserByEmail).not.toHaveBeenCalled();
  expect(deleteUser).not.toHaveBeenCalled();
});
it.each(['missing', 'email-drift', 'uuid-drift'])(
  'rejects %s Auth mapping without repair',
  async (kind) => {
    const userId = await existing();
    records.set(userId, {
      id: kind === 'uuid-drift' ? randomUUID() : userId,
      email: kind === 'email-drift' ? 'different@example.test' : 'admin@example.test',
    } as User);
    if (kind === 'missing') records.delete(userId);
    await expect(add()).rejects.toMatchObject({
      featureCode: 'ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED',
    });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  },
);
it('deactivates only one membership, permits last Admin removal, reactivates same row idempotently', async () => {
  const userId = await existing();
  const other = await seedSchool(test.seed, 'Other');
  const otherMembership = await seedMembership(test.seed, userId, other.id, 'SCHOOL_ADMIN');
  const first = await add();
  const secondId = await existing('second@example.test');
  const second = await seedMembership(test.seed, secondId, schoolId, 'SCHOOL_ADMIN');
  const usersBefore = await test.seed.select().from(schema.users);
  await changeSchoolAdminStatus(deps, actor, schoolId, first.membershipId, { status: 'INACTIVE' });
  const read = () =>
    test.seed
      .select()
      .from(schema.schoolMemberships)
      .where(eq(schema.schoolMemberships.id, otherMembership.id));
  expect((await read())[0].status).toBe('ACTIVE');
  expect(
    (await listSchoolAdmins(test.db, actor, schoolId)).find((r) => r.id === second.id)?.status,
  ).toBe('ACTIVE');
  await changeSchoolAdminStatus(deps, actor, schoolId, second.id, { status: 'INACTIVE' });
  await expect(add()).rejects.toMatchObject({ status: 409 });
  await changeSchoolAdminStatus(deps, actor, schoolId, first.membershipId, { status: 'ACTIVE' });
  await changeSchoolAdminStatus(deps, actor, schoolId, first.membershipId, { status: 'ACTIVE' });
  expect(await test.seed.select().from(schema.users)).toEqual(usersBefore);
  expect((await events()).map((e) => e.action)).toEqual([
    'SchoolAdminMembershipEstablished',
    'SchoolAdminMembershipDeactivated',
    'SchoolAdminMembershipDeactivated',
    'SchoolAdminMembershipReactivated',
  ]);
  expect(deleteUser).not.toHaveBeenCalled();
});
it.each(['inactive-user', 'inactive-school', 'missing-auth'])(
  'rejects ineligible reactivation: %s',
  async (reason) => {
    const userId = await existing();
    const m = await seedMembership(test.seed, userId, schoolId, 'SCHOOL_ADMIN', 'INACTIVE');
    if (reason === 'inactive-user')
      await test.seed
        .update(schema.users)
        .set({ status: 'DISABLED' })
        .where(eq(schema.users.id, userId));
    if (reason === 'inactive-school')
      await test.seed
        .update(schema.schools)
        .set({ status: 'INACTIVE' })
        .where(eq(schema.schools.id, schoolId));
    if (reason === 'missing-auth') records.delete(userId);
    await expect(
      changeSchoolAdminStatus(deps, actor, schoolId, m.id, { status: 'ACTIVE' }),
    ).rejects.toThrow();
    expect((await listSchoolAdmins(test.db, actor, schoolId))[0].status).toBe('INACTIVE');
    expect(await events()).toEqual([]);
  },
);
it('rejects mismatched School/membership identifiers without changing the other School', async () => {
  const userId = await existing();
  const other = await seedSchool(test.seed);
  const m = await seedMembership(test.seed, userId, other.id, 'SCHOOL_ADMIN');
  await expect(
    changeSchoolAdminStatus(deps, actor, schoolId, m.id, { status: 'INACTIVE' }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    establishSchoolAdmin(deps, actor, randomUUID(), { email: 'new@example.test' }),
  ).rejects.toMatchObject({ status: 404 });
  expect(inviteUserByEmail).not.toHaveBeenCalled();
  expect(await events()).toEqual([]);
});
it.each(['userId', 'schoolId', 'role', 'isPlatformAdmin', 'password'])(
  'rejects client authority field %s',
  async (key) => {
    await expect(
      establishSchoolAdmin(deps, actor, schoolId, { email: 'new@example.test', [key]: actor }),
    ).rejects.toMatchObject({ status: 400 });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  },
);
it('preserves School and no app state when external invitation fails; never retries', async () => {
  inviteUserByEmail.mockRejectedValue(new Error('private-provider-secret'));
  await expect(add()).rejects.toMatchObject({ featureCode: 'ACCOUNT_INVITE_FAILED' });
  expect(inviteUserByEmail).toHaveBeenCalledOnce();
  expect(await openPlatformSchool(test.db, actor, schoolId)).toBeDefined();
  expect(await listSchoolAdmins(test.db, actor, schoolId)).toEqual([]);
  expect(await events()).toEqual([]);
});
it('compensates only the new Auth identity after atomic audit/DB rollback', async () => {
  vi.spyOn(auditRepo, 'appendAuditEvent').mockRejectedValue(new Error('private-db-secret'));
  await expect(add()).rejects.toMatchObject({ featureCode: 'AUDIT_PERSISTENCE_FAILED' });
  expect(deleteUser).toHaveBeenCalledOnce();
  expect((await test.seed.select().from(schema.users)).map((u) => u.id)).toEqual([actor]);
  expect(await listSchoolAdmins(test.db, actor, schoolId)).toEqual([]);
  expect(await events()).toEqual([]);
});
it('reports compensation required if cleanup fails', async () => {
  vi.spyOn(auditRepo, 'appendAuditEvent').mockRejectedValue(new Error('private-db-secret'));
  deleteUser.mockRejectedValue(new Error('private-cleanup-secret'));
  await expect(add()).rejects.toMatchObject({
    featureCode: 'ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED',
  });
});
it('never deletes existing identity on application failure', async () => {
  await existing();
  vi.spyOn(auditRepo, 'appendAuditEvent').mockRejectedValue(new Error('private-db-secret'));
  await expect(add()).rejects.toThrow();
  expect(deleteUser).not.toHaveBeenCalled();
  expect(await listSchoolAdmins(test.db, actor, schoolId)).toEqual([]);
});
it('rolls back School creation and lifecycle mutation if audit persistence fails', async () => {
  await existing();
  const m = await add();
  vi.spyOn(auditRepo, 'appendAuditEvent').mockRejectedValue(new Error('private-db-secret'));
  await expect(createPlatformSchool(test.db, actor, { name: 'Rollback' })).rejects.toThrow();
  await expect(
    changeSchoolAdminStatus(deps, actor, schoolId, m.membershipId, { status: 'INACTIVE' }),
  ).rejects.toThrow();
  expect((await listPlatformSchools(test.db, actor)).data).toHaveLength(1);
  expect((await listSchoolAdmins(test.db, actor, schoolId))[0].status).toBe('ACTIVE');
});
it('rejects audit metadata extras and invalid School/timezone inputs', async () => {
  expect(
    platformAuditSchema.safeParse({
      action: 'SchoolCreated',
      resourceId: schoolId,
      metadata: { schoolId, token: 'synthetic' },
    }).success,
  ).toBe(false);
  await expect(
    createPlatformSchool(test.db, actor, { name: ' ', timezone: 'UTC' }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    createPlatformSchool(test.db, actor, { name: 'School', timezone: 'not-a-zone' }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    createPlatformSchool(test.db, actor, { name: 'School', userId: actor }),
  ).rejects.toMatchObject({ status: 400 });
});
