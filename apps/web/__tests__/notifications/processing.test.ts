/**
 * Notification processing — application tests (Task 010 §29–§31).
 *
 * Runs the real processor against a fresh PGlite database with all committed
 * migrations applied (including migration 0012). Tests the outbox lifecycle,
 * idempotent replay, snapshot-based recipient resolution (§30), the
 * "notification never grants source access" rule (§31), and the Task 010.1
 * safety hardening: unknown events and unapproved-policy Result events are
 * explicit FAILED outcomes — never silently dropped, never marked PROCESSED,
 * never partially processed, and safe to reprocess.
 */

import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import * as schema from '@school/database';

import { NotificationProcessingError } from '@/lib/modules/notifications/application/notification-errors';
import { processNotificationEvent } from '@/lib/modules/notifications/application/process-notification-event';
import * as notificationsRepo from '@/lib/modules/notifications/infrastructure/repositories/notification-repository';

import {
  createNotificationsTestDb,
  seedAnnouncementPublication,
  seedOutboxEvent,
  seedSchool,
  seedUser,
  type NotificationsTestDb,
} from './test-helpers';

async function setup(): Promise<{ testDb: NotificationsTestDb; schoolId: string }> {
  const testDb = await createNotificationsTestDb();
  const { schoolId } = await seedSchool(testDb.seed);
  return { testDb, schoolId };
}

function announcementPayload(schoolId: string, publication: { announcementId: string; publicationId: string; versionId: string }): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    eventType: 'AnnouncementPublished',
    schoolId,
    announcementId: publication.announcementId,
    announcementVersionId: publication.versionId,
    publicationId: publication.publicationId,
    publicationVersion: 1,
    publishedAt: new Date().toISOString(),
  };
}

async function insertAndProcess(testDb: NotificationsTestDb, schoolId: string, publication: { announcementId: string; publicationId: string; versionId: string }) {
  const event = await seedOutboxEvent(testDb.seed, 'AnnouncementPublished', announcementPayload(schoolId, publication));
  const result = await processNotificationEvent(testDb.db, { outboxEventId: event.id });
  return { event, result };
}

async function loadNotifications(testDb: NotificationsTestDb): Promise<typeof schema.notifications.$inferSelect[]> {
  return testDb.seed.select().from(schema.notifications);
}

describe('outbox → notification processing (Task 010 §29)', () => {
  it('event persistence + processing creates one notification per snapshot recipient (§29.1)', async () => {
    const { testDb, schoolId } = await setup();
    const recipientA = await seedUser(testDb.seed, schoolId, 'PARENT');
    const recipientB = await seedUser(testDb.seed, schoolId, 'TEACHER');
    const publication = await seedAnnouncementPublication(testDb.seed, { schoolId }, {
      title: 'Reunion',
      recipients: [recipientA, recipientB],
    });

    const { event, result } = await insertAndProcess(testDb, schoolId, publication);

    expect(result.notificationsCreated).toBe(2);
    expect(result.notificationType).toBe('ANNOUNCEMENT_PUBLISHED');
    expect(result.alreadyProcessed).toBe(false);

    const notifications = await loadNotifications(testDb);
    expect(notifications).toHaveLength(2);
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([recipientA, recipientB].sort());
    for (const notification of notifications) {
      expect(notification.schoolId).toBe(schoolId);
      expect(notification.notificationType).toBe('ANNOUNCEMENT_PUBLISHED');
      expect(notification.sourceType).toBe('ANNOUNCEMENT_PUBLICATION');
      expect(notification.sourceId).toBe(publication.publicationId);
      expect(notification.sourceEventId).toBe(event.id);
      expect(notification.title).toBe('Reunion');
      expect(notification.readAt).toBeNull();
    }
  });

  it('a failure leaves the event retryable, and fixing the payload succeeds (§29.2)', async () => {
    const { testDb, schoolId } = await setup();
    const recipient = await seedUser(testDb.seed, schoolId, 'PARENT');
    const publication = await seedAnnouncementPublication(testDb.seed, { schoolId }, {
      title: 'Reunion',
      recipients: [recipient],
    });

    // Malformed payload: missing publicationId.
    const badEvent = await seedOutboxEvent(testDb.seed, 'AnnouncementPublished', {
      eventId: randomUUID(),
      eventType: 'AnnouncementPublished',
      schoolId,
      announcementId: publication.announcementId,
      publicationVersion: 1,
      publishedAt: new Date().toISOString(),
    });

    await expect(processNotificationEvent(testDb.db, { outboxEventId: badEvent.id })).rejects.toBeInstanceOf(
      NotificationProcessingError,
    );

    // The failure is EXPLICIT (Task 010.1): the event is marked FAILED with a
    // readable last_error — never PROCESSED, never silently dropped — and no
    // partial notifications are created.
    const [afterFailure] = await testDb.seed
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.id, badEvent.id));
    expect(afterFailure.status).toBe('FAILED');
    expect(afterFailure.lastError).toContain('malformed');
    expect(afterFailure.processedAt).toBeNull();
    expect(await loadNotifications(testDb)).toHaveLength(0);

    // Repair the payload and retry → the event now processes successfully:
    // reprocessing a FAILED event is safe and can resolve to PROCESSED.
    await testDb.seed
      .update(schema.outboxEvents)
      .set({ payload: announcementPayload(schoolId, publication) as unknown as typeof schema.outboxEvents.$inferInsert['payload'] })
      .where(eq(schema.outboxEvents.id, badEvent.id));

    const result = await processNotificationEvent(testDb.db, { outboxEventId: badEvent.id });
    expect(result.notificationsCreated).toBe(1);
    expect(await loadNotifications(testDb)).toHaveLength(1);

    const [afterRetry] = await testDb.seed
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.id, badEvent.id));
    expect(afterRetry.status).toBe('PROCESSED');
  });

  it('successful processing marks the event PROCESSED with processed_at (§29.3)', async () => {
    const { testDb, schoolId } = await setup();
    const recipient = await seedUser(testDb.seed, schoolId, 'PARENT');
    const publication = await seedAnnouncementPublication(testDb.seed, { schoolId }, {
      title: 'Reunion',
      recipients: [recipient],
    });

    const { event } = await insertAndProcess(testDb, schoolId, publication);

    const [stored] = await testDb.seed
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.id, event.id));
    expect(stored.status).toBe('PROCESSED');
    expect(stored.processedAt).toBeInstanceOf(Date);
  });

  it('reprocessing an already-processed event is a safe no-op (§29.4)', async () => {
    const { testDb, schoolId } = await setup();
    const recipient = await seedUser(testDb.seed, schoolId, 'PARENT');
    const publication = await seedAnnouncementPublication(testDb.seed, { schoolId }, {
      title: 'Reunion',
      recipients: [recipient],
    });

    const { event, result: first } = await insertAndProcess(testDb, schoolId, publication);
    expect(first.notificationsCreated).toBe(1);

    const second = await processNotificationEvent(testDb.db, { outboxEventId: event.id });

    expect(second.alreadyProcessed).toBe(true);
    expect(second.notificationsCreated).toBe(0);
    expect(await loadNotifications(testDb)).toHaveLength(1);
  });

  it('multiple recipients are handled deterministically; no recipient is silently lost (§29.5/§29.6)', async () => {
    const { testDb, schoolId } = await setup();
    const recipients = [
      await seedUser(testDb.seed, schoolId, 'PARENT'),
      await seedUser(testDb.seed, schoolId, 'PARENT'),
      await seedUser(testDb.seed, schoolId, 'TEACHER'),
    ];
    const publication = await seedAnnouncementPublication(testDb.seed, { schoolId }, {
      title: 'Reunion',
      recipients,
    });

    const { result } = await insertAndProcess(testDb, schoolId, publication);

    expect(result.notificationsCreated).toBe(recipients.length);
    const notifications = await loadNotifications(testDb);
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([...recipients].sort());
  });

  it('unknown event type is an explicit failure — FAILED, never PROCESSED, zero notifications (Task 010.1)', async () => {
    const { testDb, schoolId } = await setup();
    const event = await seedOutboxEvent(testDb.seed, 'BillingCreated', { schoolId });

    await expect(processNotificationEvent(testDb.db, { outboxEventId: event.id })).rejects.toMatchObject({
      featureCode: 'EVENT_TYPE_NOT_SUPPORTED',
    });

    // NOT silently dropped, NOT marked PROCESSED as if it succeeded, and no
    // fake notification is created.
    const [stored] = await testDb.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, event.id));
    expect(stored.status).toBe('FAILED');
    expect(stored.lastError).toContain('BillingCreated');
    expect(stored.processedAt).toBeNull();
    expect(await loadNotifications(testDb)).toHaveLength(0);
  });

  it('reprocessing a FAILED unknown event is safe: stays FAILED, still no notifications (Task 010.1)', async () => {
    const { testDb, schoolId } = await setup();
    const event = await seedOutboxEvent(testDb.seed, 'BillingCreated', { schoolId });

    await expect(processNotificationEvent(testDb.db, { outboxEventId: event.id })).rejects.toBeInstanceOf(
      NotificationProcessingError,
    );
    // A retry of the FAILED event is a safe no-op for notifications and never
    // flips the event to PROCESSED.
    await expect(processNotificationEvent(testDb.db, { outboxEventId: event.id })).rejects.toBeInstanceOf(
      NotificationProcessingError,
    );

    const [stored] = await testDb.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, event.id));
    expect(stored.status).toBe('FAILED');
    expect(stored.processedAt).toBeNull();
    expect(await loadNotifications(testDb)).toHaveLength(0);
  });

  it('rejects a ResultPublished event until a recipient policy is approved (§15 boundary)', async () => {
    const { testDb, schoolId } = await setup();
    const event = await seedOutboxEvent(testDb.seed, 'ResultPublished', {
      eventId: randomUUID(),
      eventType: 'ResultPublished',
      schoolId,
      studentId: randomUUID(),
      resultType: 'SUBJECT',
      subjectResultId: randomUUID(),
      periodResultId: null,
      annualResultId: null,
      resultValue: '15.50',
      publicationId: randomUUID(),
      publicationVersion: 1,
      publishedAt: new Date().toISOString(),
    });

    const promise = processNotificationEvent(testDb.db, { outboxEventId: event.id });
    await expect(promise).rejects.toMatchObject({ featureCode: 'RESULT_RECIPIENT_POLICY_NOT_APPROVED' });

    // The failure is EXPLICIT (Task 010.1): the event is marked FAILED —
    // never PROCESSED, never silently dropped — and zero notifications are
    // created. No Result recipient policy is invented here.
    const [stored] = await testDb.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, event.id));
    expect(stored.status).toBe('FAILED');
    expect(stored.lastError).toContain('recipient policy');
    expect(stored.processedAt).toBeNull();
    expect(await loadNotifications(testDb)).toHaveLength(0);

    // Reprocessing the FAILED event is safe: it re-fails with the same code
    // and remains FAILED with no notifications.
    await expect(processNotificationEvent(testDb.db, { outboxEventId: event.id })).rejects.toMatchObject({
      featureCode: 'RESULT_RECIPIENT_POLICY_NOT_APPROVED',
    });
    const [storedAfterRetry] = await testDb.seed
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.id, event.id));
    expect(storedAfterRetry.status).toBe('FAILED');
    expect(storedAfterRetry.processedAt).toBeNull();
    expect(await loadNotifications(testDb)).toHaveLength(0);
  });
});

describe('recipient snapshots are the source of truth (§30)', () => {
  it('recipients stay exactly the snapshot set after ParentStudent/TeacherAssignment changes', async () => {
    const testDb = await createNotificationsTestDb();
    const { schoolId, yearId, classId } = await seedSchool(testDb.seed);

    // Recipient A: PARENT linked to a student in the class.
    const parentUser = await seedUser(testDb.seed, schoolId, 'PARENT');
    const parentId = randomUUID();
    await testDb.seed.insert(schema.parents).values({ id: parentId, schoolId, userId: parentUser, firstName: 'Nadia', lastName: 'Benali' });
    const studentId = randomUUID();
    await testDb.seed.insert(schema.students).values({ id: studentId, schoolId, firstName: 'Amine', lastName: 'Benali' });
    await testDb.seed
      .insert(schema.studentEnrollments)
      .values({ schoolId, studentId, academicYearId: yearId, classId, status: 'ACTIVE', effectiveFrom: '2025-09-01' });
    const [parentStudent] = await testDb.seed
      .insert(schema.parentStudents)
      .values({ schoolId, parentId, studentId, status: 'ACTIVE' })
      .returning({ id: schema.parentStudents.id });

    // Recipient B: TEACHER assigned to the class.
    const teacherUser = await seedUser(testDb.seed, schoolId, 'TEACHER');
    const teacherId = randomUUID();
    await testDb.seed.insert(schema.teachers).values({ id: teacherId, schoolId, userId: teacherUser, firstName: 'Karim', lastName: 'Alaoui' });
    const subjectId = randomUUID();
    await testDb.seed.insert(schema.subjects).values({ id: subjectId, schoolId, name: 'Mathematics' });
    const [assignment] = await testDb.seed
      .insert(schema.teacherAssignments)
      .values({ id: randomUUID(), schoolId, teacherId, classId, subjectId, academicYearId: yearId, status: 'ACTIVE', effectiveFrom: '2025-09-01' })
      .returning({ id: schema.teacherAssignments.id });

    // Publication snapshot persisted at publish time: exactly [parentUser, teacherUser].
    const publication = await seedAnnouncementPublication(testDb.seed, { schoolId }, {
      title: 'Reunion',
      recipients: [parentUser, teacherUser],
    });

    // Current state changes AFTER publication: relationships ENDED.
    await testDb.seed
      .update(schema.parentStudents)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(eq(schema.parentStudents.id, parentStudent.id));
    await testDb.seed
      .update(schema.teacherAssignments)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(eq(schema.teacherAssignments.id, assignment.id));

    // Process the event now (relationships already changed).
    const { result } = await insertAndProcess(testDb, schoolId, publication);

    // Recipients must be EXACTLY the snapshot set — never recomputed from
    // current ParentStudent / TeacherAssignment relationships (§30).
    expect(result.notificationsCreated).toBe(2);
    const notifications = await loadNotifications(testDb);
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([parentUser, teacherUser].sort());
  });
});

describe('notification never grants source access (§31)', () => {
  it('a source id from a notification cannot resolve the source outside its School', async () => {
    const testDb = await createNotificationsTestDb();
    const schoolA = await seedSchool(testDb.seed, 'School A');
    const schoolB = await seedSchool(testDb.seed, 'School B');

    const recipient = await seedUser(testDb.seed, schoolA.schoolId, 'PARENT');
    const publication = await seedAnnouncementPublication(testDb.seed, { schoolId: schoolA.schoolId }, {
      title: 'Private',
      recipients: [recipient],
    });

    // A School A recipient legitimately gets a notification referencing the publication.
    const { result } = await insertAndProcess(testDb, schoolA.schoolId, publication);
    expect(result.notificationsCreated).toBe(1);

    // Knowing the publication id (e.g. from a notification) grants NOTHING:
    // the source lookup is school-scoped and a School B context can never
    // resolve School A's publication (BR-NOTIFICATION-006, CLAUDE.md §13).
    const crossSchool = await notificationsRepo.findAnnouncementPublication(testDb.db, schoolB.schoolId, publication.publicationId);
    expect(crossSchool).toBeNull();

    const sameSchool = await notificationsRepo.findAnnouncementPublication(testDb.db, schoolA.schoolId, publication.publicationId);
    expect(sameSchool?.id).toBe(publication.publicationId);
  });
});
