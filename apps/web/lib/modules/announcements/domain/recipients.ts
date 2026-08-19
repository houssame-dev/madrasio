/**
 * Announcement recipient resolution (Task 009 §11/§24–§27/§46, Task 009.1).
 *
 * PURE domain resolver: it takes the CURRENT relationship snapshot provided by
 * the caller and returns the deterministic, deduplicated recipient list that a
 * PublishAnnouncement use case would persist into
 * `publication_recipient_snapshots` at publication time.
 *
 * It must NEVER create database rows and MUST NOT read the database — the
 * caller (the future use case) is responsible for loading the candidates from
 * the relevant domain records and for persisting the resolved snapshot in the
 * same transaction as the publication (+ `AnnouncementPublished` outbox event,
 * Task 009 §36).
 *
 * RULES (Task 009 §24/§25/§26):
 * - A recipient User must have an ACTIVE SchoolMembership in the target School
 *   (`activeSchoolMembership`) to be eligible — a User with memberships in
 *   other Schools is only considered through THIS School's candidates.
 * - PARENTS + SCHOOL  → every eligible parent User in the School.
 * - PARENTS + CLASS   → parents of Students currently (ACTIVE ParentStudent +
 *   ACTIVE enrollment) associated with the Class.
 * - TEACHERS + SCHOOL → every eligible teacher User in the School.
 * - TEACHERS + CLASS  → teachers with a CURRENT ACTIVE TeacherAssignment for
 *   the Class. Old ENDED assignments never grant current recipients.
 * - The author may also be a recipient (Task 009 §27) — no automatic exclusion.
 * - Recipients are resolved at PUBLICATION time, never at draft time
 *   (Task 009 §11). The result is a write-once snapshot.
 *
 * ALL MATCHED AUDIENCES (Task 009.1): a User can legitimately qualify for
 * multiple audiences/target combinations (e.g. a Parent User matching both
 * PARENTS+CLASS A and PARENTS+SCHOOL, or a User who is both Parent and
 * Teacher). Each recipient is deduplicated to ONE result entry carrying EVERY
 * audience they matched, in the canonical `ANNOUNCEMENT_AUDIENCES` order
 * (PARENTS before TEACHERS) — independent of target input order. This maps
 * directly to the JSONB `audiences` snapshot payload.
 *
 * Determinism: identical inputs always produce identical outputs (recipient
 * order = first-match order; audiences order = canonical vocabulary order).
 */

import { ANNOUNCEMENT_AUDIENCES, type AnnouncementAudience, type AnnouncementTargetType } from './announcement-vocabulary';

/** One audience + target combination (mirrors the `announcement_targets` row). */
export interface AnnouncementTargetInput {
  audience: AnnouncementAudience;
  targetType: AnnouncementTargetType;
  /** Must be set iff targetType === 'CLASS' (the schema CHECK enforces this). */
  classId: string | null;
}

/** A parent User candidate for resolution (Task 009 §24). */
export interface ParentRecipientCandidate {
  userId: string;
  activeSchoolMembership: boolean;
  /** Class ids of children the parent is CURRENTLY linked to (ACTIVE ParentStudent + ACTIVE StudentEnrollment). */
  childClassIds: string[];
}

/** A teacher User candidate for resolution (Task 009 §25). */
export interface TeacherRecipientCandidate {
  userId: string;
  activeSchoolMembership: boolean;
  /** Class ids covered by CURRENT ACTIVE TeacherAssignments (ENDED assignments excluded). */
  assignmentClassIds: string[];
}

/** The candidate universe the resolver evaluates against. */
export interface RecipientResolutionInput {
  parents: ParentRecipientCandidate[];
  teachers: TeacherRecipientCandidate[];
}

/**
 * One resolved recipient for the publication (ONE entry per User — mirrors one
 * `publication_recipient_snapshots` row). `audiences` holds every matched
 * audience in canonical `ANNOUNCEMENT_AUDIENCES` order (Task 009.1).
 */
export interface ResolvedRecipient {
  recipientUserId: string;
  schoolId: string;
  audiences: AnnouncementAudience[];
}

/** Thrown when a target violates the audience/target invariants (Task 009 §9/§11). */
export class AnnouncementResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnnouncementResolutionError';
  }
}

function matchesParentTarget(
  candidate: ParentRecipientCandidate,
  targetType: AnnouncementTargetType,
  classId: string | null,
): boolean {
  if (!candidate.activeSchoolMembership) return false;
  if (targetType === 'SCHOOL') return true;
  return candidate.childClassIds.includes(classId!);
}

function matchesTeacherTarget(
  candidate: TeacherRecipientCandidate,
  targetType: AnnouncementTargetType,
  classId: string | null,
): boolean {
  if (!candidate.activeSchoolMembership) return false;
  if (targetType === 'SCHOOL') return true;
  return candidate.assignmentClassIds.includes(classId!);
}

/** Canonical audience ordering (PARENTS before TEACHERS). */
function orderAudiences(audiences: AnnouncementAudience[]): AnnouncementAudience[] {
  return [...audiences].sort(
    (a, b) => ANNOUNCEMENT_AUDIENCES.indexOf(a) - ANNOUNCEMENT_AUDIENCES.indexOf(b),
  );
}

/**
 * Resolves the deterministic, deduplicated recipient list for one Version's
 * targets (Task 009 §46, Task 009.1). Pure — no database access, no writes.
 *
 * Target validation (Task 009 §9): a CLASS target without a classId and a
 * SCHOOL target with a classId are structurally invalid and throw
 * `AnnouncementResolutionError`. A target carrying an unknown audience value
 * (not in `ANNOUNCEMENT_AUDIENCES`) is also rejected — unknown audience values
 * must never reach the snapshot payload (Task 009.1).
 */
export function resolveAnnouncementRecipients(
  schoolId: string,
  targets: AnnouncementTargetInput[],
  input: RecipientResolutionInput,
): ResolvedRecipient[] {
  const audiencesByUser = new Map<string, Set<AnnouncementAudience>>();
  const order: string[] = [];

  const recordMatch = (userId: string, audience: AnnouncementAudience) => {
    let audiences = audiencesByUser.get(userId);
    if (!audiences) {
      audiences = new Set();
      audiencesByUser.set(userId, audiences);
      order.push(userId);
    }
    audiences.add(audience);
  };

  for (const target of targets) {
    if (!ANNOUNCEMENT_AUDIENCES.includes(target.audience)) {
      throw new AnnouncementResolutionError(
        `Unknown audience '${String(target.audience)}' is not a supported announcement audience.`,
      );
    }
    if (target.targetType === 'CLASS' && target.classId === null) {
      throw new AnnouncementResolutionError(
        `CLASS target (audience ${target.audience}) requires a Class id.`,
      );
    }
    if (target.targetType === 'SCHOOL' && target.classId !== null) {
      throw new AnnouncementResolutionError(
        `SCHOOL target (audience ${target.audience}) must not carry a Class reference.`,
      );
    }

    if (target.audience === 'PARENTS') {
      for (const candidate of input.parents) {
        if (matchesParentTarget(candidate, target.targetType, target.classId)) {
          recordMatch(candidate.userId, 'PARENTS');
        }
      }
    } else {
      for (const candidate of input.teachers) {
        if (matchesTeacherTarget(candidate, target.targetType, target.classId)) {
          recordMatch(candidate.userId, 'TEACHERS');
        }
      }
    }
  }

  return order.map((userId) => ({
    recipientUserId: userId,
    schoolId,
    audiences: orderAudiences([...audiencesByUser.get(userId)!]),
  }));
}