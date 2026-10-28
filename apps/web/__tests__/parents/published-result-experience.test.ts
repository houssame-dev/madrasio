import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as schema from '@school/database';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import type { ResultEventPayload } from '@/lib/modules/grades/domain/results';
import { publishResult } from '@/lib/modules/grades/application/publish-result';
import { getResult } from '@/lib/modules/grades/application/result-read-service';
import { getChildPublicationHistory, listChildPublishedResults } from '@/lib/modules/parents/application/parent-child-read-service';
import { getNotification, markInboxNotificationRead } from '@/lib/modules/notifications/application/notification-inbox';
import { processNotificationEvent } from '@/lib/modules/notifications/application/process-notification-event';
import { createActor, createParentsTestContext } from './test-helpers';
import { seedParentRelationship, seedStudent } from '../students/test-helpers';
import { seedSchool, seedMembership } from '../auth/test-helpers';
import { fingerprintTable } from '@/scripts/recovery/inventory';
import { APPLICATION_TABLES, RECOVERY_TABLES } from '@/scripts/recovery/contracts';
import type { QueryClient } from '@/scripts/recovery/snapshot';

// Outbox JSON is unknown at the persistence boundary. Validate the fixture before
// reading it or deliberately deriving malformed/legacy variants from it.
const resultPayloadSchema = z.object({
  eventId: z.string(),
  eventType: z.enum(['ResultPublished', 'ResultRevisionPublished']),
  schoolId: z.string(), studentId: z.string(),
  resultType: z.enum(['SUBJECT', 'PERIOD', 'ANNUAL']),
  subjectResultId: z.string().nullable(),
  periodResultId: z.string().nullable(),
  annualResultId: z.string().nullable(),
  resultValue: z.string(), publicationId: z.string(),
  publicationVersion: z.number().int().positive(), publishedAt: z.string(),
  recipientUserIds: z.array(z.string()),
  displayContext: z.object({
    schemaVersion: z.literal(1), studentName: z.string(),
    academicYearName: z.string(), academicPeriodName: z.string().nullable(),
    subjectName: z.string().nullable(),
  }).strict().optional(),
}).strict() satisfies z.ZodType<ResultEventPayload>;

function resultPayload(value: unknown): ResultEventPayload {
  return resultPayloadSchema.parse(value);
}

let c: Awaited<ReturnType<typeof createParentsTestContext>>;
beforeEach(async () => { c = await createParentsTestContext(); });
afterEach(async () => { await c.test.client.close(); });
async function fixture() {
  const actor = await createActor(c, 'PARENT');
  const child = await seedStudent(c.test, c.schoolId, 'History');
  await seedParentRelationship(c, actor, child.id);
  await c.test.seed.insert(schema.studentEnrollments).values({ schoolId: c.schoolId, studentId: child.id, academicYearId: c.yearId, classId: c.classAId, effectiveFrom: '2025-09-01', status: 'ACTIVE' });
  const [period] = await c.test.seed.insert(schema.academicPeriods).values({ schoolId: c.schoolId, academicYearId: c.yearId, name: 'Original term', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-20', status: 'ACTIVE' }).returning();
  const [config] = await c.test.seed.insert(schema.gradingConfigurations).values({ schoolId: c.schoolId, name: 'Rules' }).returning();
  const [version] = await c.test.seed.insert(schema.gradingConfigurationVersions).values({ schoolId: c.schoolId, gradingConfigurationId: config.id, versionNumber: 1, status: 'ACTIVE', rules: { schemaVersion: 1 } }).returning();
  async function result(subjectId = c.subjectId, studentId = child.id) {
    const [row] = await c.test.seed.insert(schema.subjectResults).values({ schoolId: c.schoolId, studentId, academicYearId: c.yearId, academicPeriodId: period.id, classId: c.classAId, subjectId, gradingConfigurationVersionId: version.id, value: '14.00', status: 'FINALIZED' }).returning();
    return row;
  }
  const row = await result();
  const publish = (id = row.id, revision = false, idempotencyKey = randomUUID()) => publishResult(c.db, { ...c.admin, resultType: 'SUBJECT', resultId: id, revision, idempotencyKey });
  return { actor, child, period, version, row, result, publish };
}

it('preserves initial/revised labels and values after rename; contextual notification replay stays idempotent', async () => {
  const f = await fixture();
  const initial = await f.publish();
  await c.test.seed.update(schema.students).set({ firstName: 'Renamed' }).where(eq(schema.students.id, f.child.id));
  await c.test.seed.update(schema.subjects).set({ name: 'Renamed subject' }).where(eq(schema.subjects.id, c.subjectId));
  await c.test.seed.update(schema.academicYears).set({ name: 'Renamed year' }).where(eq(schema.academicYears.id, c.yearId));
  await c.test.seed.update(schema.academicPeriods).set({ name: 'Renamed period' }).where(eq(schema.academicPeriods.id, f.period.id));
  await c.test.seed.update(schema.subjectResults).set({ value: '16.00' }).where(eq(schema.subjectResults.id, f.row.id));
  const key = randomUUID(); const revised = await f.publish(f.row.id, true, key);
  expect(await f.publish(f.row.id, true, key)).toEqual(revised);
  const history = await getChildPublicationHistory(c.parentDb, f.actor, f.child.id, initial.publicationId, 1);
  expect(history.meta.total).toBe(2);
  expect(history.selected).toMatchObject({ state: 'PUBLISHED', value: '14.00', displayContext: { studentName: `${f.child.firstName} ${f.child.lastName}`, academicYearName: '2025/2026', academicPeriodName: 'Original term', subjectName: 'Mathematics' } });
  expect(history.data[0]).toMatchObject({ state: 'REVISED', value: '16.00', displayContext: { subjectName: 'Renamed subject', academicPeriodName: 'Renamed period' }, gradingConfigurationVersionId: f.version.id });
  const events = await c.test.seed.select().from(schema.outboxEvents);
  expect(events).toHaveLength(2);
  for (const event of events) {
    await processNotificationEvent(c.db, { outboxEventId: event.id });
    await processNotificationEvent(c.db, { outboxEventId: event.id });
  }
  const notifications = await c.test.seed.select().from(schema.notifications);
  expect(notifications).toHaveLength(2);
  const first = notifications.find((n) => n.sourceId === initial.publicationId)!;
  expect(first.body).toContain('Mathematics'); expect(first.body).toContain('Original term'); expect(first.body).toContain('Initial publication'); expect(first.body).not.toContain('Renamed');
  expect(notifications.find((n) => n.sourceId === revised.publicationId)!.body).toContain('Revised publication 2');
  expect((await getNotification(c.db, f.actor, first.id)).destination).toBe(`/children/${f.child.id}/results/${initial.publicationId}`);
  expect((await markInboxNotificationRead(c.db, f.actor, first.id)).destination).toBe(`/children/${f.child.id}/results/${initial.publicationId}`);
  const staff = await getResult(c.db, c.admin, 'SUBJECT', f.row.id);
  expect(staff.status).toBe('FINALIZED'); expect(staff.publicationHistory?.meta.total).toBe(2);
});

it('paginates 55 authorized latest results without counting revisions twice', async () => {
  const f = await fixture(); await f.publish(); await f.publish(f.row.id, true);
  for (let i = 2; i <= 55; i++) {
    const [subject] = await c.test.seed.insert(schema.subjects).values({ schoolId: c.schoolId, name: `Subject ${i}` }).returning();
    await f.publish((await f.result(subject.id)).id);
  }
  const input = { academicYearId: c.yearId, resultType: 'SUBJECT' as const, page: 1, pageSize: 50 };
  const first = await listChildPublishedResults(c.parentDb, f.actor, f.child.id, input);
  const second = await listChildPublishedResults(c.parentDb, f.actor, f.child.id, { ...input, page: 2 });
  expect(first.data).toHaveLength(50); expect(second.data).toHaveLength(5); expect(first.meta.total).toBe(55);
  expect(new Set([...first.data, ...second.data].map((p) => p.resultId)).size).toBe(55);
}, 30000);

it('denies unrelated, ended, foreign-School and forged identifiers, including notification destinations', async () => {
  const f = await fixture(); const publication = await f.publish();
  const outsider = await seedStudent(c.test, c.schoolId, 'Unrelated');
  const outsiderPublication = await f.publish((await f.result(c.subjectId, outsider.id)).id);
  for (const [studentId, publicationId] of [[outsider.id, outsiderPublication.publicationId], [f.child.id, outsiderPublication.publicationId], [f.child.id, f.row.id], [randomUUID(), publication.publicationId], [f.child.id, randomUUID()]]) {
    await expect(getChildPublicationHistory(c.parentDb, f.actor, studentId, publicationId, 1)).rejects.toMatchObject({ featureCode: 'CHILD_NOT_AVAILABLE' });
  }
  const otherSchool = await seedSchool(c.test.seed, 'Other School');
  await seedMembership(c.test.seed, f.actor.userId!, otherSchool.id, 'PARENT');
  await expect(getChildPublicationHistory(c.parentDb, { ...f.actor, schoolId: otherSchool.id }, f.child.id, publication.publicationId, 1)).rejects.toMatchObject({ featureCode: 'CHILD_NOT_AVAILABLE' });
  const event = (await c.test.seed.select().from(schema.outboxEvents)).find((item) => resultPayload(item.payload).publicationId === publication.publicationId)!;
  await processNotificationEvent(c.db, { outboxEventId: event.id });
  const [notification] = await c.test.seed.select().from(schema.notifications);
  await c.test.seed.update(schema.notifications).set({ sourceId: outsiderPublication.publicationId }).where(eq(schema.notifications.id, notification.id));
  expect((await getNotification(c.db, f.actor, notification.id)).destination).toBeNull();
  await c.test.seed.update(schema.notifications).set({ sourceId: publication.publicationId }).where(eq(schema.notifications.id, notification.id));
  await c.test.seed.update(schema.parentStudents).set({ status: 'ENDED' });
  await expect(getChildPublicationHistory(c.parentDb, f.actor, f.child.id, publication.publicationId, 1)).rejects.toMatchObject({ featureCode: 'CHILD_NOT_AVAILABLE' });
  expect((await getNotification(c.db, f.actor, notification.id)).destination).toBeNull();
});

it('paginates all 21 immutable revisions without losing an older selected publication', async () => {
  const f = await fixture(); const initial = await f.publish();
  for (let i = 2; i <= 21; i++) await f.publish(f.row.id, true);
  const first = await getChildPublicationHistory(c.parentDb, f.actor, f.child.id, initial.publicationId, 1);
  const second = await getChildPublicationHistory(c.parentDb, f.actor, f.child.id, initial.publicationId, 2);
  expect(first.data.map((p) => p.publicationVersion)).toEqual(Array.from({ length: 20 }, (_, i) => 21 - i));
  expect(second.data.map((p) => p.publicationVersion)).toEqual([1]);
  expect(first.meta.total).toBe(21); expect(second.selected).toEqual(first.selected);
  expect((await getResult(c.db, c.admin, 'SUBJECT', f.row.id, 2)).publicationHistory?.data).toHaveLength(1);
}, 30000);

it('does not turn history into staff authority or bypass inactive Parent profiles', async () => {
  const f = await fixture(); const pub = await f.publish();
  await expect(getResult(c.db, f.actor, 'SUBJECT', f.row.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const teacher = await createActor(c, 'TEACHER');
  const [profile] = await c.test.seed.insert(schema.teachers).values({ schoolId: c.schoolId, userId: teacher.userId, firstName: 'Scoped', lastName: 'Teacher' }).returning();
  await expect(getResult(c.db, teacher, 'SUBJECT', f.row.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const [assignment] = await c.test.seed.insert(schema.teacherAssignments).values({ schoolId: c.schoolId, teacherId: profile.id, academicYearId: c.yearId, classId: c.classAId, subjectId: c.subjectId, effectiveFrom: '2025-09-01' }).returning();
  expect((await getResult(c.db, teacher, 'SUBJECT', f.row.id)).publicationHistory?.selected.publicationId).toBe(pub.publicationId);
  await c.test.seed.update(schema.teacherAssignments).set({ status: 'ENDED' }).where(eq(schema.teacherAssignments.id, assignment.id));
  await expect(getResult(c.db, teacher, 'SUBJECT', f.row.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await c.test.seed.update(schema.parents).set({ status: 'INACTIVE' }).where(eq(schema.parents.userId, f.actor.userId!));
  await expect(getChildPublicationHistory(c.parentDb, f.actor, f.child.id, pub.publicationId, 1)).rejects.toMatchObject({ featureCode: 'CHILD_NOT_AVAILABLE' });
});

it('captures Period/Annual context without inventing an Annual period or Subject', async () => {
  const f = await fixture();
  const values = { schoolId: c.schoolId, studentId: f.child.id, academicYearId: c.yearId, classId: c.classAId, gradingConfigurationVersionId: f.version.id, value: '13.00', status: 'FINALIZED' as const };
  const [period] = await c.test.seed.insert(schema.periodResults).values({ ...values, academicPeriodId: f.period.id }).returning();
  const [annual] = await c.test.seed.insert(schema.annualResults).values(values).returning();
  for (const [resultType, result] of [['PERIOD', period], ['ANNUAL', annual]] as const) {
    const pub = await publishResult(c.db, { ...c.admin, resultType, resultId: result.id, idempotencyKey: randomUUID() });
    const view = await getChildPublicationHistory(c.parentDb, f.actor, f.child.id, pub.publicationId, 1);
    expect(view.selected.displayContext).toMatchObject({ subjectName: null, academicPeriodName: resultType === 'ANNUAL' ? null : 'Original term' });
  }
});

it('rejects malformed new notification context without persisting a misleading notification', async () => {
  const f = await fixture(); await f.publish();
  const [event] = await c.test.seed.select().from(schema.outboxEvents);
  await c.test.seed.update(schema.outboxEvents).set({ payload: { ...resultPayload(event.payload), displayContext: { schemaVersion: 999, studentName: 'Unsupported' } } }).where(eq(schema.outboxEvents.id, event.id));
  await expect(processNotificationEvent(c.db, { outboxEventId: event.id })).rejects.toMatchObject({ featureCode: 'EVENT_PAYLOAD_INVALID' });
  expect(await c.test.seed.select().from(schema.notifications)).toHaveLength(0);
});

it('keeps the current 60-table recovery inventory and fingerprints the publication context', async () => {
  const f = await fixture(); await f.publish();
  expect(APPLICATION_TABLES).toHaveLength(58); expect(RECOVERY_TABLES).toHaveLength(60);
  expect(RECOVERY_TABLES.filter(table => table.startsWith('auth.'))).toEqual(['auth.users', 'auth.identities']);
  expect(RECOVERY_TABLES).toContain('public.result_publications');
  const client = c.test.client as unknown as QueryClient;
  const [publication] = await c.test.seed.select().from(schema.resultPublications);
  const original = await fingerprintTable(client, 'public.result_publications');
  // Local corruption/readback simulation: column changes must affect content, never identity.
  await c.test.seed.update(schema.resultPublications).set({ displayContext: null });
  const changed = await fingerprintTable(client, 'public.result_publications');
  expect(changed.primaryKeySha256).toBe(original.primaryKeySha256);
  expect(changed.contentSha256).not.toBe(original.contentSha256);
  await c.test.seed.update(schema.resultPublications).set({ displayContext: publication.displayContext });
  expect(await fingerprintTable(client, 'public.result_publications')).toEqual(original);
});

it('keeps legacy snapshots truthful and excludes unpublished result IDs/history', async () => {
  const f = await fixture();
  await expect(getChildPublicationHistory(c.parentDb, f.actor, f.child.id, f.row.id, 1)).rejects.toThrow();
  const pub = await f.publish();
  // Simulate a legacy persisted record, not an application update path.
  await c.test.seed.update(schema.resultPublications).set({ displayContext: null });
  const [event] = await c.test.seed.select().from(schema.outboxEvents);
  const { displayContext: _legacyMissing, ...legacyPayload } = resultPayload(event.payload);
  await c.test.seed.update(schema.outboxEvents).set({ payload: legacyPayload });
  await processNotificationEvent(c.db, { outboxEventId: event.id });
  const [notification] = await c.test.seed.select().from(schema.notifications);
  expect(notification.body).toBe('Result value: 14.00');
  const history = await getChildPublicationHistory(c.parentDb, f.actor, f.child.id, pub.publicationId, 1);
  expect(history.selected.displayContext).toBeNull(); expect(history.selected.value).toBe('14.00');
  const list = await listChildPublishedResults(c.parentDb, f.actor, f.child.id, { academicYearId: c.yearId, resultType: 'SUBJECT', page: 1, pageSize: 50 });
  expect(list.data[0].subject?.name).toBe('Historical subject label not recorded');
});
