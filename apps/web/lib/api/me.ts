/**
 * `GET /api/v1/me` HTTP adapter DTO (Task 014 §16/§17/§35).
 *
 * Thin, pure mapping from the resolved User Context to the safe `/me` payload.
 * No business logic here. The payload is deliberately minimal and NEVER
 * contains Supabase tokens, credentials, service-role information, or auth
 * metadata (Task 014 §35). The route-level lifecycle guard is
 * `resolveMeContext` (Task 014.1 §7): a SUSPENDED/DISABLED User is denied
 * before any School Context is produced.
 *
 * `memberships` is the V1 school SELECTOR list — ACTIVE memberships only
 * (Task 014 §17: historical/inactive memberships are not exposed in V1; an
 * account-management view may add an explicit historical query later). The
 * selector must only ever allow ACTIVE membership switching, so only ACTIVE
 * memberships are returned.
 */

import {
  assertUserActive,
  resolveUserContext,
  type AuthDb,
  type ResolvedMembership,
  type ResolvedUserContext,
} from '@/lib/auth/current-context';
import type { Role } from '@/lib/authorization/roles';

export interface MeUserDto {
  id: string;
}

export interface MeCurrentSchoolDto {
  id: string;
  role: Role;
}

export interface MeMembershipDto {
  schoolId: string;
  schoolName: string;
  role: Role;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface MeResponseDto {
  user: MeUserDto;
  currentSchool: MeCurrentSchoolDto | null;
  memberships: MeMembershipDto[];
}

export function toMeResponse(resolution: ResolvedUserContext): MeResponseDto {
  return {
    user: { id: resolution.userId },
    currentSchool: resolution.currentSchool
      ? { id: resolution.currentSchool.schoolId, role: resolution.currentSchool.role }
      : null,
    memberships: resolution.memberships
      .filter((membership: ResolvedMembership) => membership.status === 'ACTIVE')
      .map((membership: ResolvedMembership) => ({
        schoolId: membership.schoolId,
        schoolName: membership.schoolName,
        role: membership.role,
        status: membership.status,
      })),
  };
}

/**
 * `GET /api/v1/me` route resolution (Task 014.1 §7).
 *
 * The global User lifecycle runs BEFORE any School/membership processing: a
 * SUSPENDED or DISABLED application User gets a controlled `USER_INACTIVE`
 * denial (403) — never an operational School Context, even when their
 * memberships are ACTIVE. The client sees no tokens or account-admin details.
 */
export async function resolveMeContext(
  db: AuthDb,
  userId: string,
  selectedSchoolId: string | null,
): Promise<ResolvedUserContext> {
  const resolution = await resolveUserContext(db, { userId, selectedSchoolId });
  assertUserActive(resolution);
  return resolution;
}