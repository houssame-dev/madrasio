/**
 * Mark-read use cases (Task 010 §8/§9/§10).
 *
 * Verifies that a User can only mark THEIR OWN notifications read, inside
 * their current School, idempotently and without ever moving `read_at`
 * backward.
 */

import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import * as schema from '@school/database';

import { markAllNotificationsRead } from '@/lib/modules/notifications/application/mark-all-notifications-read';
import { markNotificationRead } from '@/lib/modules/notifications/application/mark-notification-read';

import {
  createNotificationsTestDb,
  seedSchool,
  seedUser,
  type NotificationsTestDb,
} from './test-helpers';

async function setup(): Promise<{ testDb: NotificationsTestDb; schoolId: string }> {
  const testDb = await createNotificationsTestDb();
  const { schoolId } = await seedSchool(testDb.seed);
  return { testDb, schoolId };
}

async function seedNotification(
  testDb: NotificationsTestDb,
  schoolId: string,
  recipientUserId: string,
  title = 'Reunion',
): Promise<string> {
  const [row] = await testDb.seed
    .insert(schema.notifications)
    .values({
      schoolId,
      recipientUserId,
      notificationType: 'ANNOUNCEMENT_PUBLISHED',
      sourceType: 'ANNOUNCEMENT_PUBLICATION',
      sourceId: randomUUID(),
      sourceEventId: randomUUID(),
      title,
      body: 'A new announcement was published for your school.',
    })
    .returning({ id: schema.notifications.id });
  return row.id;
}

async function readAtOf(testDb: NotificationsTestDb, notificationId: string): Promise<Date | null> {
  const [row] = await testDb.seed
    .select({ readAt: schema.notifications.readAt })
    .from(schema.notifications)
    .where(eq(schema.notifications.id, notificationId));
  return row?.readAt ?? null;
}

describe('markNotificationRead (Task 010 §8/§9)', () => {
  it('marks the recipient-owned notification read', async () => {
    const { testDb, schoolId } = await setup();
    const recipient = await seedUser(testDb.seed, schoolId, 'PARENT');
    const notificationId = await seedNotification(testDb, schoolId, recipient);

    const marked = await markNotificationRead(testDb.db, { userId: recipient, schoolId, notificationId });

    expect(marked).toMatchObject({ id: notificationId });
    expect(await readAtOf(testDb, notificationId)).toBeInstanceOf(Date);
  });

  it('refuses to mark another user’s notification (ownership)', async () => {
    const { testDb, schoolId } = await setup();
    const owner = await seedUser(testDb.seed, schoolId, 'PARENT');
    const stranger = await seedUser(testDb.seed, schoolId, 'TEACHER');
    const notificationId = await seedNotification(testDb, schoolId, owner);

    const marked = await markNotificationRead(testDb.db, { userId: stranger, schoolId, notificationId });

    expect(marked).toBeNull();
    expect(await readAtOf(testDb, notificationId)).toBeNull();
  });

  it('refuses a cross-school mark (tenant isolation)', async () => {
    const testDb = await createNotificationsTestDb();
    const schoolA = await seedSchool(testDb.seed, 'School A');
    const schoolB = await seedSchool(testDb.seed, 'School B');
    const recipientA = await seedUser(testDb.seed, schoolA.schoolId, 'PARENT');
    await seedUser(testDb.seed, schoolB.schoolId, 'PARENT');
    const notificationId = await seedNotification(testDb, schoolA.schoolId, recipientA);

    // Same recipient, but the school context is B → the A notification is untouchable.
    const marked = await markNotificationRead(testDb.db, {
      userId: recipientA,
      schoolId: schoolB.schoolId,
      notificationId,
    });

    expect(marked).toBeNull();
    expect(await readAtOf(testDb, notificationId)).toBeNull();
  });

  it('is idempotent and never moves read_at backward', async () => {
    const { testDb, schoolId } = await setup();
    const recipient = await seedUser(testDb.seed, schoolId, 'PARENT');
    const notificationId = await seedNotification(testDb, schoolId, recipient);

    await markNotificationRead(testDb.db, { userId: recipient, schoolId, notificationId });
    const firstReadAt = await readAtOf(testDb, notificationId);

    const again = await markNotificationRead(testDb.db, { userId: recipient, schoolId, notificationId });
    const secondReadAt = await readAtOf(testDb, notificationId);

    expect(again).toMatchObject({ id: notificationId, readAt: firstReadAt });
    expect(secondReadAt).toBeInstanceOf(Date);
    expect(secondReadAt!.getTime()).toBe(firstReadAt!.getTime());
  });
});

describe('markAllNotificationsRead (Task 010 §8/§10)', () => {
  it('marks only the caller’s unread notifications in the caller’s School', async () => {
    const { testDb, schoolId } = await setup();
    const recipient = await seedUser(testDb.seed, schoolId, 'PARENT');
    const otherUser = await seedUser(testDb.seed, schoolId, 'TEACHER');
    await seedNotification(testDb, schoolId, recipient);
    await seedNotification(testDb, schoolId, recipient);
    await seedNotification(testDb, schoolId, otherUser);

    const updated = await markAllNotificationsRead(testDb.db, { userId: recipient, schoolId });

    expect(updated).toBe(2);
    const [mine] = await testDb.seed
      .select({ readAt: schema.notifications.readAt })
      .from(schema.notifications)
      .where(eq(schema.notifications.recipientUserId, recipient));
    expect(mine.readAt).toBeInstanceOf(Date);
    const [theirs] = await testDb.seed
      .select({ readAt: schema.notifications.readAt })
      .from(schema.notifications)
      .where(eq(schema.notifications.recipientUserId, otherUser));
    expect(theirs.readAt).toBeNull();
  });

  it('does not touch already-read notifications', async () => {
    const { testDb, schoolId } = await setup();
    const recipient = await seedUser(testDb.seed, schoolId, 'PARENT');
    const unreadId = await seedNotification(testDb, schoolId, recipient);
    const readId = await seedNotification(testDb, schoolId, recipient);
    await markNotificationRead(testDb.db, { userId: recipient, schoolId, notificationId: readId });

    const updated = await markAllNotificationsRead(testDb.db, { userId: recipient, schoolId });

    expect(updated).toBe(1);
    const [unread] = await testDb.seed
      .select({ readAt: schema.notifications.readAt })
      .from(schema.notifications)
      .where(eq(schema.notifications.id, unreadId));
    expect(unread.readAt).toBeInstanceOf(Date);
    const [alreadyRead] = await testDb.seed
      .select({ readAt: schema.notifications.readAt })
      .from(schema.notifications)
      .where(eq(schema.notifications.id, readId));
    expect(alreadyRead.readAt).toBeInstanceOf(Date);
  });

  it('returns 0 when the caller has no notifications', async () => {
    const { testDb, schoolId } = await setup();
    const recipient = await seedUser(testDb.seed, schoolId, 'PARENT');

    const updated = await markAllNotificationsRead(testDb.db, { userId: recipient, schoolId });

    expect(updated).toBe(0);
  });

  it('does not mark across Schools', async () => {
    const testDb = await createNotificationsTestDb();
    const schoolA = await seedSchool(testDb.seed, 'School A');
    const schoolB = await seedSchool(testDb.seed, 'School B');
    const recipient = await seedUser(testDb.seed, schoolA.schoolId, 'PARENT');
    const notificationId = await seedNotification(testDb, schoolA.schoolId, recipient);

    const updated = await markAllNotificationsRead(testDb.db, { userId: recipient, schoolId: schoolB.schoolId });

    expect(updated).toBe(0);
    const [row] = await testDb.seed
      .select({ readAt: schema.notifications.readAt })
      .from(schema.notifications)
      .where(eq(schema.notifications.id, notificationId));
    expect(row.readAt).toBeNull();
  });
});
