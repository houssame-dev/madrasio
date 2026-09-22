/**
 * Result notification recipient resolution — pure domain tests (Task 012 §3/§23).
 *
 * The resolver is pure (no database): it reduces candidate facts loaded at
 * publication time into the deterministic, deduplicated, canonical-ordered
 * recipient snapshot frozen into the Result Outbox event payload.
 *
 * Approved policy (Task 012 §1): ONLY eligible PARENT Users of the Result
 * Student — ACTIVE ParentStudent + non-null user_id + ACTIVE SchoolMembership
 * + same School. Zero eligible parents yields `[]`, never an error (§5).
 */

import { describe, expect, it } from 'vitest';

import { resolveResultNotificationRecipients, type ResultRecipientCandidate } from '@/lib/modules/grades/domain/result-recipients';

function candidate(userId: string | null, overrides: Partial<ResultRecipientCandidate> = {}): ResultRecipientCandidate {
  return {
    userId,
    parentStudentStatus: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    ...overrides,
  };
}

describe('resolveResultNotificationRecipients (Task 012 §23)', () => {
  it('1. active ParentStudent + parent user + ACTIVE membership → included', () => {
    const result = resolveResultNotificationRecipients([candidate('user-a')]);
    expect(result.recipientUserIds).toEqual(['user-a']);
  });

  it('2. ENDED ParentStudent → excluded from a NEW publication', () => {
    const result = resolveResultNotificationRecipients([
      candidate('user-a', { parentStudentStatus: 'ENDED' }),
      candidate('user-b'),
    ]);
    expect(result.recipientUserIds).toEqual(['user-b']);
  });

  it('3. Parent with null user_id → excluded', () => {
    const result = resolveResultNotificationRecipients([
      candidate(null),
      candidate('user-b'),
    ]);
    expect(result.recipientUserIds).toEqual(['user-b']);
  });

  it('4. INACTIVE membership → excluded from a NEW publication', () => {
    const result = resolveResultNotificationRecipients([
      candidate('user-a', { membershipStatus: 'INACTIVE' }),
      candidate('user-b'),
    ]);
    expect(result.recipientUserIds).toEqual(['user-b']);
  });

  it('5. other-School Parent is never part of the candidates (School scoping is enforced by the loading query)', () => {
    // The pure resolver only ever sees candidates loaded for the publication's
    // School (the repository query is School-scoped, PRD.md §13). A foreign
    // Parent is simply absent from the candidate set and therefore excluded.
    const result = resolveResultNotificationRecipients([candidate('user-a')]);
    expect(result.recipientUserIds).toEqual(['user-a']);
  });

  it('6. duplicate User matches → deduplicated to ONE entry', () => {
    const result = resolveResultNotificationRecipients([
      candidate('user-a'),
      candidate('user-a'),
      candidate('user-a', { parentStudentStatus: 'ENDED' }),
      candidate('user-b'),
    ]);
    expect(result.recipientUserIds).toEqual(['user-a', 'user-b']);
  });

  it('7. deterministic canonical ordering (ascending)', () => {
    const result = resolveResultNotificationRecipients([
      candidate('user-z'),
      candidate('user-a'),
      candidate('user-m'),
    ]);
    expect(result.recipientUserIds).toEqual(['user-a', 'user-m', 'user-z']);
    // Same inputs → same output, always.
    expect(resolveResultNotificationRecipients([
      candidate('user-z'),
      candidate('user-a'),
      candidate('user-m'),
    ]).recipientUserIds).toEqual(result.recipientUserIds);
  });

  it('8. zero parents → empty recipient list, not an error', () => {
    const result = resolveResultNotificationRecipients([]);
    expect(result.recipientUserIds).toEqual([]);
  });
});