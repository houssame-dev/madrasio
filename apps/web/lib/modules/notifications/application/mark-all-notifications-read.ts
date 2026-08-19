/**
 * Mark all of the current User's notifications as read (Task 010 §8/§10).
 *
 * Scoped server-side by the authenticated User + current School context
 * (BR-NOTIFICATION-007): only the caller's own unread notifications in the
 * current School are touched. Other Users and other Schools are never
 * affected. Returns the number of notifications updated.
 */

import type { NotificationsDb } from '../infrastructure/repositories/notification-repository';
import * as repo from '../infrastructure/repositories/notification-repository';

export interface MarkAllNotificationsReadInput {
  userId: string;
  schoolId: string;
}

export async function markAllNotificationsRead(
  db: NotificationsDb,
  input: MarkAllNotificationsReadInput,
): Promise<number> {
  return repo.markAllNotificationsRead(db, input.schoolId, input.userId);
}