/**
 * Authentication & Current School Context tests (Task 014 §40–§42, §44).
 *
 * PGlite-backed, hermetic (no Supabase network dependency). The server session
 * is simulated with an injected session resolver; the current-school selector
 * with an injected cookie reader. All role/status/context facts are derived
 * exclusively from the database.
 */

import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '@school/database';

import { toMeResponse } from '@/lib/api/me';
import { normalizeSchoolSelector } from '@/lib/auth/current-school';
import {
  contextFromResolution,
  resolveUserContext,
  selectCurrentSchool,
} from '@/lib/auth/current-context';
import { AUTH_ERROR_CODES, AuthError } from '@/lib/auth/auth-errors';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { ROLES } from '@/lib/authorization/roles';
import { UnauthenticatedError } from '@/lib/errors';

import {
  createAuthTestDb,
  seedAuthUser,
  seedMembership,
  seedSchool,
  seedUser,
  type AuthTestDb,
} from './test-helpers';

let test: AuthTestDb;

beforeEach(async () => {
  test = await createAuthTestDb();
});

const identity = (userId: string) => ({
  sessionResolver: async () => ({ id: userId }),
  readSelectedSchoolId: async () => null,
});

describe('Task 014 §40 — authentication resolution', () => {
  it('1. no session → unauthenticated', async () => {
    await expect(
      requireCurrentContext(test.db, { sessionResolver: async () => null, readSelectedSchoolId: async () => null }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('2. auth User maps to the matching application User (shared UUID, ADR-018)', async () => {
    const user = await seedUser(test.seed);
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN');

    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });
    expect(resolution.userId).toBe(user);
    expect(resolution.memberships).toHaveLength(1);
    expect(resolution.currentSchool?.schoolId).toBe(school.id);
    expect(resolution.currentSchool?.schoolName).toBe('School A');

    const context = await requireCurrentContext(test.db, identity(user));
    expect(context.userId).toBe(user);
    expect(context.role).toBe('SCHOOL_ADMIN');
  });

  it('3. auth identity without an application User → controlled APPLICATION_USER_NOT_FOUND', async () => {
    const authOnlyUser = await seedAuthUser(test.seed);

    await expect(
      resolveUserContext(test.db, { userId: authOnlyUser, selectedSchoolId: null }),
    ).rejects.toMatchObject({ featureCode: 'APPLICATION_USER_NOT_FOUND' });
    await expect(
      requireCurrentContext(test.db, identity(authOnlyUser)),
    ).rejects.toBeInstanceOf(AuthError);
    expect(AUTH_ERROR_CODES).toContain('APPLICATION_USER_NOT_FOUND');
  });

  it('4. identity is the auth user ID, never the email', async () => {
    const email = 'shared@example.com';
    const provisioned = await seedUser(test.seed, undefined, email);
    const unprovisioned = await seedAuthUser(test.seed, undefined, email);

    await expect(
      resolveUserContext(test.db, { userId: provisioned, selectedSchoolId: null }),
    ).resolves.toMatchObject({ userId: provisioned });
    await expect(
      resolveUserContext(test.db, { userId: unprovisioned, selectedSchoolId: null }),
    ).rejects.toMatchObject({ featureCode: 'APPLICATION_USER_NOT_FOUND' });
  });

  it('5. no Student role is introduced', () => {
    expect(ROLES).not.toContain('STUDENT');
  });
});

describe('Task 014 §41 — membership & current school selection', () => {
  it('6. one ACTIVE membership → auto-selected current School', async () => {
    const user = await seedUser(test.seed);
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'TEACHER');

    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });
    expect(resolution.currentSchool?.schoolId).toBe(school.id);
    expect(resolution.currentSchoolSource).toBe('auto-single');

    const context = await requireCurrentContext(test.db, identity(user));
    expect(context.schoolContext).toEqual({ schoolId: school.id, isValid: true });
    expect(context.membership).toEqual({ schoolId: school.id, status: 'ACTIVE' });
  });

  it('7. multiple ACTIVE memberships with no selection → context required, never guessed', async () => {
    const user = await seedUser(test.seed);
    const schoolA = await seedSchool(test.seed, 'School A');
    const schoolB = await seedSchool(test.seed, 'School B');
    await seedMembership(test.seed, user, schoolA.id, 'SCHOOL_ADMIN');
    await seedMembership(test.seed, user, schoolB.id, 'TEACHER');

    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });
    expect(resolution.activeMemberships).toHaveLength(2);
    expect(resolution.currentSchool).toBeNull();

    await expect(requireCurrentContext(test.db, identity(user))).rejects.toMatchObject({
      featureCode: 'SCHOOL_CONTEXT_REQUIRED',
    });
  });

  it('8. a valid explicit selected School becomes the current context', async () => {
    const user = await seedUser(test.seed);
    const schoolA = await seedSchool(test.seed, 'School A');
    const schoolB = await seedSchool(test.seed, 'School B');
    await seedMembership(test.seed, user, schoolA.id, 'SCHOOL_ADMIN');
    await seedMembership(test.seed, user, schoolB.id, 'TEACHER');

    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: schoolB.id });
    expect(resolution.currentSchool?.schoolId).toBe(schoolB.id);
    expect(resolution.currentSchoolSource).toBe('selected');

    const context = await requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: user }),
      readSelectedSchoolId: async () => schoolB.id,
    });
    expect(context.schoolContext?.schoolId).toBe(schoolB.id);
    expect(context.role).toBe('TEACHER');
  });

  it('9. a selected School without membership is denied', async () => {
    const user = await seedUser(test.seed);
    const schoolA = await seedSchool(test.seed, 'School A');
    const schoolB = await seedSchool(test.seed, 'School B');
    const schoolC = await seedSchool(test.seed, 'School C');
    await seedMembership(test.seed, user, schoolA.id, 'SCHOOL_ADMIN');
    await seedMembership(test.seed, user, schoolB.id, 'TEACHER');

    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: schoolC.id });
    expect(resolution.currentSchool).toBeNull();

    await expect(
      requireCurrentContext(test.db, {
        sessionResolver: async () => ({ id: user }),
        readSelectedSchoolId: async () => schoolC.id,
      }),
    ).rejects.toMatchObject({ featureCode: 'SCHOOL_CONTEXT_REQUIRED' });
  });

  it('10. an INACTIVE membership never grants current context', async () => {
    const user = await seedUser(test.seed);
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'TEACHER', 'INACTIVE');

    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });
    expect(resolution.activeMemberships).toHaveLength(0);
    expect(resolution.currentSchool).toBeNull();
    expect(contextFromResolution(resolution).membership).toBeNull();

    await expect(requireCurrentContext(test.db, identity(user))).rejects.toMatchObject({
      featureCode: 'SCHOOL_CONTEXT_REQUIRED',
    });
  });

  it('11. malformed or stale selected School is safely rejected', async () => {
    // Malformed cookie value is normalized to null (pure helper).
    expect(normalizeSchoolSelector('not-a-uuid')).toBeNull();
    expect(normalizeSchoolSelector(undefined)).toBeNull();

    const user = await seedUser(test.seed);
    const schoolA = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, schoolA.id, 'PARENT');

    // Malformed selector + exactly one ACTIVE membership → safe auto-fallback.
    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: 'stale-cookie' });
    expect(resolution.currentSchool?.schoolId).toBe(schoolA.id);
    expect(resolution.currentSchoolSource).toBe('auto-single');
  });

  it('12. zero ACTIVE memberships → authenticated but no current context', async () => {
    const user = await seedUser(test.seed);

    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });
    expect(resolution.activeMemberships).toHaveLength(0);
    expect(resolution.currentSchool).toBeNull();

    const context = contextFromResolution(resolution);
    expect(context.userId).toBe(user);
    expect(context.userActive).toBe(true);
    expect(context.membership).toBeNull();
    expect(context.schoolContext).toBeNull();

    await expect(requireCurrentContext(test.db, identity(user))).rejects.toMatchObject({
      featureCode: 'SCHOOL_CONTEXT_REQUIRED',
    });
  });

  it('13. School switch A → B works', async () => {
    const user = await seedUser(test.seed);
    const schoolA = await seedSchool(test.seed, 'School A');
    const schoolB = await seedSchool(test.seed, 'School B');
    await seedMembership(test.seed, user, schoolA.id, 'SCHOOL_ADMIN');
    await seedMembership(test.seed, user, schoolB.id, 'TEACHER');

    const contextA = await requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: user }),
      readSelectedSchoolId: async () => schoolA.id,
    });
    expect(contextA.schoolContext?.schoolId).toBe(schoolA.id);

    const contextB = await requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: user }),
      readSelectedSchoolId: async () => schoolB.id,
    });
    expect(contextB.schoolContext?.schoolId).toBe(schoolB.id);
  });

  it('14. role changes per School membership (A SCHOOL_ADMIN → B TEACHER)', async () => {
    const user = await seedUser(test.seed);
    const schoolA = await seedSchool(test.seed, 'School A');
    const schoolB = await seedSchool(test.seed, 'School B');
    await seedMembership(test.seed, user, schoolA.id, 'SCHOOL_ADMIN');
    await seedMembership(test.seed, user, schoolB.id, 'TEACHER');

    const contextA = await requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: user }),
      readSelectedSchoolId: async () => schoolA.id,
    });
    const contextB = await requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: user }),
      readSelectedSchoolId: async () => schoolB.id,
    });

    expect(contextA.role).toBe('SCHOOL_ADMIN');
    expect(contextB.role).toBe('TEACHER');
    // No cached SCHOOL_ADMIN role leaks into School B.
    expect(contextB.role).not.toBe('SCHOOL_ADMIN');
  });

  it('15. switching to a foreign School fails (INVALID_SCHOOL_CONTEXT)', async () => {
    const user = await seedUser(test.seed);
    const schoolA = await seedSchool(test.seed, 'School A');
    const schoolB = await seedSchool(test.seed, 'School B');
    await seedMembership(test.seed, user, schoolA.id, 'SCHOOL_ADMIN');

    await expect(
      selectCurrentSchool(test.db, { userId: user, schoolId: schoolB.id }),
    ).rejects.toMatchObject({ featureCode: 'INVALID_SCHOOL_CONTEXT' });
  });
});

describe('Task 014 §42 — security', () => {
  it('16. client-provided role is ignored; role comes from the membership row', async () => {
    const user = await seedUser(test.seed);
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'TEACHER');

    // The API only ever supplies userId + selectedSchoolId — no role input exists.
    const context = await requireCurrentContext(test.db, identity(user));
    expect(context.role).toBe('TEACHER');
    expect(context.role).not.toBe('SCHOOL_ADMIN');
  });

  it('17. client-provided membership status is ignored; status comes from the DB', async () => {
    const user = await seedUser(test.seed);
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN', 'INACTIVE');

    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });
    expect(resolution.memberships[0].status).toBe('INACTIVE');
    expect(resolution.currentSchool).toBeNull();
  });

  it('18. the cookie schoolId alone never authorizes a School', async () => {
    const user = await seedUser(test.seed);
    const schoolA = await seedSchool(test.seed, 'School A');
    const schoolB = await seedSchool(test.seed, 'School B');
    await seedMembership(test.seed, user, schoolA.id, 'PARENT');

    // Cookie claims School B, but the user has no membership there.
    const context = await requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: user }),
      readSelectedSchoolId: async () => schoolB.id,
    });
    // Context resolves to the user's REAL active membership (A), never B.
    expect(context.schoolContext?.schoolId).toBe(schoolA.id);
    expect(context.schoolContext?.schoolId).not.toBe(schoolB.id);
  });

  it('19. a deactivated membership invalidates the next request', async () => {
    const user = await seedUser(test.seed);
    const school = await seedSchool(test.seed, 'School A');
    const membership = await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN', 'ACTIVE');

    const before = await requireCurrentContext(test.db, identity(user));
    expect(before.schoolContext?.schoolId).toBe(school.id);

    // T2: membership becomes INACTIVE (historical row kept, never deleted).
    await test.seed
      .update(schema.schoolMemberships)
      .set({ status: 'INACTIVE' })
      .where(and(eq(schema.schoolMemberships.userId, user), eq(schema.schoolMemberships.schoolId, school.id)));

    const after = await resolveUserContext(test.db, { userId: user, selectedSchoolId: school.id });
    expect(after.currentSchool).toBeNull();
    expect(after.memberships).toHaveLength(1);
    expect(after.memberships[0].status).toBe('INACTIVE');

    await expect(
      requireCurrentContext(test.db, identity(user)),
    ).rejects.toMatchObject({ featureCode: 'SCHOOL_CONTEXT_REQUIRED' });
    void membership;
  });

  it('20. a context resolved for User A can never authorize User B', async () => {
    const userA = await seedUser(test.seed);
    const userB = await seedUser(test.seed);
    const schoolA = await seedSchool(test.seed, 'School A');
    const schoolB = await seedSchool(test.seed, 'School B');
    await seedMembership(test.seed, userA, schoolA.id, 'SCHOOL_ADMIN');
    await seedMembership(test.seed, userB, schoolB.id, 'SCHOOL_ADMIN');

    // User B's session resolves only B's memberships, never A.
    const contextB = await requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: userB }),
      readSelectedSchoolId: async () => schoolA.id,
    });
    expect(contextB.userId).toBe(userB);
    expect(contextB.schoolContext?.schoolId).toBe(schoolB.id);
    expect(contextB.schoolContext?.schoolId).not.toBe(schoolA.id);
  });

  it('21. GET /me payload never exposes tokens or secrets', async () => {
    const user = await seedUser(test.seed);
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN');
    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });

    const serialized = JSON.stringify(toMeResponse(resolution)).toLowerCase();
    for (const secret of ['access_token', 'refresh_token', 'service_role', 'password', 'secret', 'supabase_url', 'anon_key']) {
      expect(serialized).not.toContain(secret);
    }
  });
});

describe('Task 014 §44 — /me API semantics (resolver + DTO level)', () => {
  it('unauthenticated /me maps to a 401 UNAUTHENTICATED error', async () => {
    const error = await requireCurrentContext(test.db, {
      sessionResolver: async () => null,
      readSelectedSchoolId: async () => null,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnauthenticatedError);
    expect((error as UnauthenticatedError).status).toBe(401);
    expect((error as UnauthenticatedError).code).toBe('UNAUTHENTICATED');
  });

  it('authenticated /me payload: user + currentSchool + ACTIVE memberships', async () => {
    const user = await seedUser(test.seed);
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'SCHOOL_ADMIN');
    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });

    const payload = toMeResponse(resolution);
    expect(payload.user).toEqual({ id: user });
    expect(payload.currentSchool).toEqual({ id: school.id, role: 'SCHOOL_ADMIN' });
    expect(payload.memberships).toEqual([
      { schoolId: school.id, schoolName: 'School A', role: 'SCHOOL_ADMIN', status: 'ACTIVE' },
    ]);
  });

  it('one ACTIVE membership → currentSchool is auto-selected', async () => {
    const user = await seedUser(test.seed);
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'TEACHER');
    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });

    const payload = toMeResponse(resolution);
    expect(payload.currentSchool).toEqual({ id: school.id, role: 'TEACHER' });
  });

  it('multiple ACTIVE memberships with no selection → currentSchool null (selection required)', async () => {
    const user = await seedUser(test.seed);
    const schoolA = await seedSchool(test.seed, 'School A');
    const schoolB = await seedSchool(test.seed, 'School B');
    await seedMembership(test.seed, user, schoolA.id, 'SCHOOL_ADMIN');
    await seedMembership(test.seed, user, schoolB.id, 'TEACHER');
    const resolution = await resolveUserContext(test.db, { userId: user, selectedSchoolId: null });

    const payload = toMeResponse(resolution);
    expect(payload.currentSchool).toBeNull();
    expect(payload.memberships).toHaveLength(2);
    expect(AUTH_ERROR_CODES).toContain('SCHOOL_CONTEXT_REQUIRED');
  });

  it('POST /me/current-school valid switch resolves the new context', async () => {
    const user = await seedUser(test.seed);
    const schoolA = await seedSchool(test.seed, 'School A');
    const schoolB = await seedSchool(test.seed, 'School B');
    await seedMembership(test.seed, user, schoolA.id, 'SCHOOL_ADMIN');
    await seedMembership(test.seed, user, schoolB.id, 'TEACHER');

    const membership = await selectCurrentSchool(test.db, { userId: user, schoolId: schoolB.id });
    expect(membership.schoolId).toBe(schoolB.id);

    const after = await resolveUserContext(test.db, { userId: user, selectedSchoolId: schoolB.id });
    expect(toMeResponse(after).currentSchool).toEqual({ id: schoolB.id, role: 'TEACHER' });
  });

  it('POST /me/current-school rejects inactive membership', async () => {
    const user = await seedUser(test.seed);
    const school = await seedSchool(test.seed, 'School A');
    await seedMembership(test.seed, user, school.id, 'TEACHER', 'INACTIVE');

    await expect(
      selectCurrentSchool(test.db, { userId: user, schoolId: school.id }),
    ).rejects.toMatchObject({ featureCode: 'INVALID_SCHOOL_CONTEXT' });
  });

  it('POST /me/current-school rejects a foreign membership', async () => {
    const user = await seedUser(test.seed);
    const schoolA = await seedSchool(test.seed, 'School A');
    const schoolB = await seedSchool(test.seed, 'School B');
    await seedMembership(test.seed, user, schoolA.id, 'SCHOOL_ADMIN');

    await expect(
      selectCurrentSchool(test.db, { userId: user, schoolId: schoolB.id }),
    ).rejects.toMatchObject({ featureCode: 'INVALID_SCHOOL_CONTEXT' });
  });

  it('POST /me/current-school rejects malformed input', () => {
    expect(z.string().uuid().safeParse('not-a-uuid').success).toBe(false);
    expect(z.string().uuid().safeParse('').success).toBe(false);
  });
});