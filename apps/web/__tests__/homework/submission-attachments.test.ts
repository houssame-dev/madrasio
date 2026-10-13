import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as schema from '@school/database';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as app from '@/lib/modules/homework/application';
import * as attachments from '@/lib/modules/homework/application/submission-attachments';
import * as audit from '@/lib/audit/repository';
import * as files from '@/lib/files/repository';
import * as attachmentRepo from '@/lib/modules/homework/infrastructure/repositories/attachment-repository';
import { createActor, seedParentRelationship } from '../students/test-helpers';
import { seedSchool } from '../auth/test-helpers';
import { deliveryFixture, type DeliveryFixture } from './delivery-test-helpers';

let t: DeliveryFixture; let id: string;
const bytes = Buffer.from('%PDF-1.7 Homework');
const store = { put: vi.fn(async () => {}), get: vi.fn(async () => bytes), delete: vi.fn(async () => {}) };
const input = () => ({ requestId: randomUUID(), name: 'work.pdf', mediaType: 'application/pdf', bytes });
beforeEach(async () => {
  vi.clearAllMocks(); t = await deliveryFixture();
  id = (await app.createHomeworkSubmission(t.homeworkDb, t.teacher, t.homework.id, { studentId: t.child.id })).id;
}, 30_000);
afterEach(async () => { vi.restoreAllMocks(); await t?.test.client.close(); });
const upload = (value = input()) => attachments.uploadSubmissionAttachment(t.homeworkDb, store, t.teacher, id, value);

it('uploads privately and replays a READY request without duplicate storage, association or audit', async () => {
  const value = input(); const first = await upload(value); expect(await upload(value)).toEqual(first);
  expect(store.put).toHaveBeenCalledTimes(1);
  expect(await t.test.seed.select().from(schema.homeworkSubmissionAttachments)).toHaveLength(1);
  expect(await t.test.seed.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'HomeworkSubmissionAttachmentAdded'))).toHaveLength(1);
  expect(first).not.toHaveProperty('objectKey'); expect(first).not.toHaveProperty('fileId');
  expect(await attachments.downloadSubmissionAttachment(t.homeworkDb, store, t.teacher, id, first.id)).toEqual({ bytes, name: 'work.pdf' });
  await expect(upload({ ...value, bytes: Buffer.from('%PDF-1.7 changed') })).rejects.toMatchObject({ featureCode: 'FILE_REQUEST_CONFLICT' });
});

it('keeps files bound to their original recording through review/return/resubmission, without deletion authority', async () => {
  const first = await upload(); const recorded = first.submissionRecordedAt;
  await app.reviewHomeworkSubmission(t.homeworkDb, t.teacher, id, { status: 'REVIEWED' });
  await expect(upload()).rejects.toMatchObject({ featureCode: 'INVALID_HOMEWORK_SUBMISSION_STATE' });
  await app.reviewHomeworkSubmission(t.homeworkDb, t.teacher, id, { status: 'RETURNED' });
  await expect(upload()).rejects.toMatchObject({ featureCode: 'INVALID_HOMEWORK_SUBMISSION_STATE' });
  await app.patchHomeworkSubmission(t.homeworkDb, t.teacher, id, { content: 'Revised' });
  const later = await upload();
  const listed = await attachments.listSubmissionAttachments(t.homeworkDb, t.teacher, id);
  expect(listed).toHaveLength(2);
  expect(listed.find((x) => x.id === first.id)!.submissionRecordedAt).toEqual(recorded);
  expect(later.id).not.toBe(first.id); expect(store.delete).not.toHaveBeenCalled();
});

it('authorizes own active Parent relationship before storage; denies other child, ended relation and uploads', async () => {
  const file = await upload();
  const parent = await createActor(t.test, t.schoolId, 'PARENT'); await seedParentRelationship(t, parent, t.child.id);
  expect(await attachments.listSubmissionAttachments(t.homeworkDb, parent, id)).toHaveLength(1);
  expect((await attachments.downloadSubmissionAttachment(t.homeworkDb, store, parent, id, file.id)).bytes).toEqual(bytes);
  await expect(attachments.uploadSubmissionAttachment(t.homeworkDb, store, parent, id, input())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const other = await t.student('other');
  const otherSubmission = await app.createHomeworkSubmission(t.homeworkDb, t.teacher, t.homework.id, { studentId: other.id });
  await expect(attachments.listSubmissionAttachments(t.homeworkDb, parent, otherSubmission.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  store.get.mockClear();
  await expect(attachments.downloadSubmissionAttachment(t.homeworkDb, store, parent, otherSubmission.id, file.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await t.test.seed.update(schema.parentStudents).set({ status: 'ENDED' });
  await expect(attachments.downloadSubmissionAttachment(t.homeworkDb, store, parent, id, file.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(store.get).not.toHaveBeenCalled();
});

it('retains SchoolAdmin attachment authority without bypassing Student target eligibility', async () => {
  const value = input();
  const file = await attachments.uploadSubmissionAttachment(t.homeworkDb, store, t.admin, id, value);
  expect(await attachments.listSubmissionAttachments(t.homeworkDb, t.admin, id)).toHaveLength(1);
  expect((await attachments.downloadSubmissionAttachment(t.homeworkDb, store, t.admin, id, file.id)).bytes).toEqual(bytes);
  await t.test.seed.update(schema.studentEnrollments).set({ effectiveFrom: '2025-10-11' })
    .where(eq(schema.studentEnrollments.studentId, t.child.id));
  const puts = store.put.mock.calls.length;
  await expect(attachments.uploadSubmissionAttachment(t.homeworkDb, store, t.admin, id, input()))
    .rejects.toMatchObject({ featureCode: 'STUDENT_NOT_ELIGIBLE_FOR_HOMEWORK' });
  expect(store.put).toHaveBeenCalledTimes(puts);
});

it('denies foreign School and same-School resource/file UUID substitution before GET', async () => {
  const file = await upload(); const otherSchool = await seedSchool(t.test.seed);
  const actor = await createActor(t.test, otherSchool.id, 'SCHOOL_ADMIN');
  await expect(attachments.downloadSubmissionAttachment(t.homeworkDb, store, actor, id, file.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const child = await t.student('next');
  const other = await app.createHomeworkSubmission(t.homeworkDb, t.teacher, t.homework.id, { studentId: child.id });
  await expect(attachments.downloadSubmissionAttachment(t.homeworkDb, store, t.teacher, other.id, file.id)).rejects.toMatchObject({ featureCode: 'FILE_UNAVAILABLE' });
  const value = input(); await upload(value);
  await expect(attachments.uploadSubmissionAttachment(t.homeworkDb, store, t.teacher, other.id, value)).rejects.toMatchObject({ featureCode: 'FILE_REQUEST_CONFLICT' });
  expect(store.get).not.toHaveBeenCalled();
});

it('preserves an ambiguous PUT as non-delivered, blocks review, and never blindly retries or deletes', async () => {
  const value = input(); store.put.mockRejectedValueOnce(new Error('provider detail must not escape'));
  for (let attempt = 0; attempt < 2; attempt++) await expect(upload(value)).rejects.toMatchObject({ featureCode: 'FILE_RECONCILIATION_REQUIRED' });
  expect(await attachments.listSubmissionAttachments(t.homeworkDb, t.teacher, id)).toEqual([]);
  expect(store.put).toHaveBeenCalledTimes(1); expect(store.delete).not.toHaveBeenCalled();
  await expect(app.reviewHomeworkSubmission(t.homeworkDb, t.teacher, id, { status: 'REVIEWED' })).rejects.toMatchObject({ featureCode: 'FILE_NOT_READY' });
  expect((await t.test.seed.select().from(schema.files))[0]!.state).toBe('UPLOADING');
});

it('serializes pending upload against review and safely compensates a Homework close before finalization', async () => {
  store.put.mockImplementationOnce(async () => {
    await expect(app.reviewHomeworkSubmission(t.homeworkDb, t.teacher, id, { status: 'REVIEWED' })).rejects.toMatchObject({ featureCode: 'FILE_NOT_READY' });
    await app.patchHomework(t.homeworkDb, t.teacher, t.homework.id, { status: 'CLOSED' });
  });
  await expect(upload()).rejects.toMatchObject({ featureCode: 'FILE_RECONCILIATION_REQUIRED' });
  expect(store.delete).toHaveBeenCalledTimes(1);
  expect((await t.test.seed.select().from(schema.files))[0]!.state).toBe('REJECTED');
  expect(await attachments.listSubmissionAttachments(t.homeworkDb, t.teacher, id)).toEqual([]);
});

it('rolls back READY and audit atomically when attribution fails, then compensates only its own incomplete object', async () => {
  vi.spyOn(audit, 'appendAuditEvent').mockRejectedValueOnce(new Error('audit failure'));
  await expect(upload()).rejects.toMatchObject({ featureCode: 'FILE_RECONCILIATION_REQUIRED' });
  expect(store.delete).toHaveBeenCalledTimes(1);
  expect((await t.test.seed.select().from(schema.files))[0]!.state).toBe('REJECTED');
  expect(await t.test.seed.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'HomeworkSubmissionAttachmentAdded'))).toEqual([]);
});

it('rechecks active assignment after upload before exposing the attachment', async () => {
  store.put.mockImplementationOnce(async () => {
    await t.test.seed.update(schema.teacherAssignments).set({ status: 'ENDED' });
  });
  await expect(upload()).rejects.toMatchObject({ featureCode: 'FILE_RECONCILIATION_REQUIRED' });
  expect(store.delete).toHaveBeenCalledTimes(1);
  expect((await t.test.seed.select().from(schema.files))[0]!.state).toBe('REJECTED');
  expect(await t.test.seed.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'HomeworkSubmissionAttachmentAdded'))).toEqual([]);
});

it('preserves an incomplete intent when compensation itself fails', async () => {
  vi.spyOn(audit, 'appendAuditEvent').mockRejectedValueOnce(new Error('synthetic failure'));
  store.delete.mockRejectedValueOnce(new Error('private provider details'));
  await expect(upload()).rejects.toMatchObject({ featureCode: 'FILE_RECONCILIATION_REQUIRED' });
  expect((await t.test.seed.select().from(schema.files))[0]!.state).toBe('UPLOADING');
  expect(await attachments.listSubmissionAttachments(t.homeworkDb, t.teacher, id)).toEqual([]);
});

it('never deletes when finalization outcome cannot be established', async () => {
  vi.spyOn(audit, 'appendAuditEvent').mockRejectedValueOnce(new Error('synthetic failure'));
  vi.spyOn(files, 'findFile').mockRejectedValueOnce(new Error('connection unavailable'));
  await expect(upload()).rejects.toMatchObject({ featureCode: 'FILE_RECONCILIATION_REQUIRED' });
  expect(store.delete).not.toHaveBeenCalled();
  expect((await t.test.seed.select().from(schema.files))[0]!.state).toBe('UPLOADING');
});

it('bounds lifetime attachment intents while allowing exact READY replay at the limit', async () => {
  const first = input(); await upload(first);
  for (let index = 1; index < 10; index++) await upload();
  await expect(upload()).rejects.toMatchObject({ featureCode: 'FILE_LIMIT_REACHED' });
  await expect(upload(first)).resolves.toMatchObject({ name: 'work.pdf' });
  expect(store.put).toHaveBeenCalledTimes(10);
  expect(await t.test.seed.select().from(schema.homeworkSubmissionAttachments)).toHaveLength(10);
});

it('maps a cross-resource request-key uniqueness race to a bounded conflict before storage', async () => {
  vi.spyOn(attachmentRepo, 'insertIntent').mockRejectedValueOnce({ code: '23505' });
  await expect(upload()).rejects.toMatchObject({ featureCode: 'FILE_REQUEST_CONFLICT' });
  expect(store.put).not.toHaveBeenCalled();
  expect(await t.test.seed.select().from(schema.homeworkSubmissionAttachments)).toEqual([]);
});

it('bounds type/size and refuses corrupted download bytes without emitting provider details', async () => {
  await expect(upload({ ...input(), name: 'work.html', mediaType: 'text/html' })).rejects.toMatchObject({ featureCode: 'FILE_INVALID' });
  await expect(upload({ ...input(), bytes: Buffer.alloc(2 * 1024 * 1024 + 1) })).rejects.toMatchObject({ featureCode: 'FILE_INVALID' });
  expect(store.put).not.toHaveBeenCalled();
  const file = await upload(); store.get.mockResolvedValueOnce(Buffer.from('wrong'));
  await expect(attachments.downloadSubmissionAttachment(t.homeworkDb, store, t.teacher, id, file.id)).rejects.toMatchObject({ featureCode: 'FILE_STORAGE_UNAVAILABLE' });
});
