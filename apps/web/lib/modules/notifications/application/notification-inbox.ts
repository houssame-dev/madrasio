import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';

import type {
  NotificationInboxQuery, NotificationPage, NotificationView,
} from '../domain/contracts';
import * as repo from '../infrastructure/repositories/notification-repository';
import type { NotificationsDb } from '../infrastructure/repositories/notification-repository';
import { markAllNotificationsRead as markAllReadState } from './mark-all-notifications-read';
import { markNotificationRead as markReadState } from './mark-notification-read';
import { NotificationInboxError } from './notification-inbox-errors';

export interface NotificationActor {
  userId: string | null;
  schoolId: string;
}

async function authorizeInbox(db: NotificationsDb, actor: NotificationActor): Promise<string> {
  await requireOperation(db as unknown as AuthorizationDb, actor, {
    permission: 'notifications.read',
    scope: { kind: 'school' },
  });
  // The canonical authorization pipeline rejects a missing identity first.
  return actor.userId!;
}

function notFound(): never {
  throw new NotificationInboxError('NOTIFICATION_NOT_FOUND', 'Notification was not found.');
}

export async function listNotificationInbox(
  db: NotificationsDb,
  actor: NotificationActor,
  input: NotificationInboxQuery,
): Promise<NotificationPage> {
  const userId = await authorizeInbox(db, actor);
  const result = await repo.listNotifications(db, actor.schoolId, userId, input);
  return {
    data: result.rows,
    meta: { page: input.page, pageSize: input.pageSize, total: result.total },
  };
}

export async function getNotification(
  db: NotificationsDb,
  actor: NotificationActor,
  notificationId: string,
): Promise<NotificationView> {
  const userId = await authorizeInbox(db, actor);
  const row = await repo.findNotification(db, notificationId, actor.schoolId, userId);
  return row ?? notFound();
}

export async function markInboxNotificationRead(
  db: NotificationsDb,
  actor: NotificationActor,
  notificationId: string,
): Promise<NotificationView> {
  const userId = await authorizeInbox(db, actor);
  const row = await markReadState(db, { userId, schoolId: actor.schoolId, notificationId });
  return row ?? notFound();
}

export async function markNotificationInboxRead(
  db: NotificationsDb,
  actor: NotificationActor,
): Promise<{ updatedCount: number }> {
  const userId = await authorizeInbox(db, actor);
  const updatedCount = await markAllReadState(db, { userId, schoolId: actor.schoolId });
  return { updatedCount };
}

export async function getUnreadNotificationCount(
  db: NotificationsDb,
  actor: NotificationActor,
): Promise<{ count: number }> {
  const userId = await authorizeInbox(db, actor);
  return { count: await repo.countUnreadNotifications(db, actor.schoolId, userId) };
}
