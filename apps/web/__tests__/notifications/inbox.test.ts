import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import * as schema from '@school/database';

import { ForbiddenError, UnauthenticatedError } from '@/lib/errors';
import {
  getNotification,
  getUnreadNotificationCount,
  listNotificationInbox,
  markInboxNotificationRead,
  markNotificationInboxRead,
} from '@/lib/modules/notifications/application';
import { processNotificationEvent } from '@/lib/modules/notifications/application/process-notification-event';

import {
  createNotificationsTestDb,
  seedAnnouncementPublication,
  seedOutboxEvent,
  seedSchool,
  seedUser,
  type NotificationsTestDb,
} from './test-helpers';

type Kind = 'ANNOUNCEMENT_PUBLISHED' | 'RESULT_PUBLISHED' | 'RESULT_REVISED';

function query(overrides: Partial<{
  page: number;
  pageSize: number;
  status: 'ALL' | 'READ' | 'UNREAD';
  notificationType: Kind;
  sourceType: 'ANNOUNCEMENT_PUBLICATION' | 'RESULT_PUBLICATION';
  sourceId: string;
  createdFrom: Date;
  createdTo: Date;
}> = {}) {
  return { page: 1, pageSize: 50, status: 'ALL' as const, ...overrides };
}

async function seedNotification(
  test: NotificationsTestDb,
  schoolId: string,
  recipientUserId: string,
  input: { type?: Kind; title?: string; createdAt?: Date; readAt?: Date; sourceId?: string } = {},
) {
  const type = input.type ?? 'ANNOUNCEMENT_PUBLISHED';
  const [row] = await test.seed.insert(schema.notifications).values({
    schoolId,
    recipientUserId,
    notificationType: type,
    sourceType: type === 'ANNOUNCEMENT_PUBLISHED' ? 'ANNOUNCEMENT_PUBLICATION' : 'RESULT_PUBLICATION',
    sourceId: input.sourceId ?? randomUUID(),
    sourceEventId: randomUUID(),
    title: input.title ?? 'Notification',
    body: 'Persisted content.',
    createdAt: input.createdAt,
    readAt: input.readAt,
  }).returning({ id: schema.notifications.id });
  return row.id;
}

describe('Notification inbox ownership, filters, and history', () => {
  it('lists only the current User/current School with deterministic bounded pagination', async () => {
    const test = await createNotificationsTestDb();
    const schoolA = await seedSchool(test.seed, 'School A');
    const schoolB = await seedSchool(test.seed, 'School B');
    const owner = await seedUser(test.seed, schoolA.schoolId, 'PARENT');
    const other = await seedUser(test.seed, schoolA.schoolId, 'SCHOOL_ADMIN');
    await test.seed.insert(schema.schoolMemberships).values({
      schoolId: schoolB.schoolId, userId: owner, role: 'PARENT', status: 'ACTIVE',
    });
    const older = await seedNotification(test, schoolA.schoolId, owner, {
      title: 'Older', createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const newer = await seedNotification(test, schoolA.schoolId, owner, {
      title: 'Newer', createdAt: new Date('2026-01-02T00:00:00Z'),
    });
    await seedNotification(test, schoolA.schoolId, other, { title: 'Other user' });
    await seedNotification(test, schoolB.schoolId, owner, { title: 'Other school' });

    const first = await listNotificationInbox(
      test.db, { userId: owner, schoolId: schoolA.schoolId }, query({ pageSize: 1 }),
    );
    const second = await listNotificationInbox(
      test.db, { userId: owner, schoolId: schoolA.schoolId }, query({ page: 2, pageSize: 1 }),
    );

    expect(first).toMatchObject({ data: [{ id: newer }], meta: { page: 1, pageSize: 1, total: 2 } });
    expect(second).toMatchObject({ data: [{ id: older }], meta: { page: 2, pageSize: 1, total: 2 } });
    expect(first.data[0]).not.toHaveProperty('schoolId');
    expect(first.data[0]).not.toHaveProperty('recipientUserId');
    expect(first.data[0]).not.toHaveProperty('sourceEventId');
  });

  it('filters read state, exact committed types, source, and created range in SQL', async () => {
    const test = await createNotificationsTestDb();
    const school = await seedSchool(test.seed);
    const userId = await seedUser(test.seed, school.schoolId, 'TEACHER');
    const sourceId = randomUUID();
    const match = await seedNotification(test, school.schoolId, userId, {
      type: 'RESULT_REVISED', sourceId, readAt: new Date('2026-02-02T00:00:00Z'),
      createdAt: new Date('2026-02-01T00:00:00Z'),
    });
    await seedNotification(test, school.schoolId, userId, {
      type: 'RESULT_PUBLISHED', createdAt: new Date('2026-03-01T00:00:00Z'),
    });

    const result = await listNotificationInbox(test.db, { userId, schoolId: school.schoolId }, query({
      status: 'READ', notificationType: 'RESULT_REVISED', sourceType: 'RESULT_PUBLICATION', sourceId,
      createdFrom: new Date('2026-01-31T00:00:00Z'), createdTo: new Date('2026-02-02T00:00:00Z'),
    }));
    const unread = await listNotificationInbox(
      test.db, { userId, schoolId: school.schoolId }, query({ status: 'UNREAD' }),
    );

    expect(result.data.map((row) => row.id)).toEqual([match]);
    expect(unread.data).toHaveLength(1);
    expect(unread.data[0].notificationType).toBe('RESULT_PUBLISHED');
  });

  it('returns owned detail without auto-mark and hides other recipients, Schools, and missing ids', async () => {
    const test = await createNotificationsTestDb();
    const school = await seedSchool(test.seed);
    const owner = await seedUser(test.seed, school.schoolId, 'PARENT');
    const other = await seedUser(test.seed, school.schoolId, 'PARENT');
    const ownId = await seedNotification(test, school.schoolId, owner);
    const otherId = await seedNotification(test, school.schoolId, other);

    expect(await getNotification(test.db, { userId: owner, schoolId: school.schoolId }, ownId))
      .toMatchObject({ id: ownId, readAt: null });
    for (const id of [otherId, randomUUID()]) {
      await expect(getNotification(test.db, { userId: owner, schoolId: school.schoolId }, id))
        .rejects.toMatchObject({ code: 'NOT_FOUND', featureCode: 'NOTIFICATION_NOT_FOUND' });
    }
  });

  it('marks one idempotently, preserves first readAt, and never mutates its Outbox event', async () => {
    const test = await createNotificationsTestDb();
    const school = await seedSchool(test.seed);
    const userId = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
    const event = await seedOutboxEvent(test.seed, 'FailedExample', { reason: 'test' });
    const [notification] = await test.seed.insert(schema.notifications).values({
      schoolId: school.schoolId, recipientUserId: userId,
      notificationType: 'ANNOUNCEMENT_PUBLISHED', sourceType: 'ANNOUNCEMENT_PUBLICATION',
      sourceId: randomUUID(), sourceEventId: event.id, title: 'Read me', body: 'Body',
    }).returning({ id: schema.notifications.id });

    const first = await markInboxNotificationRead(test.db, { userId, schoolId: school.schoolId }, notification.id);
    const replay = await markInboxNotificationRead(test.db, { userId, schoolId: school.schoolId }, notification.id);
    const [outbox] = await test.seed.select({ status: schema.outboxEvents.status })
      .from(schema.outboxEvents).where(eq(schema.outboxEvents.id, event.id));

    expect(first.readAt).toBeInstanceOf(Date);
    expect(replay.readAt?.getTime()).toBe(first.readAt?.getTime());
    expect(outbox.status).toBe('PENDING');
  });

  it('mark-all uses recipient+School scope, preserves existing timestamps, and becomes a zero update', async () => {
    const test = await createNotificationsTestDb();
    const school = await seedSchool(test.seed);
    const owner = await seedUser(test.seed, school.schoolId, 'PARENT');
    const other = await seedUser(test.seed, school.schoolId, 'PARENT');
    const existingReadAt = new Date('2026-01-01T00:00:00Z');
    await seedNotification(test, school.schoolId, owner);
    const alreadyRead = await seedNotification(test, school.schoolId, owner, { readAt: existingReadAt });
    const otherId = await seedNotification(test, school.schoolId, other);

    expect(await markNotificationInboxRead(test.db, { userId: owner, schoolId: school.schoolId }))
      .toEqual({ updatedCount: 1 });
    expect(await markNotificationInboxRead(test.db, { userId: owner, schoolId: school.schoolId }))
      .toEqual({ updatedCount: 0 });
    const rows = await test.seed.select({ id: schema.notifications.id, readAt: schema.notifications.readAt })
      .from(schema.notifications).where(and(
        eq(schema.notifications.schoolId, school.schoolId),
        eq(schema.notifications.recipientUserId, owner),
      ));
    expect(rows.find((row) => row.id === alreadyRead)?.readAt?.getTime()).toBe(existingReadAt.getTime());
    const [otherRow] = await test.seed.select({ readAt: schema.notifications.readAt })
      .from(schema.notifications).where(eq(schema.notifications.id, otherId));
    expect(otherRow.readAt).toBeNull();
  });

  it('counts only unread rows for the current recipient and current School', async () => {
    const test = await createNotificationsTestDb();
    const school = await seedSchool(test.seed);
    const owner = await seedUser(test.seed, school.schoolId, 'SUPER_ADMIN');
    const other = await seedUser(test.seed, school.schoolId, 'TEACHER');
    await seedNotification(test, school.schoolId, owner);
    await seedNotification(test, school.schoolId, owner, { readAt: new Date() });
    await seedNotification(test, school.schoolId, other);

    expect(await getUnreadNotificationCount(test.db, { userId: owner, schoolId: school.schoolId }))
      .toEqual({ count: 1 });
  });

  it('uses canonical permission/context stages for every role and denies inactive identities', async () => {
    const test = await createNotificationsTestDb();
    const school = await seedSchool(test.seed);
    for (const role of ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'PARENT'] as const) {
      const userId = await seedUser(test.seed, school.schoolId, role);
      await seedNotification(test, school.schoolId, userId, { title: role });
      expect((await listNotificationInbox(test.db, { userId, schoolId: school.schoolId }, query())).data)
        .toMatchObject([{ title: role }]);
    }
    await expect(listNotificationInbox(test.db, { userId: null, schoolId: school.schoolId }, query()))
      .rejects.toBeInstanceOf(UnauthenticatedError);
    const inactiveUser = await seedUser(test.seed, school.schoolId, 'PARENT');
    await test.seed.update(schema.users).set({ status: 'SUSPENDED' }).where(eq(schema.users.id, inactiveUser));
    await expect(listNotificationInbox(test.db, { userId: inactiveUser, schoolId: school.schoolId }, query()))
      .rejects.toBeInstanceOf(ForbiddenError);
    const inactiveMember = await seedUser(test.seed, school.schoolId, 'PARENT');
    await test.seed.update(schema.schoolMemberships).set({ status: 'INACTIVE' }).where(and(
      eq(schema.schoolMemberships.schoolId, school.schoolId),
      eq(schema.schoolMemberships.userId, inactiveMember),
    ));
    await expect(listNotificationInbox(test.db, { userId: inactiveMember, schoolId: school.schoolId }, query()))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lists the persisted Announcement notification without rechecking live eligibility', async () => {
    const test = await createNotificationsTestDb();
    const school = await seedSchool(test.seed);
    const parent = await seedUser(test.seed, school.schoolId, 'PARENT');
    const [parentProfile] = await test.seed.insert(schema.parents).values({
      schoolId: school.schoolId, userId: parent, firstName: 'Parent', lastName: 'History',
    }).returning({ id: schema.parents.id });
    const [student] = await test.seed.insert(schema.students).values({
      schoolId: school.schoolId, firstName: 'Student', lastName: 'History',
    }).returning({ id: schema.students.id });
    const [relationship] = await test.seed.insert(schema.parentStudents).values({
      schoolId: school.schoolId, parentId: parentProfile.id, studentId: student.id,
    }).returning({ id: schema.parentStudents.id });
    const publication = await seedAnnouncementPublication(test.seed, school, {
      title: 'Historical announcement', recipients: [parent],
    });
    const event = await seedOutboxEvent(test.seed, 'AnnouncementPublished', {
      eventId: randomUUID(),
      eventType: 'AnnouncementPublished',
      schoolId: school.schoolId,
      announcementId: publication.announcementId,
      announcementVersionId: publication.versionId,
      publicationId: publication.publicationId,
      publicationVersion: 1,
      publishedAt: new Date().toISOString(),
    });
    await processNotificationEvent(test.db, { outboxEventId: event.id });
    const resultNotificationId = await seedNotification(test, school.schoolId, parent, {
      type: 'RESULT_PUBLISHED', title: 'Historical result',
    });
    await test.seed.update(schema.parentStudents).set({ status: 'ENDED' })
      .where(eq(schema.parentStudents.id, relationship.id));

    const inbox = await listNotificationInbox(test.db, { userId: parent, schoolId: school.schoolId }, query());
    expect(inbox.data).toEqual(expect.arrayContaining([expect.objectContaining({
      notificationType: 'ANNOUNCEMENT_PUBLISHED',
      sourceType: 'ANNOUNCEMENT_PUBLICATION',
      sourceId: publication.publicationId,
    }), expect.objectContaining({ id: resultNotificationId, notificationType: 'RESULT_PUBLISHED' })]));
  });

  it('does not surface failed Outbox events and keeps concurrent read operations valid', async () => {
    const test = await createNotificationsTestDb();
    const school = await seedSchool(test.seed);
    const userId = await seedUser(test.seed, school.schoolId, 'PARENT');
    await seedOutboxEvent(test.seed, 'Unsupported', { schoolId: school.schoolId });
    const id = await seedNotification(test, school.schoolId, userId);
    const actor = { userId, schoolId: school.schoolId };

    expect((await listNotificationInbox(test.db, actor, query())).data).toHaveLength(1);
    const [one, all] = await Promise.all([
      markInboxNotificationRead(test.db, actor, id),
      markNotificationInboxRead(test.db, actor),
    ]);
    expect(one.readAt).toBeInstanceOf(Date);
    expect([0, 1]).toContain(all.updatedCount);
    expect((await getUnreadNotificationCount(test.db, actor)).count).toBe(0);
  });
});
