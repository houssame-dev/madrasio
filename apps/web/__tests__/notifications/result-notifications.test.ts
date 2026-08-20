/**
 * Result notification recipients — publication payload + processing
 * integration tests (Task 012 §24/§25/§26).
 *
 * Runs the REAL publish use cases (publication + frozen-recipient Outbox event
 * in one transaction) and the REAL notification processor against a fresh
 * PGlite database with all committed migrations applied.
 *
 * Approved policy (Task 012 §1/§5): ResultPublished / ResultRevisionPublished
 * recipients are ONLY the eligible PARENT Users of the Student, resolved and
 * frozen at publication time (ACTIVE ParentStudent + non-null user_id +
 * ACTIVE SchoolMembership + same School). Zero parents never blocks
 * publication. The Notification processor consumes the frozen payload — it
 * never queries ParentStudent.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { and, eq } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import { randomUUID } from 'node:crypto';

import * as schema from '@school/database';

import { calculateSubjectResult, finalizeResult, publishResult } from '@/lib/modules/grades/application';
import type { NotificationsDb } from '@/lib/modules/notifications/infrastructure/repositories/notification-repository';
import * as notificationsRepo from '@/lib/modules/notifications/infrastructure/repositories/notification-repository';
import { processNotificationEvent } from '@/lib/modules/notifications/application/process-notification-event';
import { NotificationProcessingError } from '@/lib/modules/notifications/application/notification-errors';

import {
  createGradesTestDb,
  seedGradebook,
  seedGrades,
  seedSchool,
  seedStudentAndActors,
  type GradesTestDb,
  type SeededSchool,
  type SeededStudent,
} from '../grades/test-helpers';

let test: GradesTestDb;

beforeEach(async () => {
  test = await createGradesTestDb();
});

afterEach(async () => {
  await test.client.close();
});

interface SeededLinkedParent {
  userId: string | null;
  parentId: string;
}

async function seedLinkedParent(
  schoolId: string,
  studentId: string,
  opts: {
    withUser?: boolean;
    membershipStatus?: 'ACTIVE' | 'INACTIVE';
    parentStudentStatus?: 'ACTIVE' | 'ENDED';
  } = {},
): Promise<SeededLinkedParent> {
  const withUser = opts.withUser ?? true;
  let userId: string | null = null;
  if (withUser) {
    userId = randomUUID();
    await test.seed.insert(authUsers).values({ id: userId });
    await test.seed.insert(schema.users).values({ id: userId });
    await test.seed
      .insert(schema.schoolMemberships)
      .values({ schoolId, userId, role: 'PARENT', status: opts.membershipStatus ?? 'ACTIVE' });
  }
  const parentId = randomUUID();
  await test.seed
    .insert(schema.parents)
    .values({ id: parentId, schoolId, userId, firstName: 'Nadia', lastName: 'Benali' });
  await test.seed
    .insert(schema.parentStudents)
    .values({ schoolId, parentId, studentId, status: opts.parentStudentStatus ?? 'ACTIVE' });
  return { userId, parentId };
}

async function seedScenario(): Promise<{
  school: SeededSchool;
  actors: SeededStudent;
  adminId: string;
  studentId: string;
}> {
  const school = await seedSchool(test.seed);
  const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  return { school, actors, adminId: actors.schoolAdminUserId, studentId: actors.studentId };
}

async function publishSubjectResult(
  school: SeededSchool,
  adminId: string,
  studentId: string,
  idempotencyKey: string,
  opts: { revision?: boolean; resultId?: string } = {},
): Promise<{ publicationId: string; event: typeof schema.outboxEvents.$inferSelect; resultId: string }> {
  let resultId = opts.resultId;
  if (!resultId) {
    const gradebook = await seedGradebook(test.seed, school.schoolId, school, school.subjectMathId);
    await seedGrades(test.seed, school.schoolId, gradebook.gradebookId, gradebook, studentId, '16', '18');

    const calculated = await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId,
    });
    await finalizeResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
    });
    resultId = calculated.id;
  }

  const published = await publishResult(test.db, {
    userId: adminId,
    schoolId: school.schoolId,
    resultType: 'SUBJECT',
    resultId,
    idempotencyKey,
    revision: opts.revision ?? false,
  });

  const eventType = opts.revision ? 'ResultRevisionPublished' : 'ResultPublished';
  const [event] = await test.seed
    .select()
    .from(schema.outboxEvents)
    .where(eq(schema.outboxEvents.eventType, eventType));
  return { publicationId: published.publicationId, event, resultId };
}

async function loadNotifications(): Promise<typeof schema.notifications.$inferSelect[]> {
  return test.seed.select().from(schema.notifications);
}

function payloadOf(event: typeof schema.outboxEvents.$inferSelect): Record<string, unknown> {
  return event.payload as unknown as Record<string, unknown>;
}

describe('ResultPublished payload freezes publication-time recipients (Task 012 §24)', () => {
  it('9. ResultPublished event contains frozen recipientUserIds', async () => {
    const { school, adminId, studentId } = await seedScenario();
    const parentA = await seedLinkedParent(school.schoolId, studentId);
    const parentB = await seedLinkedParent(school.schoolId, studentId);

    const { event } = await publishSubjectResult(school, adminId, studentId, randomUUID());

    expect(event.eventType).toBe('ResultPublished');
    const payload = payloadOf(event);
    expect(payload.publicationId).toBeTruthy();
    expect(payload.studentId).toBe(studentId);
    expect(payload.recipientUserIds).toEqual([parentA.userId, parentB.userId].sort());
  });

  it('excludes a Parent with null user_id, an ENDED relationship and an INACTIVE membership (Task 012 §1)', async () => {
    const { school, adminId, studentId } = await seedScenario();
    await seedLinkedParent(school.schoolId, studentId, { withUser: false });
    await seedLinkedParent(school.schoolId, studentId, { parentStudentStatus: 'ENDED' });
    await seedLinkedParent(school.schoolId, studentId, { membershipStatus: 'INACTIVE' });
    const eligible = await seedLinkedParent(school.schoolId, studentId);

    const { event } = await publishSubjectResult(school, adminId, studentId, randomUUID());
    expect(payloadOf(event).recipientUserIds).toEqual([eligible.userId]);
  });

  it('excludes a Parent who belongs to another School (tenant isolation)', async () => {
    const { school, adminId, studentId } = await seedScenario();
    const otherSchoolId = randomUUID();
    await test.seed.insert(schema.schools).values({ id: otherSchoolId, name: 'Other School' });
    // A parent User with an ACTIVE membership ONLY in the other School.
    const otherUserId = randomUUID();
    await test.seed.insert(authUsers).values({ id: otherUserId });
    await test.seed.insert(schema.users).values({ id: otherUserId });
    await test.seed
      .insert(schema.schoolMemberships)
      .values({ schoolId: otherSchoolId, userId: otherUserId, role: 'PARENT', status: 'ACTIVE' });
    await test.seed
      .insert(schema.parents)
      .values({ id: randomUUID(), schoolId: otherSchoolId, userId: otherUserId, firstName: 'Other', lastName: 'Parent' });

    const { event } = await publishSubjectResult(school, adminId, studentId, randomUUID());
    expect(payloadOf(event).recipientUserIds).toEqual([]);
  });

  it('zero parents → empty recipient list; publication still succeeds and the event is still created (Task 012 §5)', async () => {
    const { school, adminId, studentId } = await seedScenario();
    const { event, publicationId } = await publishSubjectResult(school, adminId, studentId, randomUUID());

    expect(payloadOf(event).recipientUserIds).toEqual([]);
    expect(publicationId).toBeTruthy();
    expect(event.status).toBe('PENDING');
  });

  it('11. publication #1 payload remains unchanged after ParentStudent changes', async () => {
    const { school, adminId, studentId } = await seedScenario();
    const parentA = await seedLinkedParent(school.schoolId, studentId);
    const parentB = await seedLinkedParent(school.schoolId, studentId);

    const { event } = await publishSubjectResult(school, adminId, studentId, randomUUID());
    expect(payloadOf(event).recipientUserIds).toEqual([parentA.userId, parentB.userId].sort());

    // End A's relationship and add C AFTER publication #1.
    await test.seed
      .update(schema.parentStudents)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(and(eq(schema.parentStudents.parentId, parentA.parentId), eq(schema.parentStudents.studentId, studentId)));
    await seedLinkedParent(school.schoolId, studentId);

    // The stored event payload is historical event data — never recomputed.
    const [stored] = await test.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, event.id));
    expect(payloadOf(stored).recipientUserIds).toEqual([parentA.userId, parentB.userId].sort());
  });

  it('10/12. ResultRevisionPublished resolves CURRENT relationships independently — never copies publication #1', async () => {
    const { school, adminId, studentId } = await seedScenario();
    const parentA = await seedLinkedParent(school.schoolId, studentId);
    const parentB = await seedLinkedParent(school.schoolId, studentId);

    // Publication #1 → [A, B].
    const first = await publishSubjectResult(school, adminId, studentId, randomUUID());
    expect(payloadOf(first.event).recipientUserIds).toEqual([parentA.userId, parentB.userId].sort());

    // A ENDED, C becomes ACTIVE before the revision.
    await test.seed
      .update(schema.parentStudents)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(and(eq(schema.parentStudents.parentId, parentA.parentId), eq(schema.parentStudents.studentId, studentId)));
    const parentC = await seedLinkedParent(school.schoolId, studentId);

    // Revision #2 resolves current state → [B, C], NOT [A, B].
    const second = await publishSubjectResult(school, adminId, studentId, randomUUID(), {
      revision: true,
      resultId: first.resultId,
    });
    expect(second.event.eventType).toBe('ResultRevisionPublished');
    expect(payloadOf(second.event).recipientUserIds).toEqual([parentB.userId, parentC.userId].sort());

    // Publication #1 is untouched.
    const [storedFirst] = await test.seed
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.id, first.event.id));
    expect(payloadOf(storedFirst).recipientUserIds).toEqual([parentA.userId, parentB.userId].sort());
  });
});

describe('Result notification processing (Task 012 §25)', () => {
  async function process(eventId: string) {
    return processNotificationEvent(test.db as unknown as NotificationsDb, { outboxEventId: eventId });
  }

  it('13. ResultPublished → correct persisted Notifications', async () => {
    const { school, adminId, studentId } = await seedScenario();
    const parentA = await seedLinkedParent(school.schoolId, studentId);
    const parentB = await seedLinkedParent(school.schoolId, studentId);
    const { event } = await publishSubjectResult(school, adminId, studentId, randomUUID());

    const result = await process(event.id);

    expect(result.notificationType).toBe('RESULT_PUBLISHED');
    expect(result.notificationsCreated).toBe(2);
    const notifications = await loadNotifications();
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([parentA.userId, parentB.userId].sort());
    for (const notification of notifications) {
      expect(notification.schoolId).toBe(school.schoolId);
      expect(notification.notificationType).toBe('RESULT_PUBLISHED');
      expect(notification.sourceType).toBe('RESULT_PUBLICATION');
      expect(notification.sourceId).toBe(payloadOf(event).publicationId);
      expect(notification.sourceEventId).toBe(event.id);
      expect(notification.title).toBe('Result published');
      expect(notification.body).toBe('Result value: 17.00');
      expect(notification.readAt).toBeNull();
    }
  });

  it('14. ResultRevisionPublished → correct persisted Notifications', async () => {
    const { school, adminId, studentId } = await seedScenario();
    const parentB = await seedLinkedParent(school.schoolId, studentId);
    const parentC = await seedLinkedParent(school.schoolId, studentId);

    // Publication #2 with revision semantics.
    const first = await publishSubjectResult(school, adminId, studentId, randomUUID());
    const second = await publishSubjectResult(school, adminId, studentId, randomUUID(), {
      revision: true,
      resultId: first.resultId,
    });

    const result = await process(second.event.id);

    expect(result.notificationType).toBe('RESULT_REVISED');
    expect(result.notificationsCreated).toBe(2);
    const notifications = await loadNotifications();
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([parentB.userId, parentC.userId].sort());
    for (const notification of notifications) {
      expect(notification.notificationType).toBe('RESULT_REVISED');
      expect(notification.sourceType).toBe('RESULT_PUBLICATION');
      expect(notification.title).toBe('Result updated');
    }
  });

  it('15. same event retry creates no duplicates', async () => {
    const { school, adminId, studentId } = await seedScenario();
    const parentA = await seedLinkedParent(school.schoolId, studentId);
    const parentB = await seedLinkedParent(school.schoolId, studentId);
    const { event } = await publishSubjectResult(school, adminId, studentId, randomUUID());
    expect(payloadOf(event).recipientUserIds).toEqual([parentA.userId, parentB.userId].sort());

    const first = await process(event.id);
    expect(first.notificationsCreated).toBe(2);

    const second = await process(event.id);
    expect(second.alreadyProcessed).toBe(true);
    expect(second.notificationsCreated).toBe(0);
    expect(await loadNotifications()).toHaveLength(2);

    const [stored] = await test.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, event.id));
    expect(stored.status).toBe('PROCESSED');
  });

  it('16. zero-recipient event creates zero Notifications and becomes PROCESSED (not an error, Task 012 §12)', async () => {
    const { school, adminId, studentId } = await seedScenario();
    const { event } = await publishSubjectResult(school, adminId, studentId, randomUUID());
    expect(payloadOf(event).recipientUserIds).toEqual([]);

    const result = await process(event.id);

    expect(result.notificationsCreated).toBe(0);
    expect(await loadNotifications()).toHaveLength(0);
    const [stored] = await test.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, event.id));
    expect(stored.status).toBe('PROCESSED');
    expect(stored.processedAt).toBeInstanceOf(Date);
  });

  it('17. ParentStudent changed after publication does not alter event recipients', async () => {
    const { school, adminId, studentId } = await seedScenario();
    const parentA = await seedLinkedParent(school.schoolId, studentId);
    const parentB = await seedLinkedParent(school.schoolId, studentId);
    const { event } = await publishSubjectResult(school, adminId, studentId, randomUUID());

    // A ENDED, C becomes ACTIVE AFTER publication, BEFORE processing.
    await test.seed
      .update(schema.parentStudents)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(and(eq(schema.parentStudents.parentId, parentA.parentId), eq(schema.parentStudents.studentId, studentId)));
    await seedLinkedParent(school.schoolId, studentId);

    const result = await process(event.id);
    expect(result.notificationsCreated).toBe(2);
    const notifications = await loadNotifications();
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([parentA.userId, parentB.userId].sort());
  });

  it('18. SchoolMembership changed to INACTIVE after publication does not remove the frozen recipient (Task 012 §17)', async () => {
    const { school, adminId, studentId } = await seedScenario();
    const parentA = await seedLinkedParent(school.schoolId, studentId);
    const { event } = await publishSubjectResult(school, adminId, studentId, randomUUID());

    // Membership deactivated AFTER publication, BEFORE processing. The
    // notifications composite FK targets the (school_id, user_id) membership
    // row, which still exists when INACTIVE — so historical notifications are
    // preserved (Task 010 §16/§23, Task 012 §17).
    await test.seed
      .update(schema.schoolMemberships)
      .set({ status: 'INACTIVE', updatedAt: new Date() })
      .where(and(eq(schema.schoolMemberships.schoolId, school.schoolId), eq(schema.schoolMemberships.userId, parentA.userId!)));

    const result = await process(event.id);
    expect(result.notificationsCreated).toBe(1);
    const notifications = await loadNotifications();
    expect(notifications.map((n) => n.recipientUserId)).toEqual([parentA.userId]);
  });

  it('19. invalid/malformed Result payload → FAILED, never PROCESSED, zero notifications', async () => {
    const { school, adminId, studentId } = await seedScenario();
    await seedLinkedParent(school.schoolId, studentId);
    const { event } = await publishSubjectResult(school, adminId, studentId, randomUUID());

    // Corrupt the stored payload (drop the frozen recipients array).
    await test.seed
      .update(schema.outboxEvents)
      .set({ payload: { ...payloadOf(event), recipientUserIds: undefined } })
      .where(eq(schema.outboxEvents.id, event.id));

    const promise = process(event.id);
    await expect(promise).rejects.toBeInstanceOf(NotificationProcessingError);
    await expect(promise).rejects.toMatchObject({ featureCode: 'EVENT_PAYLOAD_INVALID' });

    const [stored] = await test.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, event.id));
    expect(stored.status).toBe('FAILED');
    expect(stored.lastError).toContain('malformed');
    expect(stored.processedAt).toBeNull();
    expect(await loadNotifications()).toHaveLength(0);
  });

  it('20. notification source reference points to the exact ResultPublication', async () => {
    const { school, adminId, studentId } = await seedScenario();
    await seedLinkedParent(school.schoolId, studentId);
    const { event, publicationId } = await publishSubjectResult(school, adminId, studentId, randomUUID());

    await process(event.id);

    const [notification] = await loadNotifications();
    expect(notification.sourceId).toBe(publicationId);
    // The exact publication row exists and matches.
    const [publication] = await test.seed
      .select()
      .from(schema.resultPublications)
      .where(eq(schema.resultPublications.id, publicationId));
    expect(publication.id).toBe(publicationId);
    expect(publication.studentId).toBe(studentId);
  });

  it('21. a notification never bypasses source authorization (BR-NOTIFICATION-006)', async () => {
    const { school, adminId, studentId } = await seedScenario();
    await seedLinkedParent(school.schoolId, studentId);
    const { event, publicationId } = await publishSubjectResult(school, adminId, studentId, randomUUID());
    await process(event.id);

    // The source lookup is School-scoped: the publication can be resolved in
    // its own School but NEVER from another School's context.
    const otherSchoolId = randomUUID();
    await test.seed.insert(schema.schools).values({ id: otherSchoolId, name: 'Other School' });
    expect(await notificationsRepo.findResultPublication(test.db, otherSchoolId, publicationId)).toBeNull();
    expect((await notificationsRepo.findResultPublication(test.db, school.schoolId, publicationId))?.id).toBe(publicationId);
  });
});

describe('Result publication → notification end-to-end (Task 012 §26)', () => {
  it('historical scenario: #1 freezes [A,B]; revision #2 independently freezes [B,C]; both stay unchanged', async () => {
    const { school, adminId, studentId } = await seedScenario();

    // T1: Student S with Parent A and Parent B active.
    const parentA = await seedLinkedParent(school.schoolId, studentId);
    const parentB = await seedLinkedParent(school.schoolId, studentId);

    // Publish finalized Result #1.
    const first = await publishSubjectResult(school, adminId, studentId, randomUUID());
    expect(payloadOf(first.event).recipientUserIds).toEqual([parentA.userId, parentB.userId].sort());

    // Then: Parent A relationship ENDED, Parent C becomes ACTIVE.
    await test.seed
      .update(schema.parentStudents)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(and(eq(schema.parentStudents.parentId, parentA.parentId), eq(schema.parentStudents.studentId, studentId)));
    const parentC = await seedLinkedParent(school.schoolId, studentId);

    // Process ResultPublished #1 → notifications for A and B (historical set).
    await processNotificationEvent(test.db as unknown as NotificationsDb, { outboxEventId: first.event.id });
    let notifications = await loadNotifications();
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([parentA.userId, parentB.userId].sort());
    expect(notifications.every((n) => n.sourceEventId === first.event.id)).toBe(true);

    // Publish Result revision #2 → current recipients [B, C].
    const second = await publishSubjectResult(school, adminId, studentId, randomUUID(), {
      revision: true,
      resultId: first.resultId,
    });
    expect(second.event.eventType).toBe('ResultRevisionPublished');
    expect(payloadOf(second.event).recipientUserIds).toEqual([parentB.userId, parentC.userId].sort());

    // Process revision #2 → notifications for B and C.
    await processNotificationEvent(test.db as unknown as NotificationsDb, { outboxEventId: second.event.id });
    notifications = await loadNotifications();
    expect(notifications).toHaveLength(4);
    const firstRecipients = notifications.filter((n) => n.sourceEventId === first.event.id).map((n) => n.recipientUserId).sort();
    const secondRecipients = notifications.filter((n) => n.sourceEventId === second.event.id).map((n) => n.recipientUserId).sort();
    expect(firstRecipients).toEqual([parentA.userId, parentB.userId].sort());
    expect(secondRecipients).toEqual([parentB.userId, parentC.userId].sort());

    // Old publication/event/notifications remain historically unchanged.
    const [storedFirst] = await test.seed.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, first.event.id));
    expect(payloadOf(storedFirst).recipientUserIds).toEqual([parentA.userId, parentB.userId].sort());
    const [storedFirstPub] = await test.seed
      .select()
      .from(schema.resultPublications)
      .where(eq(schema.resultPublications.id, payloadOf(first.event).publicationId as string));
    expect(storedFirstPub.publicationVersion).toBe(1);
  });
});