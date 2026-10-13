import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as schema from '@school/database';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as app from '@/lib/modules/homework/application';
import { homeworkSubmissionCreateSchema, homeworkSubmissionPatchSchema } from '@/lib/modules/homework/domain/contracts';
import * as audit from '@/lib/audit/repository';
import { createActor, seedParentRelationship, seedTeacherScope } from '../students/test-helpers';
import { deliveryFixture, type DeliveryFixture } from './delivery-test-helpers';

let t: DeliveryFixture;
beforeEach(async () => { t = await deliveryFixture(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2025-10-12T12:00:00Z')); }, 30_000);
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await t?.test.client.close(); });
const create = (actualHandedInAt?: string | null) => app.createHomeworkSubmission(t.homeworkDb, t.teacher, t.homework.id, { studentId: t.child.id, actualHandedInAt });

it.each([undefined, null])('keeps unknown actual time %s unknown and uses authoritative recording time', async (actual) => {
  expect((await app.listHomeworkStudents(t.homeworkDb, t.teacher, t.homework.id, { page: 1, pageSize: 50 })).data[0]!.submission).toBeNull();
  const result = await create(actual);
  expect(result.actualHandedInAt).toBeNull(); expect(result.status).toBe('LATE');
  expect(result.submittedAt.toISOString()).toBe('2025-10-12T12:00:00.000Z');
  expect(result.createdAt).toEqual(result.submittedAt);
  expect((await app.listHomeworkStudents(t.homeworkDb, t.teacher, t.homework.id, { page: 1, pageSize: 50 })).data[0]!.submission).toMatchObject({ id: result.id, actualHandedInAt: null });
});

it('records on-time physical work later without rewriting recording accountability', async () => {
  const result = await create('2025-10-10T12:00:00+01:00');
  expect(result.status).toBe('SUBMITTED'); expect(result.actualHandedInAt!.toISOString()).toBe('2025-10-10T11:00:00.000Z');
  expect(result.submittedAt.toISOString()).toBe('2025-10-12T12:00:00.000Z');
  const events = await t.test.seed.select().from(schema.auditEvents);
  expect(events).toEqual([expect.objectContaining({ actorUserId: t.teacher.userId, schoolId: t.schoolId,
    resourceId: result.id, action: 'HomeworkSubmissionRecorded',
    metadata: expect.objectContaining({ actualHandedInAt: '2025-10-10T11:00:00.000Z', recordedAt: '2025-10-12T12:00:00.000Z' }) })]);
});

it.each([
  ['Pacific/Kiritimati', '2025-10-10T09:59:59Z', 'SUBMITTED'],
  ['Pacific/Kiritimati', '2025-10-10T10:00:00Z', 'LATE'],
  ['America/Los_Angeles', '2025-10-11T06:59:59Z', 'SUBMITTED'],
  ['America/Los_Angeles', '2025-10-11T07:00:00Z', 'LATE'],
])('uses School-local inclusive due date %s / %s', async (timezone, actual, status) => {
  await t.test.seed.update(schema.schools).set({ timezone }).where(eq(schema.schools.id, t.schoolId));
  expect((await create(actual)).status).toBe(status);
});

it.each(['bad', '', '2025-02-29T12:00:00Z', '2025-04-31T12:00:00Z', '2025-10-10T12:00', '0000-01-01T00:00:00Z', '2025-10-13T00:00:00Z'])('rejects invalid/future actual hand-in %s without writing', async (actual) => {
  await expect(create(actual)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(await t.test.seed.select().from(schema.homeworkSubmissions)).toEqual([]);
  expect(await t.test.seed.select().from(schema.auditEvents)).toEqual([]);
});

it('accepts real leap dates, keeps server-owned timestamps/status strict, and permits only actual time', () => {
  const base = { studentId: randomUUID(), actualHandedInAt: '2024-02-29T12:00:00Z' };
  expect(homeworkSubmissionCreateSchema.safeParse(base).success).toBe(true);
  for (const extra of [{ submittedAt: base.actualHandedInAt }, { createdAt: base.actualHandedInAt }, { status: 'SUBMITTED' }, { userId: randomUUID() }]) {
    expect(homeworkSubmissionCreateSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  }
  expect(homeworkSubmissionPatchSchema.safeParse({ content: null, actualHandedInAt: null }).success).toBe(true);
});

it('preserves one identity and first recording across review, return and a newly timed resubmission', async () => {
  const first = await create('2025-10-10T10:00:00Z');
  await app.reviewHomeworkSubmission(t.homeworkDb, t.teacher, first.id, { status: 'REVIEWED' });
  await app.reviewHomeworkSubmission(t.homeworkDb, t.teacher, first.id, { status: 'RETURNED' });
  await expect(app.patchHomeworkSubmission(t.homeworkDb, t.teacher, first.id, { content: null, actualHandedInAt: '2025-10-09T10:00:00Z' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  vi.setSystemTime(new Date('2025-10-13T12:00:00Z'));
  const next = await app.patchHomeworkSubmission(t.homeworkDb, t.teacher, first.id, { content: 'Revision', actualHandedInAt: '2025-10-11T10:00:00Z' });
  expect(next).toMatchObject({ id: first.id, studentId: first.studentId, createdAt: first.createdAt, status: 'LATE' });
  expect(next.submittedAt.toISOString()).toBe('2025-10-13T12:00:00.000Z');
  const [event] = await t.test.seed.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'HomeworkSubmissionResubmitted'));
  expect(event!.metadata).toMatchObject({ previousActualHandedInAt: first.actualHandedInAt!.toISOString(), previousRecordedAt: first.submittedAt.toISOString() });
  await app.reviewHomeworkSubmission(t.homeworkDb, t.teacher, first.id, { status: 'REVIEWED' });
  await app.reviewHomeworkSubmission(t.homeworkDb, t.teacher, first.id, { status: 'RETURNED' });
  expect((await app.patchHomeworkSubmission(t.homeworkDb, t.teacher, first.id, { content: 'Unknown next physical time' })).actualHandedInAt).toBeNull();
  expect(await t.test.seed.select().from(schema.homeworkSubmissions)).toHaveLength(1);
});

it('rolls back recording and review if attribution cannot persist', async () => {
  const failure = vi.spyOn(audit, 'appendAuditEvent').mockRejectedValue(new Error('synthetic audit failure'));
  await expect(create()).rejects.toThrow();
  expect(await t.test.seed.select().from(schema.homeworkSubmissions)).toEqual([]);
  failure.mockRestore();
  const result = await create();
  vi.spyOn(audit, 'appendAuditEvent').mockRejectedValue(new Error('synthetic audit failure'));
  await expect(app.reviewHomeworkSubmission(t.homeworkDb, t.teacher, result.id, { status: 'REVIEWED' })).rejects.toThrow();
  expect((await app.getHomeworkSubmission(t.homeworkDb, t.teacher, result.id)).status).toBe('LATE');
});

it('rolls back a resubmission and retains its prior physical/recorded history on audit failure', async () => {
  const first = await create('2025-10-10T10:00:00Z');
  await app.reviewHomeworkSubmission(t.homeworkDb, t.teacher, first.id, { status: 'REVIEWED' });
  const returned = await app.reviewHomeworkSubmission(t.homeworkDb, t.teacher, first.id, { status: 'RETURNED' });
  vi.setSystemTime(new Date('2025-10-13T12:00:00Z'));
  vi.spyOn(audit, 'appendAuditEvent').mockRejectedValueOnce(new Error('synthetic audit failure'));
  await expect(app.patchHomeworkSubmission(t.homeworkDb, t.teacher, first.id, {
    content: 'Not persisted', actualHandedInAt: '2025-10-11T12:00:00Z',
  })).rejects.toThrow();
  expect(await app.getHomeworkSubmission(t.homeworkDb, t.teacher, first.id)).toEqual(returned);
  expect(await t.test.seed.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'HomeworkSubmissionResubmitted'))).toEqual([]);
});

it('preserves Parent read-only, exact Teacher assignment and target eligibility', async () => {
  const result = await create();
  const parent = await createActor(t.test, t.schoolId, 'PARENT'); await seedParentRelationship(t, parent, t.child.id);
  expect((await app.getHomeworkSubmission(t.homeworkDb, parent, result.id)).id).toBe(result.id);
  await expect(app.patchHomeworkSubmission(t.homeworkDb, parent, result.id, { content: 'unauthorized' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const unrelated = await createActor(t.test, t.schoolId, 'TEACHER'); await seedTeacherScope(t, unrelated, t.classBId);
  await expect(app.getHomeworkSubmission(t.homeworkDb, unrelated, result.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await t.test.seed.update(schema.teacherAssignments).set({ status: 'ENDED' });
  await expect(app.reviewHomeworkSubmission(t.homeworkDb, t.teacher, result.id, { status: 'REVIEWED' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

it('allows only one logical record on duplicate concurrent recording attempts', async () => {
  const results = await Promise.allSettled([create(), create()]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await t.test.seed.select().from(schema.homeworkSubmissions)).toHaveLength(1);
  expect(await t.test.seed.select().from(schema.auditEvents)).toHaveLength(1);
});
