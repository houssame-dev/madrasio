/**
 * Result notification recipient resolution (Task 012 §1/§3/§4).
 *
 * PURE domain resolver: it takes the candidate facts loaded by the caller
 * (the repository/application layer) and returns the deterministic,
 * deduplicated recipient list that a Result publication freezes into its
 * Outbox event payload at publication time.
 *
 * APPROVED V1 POLICY (Task 012 §1):
 * ResultPublished / ResultRevisionPublished notification recipients are ONLY
 * eligible PARENT Users of the Student whose ResultPublication was published,
 * evaluated at RESULT PUBLICATION TIME. A Parent recipient must satisfy:
 *   1. the Parent belongs to the same School,
 *   2. the Parent is linked to the Result student through an ACTIVE
 *      ParentStudent,
 *   3. the Parent has a non-null authenticated user_id,
 *   4. that User has an ACTIVE SchoolMembership in the same School.
 *
 * Students (no V1 account), Teachers, SCHOOL_ADMIN and SUPER_ADMIN are never
 * automatic Result notification recipients (Task 012 §1).
 *
 * The resolver never reads the database and never writes — it only reduces
 * the provided candidates. Repository/application code loads the candidate
 * facts and persists the resolved list inside the SAME transaction as the
 * publication + Outbox event (Task 012 §8).
 *
 * DEDUPLICATION (Task 012 §4): a single authenticated User reachable through
 * more than one Parent/relationship appears ONCE in the result — keyed by
 * `recipient_user_id`.
 *
 * ZERO RECIPIENTS (Task 012 §5): zero eligible Parents yields `[]` — never an
 * error. A ResultPublication is an academic record; notification availability
 * is a downstream concern and must not block publication.
 *
 * Determinism: identical candidate inputs always produce identical outputs;
 * `recipientUserIds` is sorted ascending for a canonical stable ordering.
 */

/** Candidate facts for one Parent (loaded by the repository at publication time). */
export interface ResultRecipientCandidate {
  /** The authenticated `parents.user_id` (null when the Parent has no account). */
  userId: string | null;
  /** `parent_students.status` at publication time. */
  parentStudentStatus: 'ACTIVE' | 'ENDED';
  /** `school_memberships.status` at publication time. */
  membershipStatus: 'ACTIVE' | 'INACTIVE';
}

/** The deterministic, deduplicated, canonical-ordered recipient snapshot. */
export interface ResolvedResultRecipients {
  recipientUserIds: string[];
}

/**
 * Resolves the approved Result recipient list from the candidate facts.
 * Pure — no database access, no writes. Candidates violating any of the four
 * approved conditions are excluded; the surviving user ids are deduplicated
 * and sorted ascending (canonical deterministic ordering).
 */
export function resolveResultNotificationRecipients(
  candidates: ResultRecipientCandidate[],
): ResolvedResultRecipients {
  const userIds = new Set<string>();
  for (const candidate of candidates) {
    if (
      candidate.userId === null ||
      candidate.parentStudentStatus !== 'ACTIVE' ||
      candidate.membershipStatus !== 'ACTIVE'
    ) {
      continue;
    }
    userIds.add(candidate.userId);
  }
  return { recipientUserIds: [...userIds].sort() };
}