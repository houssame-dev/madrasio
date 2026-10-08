import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import * as schema from '@school/database';
import { eq } from 'drizzle-orm';
import { recoverProfileAccount } from '@/lib/modules/user-provisioning/application/recover-account';
import type { ProvisioningDb } from '@/lib/modules/user-provisioning/infrastructure/provisioning-repository';
import * as auditRepository from '@/lib/audit/repository';
import { schoolAuditEventSchema } from '@/lib/audit/contracts';
import {
  createAuthTestDb,
  seedUser,
  seedSchool,
  seedMembership,
  type AuthTestDb,
} from '../auth/test-helpers';

let test: AuthTestDb;
let actor: { userId: string; schoolId: string };
let targetId: string;
let profileId: string;
let deps: Parameters<typeof recoverProfileAccount>[0];
const getUserById = vi.fn();
const request = vi.fn();
const run = () => recoverProfileAccount(deps, actor, 'TEACHER', profileId);
beforeEach(async () => {
  test = await createAuthTestDb();
  const school = await seedSchool(test.seed);
  const admin = await seedUser(test.seed);
  await seedMembership(test.seed, admin, school.id, 'SCHOOL_ADMIN');
  actor = { userId: admin, schoolId: school.id };
  targetId = await seedUser(test.seed, undefined, 'existing@example.test');
  await seedMembership(test.seed, targetId, school.id, 'TEACHER');
  const [teacher] = await test.seed
    .insert(schema.teachers)
    .values({
      schoolId: school.id,
      userId: targetId,
      firstName: 'Synthetic',
      lastName: 'Teacher',
      status: 'ACTIVE',
    })
    .returning();
  profileId = teacher.id;
  getUserById
    .mockReset()
    .mockResolvedValue({ id: targetId, email: ' EXISTING@example.test ' } as User);
  request.mockReset().mockResolvedValue(undefined);
  deps = {
    db: test.seed as unknown as ProvisioningDb,
    authAdmin: { getUserById },
    delivery: { request },
    redirectTo: 'https://app.example.test/auth/confirm',
  };
});
afterEach(async () => {
  vi.restoreAllMocks();
  await test?.client.close();
});

async function identitySnapshot() {
  return {
    auth: (await test.client.query('select * from auth.users order by id')).rows,
    users: await test.seed.select().from(schema.users).orderBy(schema.users.id),
    memberships: await test.seed
      .select()
      .from(schema.schoolMemberships)
      .orderBy(schema.schoolMemberships.id),
    teachers: await test.seed.select().from(schema.teachers),
    parents: await test.seed.select().from(schema.parents),
    relationships: await test.seed.select().from(schema.parentStudents),
  };
}
describe('identity-preserving School account recovery', () => {
  it.each(['pending', 'expired-link', 'confirmed'])(
    'supports existing %s identity with bounded intent audit and no identity writes',
    async (state) => {
      // Expiry belongs to provider token state, not a fabricated application invitation status.
      if (state === 'confirmed')
        getUserById.mockResolvedValue({
          id: targetId,
          email: 'existing@example.test',
          email_confirmed_at: new Date(0).toISOString(),
        });
      const otherSchool = await seedSchool(test.seed, 'Other');
      await seedMembership(test.seed, targetId, otherSchool.id, 'PARENT', 'INACTIVE');
      const before = await identitySnapshot();
      expect(await run()).toEqual({ state: 'REQUESTED' });
      expect(await identitySnapshot()).toEqual(before);
      expect(getUserById).toHaveBeenCalledWith(targetId);
      expect(getUserById).toHaveBeenCalledOnce();
      expect(request).toHaveBeenCalledWith(
        'existing@example.test',
        'https://app.example.test/auth/confirm',
      );
      expect(request).toHaveBeenCalledOnce();
      const events = await test.seed.select().from(schema.auditEvents);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorKind: 'USER',
        actorUserId: actor.userId,
        schoolId: actor.schoolId,
        action: 'AccountRecoveryRequested',
        resourceType: 'User',
        resourceId: targetId,
        metadata: {
          profileKind: 'TEACHER',
          profileId,
          identityState: state === 'confirmed' ? 'CONFIRMED' : 'UNCONFIRMED',
        },
      });
      expect(Object.keys(events[0].metadata).sort()).toEqual([
        'identityState',
        'profileId',
        'profileKind',
      ]);
    },
  );
  it('supports a linked Parent without changing child relationships', async () => {
    const parentUser = await seedUser(test.seed, undefined, 'parent@example.test');
    await seedMembership(test.seed, parentUser, actor.schoolId, 'PARENT');
    const [parent] = await test.seed
      .insert(schema.parents)
      .values({
        schoolId: actor.schoolId,
        userId: parentUser,
        firstName: 'Synthetic',
        lastName: 'Parent',
      })
      .returning();
    const [student] = await test.seed
      .insert(schema.students)
      .values({ schoolId: actor.schoolId, firstName: 'Synthetic', lastName: 'Child' })
      .returning();
    await test.seed
      .insert(schema.parentStudents)
      .values({
        schoolId: actor.schoolId,
        parentId: parent.id,
        studentId: student.id,
      });
    getUserById.mockResolvedValue({ id: parentUser, email: 'parent@example.test' });
    const before = await identitySnapshot();
    await recoverProfileAccount(deps, actor, 'PARENT', parent.id);
    expect(await identitySnapshot()).toEqual(before);
    expect((await test.seed.select().from(schema.auditEvents))[0].metadata).toMatchObject({
      profileKind: 'PARENT',
    });
  });
  it.each(['TEACHER', 'PARENT'] as const)(
    'denies %s callers before provider/audit',
    async (role) => {
      await test.seed
        .update(schema.schoolMemberships)
        .set({ role })
        .where(eq(schema.schoolMemberships.userId, actor.userId));
      await expect(run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(getUserById).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
      expect(await test.seed.select().from(schema.auditEvents)).toHaveLength(0);
    },
  );
  it('denies an unrelated School administrator, even for a known profile UUID', async () => {
    const school = await seedSchool(test.seed);
    await seedMembership(test.seed, actor.userId, school.id, 'SCHOOL_ADMIN');
    actor.schoolId = school.id;
    await expect(run()).rejects.toMatchObject({ featureCode: 'ACCOUNT_RECOVERY_INELIGIBLE' });
    expect(getUserById).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(await test.seed.select().from(schema.auditEvents)).toHaveLength(0);
  });
  it.each([
    'profile-inactive',
    'membership-inactive',
    'role-conflict',
    'user-disabled',
    'unlinked',
    'membership-missing',
  ])('fails closed for %s', async (state) => {
    if (state === 'profile-inactive')
      await test.seed
        .update(schema.teachers)
        .set({ status: 'INACTIVE' })
        .where(eq(schema.teachers.id, profileId));
    if (state === 'membership-inactive')
      await test.seed
        .update(schema.schoolMemberships)
        .set({ status: 'INACTIVE' })
        .where(eq(schema.schoolMemberships.userId, targetId));
    if (state === 'role-conflict')
      await test.seed
        .update(schema.schoolMemberships)
        .set({ role: 'PARENT' })
        .where(eq(schema.schoolMemberships.userId, targetId));
    if (state === 'user-disabled')
      await test.seed
        .update(schema.users)
        .set({ status: 'DISABLED' })
        .where(eq(schema.users.id, targetId));
    if (state === 'unlinked')
      await test.seed
        .update(schema.teachers)
        .set({ userId: null })
        .where(eq(schema.teachers.id, profileId));
    if (state === 'membership-missing')
      await test.seed
        .delete(schema.schoolMemberships)
        .where(eq(schema.schoolMemberships.userId, targetId));
    const before = await identitySnapshot();
    await expect(run()).rejects.toMatchObject({ featureCode: 'ACCOUNT_RECOVERY_INELIGIBLE' });
    expect(await identitySnapshot()).toEqual(before);
    expect(request).not.toHaveBeenCalled();
    expect(await test.seed.select().from(schema.auditEvents)).toHaveLength(0);
  });
  it.each(['missing', 'drift', 'wrong-uuid', 'provider-error'])(
    'rejects Auth %s without repair or account recreation',
    async (state) => {
      if (state === 'missing') getUserById.mockResolvedValue(null);
      if (state === 'drift')
        getUserById.mockResolvedValue({ id: targetId, email: 'different@example.test' });
      if (state === 'wrong-uuid')
        getUserById.mockResolvedValue({ id: actor.userId, email: 'existing@example.test' });
      if (state === 'provider-error')
        getUserById.mockRejectedValue(new Error('private-provider-detail'));
      const before = await identitySnapshot();
      await expect(run()).rejects.toMatchObject({
        featureCode: 'ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED',
      });
      expect(await identitySnapshot()).toEqual(before);
      expect(request).not.toHaveBeenCalled();
      expect(await test.seed.select().from(schema.auditEvents)).toHaveLength(0);
    },
  );
  it('rechecks relationship before committing intent', async () => {
    getUserById.mockImplementation(async () => {
      await test.seed
        .update(schema.schoolMemberships)
        .set({ status: 'INACTIVE' })
        .where(eq(schema.schoolMemberships.userId, targetId));
      return { id: targetId, email: 'existing@example.test' };
    });
    await expect(run()).rejects.toMatchObject({ featureCode: 'ACCOUNT_RECOVERY_INELIGIBLE' });
    expect(request).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent requests and rejects immediate retries', async () => {
    const before = await identitySnapshot();
    const results = await Promise.allSettled([run(), run()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(run()).rejects.toMatchObject({ featureCode: 'ACCOUNT_RECOVERY_COOLDOWN' });
    expect(request).toHaveBeenCalledOnce();
    expect(await test.seed.select().from(schema.auditEvents)).toHaveLength(1);
    expect(await identitySnapshot()).toEqual(before);
  });
  it('never sends when the atomic intent audit fails', async () => {
    vi.spyOn(auditRepository, 'appendAuditEvent').mockRejectedValue(
      new Error('synthetic-private-detail'),
    );
    await expect(run()).rejects.toMatchObject({ featureCode: 'AUDIT_PERSISTENCE_FAILED' });
    expect(request).not.toHaveBeenCalled();
    expect(await test.seed.select().from(schema.auditEvents)).toHaveLength(0);
  });
  it('retains intent on uncertain delivery and never automatically retries or deletes', async () => {
    request.mockRejectedValue(new Error('synthetic-private-provider-detail'));
    const before = await identitySnapshot();
    await expect(run()).rejects.toMatchObject({
      featureCode: 'ACCOUNT_RECOVERY_DELIVERY_UNCERTAIN',
    });
    await expect(run()).rejects.toMatchObject({ featureCode: 'ACCOUNT_RECOVERY_COOLDOWN' });
    expect(request).toHaveBeenCalledOnce();
    expect(await identitySnapshot()).toEqual(before);
    expect(await test.seed.select().from(schema.auditEvents)).toHaveLength(1);
  });
  it('rejects secret-bearing audit metadata', () => {
    expect(
      schoolAuditEventSchema.safeParse({
        action: 'AccountRecoveryRequested',
        resourceId: targetId,
        metadata: {
          profileKind: 'TEACHER',
          profileId,
          identityState: 'UNCONFIRMED',
          token: 'synthetic-only',
        },
      }).success,
    ).toBe(false);
  });
});
