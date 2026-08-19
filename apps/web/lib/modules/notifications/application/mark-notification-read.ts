/**
 * Mark one notification as read (Task 010 §8/§9).
 *
 * `userId` + `schoolId` are resolved server-side from the authenticated
 * session / current School context (BR-NOTIFICATION-007, CLAUDE.md §15) — they
 * are never trusted from the client. The database UPDATE is scoped by BOTH, so
 * a User can only ever mark their OWN notification inside their current
 * School: a wrong recipient or a cross-school id resolves to nothing (returns
 * false) instead of mutating another User's data.
 *
 * Idempotent: `read_at` is set only when still NULL, so repeated calls and
 * already-read notifications are safe and `read_at` never moves backward.
 */

import type { NotificationsDb } from '../infrastructure/repositories/notification-repository';
import * as repo from '../infrastructure/repositories/notification-repository';

export interface MarkNotificationReadInput {
  userId: string;
  schoolId: string;
  notificationId: string;
}

/**
 * Marks the notification read. Returns true when the recipient-owned
 * notification in the current School existed (and was therefore marked),
 * false otherwise (wrong recipient / wrong School / not found).
 */
export async function markNotificationRead(
  db: NotificationsDb,
  input: MarkNotificationReadInput,
): Promise<boolean> {
  return repo.markNotificationRead(db, input.notificationId, input.schoolId, input.userId);
}