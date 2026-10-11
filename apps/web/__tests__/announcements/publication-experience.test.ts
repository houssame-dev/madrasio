import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@school/database';
import * as app from '@/lib/modules/announcements/application';
import * as repo from '@/lib/modules/announcements/infrastructure/repositories/announcement-repository';
import * as audit from '@/lib/audit/repository';
import { processNotificationEvent } from '@/lib/modules/notifications/application/process-notification-event';
import { getNotification } from '@/lib/modules/notifications/application/notification-inbox';
import { fingerprintTable } from '@/scripts/recovery/inventory';
import type { QueryClient } from '@/scripts/recovery/snapshot';
import { createAnnouncementsTestDb, seedSchool, seedUser, seedParent, seedStudent, seedEnrollment,
  seedParentStudent, seedTeacher, seedAssignment, type AnnouncementsTestDb, type SeededSchool } from './test-helpers';

let test: AnnouncementsTestDb;
let school: SeededSchool;
let admin: { userId: string; schoolId: string };
let parent: typeof admin;
let teacher: typeof admin;
beforeEach(async () => {
  test = await createAnnouncementsTestDb(); school = await seedSchool(test.seed);
  admin = { userId: await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN'), schoolId: school.schoolId };
  parent = { userId: await seedUser(test.seed, school.schoolId, 'PARENT'), schoolId: school.schoolId };
  const parentId = await seedParent(test.seed, school.schoolId, parent.userId);
  const child = await seedStudent(test.seed, school.schoolId);
  await seedEnrollment(test.seed, school.schoolId, child, school.yearId, school.classAId);
  await seedParentStudent(test.seed, school.schoolId, parentId, child);
  teacher = { userId: await seedUser(test.seed, school.schoolId, 'TEACHER'), schoolId: school.schoolId };
  const teacherId = await seedTeacher(test.seed, school.schoolId, teacher.userId);
  await seedAssignment(test.seed, school.schoolId, teacherId, school.classAId, school.yearId, school.subjectId);
});
afterEach(async () => { vi.restoreAllMocks(); await test?.client.close(); });

async function draft() {
  const created = await app.createAnnouncement(test.db, admin, { title: 'Notice', body: '<p><strong>Accepted</strong></p><script>secretAttack()</script>', bodyFormat: 'HTML' });
  const targets = await app.addAnnouncementTargets(test.db, admin, created.announcement.id, { announcementVersionId: created.version.id,
    targets: [{ audience: 'PARENTS', targetType: 'CLASS', academicYearId: school.yearId, classId: school.classAId },
      { audience: 'TEACHERS', targetType: 'CLASS', academicYearId: school.yearId, classId: school.classAId }] });
  return { ...created, targets };
}
function publishInput(value: Awaited<ReturnType<typeof draft>>, scheduledAt?: string) {
  return { ...admin, announcementId: value.announcement.id, announcementVersionId: value.version.id, idempotencyKey: randomUUID(), scheduledAt };
}
async function scheduledDue() {
  const value = await draft();
  const publication = await app.publishAnnouncement(test.db, publishInput(value, new Date(Date.now() + 3600000).toISOString()));
  // Local fixture only: make discovery due without fake global timers or waiting.
  await test.seed.update(schema.announcementPublications).set({ scheduledAt: new Date(Date.now() - 60000) }).where(eq(schema.announcementPublications.id, publication.publicationId));
  return { value, publication };
}
async function noDelivery() {
  expect(await test.seed.select().from(schema.publicationRecipientSnapshots)).toHaveLength(0);
  expect(await test.seed.select().from(schema.outboxEvents)).toHaveLength(0);
  expect(await test.seed.select().from(schema.notifications)).toHaveLength(0);
}

describe('Task 062 lifecycle, historical access and audit', () => {
  it('includes rich format and cancellation state in existing full-row recovery fingerprints', async () => {
    const value = await draft();
    const publication = await app.publishAnnouncement(test.db, publishInput(value, new Date(Date.now() + 7200000).toISOString()));
    // This adapter is only for the SQL/values interface used by fingerprintTable.
    const client = { query: (sql: string, values?: unknown[]) => test.client.query(sql, values) } as unknown as QueryClient;
    const contentBefore = await fingerprintTable(client, 'public.announcement_versions');
    const intentBefore = await fingerprintTable(client, 'public.announcement_publications');
    // Deliberate local recovery fixture alteration; no production mutation API does this.
    await test.seed.update(schema.announcementVersions).set({ bodyFormat: 'PLAIN_TEXT' }).where(eq(schema.announcementVersions.id, value.version.id));
    await app.changeAnnouncementSchedule(test.db, admin, value.announcement.id, publication.publicationId, { action: 'cancel' });
    const contentAfter = await fingerprintTable(client, 'public.announcement_versions');
    const intentAfter = await fingerprintTable(client, 'public.announcement_publications');
    for (const [before, after] of [[contentBefore, contentAfter], [intentBefore, intentAfter]]) {
      expect(after.rowCount).toBe(before.rowCount);
      expect(after.primaryKeySha256).toBe(before.primaryKeySha256);
      expect(after.contentSha256).not.toBe(before.contentSha256);
    }
  });

  it('does not label the first completed publication a revision after a cancelled intent', async () => {
    const value = await draft();
    const cancelled = await app.publishAnnouncement(test.db, publishInput(value, new Date(Date.now() + 7200000).toISOString()));
    await app.changeAnnouncementSchedule(test.db, admin, value.announcement.id, cancelled.publicationId, { action: 'cancel' });
    const next = await app.createAnnouncementVersion(test.db, admin, value.announcement.id, { title: 'Correction', body: 'Corrected content' });
    await app.addAnnouncementTargets(test.db, admin, value.announcement.id, { announcementVersionId: next.id, targets: [{ audience: 'PARENTS', targetType: 'SCHOOL', academicYearId: school.yearId }] });
    const input = { ...publishInput(value), announcementVersionId: next.id };
    expect(await app.publishAnnouncement(test.db, input)).toMatchObject({ publicationVersion: 2, eventEmitted: true });
    expect(await app.publishAnnouncement(test.db, input)).toMatchObject({ publicationVersion: 2, eventEmitted: false });
    const events = await test.seed.select().from(schema.outboxEvents);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('AnnouncementPublished');
    expect(await repo.findPublication(test.db, cancelled.publicationId)).toMatchObject({ status: 'CANCELLED', publishedAt: null });
  });

  it('rolls back new content together with its audit when attribution persistence fails', async () => {
    vi.spyOn(audit, 'appendAuditEvent').mockRejectedValue(new Error('local audit failure'));
    await expect(app.createAnnouncement(test.db, admin, { title: 'Uncommitted', body: 'Uncommitted' })).rejects.toThrow();
    expect(await test.seed.select().from(schema.announcements)).toHaveLength(0);
    expect(await test.seed.select().from(schema.announcementVersions)).toHaveLength(0);
    expect(await test.seed.select().from(schema.auditEvents)).toHaveLength(0);
  });
  it('corrects draft content via a new snapshot; removes/adds targets without fake publication history', async () => {
    const value = await draft();
    await app.removeAnnouncementTarget(test.db, admin, value.announcement.id, value.version.id, value.targets[0].id);
    expect(await app.listAnnouncementTargets(test.db, admin, value.announcement.id)).toHaveLength(1);
    const next = await app.createAnnouncementVersion(test.db, admin, value.announcement.id, { title: 'Corrected', body: 'New body' });
    expect(next.versionNumber).toBe(2);
    expect((await repo.findVersionForAnnouncement(test.db, school.schoolId, value.announcement.id, value.version.id))?.body).toBe('<p><strong>Accepted</strong></p>');
    expect(await test.seed.select().from(schema.announcementPublications)).toHaveLength(0);
    await expect(app.removeAnnouncementTarget(test.db, admin, value.announcement.id, value.version.id, value.targets[1].id)).rejects.toMatchObject({ featureCode: 'ANNOUNCEMENT_VERSION_IMMUTABLE' });
    await noDelivery();
  });

  it('reschedules, cancels idempotently, preserves the intent and never resurrects it by publish replay', async () => {
    const value = await draft(); const input = publishInput(value, new Date(Date.now() + 3600000).toISOString());
    const publication = await app.publishAnnouncement(test.db, input);
    const future = new Date(Date.now() + 7200000).toISOString();
    await app.changeAnnouncementSchedule(test.db, admin, value.announcement.id, publication.publicationId, { action: 'reschedule', scheduledAt: future });
    await app.changeAnnouncementSchedule(test.db, admin, value.announcement.id, publication.publicationId, { action: 'cancel' });
    await app.changeAnnouncementSchedule(test.db, admin, value.announcement.id, publication.publicationId, { action: 'cancel' });
    expect(await app.publishAnnouncement(test.db, input)).toMatchObject({ status: 'CANCELLED', eventEmitted: false });
    expect(await app.publishDueAnnouncement(test.db, { publicationId: publication.publicationId })).toMatchObject({ eventEmitted: false });
    expect(await repo.findAnnouncement(test.db, school.schoolId, value.announcement.id)).toMatchObject({ status: 'DRAFT' });
    const events = await test.seed.select().from(schema.auditEvents);
    expect(events.filter((e) => e.action === 'AnnouncementCancelled')).toHaveLength(1);
    expect(events.find((e) => e.action === 'AnnouncementRescheduled')).toMatchObject({ actorUserId: admin.userId, schoolId: school.schoolId, resourceId: value.announcement.id, metadata: { scheduledAt: future } });
    expect(JSON.stringify(events)).not.toContain('Accepted');
    await noDelivery();
  });

  it.each(['cancel', 'reschedule'] as const)('re-reads after lock: %s wins after stale processor discovery', async (action) => {
    const { value, publication } = await scheduledDue();
    const original = repo.withAnnouncementLock;
    let release!: () => void; let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const discovered = new Promise<void>((resolve) => { entered = resolve; });
    vi.spyOn(repo, 'withAnnouncementLock').mockImplementationOnce(async (db, schoolId, id, operation) => {
      entered(); await gate; return original(db, schoolId, id, operation);
    });
    const pending = app.publishDueAnnouncement(test.db, { publicationId: publication.publicationId });
    // Attach rejection handling before releasing the barrier.
    const outcome = pending.then((value) => ({ value }), (error: unknown) => ({ error }));
    await discovered;
    try {
      await app.changeAnnouncementSchedule(test.db, admin, value.announcement.id, publication.publicationId,
        action === 'cancel' ? { action } : { action, scheduledAt: new Date(Date.now() + 7200000).toISOString() });
    } finally { release(); }
    const result = await outcome;
    if (action === 'cancel') expect(result).toMatchObject({ value: { eventEmitted: false } });
    else expect(result).toMatchObject({ error: { featureCode: 'NOT_PUBLISHABLE' } });
    await noDelivery();
  });

  it('processor winner prevents cancellation/reschedule; duplicate processors produce one delivery and one system audit', async () => {
    const { value, publication } = await scheduledDue();
    const results = await Promise.all([app.publishDueAnnouncement(test.db, { publicationId: publication.publicationId }), app.publishDueAnnouncement(test.db, { publicationId: publication.publicationId })]);
    expect(results.filter((r) => r.eventEmitted)).toHaveLength(1);
    for (const input of [{ action: 'cancel' as const }, { action: 'reschedule' as const, scheduledAt: new Date(Date.now() + 7200000).toISOString() }]) {
      await expect(app.changeAnnouncementSchedule(test.db, admin, value.announcement.id, publication.publicationId, input)).rejects.toMatchObject({ featureCode: 'NOT_PUBLISHABLE' });
    }
    expect(await test.seed.select().from(schema.outboxEvents)).toHaveLength(1);
    const audits = await test.seed.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'AnnouncementPublished'));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorKind: 'SYSTEM', actorUserId: null, systemActor: 'SCHEDULED_ANNOUNCEMENT_PROCESSOR' });
  });

  it('retains exact published content and recipients after relationships end and revision targets change', async () => {
    const value = await draft(); const first = await app.publishAnnouncement(test.db, publishInput(value));
    await test.seed.update(schema.parentStudents).set({ status: 'ENDED' });
    await test.seed.update(schema.teacherAssignments).set({ status: 'ENDED' });
    for (const actor of [parent, teacher]) expect(await app.getRecipientAnnouncement(test.db, actor, first.publicationId)).toMatchObject({ body: '<p><strong>Accepted</strong></p>', bodyFormat: 'HTML' });
    await expect(app.removeAnnouncementTarget(test.db, admin, value.announcement.id, value.version.id, value.targets[0].id)).rejects.toMatchObject({ featureCode: 'ANNOUNCEMENT_VERSION_IMMUTABLE' });
    const next = await app.createAnnouncementVersion(test.db, admin, value.announcement.id, { title: 'Revision', body: 'New body' });
    await app.addAnnouncementTargets(test.db, admin, value.announcement.id, { announcementVersionId: next.id, targets: [{ audience: 'PARENTS', targetType: 'SCHOOL', academicYearId: school.yearId }] });
    const second = await app.publishAnnouncement(test.db, { ...publishInput(value), announcementVersionId: next.id });
    expect(await app.getRecipientAnnouncement(test.db, parent, second.publicationId)).toMatchObject({ title: 'Revision' });
    await expect(app.getRecipientAnnouncement(test.db, teacher, second.publicationId)).rejects.toMatchObject({ featureCode: 'PUBLICATION_NOT_FOUND' });
    expect(await app.getRecipientAnnouncement(test.db, parent, first.publicationId)).toMatchObject({ title: 'Notice' });
    expect((await app.listRecipientAnnouncements(test.db, parent, { page: 1, pageSize: 1 })).meta.total).toBe(2);
    expect((await app.listRecipientAnnouncements(test.db, parent, { page: 2, pageSize: 1 })).data[0].id).toBe(first.publicationId);
  });

  it('denies nonrecipient, foreign School, forged IDs, draft/scheduled/cancelled, inactive membership and Parent management', async () => {
    const value = await draft();
    const scheduled = await app.publishAnnouncement(test.db, publishInput(value, new Date(Date.now() + 7200000).toISOString()));
    for (const id of [value.announcement.id, randomUUID(), scheduled.publicationId]) await expect(app.getRecipientAnnouncement(test.db, parent, id)).rejects.toMatchObject({ featureCode: 'PUBLICATION_NOT_FOUND' });
    await expect(app.changeAnnouncementSchedule(test.db, parent, value.announcement.id, scheduled.publicationId, { action: 'cancel' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await app.changeAnnouncementSchedule(test.db, admin, value.announcement.id, scheduled.publicationId, { action: 'cancel' });
    await expect(app.getRecipientAnnouncement(test.db, parent, scheduled.publicationId)).rejects.toMatchObject({ featureCode: 'PUBLICATION_NOT_FOUND' });
    const other = await draft(); const published = await app.publishAnnouncement(test.db, publishInput(other));
    const stranger = { userId: await seedUser(test.seed, school.schoolId, 'PARENT'), schoolId: school.schoolId };
    await expect(app.getRecipientAnnouncement(test.db, stranger, published.publicationId)).rejects.toMatchObject({ featureCode: 'PUBLICATION_NOT_FOUND' });
    const nonrecipientTeacher = { userId: await seedUser(test.seed, school.schoolId, 'TEACHER'), schoolId: school.schoolId };
    await expect(app.getRecipientAnnouncement(test.db, nonrecipientTeacher, published.publicationId)).rejects.toMatchObject({ featureCode: 'PUBLICATION_NOT_FOUND' });
    const foreign = await seedSchool(test.seed, 'Foreign'); const foreignActor = { schoolId: foreign.schoolId, userId: await seedUser(test.seed, foreign.schoolId, 'SCHOOL_ADMIN') };
    await expect(app.getRecipientAnnouncement(test.db, foreignActor, published.publicationId)).rejects.toMatchObject({ featureCode: 'PUBLICATION_NOT_FOUND' });
    await test.seed.update(schema.schoolMemberships).set({ status: 'INACTIVE' }).where(and(eq(schema.schoolMemberships.userId, parent.userId), eq(schema.schoolMemberships.schoolId, school.schoolId)));
    await expect(app.getRecipientAnnouncement(test.db, parent, published.publicationId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('uses existing legacy event identity for authorized notification navigation, preserving processing idempotency', async () => {
    const value = await draft(); const publication = await app.publishAnnouncement(test.db, publishInput(value));
    const [event] = await test.seed.select().from(schema.outboxEvents);
    // Existing event contract contains no URL or rich body; no new field is required.
    expect(event.payload).not.toHaveProperty('destination');
    await processNotificationEvent(test.db, { outboxEventId: event.id });
    await processNotificationEvent(test.db, { outboxEventId: event.id });
    const rows = await test.seed.select().from(schema.notifications);
    expect(rows).toHaveLength(2);
    const owned = rows.find((r) => r.recipientUserId === parent.userId)!;
    expect(await getNotification(test.db, parent, owned.id)).toMatchObject({ destination: `/announcements/inbox/${publication.publicationId}` });
    const scheduledValue = await draft(); const scheduled = await app.publishAnnouncement(test.db, publishInput(scheduledValue, new Date(Date.now() + 7200000).toISOString()));
    // Deliberately inconsistent local legacy notification must not grant source access.
    await test.seed.update(schema.notifications).set({ sourceId: scheduled.publicationId }).where(eq(schema.notifications.id, owned.id));
    expect(await getNotification(test.db, parent, owned.id)).toMatchObject({ destination: null });
    await app.changeAnnouncementSchedule(test.db, admin, scheduledValue.announcement.id, scheduled.publicationId, { action: 'cancel' });
    expect(await getNotification(test.db, parent, owned.id)).toMatchObject({ destination: null });
  });

  it.each(['SCHEDULED', 'CANCELLED'] as const)('does not manufacture notifications for an inconsistent legacy event whose source is %s', async (status) => {
    const value = await draft();
    const scheduled = await app.publishAnnouncement(test.db, publishInput(value, new Date(Date.now() + 7200000).toISOString()));
    if (status === 'CANCELLED') await app.changeAnnouncementSchedule(test.db, admin, value.announcement.id, scheduled.publicationId, { action: 'cancel' });
    // Fault injection in a hermetic database: no canonical publisher emits this event.
    const [event] = await test.seed.insert(schema.outboxEvents).values({ eventType: 'AnnouncementPublished', payload: {
      eventId: randomUUID(), eventType: 'AnnouncementPublished', schoolId: school.schoolId,
      announcementId: value.announcement.id, announcementVersionId: value.version.id,
      publicationId: scheduled.publicationId, publicationVersion: scheduled.publicationVersion, publishedAt: new Date().toISOString(),
    } }).returning();
    await expect(processNotificationEvent(test.db, { outboxEventId: event.id })).rejects.toThrow();
    expect(await test.seed.select().from(schema.notifications)).toHaveLength(0);
    expect(await test.seed.select().from(schema.publicationRecipientSnapshots)).toHaveLength(0);
  });

  it('rolls back publication/snapshots/outbox and schedule mutation on audit failure; emits no false success', async () => {
    const { value, publication } = await scheduledDue();
    const before = await repo.findPublication(test.db, publication.publicationId);
    vi.spyOn(audit, 'appendAuditEvent').mockRejectedValue(new Error('local audit failure'));
    await expect(app.changeAnnouncementSchedule(test.db, admin, value.announcement.id, publication.publicationId, { action: 'cancel' })).rejects.toThrow();
    expect(await repo.findPublication(test.db, publication.publicationId)).toEqual(before);
    await expect(app.publishDueAnnouncement(test.db, { publicationId: publication.publicationId })).rejects.toThrow();
    expect(await repo.findPublication(test.db, publication.publicationId)).toEqual(before);
    await noDelivery();
    expect((await test.seed.select().from(schema.auditEvents)).some((e) => e.action === 'AnnouncementCancelled' || e.action === 'AnnouncementPublished')).toBe(false);
  });
});
