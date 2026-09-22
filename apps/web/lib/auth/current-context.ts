/**
 * Current School Context resolution (Task 014 §5–§8, §11, §20, §21).
 *
 * This is the pure, driver-agnostic resolution layer: given an authenticated
 * application User id (from `lib/auth/server-auth`) and the current-school
 * selector (from `lib/auth/current-school`), it derives the authoritative
 * User Context from the database:
 *
 *   memberships (User ↔ School ↔ Role ↔ status)  →  current School  →  context
 *
 * Selection semantics (Task 014 §8/§20/§21):
 * - An explicitly selected School is used ONLY when it is an ACTIVE membership.
 * - Exactly one ACTIVE membership with no valid selection → auto-select it.
 * - Two or more ACTIVE memberships with no valid selection → NO guessing;
 *   `currentSchool` stays null and protected operations throw
 *   `SCHOOL_CONTEXT_REQUIRED` (`require-context.ts`).
 * - Zero ACTIVE memberships → authenticated but no current School Context.
 *
 * User lifecycle (Task 014.1): `resolveUserContext` returns the authoritative
 * `users.status` (ACTIVE / SUSPENDED / DISABLED). It is a pure resolution — it
 * does NOT decide. Denial for a globally inactive User is enforced by
 * `assertUserActive` (used by `requireCurrentContext`, `selectCurrentSchool`
 * and the `/me` route) BEFORE any membership/role/permission/scope evaluation
 * (PRD.md §15 canonical order). `contextFromResolution` derives `userActive`
 * from the resolved DB status — never hardcoded.
 *
 * The role ALWAYS comes from the resolved ACTIVE membership row — never from
 * the client, a Teacher/Parent profile, or any cached value (Task 014 §13/§15).
 *
 * This module performs NO session/cookie I/O and imports NO Supabase/env
 * modules, so it is fully testable against PGlite.
 */

import { eq } from 'drizzle-orm';
import * as schema from '@school/database';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type { CurrentContext } from '@/lib/authorization/context';
import type { Role } from '@/lib/authorization/roles';

import { AuthError } from './auth-errors';

/** Minimal Drizzle database surface (full schema). Production + PGlite clients satisfy it. */
export type AuthDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Global application User lifecycle (users.status, Task 014.1 §1). */
export type UserLifecycleStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export interface ResolveUserContextInput {
  /** Authenticated application User id (auth.users.id == users.id, ADR-018). */
  userId: string;
  /** The current-school selector (cookie). null when unset/malformed. */
  selectedSchoolId: string | null;
}

export interface ResolvedMembership {
  schoolId: string;
  schoolName: string;
  role: Role;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ResolvedUserContext {
  userId: string;
  /** Authoritative global User lifecycle status (users.status). */
  userStatus: UserLifecycleStatus;
  /** All memberships (active + historical/inactive) — never deleted (Task 014 §6). */
  memberships: ResolvedMembership[];
  activeMemberships: ResolvedMembership[];
  selectedSchoolId: string | null;
  /** The single operational current School, or null when none can be resolved. */
  currentSchool: ResolvedMembership | null;
  currentSchoolSource: 'selected' | 'auto-single' | null;
}

/**
 * Resolves the authoritative User Context from the database.
 *
 * Throws `AuthError('APPLICATION_USER_NOT_FOUND', ...)` when the Supabase Auth
 * identity exists but no `public.users` row does — a controlled provisioning
 * error; the server never creates user rows here (Task 014 §3/§33).
 *
 * An inactive (SUSPENDED / DISABLED) User resolves normally with `userStatus`
 * set — the denial decision is made by `assertUserActive`, so callers that
 * need a controlled inactive response (/me) and callers that must deny before
 * scope evaluation share the same facts.
 */
export async function resolveUserContext(
  db: AuthDb,
  input: ResolveUserContextInput,
): Promise<ResolvedUserContext> {
  const [user] = await db
    .select({ id: schema.users.id, status: schema.users.status })
    .from(schema.users)
    .where(eq(schema.users.id, input.userId))
    .limit(1);
  if (!user) {
    throw new AuthError(
      'APPLICATION_USER_NOT_FOUND',
      'Your application user account could not be found. Contact your school administrator.',
    );
  }

  const rows = await db
    .select({
      schoolId: schema.schoolMemberships.schoolId,
      role: schema.schoolMemberships.role,
      status: schema.schoolMemberships.status,
      schoolName: schema.schools.name,
    })
    .from(schema.schoolMemberships)
    .innerJoin(schema.schools, eq(schema.schools.id, schema.schoolMemberships.schoolId))
    .where(eq(schema.schoolMemberships.userId, input.userId))
    .orderBy(schema.schoolMemberships.createdAt, schema.schoolMemberships.id);

  const memberships: ResolvedMembership[] = rows.map((row) => ({
    schoolId: row.schoolId,
    schoolName: row.schoolName,
    role: row.role,
    status: row.status,
  }));
  const activeMemberships = memberships.filter((membership) => membership.status === 'ACTIVE');

  let currentSchool: ResolvedMembership | null = null;
  let currentSchoolSource: 'selected' | 'auto-single' | null = null;

  if (input.selectedSchoolId) {
    const selected = activeMemberships.find((membership) => membership.schoolId === input.selectedSchoolId);
    if (selected) {
      currentSchool = selected;
      currentSchoolSource = 'selected';
    }
  }

  // Convenience fallback (Task 014 §20): a single ACTIVE membership may be
  // auto-selected when there is no valid explicit selection.
  if (!currentSchool && activeMemberships.length === 1) {
    currentSchool = activeMemberships[0];
    currentSchoolSource = 'auto-single';
  }

  return {
    userId: input.userId,
    userStatus: user.status,
    memberships,
    activeMemberships,
    selectedSchoolId: input.selectedSchoolId,
    currentSchool,
    currentSchoolSource,
  };
}

/**
 * Enforces the global User lifecycle stage of the canonical pipeline
 * (PRD.md §15, Task 014.1 §6): a SUSPENDED or DISABLED User is denied
 * BEFORE SchoolMembership authorization, role, permissions, and academic
 * scope. Global User lifecycle wins over School membership lifecycle
 * (Task 014.1 §10/§11 — applies to ALL roles including SUPER_ADMIN).
 */
export function assertUserActive(resolution: ResolvedUserContext): void {
  if (resolution.userStatus !== 'ACTIVE') {
    throw new AuthError(
      'USER_INACTIVE',
      'Your account is not active. Contact your school administrator.',
    );
  }
}

/**
 * Builds the authorization-foundation `CurrentContext` from a resolution.
 * Scope facts are intentionally left empty — they are resolved on demand in
 * `lib/authorization/server` (Task 014 §11). `userActive` is derived from the
 * authoritative `users.status` resolution — never hardcoded (Task 014.1 §17).
 */
export function contextFromResolution(resolution: ResolvedUserContext): CurrentContext {
  const current = resolution.currentSchool;
  if (!current) {
    return {
      userId: resolution.userId,
      userActive: resolution.userStatus === 'ACTIVE',
      membership: null,
      schoolContext: null,
      role: null,
      scope: { teacherAssignments: [], parentStudents: [] },
    };
  }
  return {
    userId: resolution.userId,
    userActive: resolution.userStatus === 'ACTIVE',
    membership: { schoolId: current.schoolId, status: current.status },
    schoolContext: { schoolId: current.schoolId, isValid: true },
    role: current.role,
    scope: { teacherAssignments: [], parentStudents: [] },
  };
}

/**
 * Validates a requested School switch (Task 014 §18/§30/§31) and returns the
 * ACTIVE membership for that School.
 *
 * The global User lifecycle stage runs FIRST (Task 014.1 §8): a SUSPENDED or
 * DISABLED User is denied even when the requested membership is ACTIVE. Only
 * then is `INVALID_SCHOOL_CONTEXT` (403) thrown for a non-ACTIVE/foreign/
 * nonexistent membership — without revealing whether the School exists.
 */
export async function selectCurrentSchool(
  db: AuthDb,
  input: { userId: string; schoolId: string },
): Promise<ResolvedMembership> {
  const resolution = await resolveUserContext(db, { userId: input.userId, selectedSchoolId: null });
  assertUserActive(resolution);
  const membership = resolution.activeMemberships.find((active) => active.schoolId === input.schoolId);
  if (!membership) {
    throw new AuthError('INVALID_SCHOOL_CONTEXT', 'You are not an active member of that school.');
  }
  return membership;
}