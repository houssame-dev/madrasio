/**
 * Outbox operational hardening — application tests (Task 013 §30–§33).
 *
 * Covers the small operational layer over the EXISTING outbox: specific
 * retry (`retryOutboxEvent`), bounded batch draining
 * (`processRetryableOutboxEvents`), deterministic ordering, per-event failure
 * isolation, transient-vs-deterministic semantics, operational visibility
 * (never exposing payloads), and the historical-retry guarantees
 * (Announcement snapshots + frozen Result recipients) that prove retry never
 * recomputes recipients or re-publishes the source domain (§33).
 *
 * The outbox is infrastructure (no tenant FK). There is NO public API: these
 * are server-internal operational application helpers only (Task 013
 * §17/§18/§32). The only client-facing surface remains the notification
 * processor, which enforces school-scoped source lookups.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { authUsers } from 'drizzle-orm/supabase';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import * as schema from '@school/database';

import { calculateSubjectResult, finalizeResult, publishResult } from '@/lib/modules/grades/application';
import type { NotificationsDb } from '@/lib/modules/notifications/infrastructure/repositories/notification-repository';
import * as notificationsRepo from '@/lib/modules/notifications/infrastructure/repositories/notification-repository';
import { processNotificationEvent } from '@/lib/modules/notifications/application/process-notification-event';
import { OutboxOperationError } from '@/lib/modules/notifications/application/outbox-operations-errors';
import { retryOutboxEvent } from '@/lib/modules/notifications/application/retry-outbox-event';
import {
  normalizeOutboxBatchLimit,
  processRetryableOutboxEvents,
  OUTBOX_BATCH_DEFAULT_LIMIT,
  OUTBOX_BATCH_MAX_LIMIT,
} from '@/lib/modules/notifications/application/process-retryable-outbox-events';

import {
  seedGradebook,
  seedGrades,
  seedSchool as seedGradesSchool,
  seedStudentAndActors,
  type SeededSchool,
  type SeededStudent,
} from '../grades/test-helpers';
import {
  createNotificationsTestDb,
  seedAnnouncementPublication,
  seedOutboxEvent,
  seedSchool as seedNotificationsSchool,
  seedUser,
} from './test-helpers';

interface OutboxTestDb {
  seed: ReturnType<typeof drizzle<typeof schema>>;
  db: NotificationsDb;
  client: PGlite;
}

let test: OutboxTestDb;

beforeEach(async () => {
  test = await createNotificationsTestDb();
});

afterEach(async () => {
  await test.client.close();
});

async function loadNotifications(): Promise<typeof schema.notifications.$inferSelect[]> {
  return test.seed.select().from(schema.notifications);
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

function malformedAnnouncementPayload(schoolId: string): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    eventType: 'AnnouncementPublished',
    schoolId,
    // publicationId intentionally missing → EVENT_PAYLOAD_INVALID
  };
}

async function seedAnnouncementBase(): Promise<{ schoolId: string }> {
  const { schoolId } = await seedNotificationsSchool(test.seed);
  return { schoolId };
}

async function seedAnnouncementPublicationAndEvent(
  schoolId: string,
  recipients: string[],
  createdAt?: Date,
): Promise<{ event: { id: string; status: string }; publication: { announcementId: string; publicationId: string; versionId: string } }> {
  const publication = await seedAnnouncementPublication(test.seed, { schoolId }, {
    title: 'Reunion',
    recipients,
  });
  const event = await seedOutboxEvent(test.seed, 'AnnouncementPublished', announcementPayload(schoolId, publication));
  if (createdAt) {
    await test.seed.update(schema.outboxEvents).set({ createdAt }).where(eq(schema.outboxEvents.id, event.id));
  }
  return { event, publication };
}

interface SeededParent {
  userId: string;
  parentId: string;
  parentStudentId: string;
}

async function seedLinkedParent(schoolId: string, studentId: string, parentStudentStatus: 'ACTIVE' | 'ENDED' = 'ACTIVE'): Promise<SeededParent> {
  const userId = randomUUID();
  await test.seed.insert(authUsers).values({ id: userId });
  await test.seed.insert(schema.users).values({ id: userId });
  await test.seed.insert(schema.schoolMemberships).values({ schoolId, userId, role: 'PARENT', status: 'ACTIVE' });
  const parentId = randomUUID();
  await test.seed.insert(schema.parents).values({ id: parentId, schoolId, userId, firstName: 'Nadia', lastName: 'Benali' });
  const [parentStudent] = await test.seed
    .insert(schema.parentStudents)
    .values({ schoolId, parentId, studentId, status: parentStudentStatus })
    .returning({ id: schema.parentStudents.id });
  return { userId, parentId, parentStudentId: parentStudent.id };
}

async function seedStudentAndParentLinks(schoolId: string, yearId: string, classId: string): Promise<{ studentId: string }> {
  const studentId = randomUUID();
  await test.seed.insert(schema.students).values({ id: studentId, schoolId, firstName: 'Amine', lastName: 'Benali' });
  await test.seed
    .insert(schema.studentEnrollments)
    .values({ schoolId, studentId, academicYearId: yearId, classId, effectiveFrom: '2025-09-01', status: 'ACTIVE' });
  return { studentId };
}

interface SeededResultScenario {
  schoolId: string;
  adminId: string;
  publicationId: string;
  event: typeof schema.outboxEvents.$inferSelect;
}

/** Publishes a SUBJECT result through the REAL publish use case (frozen recipient payload). */
async function publishResultScenario(school: SeededSchool, actors: SeededStudent): Promise<SeededResultScenario> {
  const gradebook = await seedGradebook(test.seed, school.schoolId, school, school.subjectMathId);
  await seedGrades(test.seed, school.schoolId, gradebook.gradebookId, gradebook, actors.studentId, '16', '18');

  const calculated = await calculateSubjectResult(test.db, {
    userId: actors.schoolAdminUserId,
    schoolId: school.schoolId,
    gradebookId: gradebook.gradebookId,
    studentId: actors.studentId,
  });
  await finalizeResult(test.db, {
    userId: actors.schoolAdminUserId,
    schoolId: school.schoolId,
    resultType: 'SUBJECT',
    resultId: calculated.id,
  });
  const published = await publishResult(test.db, {
    userId: actors.schoolAdminUserId,
    schoolId: school.schoolId,
    resultType: 'SUBJECT',
    resultId: calculated.id,
    idempotencyKey: randomUUID(),
  });

  const [event] = await test.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.eventType, 'ResultPublished'));
  return {
    schoolId: school.schoolId,
    adminId: actors.schoolAdminUserId,
    publicationId: published.publicationId,
    event,
  };
}

/**
 * A db wrapper that throws a generic (non-domain) error on the FIRST
 * `transaction` call, then delegates normally. Simulates a transient
 * infrastructure failure mid-batch (Task 013 §14).
 */
function failingOnceDb(db: NotificationsDb): NotificationsDb {
  let failedOnce = false;
  const handler: ProxyHandler<NotificationsDb> = {
    get(target, prop, receiver) {
      if (prop === 'transaction') {
        const transaction = target.transaction;
        return (...args: unknown[]) => {
          if (!failedOnce) {
            failedOnce = true;
            throw new Error('simulated transient infrastructure error');
          }
          return (transaction as unknown as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  };
  return new Proxy(db, handler) as NotificationsDb;
}

describe('specific outbox event retry (Task 013 §30)', () => {
  it('1. a PENDING event can be retried', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    const { event } = await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);

    const result = await retryOutboxEvent(test.db, { outboxEventId: event.id });

    expect(result.previousState).toBe('PENDING');
    expect(result.resultingState).toBe('PROCESSED');
    expect(result.notificationsCreated).toBe(1);
    expect(result.alreadyProcessed).toBe(false);
    expect(result.lastError).toBeNull();
    expect(result.eventType).toBe('AnnouncementPublished');
    expect(await loadNotifications()).toHaveLength(1);
  });

  it('2. a FAILED event can be retried after its cause is repaired', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    const badEvent = await seedOutboxEvent(test.seed, 'AnnouncementPublished', malformedAnnouncementPayload(schoolId));

    // Deterministic failure → FAILED with a readable last_error.
    await expect(processNotificationEvent(test.db, { outboxEventId: badEvent.id })).rejects.toMatchObject({
      featureCode: 'EVENT_PAYLOAD_INVALID',
    });
    const [afterFailure] = await test.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, badEvent.id));
    expect(afterFailure.status).toBe('FAILED');
    expect(afterFailure.lastError).toContain('malformed');

    // Repair the payload (an approved operational action), then retry.
    const publication = await seedAnnouncementPublication(test.seed, { schoolId }, {
      title: 'Reunion',
      recipients: [recipient],
    });
    await test.seed
      .update(schema.outboxEvents)
      .set({ payload: announcementPayload(schoolId, publication) as unknown as typeof schema.outboxEvents.$inferInsert['payload'] })
      .where(eq(schema.outboxEvents.id, badEvent.id));

    const result = await retryOutboxEvent(test.db, { outboxEventId: badEvent.id });

    expect(result.previousState).toBe('FAILED');
    expect(result.resultingState).toBe('PROCESSED');
    expect(result.notificationsCreated).toBe(1);
    expect(result.lastError).toBeNull();

    const [afterRetry] = await test.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, badEvent.id));
    expect(afterRetry.status).toBe('PROCESSED');
    expect(afterRetry.lastError).toBeNull();
  });

  it('3. retrying a PROCESSED event is an idempotent no-op', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    const { event } = await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);
    await retryOutboxEvent(test.db, { outboxEventId: event.id });

    const second = await retryOutboxEvent(test.db, { outboxEventId: event.id });

    expect(second.alreadyProcessed).toBe(true);
    expect(second.previousState).toBe('PROCESSED');
    expect(second.resultingState).toBe('PROCESSED');
    expect(second.notificationsCreated).toBe(0);
    expect(await loadNotifications()).toHaveLength(1);
  });

  it('4. a missing event is a controlled OUTBOX_EVENT_NOT_FOUND error', async () => {
    await expect(retryOutboxEvent(test.db, { outboxEventId: randomUUID() })).rejects.toMatchObject({
      featureCode: 'OUTBOX_EVENT_NOT_FOUND',
    });
    await expect(retryOutboxEvent(test.db, { outboxEventId: randomUUID() })).rejects.toBeInstanceOf(OutboxOperationError);
  });

  it('a PROCESSING event is refused with INVALID_RETRY_STATE', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    const { event } = await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);
    await test.seed.update(schema.outboxEvents).set({ status: 'PROCESSING' }).where(eq(schema.outboxEvents.id, event.id));

    await expect(retryOutboxEvent(test.db, { outboxEventId: event.id })).rejects.toMatchObject({
      featureCode: 'INVALID_RETRY_STATE',
    });
  });

  it('5. a successful retry creates the expected Notifications', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipientA = await seedUser(test.seed, schoolId, 'PARENT');
    const recipientB = await seedUser(test.seed, schoolId, 'TEACHER');
    const { event } = await seedAnnouncementPublicationAndEvent(schoolId, [recipientA, recipientB]);

    const result = await retryOutboxEvent(test.db, { outboxEventId: event.id });

    expect(result.notificationsCreated).toBe(2);
    const notifications = await loadNotifications();
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([recipientA, recipientB].sort());
    for (const notification of notifications) {
      expect(notification.sourceEventId).toBe(event.id);
      expect(notification.notificationType).toBe('ANNOUNCEMENT_PUBLISHED');
    }
  });

  it('6. historical Announcement recipients are preserved on retry (§21/§33)', async () => {
    const { schoolId, yearId, classId } = await seedNotificationsSchool(test.seed);
    const { studentId } = await seedStudentAndParentLinks(schoolId, yearId, classId);

    const userA = await seedUser(test.seed, schoolId, 'PARENT');
    const userB = await seedUser(test.seed, schoolId, 'PARENT');
    const userC = await seedUser(test.seed, schoolId, 'PARENT');
    const parentA = await seedLinkedParent(schoolId, studentId);
    await seedLinkedParent(schoolId, studentId); // C's live link

    // Publish-time snapshot is EXACTLY [A, B].
    const publication = await seedAnnouncementPublication(test.seed, { schoolId }, {
      title: 'Reunion',
      recipients: [userA, userB],
    });
    const event = await seedOutboxEvent(test.seed, 'AnnouncementPublished', announcementPayload(schoolId, publication));

    // After publication: A's relationship ENDED (a current recompute would drop
    // A and pick up C). Retry must consume the frozen snapshot.
    await test.seed
      .update(schema.parentStudents)
      .set({ status: 'ENDED' })
      .where(eq(schema.parentStudents.id, parentA.parentStudentId));
    void userC;

    const result = await retryOutboxEvent(test.db, { outboxEventId: event.id });

    expect(result.resultingState).toBe('PROCESSED');
    const notifications = await loadNotifications();
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([userA, userB].sort());
  });

  it('7. historical Result recipients are preserved on retry (§22/§33)', async () => {
    const school = await seedGradesSchool(test.seed);
    const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
    const parentA = await seedLinkedParent(school.schoolId, actors.studentId);
    const parentB = await seedLinkedParent(school.schoolId, actors.studentId);

    const scenario = await publishResultScenario(school, actors);
    const payload = scenario.event.payload as unknown as Record<string, unknown>;
    expect(payload.recipientUserIds).toEqual([parentA.userId, parentB.userId].sort());

    // After publication: A's relationship ENDED and C becomes eligible — a
    // recompute would give [B, C]. Retry must keep the frozen [A, B].
    await test.seed
      .update(schema.parentStudents)
      .set({ status: 'ENDED' })
      .where(eq(schema.parentStudents.id, parentA.parentStudentId));
    await seedLinkedParent(school.schoolId, actors.studentId); // C

    const result = await retryOutboxEvent(test.db, { outboxEventId: scenario.event.id });

    expect(result.resultingState).toBe('PROCESSED');
    const notifications = await loadNotifications();
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([parentA.userId, parentB.userId].sort());
  });

  it('8. retry does not recreate the source publication', async () => {
    // Announcement: retry never creates a new AnnouncementPublication.
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    const { event } = await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);
    const countAnnouncementPublications = async () =>
      (await test.seed.select({ id: schema.announcementPublications.id }).from(schema.announcementPublications)).length;

    expect(await countAnnouncementPublications()).toBe(1);
    await retryOutboxEvent(test.db, { outboxEventId: event.id });
    expect(await countAnnouncementPublications()).toBe(1);

    // Result: retry never creates a new ResultPublication.
    const school = await seedGradesSchool(test.seed);
    const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
    const resultScenario = await publishResultScenario(school, actors);
    const countResultPublications = async () =>
      (await test.seed.select({ id: schema.resultPublications.id }).from(schema.resultPublications)).length;

    expect(await countResultPublications()).toBe(1);
    await retryOutboxEvent(test.db, { outboxEventId: resultScenario.event.id });
    expect(await countResultPublications()).toBe(1);
  });
});

describe('bounded batch processing (Task 013 §31)', () => {
  it('9. the default batch processes PENDING events only', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);
    await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);

    const summary = await processRetryableOutboxEvents(test.db);

    expect(summary.attempted).toBe(2);
    expect(summary.processed).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.pending).toBe(0);
    expect(await loadNotifications()).toHaveLength(2);
  });

  it('10. the default batch does NOT continuously retry FAILED events', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);
    // A deterministic FAILED event (unknown event type).
    const failedEvent = await seedOutboxEvent(test.seed, 'BillingCreated', { schoolId });
    await expect(processNotificationEvent(test.db, { outboxEventId: failedEvent.id })).rejects.toMatchObject({
      featureCode: 'EVENT_TYPE_NOT_SUPPORTED',
    });

    const summary = await processRetryableOutboxEvents(test.db);

    expect(summary.attempted).toBe(1);
    expect(summary.processed).toBe(1);
    expect(summary.failed).toBe(0);
    const [failed] = await test.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, failedEvent.id));
    expect(failed.status).toBe('FAILED');
  });

  it('11. includeFailed explicitly processes FAILED events', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    const badEvent = await seedOutboxEvent(test.seed, 'AnnouncementPublished', malformedAnnouncementPayload(schoolId));
    await expect(processNotificationEvent(test.db, { outboxEventId: badEvent.id })).rejects.toMatchObject({
      featureCode: 'EVENT_PAYLOAD_INVALID',
    });
    // Repair the FAILED event so the includeFailed batch can drain it.
    const publication = await seedAnnouncementPublication(test.seed, { schoolId }, {
      title: 'Reunion',
      recipients: [recipient],
    });
    await test.seed
      .update(schema.outboxEvents)
      .set({ payload: announcementPayload(schoolId, publication) as unknown as typeof schema.outboxEvents.$inferInsert['payload'] })
      .where(eq(schema.outboxEvents.id, badEvent.id));
    await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);

    const summary = await processRetryableOutboxEvents(test.db, { includeFailed: true });

    expect(summary.attempted).toBe(2);
    expect(summary.processed).toBe(2);
    expect(summary.failed).toBe(0);
    expect(await loadNotifications()).toHaveLength(2);
  });

  it('12. the batch obeys its limit', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);
    await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);
    await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);

    const summary = await processRetryableOutboxEvents(test.db, { limit: 2 });

    expect(summary.attempted).toBe(2);
    expect(summary.processed).toBe(2);

    const remaining = await test.seed.select({ status: schema.outboxEvents.status }).from(schema.outboxEvents);
    expect(remaining.filter((row) => row.status === 'PENDING')).toHaveLength(1);
  });

  it('13. batch ordering is deterministic (created_at ASC, then id ASC)', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    const publication = await seedAnnouncementPublication(test.seed, { schoolId }, {
      title: 'Reunion',
      recipients: [recipient],
    });
    const payload = announcementPayload(schoolId, publication);

    const insertAt = async (createdAt: Date): Promise<string> => {
      const [row] = await test.seed
        .insert(schema.outboxEvents)
        .values({ eventType: 'AnnouncementPublished', payload: payload as unknown as typeof schema.outboxEvents.$inferInsert['payload'], createdAt })
        .returning({ id: schema.outboxEvents.id });
      return row.id;
    };

    // Inserted out of order, with a createdAt tie (t=+2 days twice).
    const ids = [
      await insertAt(new Date('2026-01-03T00:00:00Z')),
      await insertAt(new Date('2026-01-01T00:00:00Z')),
      await insertAt(new Date('2026-01-02T00:00:00Z')),
      await insertAt(new Date('2026-01-02T00:00:00Z')),
    ];

    const allRows = await Promise.all(
      ids.map(async (id) => {
        const [row] = await test.seed.select({ id: schema.outboxEvents.id, createdAt: schema.outboxEvents.createdAt }).from(schema.outboxEvents).where(eq(schema.outboxEvents.id, id));
        return row;
      }),
    );
    // Expected = created_at ASC, then id ASC (uuid byte order == lowercase lexicographic).
    const expected = allRows
      .slice()
      .sort((a, b) => {
        const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
        return byCreated !== 0 ? byCreated : a.id.localeCompare(b.id);
      })
      .map((r) => r.id);

    const summary = await processRetryableOutboxEvents(test.db, { limit: ids.length });

    expect(summary.attempted).toBe(ids.length);
    expect(summary.processed).toBe(ids.length);
    expect(summary.results.map((r) => r.eventId)).toEqual(expected);
  });

  it('14. one failed event does not abort the remaining events', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    const { publication } = await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);
    await test.seed
      .delete(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventType, 'AnnouncementPublished'));

    // Bad event FIRST (earliest created_at), good events after.
    const badEvent = await seedOutboxEvent(test.seed, 'AnnouncementPublished', malformedAnnouncementPayload(schoolId));
    await test.seed.update(schema.outboxEvents).set({ createdAt: new Date('2026-01-01T00:00:00Z') }).where(eq(schema.outboxEvents.id, badEvent.id));
    const goodA = await seedOutboxEvent(test.seed, 'AnnouncementPublished', announcementPayload(schoolId, publication));
    await test.seed.update(schema.outboxEvents).set({ createdAt: new Date('2026-01-02T00:00:00Z') }).where(eq(schema.outboxEvents.id, goodA.id));
    const goodB = await seedOutboxEvent(test.seed, 'AnnouncementPublished', announcementPayload(schoolId, publication));
    await test.seed.update(schema.outboxEvents).set({ createdAt: new Date('2026-01-03T00:00:00Z') }).where(eq(schema.outboxEvents.id, goodB.id));

    const summary = await processRetryableOutboxEvents(test.db, { limit: 3 });

    expect(summary.attempted).toBe(3);
    expect(summary.processed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.pending).toBe(0);
    expect(summary.results[0].eventId).toBe(badEvent.id);
    expect(summary.results[0].featureCode).toBe('EVENT_PAYLOAD_INVALID');
    expect(summary.results[0].resultingState).toBe('FAILED');
    expect(summary.results[1].resultingState).toBe('PROCESSED');
    expect(summary.results[2].resultingState).toBe('PROCESSED');
    const [storedBad] = await test.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, badEvent.id));
    expect(storedBad.status).toBe('FAILED');
  });

  it('15. a transient error leaves the event PENDING and does not abort the batch', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    const first = await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);
    const second = await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);

    const summary = await processRetryableOutboxEvents(failingOnceDb(test.db), { limit: 2 });

    expect(summary.attempted).toBe(2);
    expect(summary.processed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.pending).toBe(1);
    // The transient-failed event stays PENDING — never marked FAILED (§14).
    const [firstStored] = await test.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, first.event.id));
    expect(firstStored.status).toBe('PENDING');
    expect(firstStored.lastError).toBeNull();
    const [secondStored] = await test.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, second.event.id));
    expect(secondStored.status).toBe('PROCESSED');
  });

  it('16. batch summary counts are correct', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);
    const badEvent = await seedOutboxEvent(test.seed, 'AnnouncementPublished', malformedAnnouncementPayload(schoolId));

    const summary = await processRetryableOutboxEvents(test.db, { limit: 2 });

    expect(summary).toMatchObject({
      attempted: 2,
      processed: 1,
      failed: 1,
      pending: 0,
    });
    expect(summary.results).toHaveLength(2);
    expect(summary.results.find((r) => r.eventId === badEvent.id)?.featureCode).toBe('EVENT_PAYLOAD_INVALID');
    for (const outcome of summary.results) {
      expect(typeof outcome.eventType).toBe('string');
      expect(['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED']).toContain(outcome.previousState);
      expect(['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED']).toContain(outcome.resultingState);
    }
  });

  it('17. re-running the batch after success creates no duplicate notifications', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    const { event } = await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);

    const firstRun = await processRetryableOutboxEvents(test.db);
    expect(firstRun.processed).toBe(1);
    expect(await loadNotifications()).toHaveLength(1);

    const secondRun = await processRetryableOutboxEvents(test.db);
    expect(secondRun.attempted).toBe(0);
    expect(secondRun.processed).toBe(0);
    expect(await loadNotifications()).toHaveLength(1);
    void event;

    expect(OUTBOX_BATCH_DEFAULT_LIMIT).toBe(25);
    expect(OUTBOX_BATCH_MAX_LIMIT).toBe(100);
  });

  it('18. concurrent batch invocations claim each event effectively once', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);
    await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);
    await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);

    await Promise.all([
      processRetryableOutboxEvents(test.db, { limit: 3 }),
      processRetryableOutboxEvents(test.db, { limit: 3 }),
    ]);

    expect(await loadNotifications()).toHaveLength(3);
    const events = await test.seed.select().from(schema.outboxEvents);
    expect(events.every((event) => event.status === 'PROCESSED')).toBe(true);
    expect(events.every((event) => event.attemptCount === 1)).toBe(true);
  });

  it('19. normalizes caller limits to the conservative bounded range', () => {
    expect(normalizeOutboxBatchLimit()).toBe(OUTBOX_BATCH_DEFAULT_LIMIT);
    expect(normalizeOutboxBatchLimit(0)).toBe(1);
    expect(normalizeOutboxBatchLimit(1_000)).toBe(OUTBOX_BATCH_MAX_LIMIT);
    expect(normalizeOutboxBatchLimit(Number.POSITIVE_INFINITY)).toBe(OUTBOX_BATCH_DEFAULT_LIMIT);
  });
});

describe('operational visibility & privacy (Task 013 §15/§16/§19/§32)', () => {
  it('operational rows expose lifecycle fields but NEVER the event payload', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const recipient = await seedUser(test.seed, schoolId, 'PARENT');
    await seedAnnouncementPublicationAndEvent(schoolId, [recipient]);

    const rows = await notificationsRepo.listRetryableOutboxEvents(test.db, { statuses: ['PENDING'], limit: 10 });
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.id).toBeTruthy();
    expect(row.eventType).toBe('AnnouncementPublished');
    expect(row.status).toBe('PENDING');
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.processedAt).toBeNull();
    expect(row.lastError).toBeNull();
    expect(row.attemptCount).toBe(0);
    // The payload (which can contain recipient IDs) is never exposed.
    expect('payload' in row).toBe(false);

    const single = await notificationsRepo.findOutboxEventOperational(test.db, row.id);
    expect(single?.id).toBe(row.id);
    expect('payload' in (single ?? {})).toBe(false);
  });

  it('a deterministic FAILED row is visible with its last_error and status', async () => {
    const { schoolId } = await seedAnnouncementBase();
    const badEvent = await seedOutboxEvent(test.seed, 'AnnouncementPublished', malformedAnnouncementPayload(schoolId));
    await expect(processNotificationEvent(test.db, { outboxEventId: badEvent.id })).rejects.toMatchObject({
      featureCode: 'EVENT_PAYLOAD_INVALID',
    });

    const row = await notificationsRepo.findOutboxEventOperational(test.db, badEvent.id);
    expect(row?.status).toBe('FAILED');
    expect(row?.lastError).toContain('malformed');
    expect(row?.processedAt).toBeNull();
  });
});
