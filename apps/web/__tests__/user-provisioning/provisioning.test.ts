import { randomUUID } from 'node:crypto';

import type { User } from '@supabase/supabase-js';
import * as schema from '@school/database';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import type { AuthAdminPort } from '@/lib/auth/admin';
import { provisionProfileAccount } from '@/lib/modules/user-provisioning';
import type { ProvisioningDb } from '@/lib/modules/user-provisioning/infrastructure/provisioning-repository';

import { seedAuthUser, seedMembership, seedSchool, seedUser } from '../auth/test-helpers';
import { createTeachersTestContext, seedTeacher } from '../teachers/test-helpers';

function authUser(id: string, email: string): User {
  return { id, email, aud: 'authenticated', role: 'authenticated',
    created_at: new Date(0).toISOString(), app_metadata: {}, user_metadata: {} } as User;
}

class FakeAuthAdmin implements AuthAdminPort {
  readonly users = new Map<string, User>();
  inviteCalls = 0;
  deleteCalls: string[] = [];
  inviteId: string = randomUUID();
  inviteError?: Error;
  deleteError?: Error;
  onInvite?: (id: string, email: string) => Promise<void>;

  async getUserById(id: string) { return this.users.get(id) ?? null; }
  async inviteUserByEmail(email: string) {
    this.inviteCalls += 1;
    if (this.inviteError) throw this.inviteError;
    await this.onInvite?.(this.inviteId, email);
    const user = authUser(this.inviteId, email);
    this.users.set(user.id, user);
    return user;
  }
  async deleteUser(id: string) {
    this.deleteCalls.push(id);
    if (this.deleteError) throw this.deleteError;
    this.users.delete(id);
  }
}

describe('User provisioning', () => {
  async function setup() {
    const context = await createTeachersTestContext();
    const adminId = await seedUser(context.test.seed);
    await seedMembership(context.test.seed, adminId, context.schoolId, 'SCHOOL_ADMIN');
    const auth = new FakeAuthAdmin();
    auth.onInvite = async (id, email) => { await seedAuthUser(context.test.seed, id, email); };
    return {
      context, auth,
      actor: { userId: adminId, schoolId: context.schoolId },
      deps: { db: context.test.seed as unknown as ProvisioningDb, authAdmin: auth, inviteRedirectTo: 'http://localhost:3000/auth/confirm' },
    };
  }

  it('invites and atomically creates User, TEACHER membership, and profile link', async () => {
    const value = await setup();
    const teacher = await seedTeacher(value.context);
    const result = await provisionProfileAccount(value.deps, value.actor, 'TEACHER', teacher.id, {
      email: '  NEW.Teacher@Example.com ',
    });
    expect(result).toMatchObject({ profileId: teacher.id, state: 'INVITED' });
    expect(value.auth.inviteCalls).toBe(1);
    const [user] = await value.context.test.seed.select().from(schema.users)
      .where(eq(schema.users.id, result.userId));
    const [membership] = await value.context.test.seed.select().from(schema.schoolMemberships)
      .where(and(eq(schema.schoolMemberships.schoolId, value.context.schoolId), eq(schema.schoolMemberships.userId, result.userId)));
    const [linked] = await value.context.test.seed.select().from(schema.teachers)
      .where(eq(schema.teachers.id, teacher.id));
    expect(user.email).toBe('new.teacher@example.com');
    expect(membership.role).toBe('TEACHER');
    expect(linked.userId).toBe(result.userId);
  });

  it('makes a retry a no-op without another invite', async () => {
    const value = await setup();
    const teacher = await seedTeacher(value.context);
    await provisionProfileAccount(value.deps, value.actor, 'TEACHER', teacher.id, { email: 'retry@example.com' });
    const retried = await provisionProfileAccount(value.deps, value.actor, 'TEACHER', teacher.id, { email: ' RETRY@example.com ' });
    expect(retried.state).toBe('ALREADY_LINKED');
    expect(value.auth.inviteCalls).toBe(1);
  });

  it('does not silently repair an already-linked profile with a missing membership', async () => {
    const value = await setup();
    const userId = await seedUser(value.context.test.seed, undefined, 'partial@example.com');
    value.auth.users.set(userId, authUser(userId, 'partial@example.com'));
    const teacher = await seedTeacher(value.context, { userId });
    await expect(provisionProfileAccount(value.deps, value.actor, 'TEACHER', teacher.id, {
      email: 'partial@example.com',
    })).rejects.toMatchObject({ featureCode: 'ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED' });
    expect(value.auth.inviteCalls).toBe(0);
  });

  it('reuses a verified existing User across Schools without calling invite', async () => {
    const value = await setup();
    const otherSchool = await seedSchool(value.context.test.seed, 'Other School');
    const userId = await seedUser(value.context.test.seed, undefined, 'shared@example.com');
    await seedMembership(value.context.test.seed, userId, otherSchool.id, 'PARENT');
    value.auth.users.set(userId, authUser(userId, 'SHARED@example.com'));
    const teacher = await seedTeacher(value.context);
    const result = await provisionProfileAccount(value.deps, value.actor, 'TEACHER', teacher.id, { email: ' shared@example.com ' });
    expect(result).toMatchObject({ userId, state: 'LINKED' });
    expect(value.auth.inviteCalls).toBe(0);
    const memberships = await value.context.test.seed.select().from(schema.schoolMemberships)
      .where(eq(schema.schoolMemberships.userId, userId));
    expect(memberships).toHaveLength(2);
    expect(memberships.find((row) => row.schoolId === otherSchool.id)?.role).toBe('PARENT');
    expect(memberships.find((row) => row.schoolId === value.context.schoolId)?.role).toBe('TEACHER');
  });

  it('links an existing same-role membership without duplicating it', async () => {
    const value = await setup();
    const userId = await seedUser(value.context.test.seed, undefined, 'member@example.com');
    await seedMembership(value.context.test.seed, userId, value.context.schoolId, 'TEACHER');
    value.auth.users.set(userId, authUser(userId, 'member@example.com'));
    const teacher = await seedTeacher(value.context);
    await provisionProfileAccount(value.deps, value.actor, 'TEACHER', teacher.id, { email: 'member@example.com' });
    const rows = await value.context.test.seed.select().from(schema.schoolMemberships).where(and(
      eq(schema.schoolMemberships.schoolId, value.context.schoolId), eq(schema.schoolMemberships.userId, userId),
    ));
    expect(rows).toHaveLength(1);
  });

  it('serializes concurrent links so one User cannot acquire two same-kind profiles', async () => {
    const value = await setup();
    const userId = await seedUser(value.context.test.seed, undefined, 'concurrent@example.com');
    await seedMembership(value.context.test.seed, userId, value.context.schoolId, 'TEACHER');
    value.auth.users.set(userId, authUser(userId, 'concurrent@example.com'));
    const first = await seedTeacher(value.context);
    const second = await seedTeacher(value.context);
    const results = await Promise.allSettled([
      provisionProfileAccount(value.deps, value.actor, 'TEACHER', first.id, { email: 'concurrent@example.com' }),
      provisionProfileAccount(value.deps, value.actor, 'TEACHER', second.id, { email: 'concurrent@example.com' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const linked = await value.context.test.seed.select().from(schema.teachers).where(and(
      eq(schema.teachers.schoolId, value.context.schoolId), eq(schema.teachers.userId, userId),
    ));
    expect(linked).toHaveLength(1);
  });

  it('fails closed for a conflicting same-School role without mutation', async () => {
    const value = await setup();
    const userId = await seedUser(value.context.test.seed, undefined, 'conflict@example.com');
    await seedMembership(value.context.test.seed, userId, value.context.schoolId, 'PARENT');
    value.auth.users.set(userId, authUser(userId, 'conflict@example.com'));
    const teacher = await seedTeacher(value.context);
    await expect(provisionProfileAccount(value.deps, value.actor, 'TEACHER', teacher.id, { email: 'conflict@example.com' }))
      .rejects.toMatchObject({ featureCode: 'ACCOUNT_ROLE_CONFLICT' });
    expect((await value.context.test.seed.select().from(schema.teachers).where(eq(schema.teachers.id, teacher.id)))[0].userId).toBeNull();
    expect(value.auth.inviteCalls).toBe(0);
  });

  it.each<[string, string | undefined]>([
    ['missing Auth identity', undefined],
    ['mismatched Auth email', 'different@example.com'],
  ])('fails closed for %s', async (_label, authEmail) => {
    const value = await setup();
    const userId = await seedUser(value.context.test.seed, undefined, 'drift@example.com');
    if (authEmail) value.auth.users.set(userId, authUser(userId, authEmail));
    const teacher = await seedTeacher(value.context);
    await expect(provisionProfileAccount(value.deps, value.actor, 'TEACHER', teacher.id, { email: 'drift@example.com' }))
      .rejects.toMatchObject({ featureCode: 'ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED' });
    expect(value.auth.inviteCalls).toBe(0);
  });

  it('compensates only the newly invited Auth identity when the DB transaction fails', async () => {
    const value = await setup();
    const teacher = await seedTeacher(value.context);
    value.auth.inviteId = await seedUser(value.context.test.seed, undefined, 'occupied@example.com');
    value.auth.onInvite = undefined;
    await expect(provisionProfileAccount(value.deps, value.actor, 'TEACHER', teacher.id, { email: 'new-address@example.com' }))
      .rejects.toMatchObject({ featureCode: 'ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED' });
    expect(value.auth.deleteCalls).toEqual([value.auth.inviteId]);
  });

  it('reports compensation-required when cleanup of a newly invited identity fails', async () => {
    const value = await setup();
    const teacher = await seedTeacher(value.context);
    value.auth.inviteId = await seedUser(value.context.test.seed, undefined, 'occupied2@example.com');
    value.auth.onInvite = undefined;
    value.auth.deleteError = new Error('cleanup unavailable');
    await expect(provisionProfileAccount(value.deps, value.actor, 'TEACHER', teacher.id, { email: 'another@example.com' }))
      .rejects.toMatchObject({ featureCode: 'ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED' });
  });

  it('denies Teacher and Parent actors and hides a foreign-School profile', async () => {
    const value = await setup();
    const teacherActor = await seedUser(value.context.test.seed);
    await seedMembership(value.context.test.seed, teacherActor, value.context.schoolId, 'TEACHER');
    const teacher = await seedTeacher(value.context);
    await expect(provisionProfileAccount(value.deps, { userId: teacherActor, schoolId: value.context.schoolId }, 'TEACHER', teacher.id, { email: 'denied@example.com' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });

    const other = await seedSchool(value.context.test.seed, 'Foreign');
    const [foreign] = await value.context.test.seed.insert(schema.teachers).values({
      schoolId: other.id, firstName: 'Foreign', lastName: 'Teacher', status: 'ACTIVE',
    }).returning();
    await expect(provisionProfileAccount(value.deps, value.actor, 'TEACHER', foreign.id, { email: 'hidden@example.com' }))
      .rejects.toMatchObject({ featureCode: 'PROFILE_NOT_FOUND' });
    expect(value.auth.inviteCalls).toBe(0);
  });

  it('derives PARENT role from profile kind and has no Student provisioning path', async () => {
    const value = await setup();
    const [parent] = await value.context.test.seed.insert(schema.parents).values({
      schoolId: value.context.schoolId, firstName: 'New', lastName: 'Parent', status: 'ACTIVE',
    }).returning();
    const result = await provisionProfileAccount(value.deps, value.actor, 'PARENT', parent.id, { email: 'parent.invite@example.com' });
    const [membership] = await value.context.test.seed.select().from(schema.schoolMemberships)
      .where(eq(schema.schoolMemberships.userId, result.userId));
    expect(membership.role).toBe('PARENT');
    expect(['TEACHER', 'PARENT']).not.toContain('STUDENT');
  });
});
