/**
 * Application User lifecycle tests (Task 014.1 §17/§18).
 *
 * PGlite-backed and hermetic (no Supabase network). Global User lifecycle
 * (users.status) is DISTINCT from SchoolMembership lifecycle:
 *
 *   User ACTIVE  + Membership INACTIVE → no School context
 *   User SUSPENDED/DISABLED + Membership ACTIVE → denied globally (USER_INACTIVE)
 *   User ACTIVE  + Membership ACTIVE  → normal processing
 *
 * The denial runs BEFORE membership/role/permission/scope evaluation
 * (canonical order, PRD.md §15) and applies to every role including
 * SUPER_ADMIN.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';
import * as schema from '@school/database';

import { resolveMeContext, toMeResponse } from '@/lib/api/me';
import {
  assertUserActive,
  contextFromResolution,
  resolveUserContext,
  selectCurrentSchool,
} from '@/lib/auth/current-context';
import { AuthError } from '@/lib/auth/auth-errors';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { evaluateAuthorization } from '@/lib/authorization/pipeline';
import { resolveCurrentContext } from '@/lib/authorization/server/resolve-context';

import {
  createAuthTestDb,
  seedMembership,
  seedSchool,
  seedUser,
  type AuthTestDb,
} from './test-helpers';

let test: AuthTestDb;

beforeEach(async () => {
  test = await createAuthTestDb();
});

const identity = (userId: string, selectedSchoolId: string | null = null) => ({
  sessionResolver: async () => ({ id: userId }),
  readSelectedSchoolId: async () => selectedSchoolId,
});

async function seedActiveUserInSchool() {
  const user = await seedUser(test.seed, undefined, undefined, 'ACTIVE');
  const school = await seedSchool(test.seed, 'School A');
  await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN');
  return { user, school };
}

describe('Task 014.1 §17 — user lifecycle in the auth layer', () => {
  it('9. an ACTIVE User resolves normally', async () => {
    const { user, school } = await seedActiveUserInSchool();

    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });
    expect(resolution.userStatus).toBe('ACTIVE');
    expect(resolution.currentSchool?.schoolId).toBe(school.id);

    const context = await requireCurrentContext(test.db, identity(user));
    expect(context.userActive).toBe(true);
    expect(context.schoolContext?.schoolId).toBe(school.id);
    expect(context.role).toBe('SCHOOL_ADMIN');
  });

  it('10. a SUSPENDED User is denied (USER_INACTIVE)', async () => {
    const user = await seedUser(test.seed, undefined, undefined, 'SUSPENDED');
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN');

    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });
    expect(resolution.userStatus).toBe('SUSPENDED');

    await expect(requireCurrentContext(test.db, identity(user))).rejects.toMatchObject({
      featureCode: 'USER_INACTIVE',
    });
  });

  it('11. a DISABLED User is denied (USER_INACTIVE)', async () => {
    const user = await seedUser(test.seed, undefined, undefined, 'DISABLED');
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN');

    await expect(requireCurrentContext(test.db, identity(user))).rejects.toMatchObject({
      featureCode: 'USER_INACTIVE',
    });
  });

  it('12. an inactive User cannot auto-select a single ACTIVE membership', async () => {
    const user = await seedUser(test.seed, undefined, undefined, 'SUSPENDED');
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN');

    // The resolution still reports the ACTIVE membership, but the denial is
    // USER_INACTIVE — NOT a resolved current School and NOT SCHOOL_CONTEXT_REQUIRED.
    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });
    expect(resolution.activeMemberships).toHaveLength(1);
    expect(resolution.currentSchool?.schoolId).toBe(school.id);

    await expect(requireCurrentContext(test.db, identity(user))).rejects.toMatchObject({
      featureCode: 'USER_INACTIVE',
    });
  });

  it('13. an inactive User cannot use a valid selected-school cookie', async () => {
    const user = await seedUser(test.seed, undefined, undefined, 'SUSPENDED');
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN');

    // The cookie points at the user's OWN ACTIVE membership, but global User
    // lifecycle denies before School authorization (Task 014.1 §9).
    await expect(requireCurrentContext(test.db, identity(user, school.id))).rejects.toMatchObject({
      featureCode: 'USER_INACTIVE',
    });
  });

  it('14. an inactive User cannot switch School', async () => {
    const user = await seedUser(test.seed, undefined, undefined, 'SUSPENDED');
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN');

    await expect(
      selectCurrentSchool(test.db, { userId: user, schoolId: school.id }),
    ).rejects.toMatchObject({ featureCode: 'USER_INACTIVE' });
  });

  it('15. userActive in CurrentContext is derived from DB status, not hardcoded', async () => {
    const activeUser = await seedUser(test.seed, undefined, undefined, 'ACTIVE');
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, activeUser, school.id, 'SCHOOL_ADMIN');

    const activeResolution = await resolveUserContext(test.db, { userId: activeUser, selectedSchoolId: null });
    expect(contextFromResolution(activeResolution).userActive).toBe(true);

    // Simulate the resolution of a SUSPENDED user by mutating the DB state —
    // the derivation must flip to false without any hardcoded assumption.
    await test.seed.update(schema.users).set({ status: 'SUSPENDED' }).where(eq(schema.users.id, activeUser));
    const suspendedResolution = await resolveUserContext(test.db, { userId: activeUser, selectedSchoolId: null });
    expect(suspendedResolution.userStatus).toBe('SUSPENDED');
    expect(contextFromResolution(suspendedResolution).userActive).toBe(false);

    expect(() => assertUserActive(suspendedResolution)).toThrow(AuthError);
  });

  it('16. an inactive User fails BEFORE permission/scope evaluation', async () => {
    const user = await seedUser(test.seed, undefined, undefined, 'SUSPENDED');
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SUPER_ADMIN');

    // (a) The canonical protected entry denies at the Active User stage.
    await expect(requireCurrentContext(test.db, identity(user))).rejects.toMatchObject({
      featureCode: 'USER_INACTIVE',
    });

    // (b) The pure pipeline: even a context carrying a SUPER_ADMIN role +
    //     a permission + a satisfied scope is denied USER_INACTIVE first.
    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });
    const context = contextFromResolution(resolution);
    const decision = evaluateAuthorization(context, {
      permission: 'grades.publish',
      scope: { kind: 'school' },
    });
    expect(decision).toEqual({ allowed: false, reason: 'USER_INACTIVE' });

    // (c) The legacy authorizeOperation path reads users.status too: a
    //     suspended SUPER_ADMIN with an ACTIVE membership is denied at the
    //     Active User stage — never MISSING_PERMISSION / OUT_OF_SCOPE.
    const legacyDecision = await evaluateLegacyContext(user, school.id);
    expect(legacyDecision).toEqual({ allowed: false, reason: 'USER_INACTIVE' });
  });

  it('SUPER_ADMIN is not exempt from the global User lifecycle', async () => {
    const user = await seedUser(test.seed, undefined, undefined, 'DISABLED');
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SUPER_ADMIN');

    await expect(requireCurrentContext(test.db, identity(user))).rejects.toMatchObject({
      featureCode: 'USER_INACTIVE',
    });
  });
});

describe('Task 014.1 §18 — /me API semantics for inactive users', () => {
  it('GET /me — ACTIVE User returns the normal response', async () => {
    const { user, school } = await seedActiveUserInSchool();

    const resolution = await resolveMeContext(test.db, user, null);
    const payload = toMeResponse(resolution);
    expect(payload.user).toEqual({ id: user });
    expect(payload.currentSchool).toEqual({ id: school.id, role: 'SCHOOL_ADMIN' });
  });

  it('GET /me — SUSPENDED User gets a controlled denial (never an operational School)', async () => {
    const user = await seedUser(test.seed, undefined, undefined, 'SUSPENDED');
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN');

    const error = await resolveMeContext(test.db, user, school.id).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).featureCode).toBe('USER_INACTIVE');
    expect((error as AuthError).status).toBe(403);
    expect((error as AuthError).code).toBe('FORBIDDEN');
  });

  it('GET /me — DISABLED User gets a controlled denial', async () => {
    const user = await seedUser(test.seed, undefined, undefined, 'DISABLED');
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN');

    await expect(resolveMeContext(test.db, user, school.id)).rejects.toMatchObject({
      featureCode: 'USER_INACTIVE',
    });
  });

  it('POST /me/current-school — inactive User is denied even with an ACTIVE membership', async () => {
    const user = await seedUser(test.seed, undefined, undefined, 'SUSPENDED');
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN');

    // selectCurrentSchool is the route-level guard: global lifecycle first.
    await expect(
      selectCurrentSchool(test.db, { userId: user, schoolId: school.id }),
    ).rejects.toMatchObject({ featureCode: 'USER_INACTIVE' });
  });
});

async function evaluateLegacyContext(
  userId: string,
  schoolId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  // Mirrors `authorizeOperation`'s resolution path using the real resolver and
  // DB state (users.status is read by resolveCurrentContext).
  const db = test.db as unknown as Parameters<typeof resolveCurrentContext>[0];
  const context = await resolveCurrentContext(db, { userId, schoolId });
  return evaluateAuthorization(context, {
    permission: 'grades.publish',
    scope: { kind: 'school' },
  });
}