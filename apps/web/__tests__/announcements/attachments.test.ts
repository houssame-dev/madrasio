import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import * as schema from '@school/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as audit from '@/lib/audit/announcements';
import * as announcementRepo from '@/lib/modules/announcements/infrastructure/repositories/announcement-repository';
import type { PrivateFileStore } from '@/lib/files/storage';
import * as attachments from '@/lib/modules/announcements/application/announcement-attachments';
import { publishAnnouncement, publishDueAnnouncement } from '@/lib/modules/announcements/application/publish-announcement';
import { createAnnouncementVersion } from '@/lib/modules/announcements/application/announcement-management';
import { createAnnouncementsTestDb, seedSchool, seedUser, seedAnnouncement, seedTeacher, seedAssignment, seedTarget, seedParent, seedStudent, seedEnrollment, seedParentStudent,
  type AnnouncementsTestDb, type SeededSchool, type SeededAnnouncement } from './test-helpers';

const pdf = Buffer.from('%PDF-1.7\nfixture\n%%EOF');
class MemoryStore implements PrivateFileStore {
  objects = new Map<string, Uint8Array>();
  put = vi.fn(async (key: string, bytes: Uint8Array) => { if (this.objects.has(key)) throw new Error('collision'); this.objects.set(key, bytes.slice()); });
  get = vi.fn(async (key: string) => { const value = this.objects.get(key); if (!value) throw new Error('missing'); return value; });
  delete = vi.fn(async (key: string) => { this.objects.delete(key); });
}
let t: AnnouncementsTestDb, school: SeededSchool, announcement: SeededAnnouncement, actor: { userId: string; schoolId: string }, store: MemoryStore;
const input = () => ({ requestId: randomUUID(), name: 'notice.pdf', mediaType: 'application/pdf', bytes: pdf });
const upload = (value = input(), who = actor, versionId = announcement.versionId) => attachments.uploadAnnouncementAttachment(t.db, store, who, announcement.announcementId, versionId, value);
const list = () => attachments.listManagedAttachments(t.db, actor, announcement.announcementId, announcement.versionId);
const remove = (id: string) => attachments.removeAnnouncementAttachment(t.db, actor, announcement.announcementId, announcement.versionId, id);
const publish = (scheduledAt?: Date) => publishAnnouncement(t.db, { ...actor, announcementId: announcement.announcementId, announcementVersionId: announcement.versionId, idempotencyKey: randomUUID(), ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}) });

beforeEach(async () => {
  t = await createAnnouncementsTestDb(); school = await seedSchool(t.seed);
  actor = { schoolId: school.schoolId, userId: await seedUser(t.seed, school.schoolId, 'SCHOOL_ADMIN') };
  announcement = await seedAnnouncement(t.seed, school.schoolId, actor.userId); store = new MemoryStore();
}, 30_000);
afterEach(async () => { vi.restoreAllMocks(); await t?.client.close(); });

async function parentRecipient() {
  const userId = await seedUser(t.seed, school.schoolId, 'PARENT');
  const parentId = await seedParent(t.seed, school.schoolId, userId); const studentId = await seedStudent(t.seed, school.schoolId);
  await seedEnrollment(t.seed, school.schoolId, studentId, school.yearId, school.classAId);
  await seedParentStudent(t.seed, school.schoolId, parentId, studentId);
  await seedTarget(t.seed, school.schoolId, announcement.versionId, 'PARENTS', 'CLASS', school.yearId, school.classAId);
  return { userId, schoolId: school.schoolId, parentId };
}

describe('private exact-Version attachments', () => {
  it('rejects invalid content before reserving metadata or accessing storage and enforces ten active attachments', async () => {
    await expect(
  upload({ ...input(), bytes: Buffer.alloc(0) }),
).rejects.toMatchObject({ featureCode: 'FILE_INVALID' });
    await expect(upload({ ...input(), mediaType: 'text/html' })).rejects.toMatchObject({ featureCode: 'FILE_INVALID' });
    expect(await t.seed.select().from(schema.files)).toHaveLength(0); expect(store.put).not.toHaveBeenCalled();
    const results = [];
    for (let index = 0; index < 10; index++) results.push(await upload());
    await expect(upload()).rejects.toMatchObject({ featureCode: 'FILE_LIMIT_REACHED' });
    await remove(results[0]!.id); await expect(upload()).resolves.toMatchObject({ state: 'READY' });
    expect(await list()).toHaveLength(10);
  });
  it('uploads as SchoolAdmin, generates an opaque key, replays without I/O, and audits safe attribution atomically', async () => {
    const request = input(); const result = await upload(request);
    expect(result).toMatchObject({ state: 'READY', name: 'notice.pdf', byteSize: pdf.length });
    expect(await upload(request)).toEqual(result); expect(store.put).toHaveBeenCalledOnce();
    const [file] = await t.seed.select().from(schema.files);
    expect(file).toMatchObject({ schoolId: actor.schoolId, createdBy: actor.userId });
    expect(file!.objectKey).toMatch(/^application-files\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/);
    expect(file!.objectKey).not.toContain('notice');
    expect(Object.keys(result).sort()).toEqual(['byteSize', 'id', 'mediaType', 'name', 'state']);
    const events = await t.seed.select().from(schema.auditEvents);
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ action: 'AnnouncementAttachmentAdded', schoolId: actor.schoolId, actorUserId: actor.userId, resourceId: announcement.announcementId });
    expect(events[0]!.metadata).toEqual({ versionId: announcement.versionId, attachmentId: result.id, fileId: file!.id });
    expect(JSON.stringify(events)).not.toMatch(/notice\.pdf|%PDF|objectKey|signedUrl|secret/);
    expect(await attachments.downloadManagedAttachment(t.db, store, actor, announcement.announcementId, announcement.versionId, result.id)).toEqual({ name: 'notice.pdf', bytes: pdf });
    await expect(upload({ ...request, bytes: Buffer.from('%PDF-different') })).rejects.toMatchObject({ featureCode: 'FILE_REQUEST_CONFLICT' });
    expect(store.put).toHaveBeenCalledOnce();
  });
  it('denies Parent, unauthenticated, foreign School, foreign Version and forged identifiers before storage', async () => {
    const parent = await seedUser(t.seed, school.schoolId, 'PARENT'); const other = await seedSchool(t.seed, 'Other');
    await expect(upload(input(), { ...actor, userId: parent })).rejects.toThrow();
    await expect(attachments.uploadAnnouncementAttachment(t.db, store, { ...actor, userId: null }, announcement.announcementId, announcement.versionId, input())).rejects.toThrow();
    await expect(upload(input(), { ...actor, schoolId: other.schoolId })).rejects.toThrow();
    await expect(upload(input(), actor, randomUUID())).rejects.toThrow();
    const foreign = await seedAnnouncement(t.seed, other.schoolId, actor.userId);
    await expect(upload(input(), actor, foreign.versionId)).rejects.toThrow();
    await expect(attachments.uploadAnnouncementAttachment(t.db, store, actor, randomUUID(), announcement.versionId, input())).rejects.toThrow();
    expect(store.put).not.toHaveBeenCalled(); expect(await t.seed.select().from(schema.files)).toHaveLength(0);
  });
  it.each(['membership', 'identity'] as const)('denies inactive %s', async (kind) => {
    if (kind === 'membership') await t.seed.update(schema.schoolMemberships).set({ status: 'INACTIVE' }).where(eq(schema.schoolMemberships.userId, actor.userId));
    else await t.seed.update(schema.users).set({ status: 'SUSPENDED' }).where(eq(schema.users.id, actor.userId));
    await expect(upload()).rejects.toThrow(); expect(store.put).not.toHaveBeenCalled();
  });
  it('permits author Teacher only within active assignment scope', async () => {
    const userId = await seedUser(t.seed, school.schoolId, 'TEACHER'); const teacherId = await seedTeacher(t.seed, school.schoolId, userId);
    await seedAssignment(t.seed, school.schoolId, teacherId, school.classAId, school.yearId, school.subjectId);
    announcement = await seedAnnouncement(t.seed, school.schoolId, userId);
    await seedTarget(t.seed, school.schoolId, announcement.versionId, 'PARENTS', 'CLASS', school.yearId, school.classAId);
    const teacher = { ...actor, userId };
    await expect(upload(input(), teacher)).resolves.toMatchObject({ state: 'READY' });
    await seedTarget(t.seed, school.schoolId, announcement.versionId, 'PARENTS', 'CLASS', school.yearId, school.classBId);
    await expect(upload(input(), teacher)).rejects.toThrow(); expect(store.put).toHaveBeenCalledOnce();
  });
  it('removes logically and idempotently; never deletes R2 bytes through an arbitrary client key', async () => {
    const result = await upload(); expect(await remove(result.id)).toEqual({ removed: true }); await remove(result.id);
    expect(await list()).toEqual([]); expect(store.delete).not.toHaveBeenCalled();
    await expect(remove(randomUUID())).rejects.toMatchObject({ featureCode: 'FILE_UNAVAILABLE' });
    await expect(attachments.downloadManagedAttachment(t.db, store, actor, announcement.announcementId, announcement.versionId, result.id)).rejects.toThrow();
    expect(store.get).not.toHaveBeenCalled();
    expect((await t.seed.select().from(schema.auditEvents)).map((e) => e.action)).toEqual(['AnnouncementAttachmentAdded', 'AnnouncementAttachmentRemoved']);
  });
  it.each(['SCHEDULED', 'CANCELLED', 'PUBLISHED'] as const)('freezes attachments at every historical intent boundary: %s', async (status) => {
    const result = await upload();
    await t.seed.insert(schema.announcementPublications).values({ schoolId: school.schoolId, announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId, publicationVersion: 1, status, scheduledAt: status === 'PUBLISHED' ? null : new Date('2035-01-01'),
      publishedAt: status === 'PUBLISHED' ? new Date() : null, publishedBy: actor.userId, idempotencyKey: randomUUID() });
    await expect(upload()).rejects.toMatchObject({ featureCode: 'FILE_VERSION_FROZEN' });
    await expect(remove(result.id)).rejects.toMatchObject({ featureCode: 'FILE_VERSION_FROZEN' });
    const version = await createAnnouncementVersion(t.db, actor, announcement.announcementId, { title: 'Correction', body: 'Corrected', bodyFormat: 'PLAIN_TEXT' });
    expect(await attachments.listManagedAttachments(t.db, actor, announcement.announcementId, version.id)).toEqual([]);
    await expect(upload(input(), actor, version.id)).resolves.toMatchObject({ state: 'READY' });
    expect((await list()).map((row) => row.id)).toEqual([result.id]);
  });
  it('preserves historical recipient access after relationship changes; possession alone, other Version and inactive membership fail', async () => {
    const recipient = await parentRecipient(); const result = await upload(); const publication = await publish();
    await t.seed.update(schema.parentStudents).set({ status: 'ENDED' }).where(eq(schema.parentStudents.parentId, recipient.parentId));
    expect(await attachments.listRecipientAttachments(t.db, recipient, publication.publicationId)).toEqual([result]);
    await expect(attachments.downloadRecipientAttachment(t.db, store, recipient, publication.publicationId, result.id)).resolves.toMatchObject({ bytes: pdf });
    const stranger = { ...recipient, userId: await seedUser(t.seed, school.schoolId, 'PARENT') };
    await expect(attachments.downloadRecipientAttachment(t.db, store, stranger, publication.publicationId, result.id)).rejects.toThrow();
    await expect(attachments.downloadRecipientAttachment(t.db, store, recipient, randomUUID(), result.id)).rejects.toThrow();
    const revision = await createAnnouncementVersion(t.db, actor, announcement.announcementId, { title: 'Revision', body: 'New version', bodyFormat: 'PLAIN_TEXT' });
    const later = await upload(input(), actor, revision.id);
    await expect(attachments.downloadRecipientAttachment(t.db, store, recipient, publication.publicationId, later.id)).rejects.toThrow();
    await expect(attachments.downloadRecipientAttachment(t.db, store, { ...recipient, schoolId: randomUUID() }, publication.publicationId, result.id)).rejects.toThrow();
    await t.seed.update(schema.schoolMemberships).set({ status: 'INACTIVE' }).where(and(eq(schema.schoolMemberships.userId, recipient.userId), eq(schema.schoolMemberships.schoolId, recipient.schoolId)));
    await expect(attachments.downloadRecipientAttachment(t.db, store, recipient, publication.publicationId, result.id)).rejects.toThrow();
    expect(store.get).toHaveBeenCalledOnce();
  });
});

describe('storage/transaction consistency', () => {
  it('does not delete an ambiguously committed READY object; retry returns the same successful association', async () => {
    const original = announcementRepo.withAnnouncementLock; let calls = 0;
    const failAfterCommit: typeof original = async (db, schoolId, id, operation) => {
      const result = await original(db, schoolId, id, operation);
      if (++calls === 2) throw new Error('connection lost after commit');
      return result;
    };
    vi.spyOn(announcementRepo, 'withAnnouncementLock').mockImplementation(failAfterCommit);
    const request = input();
    await expect(upload(request)).rejects.toMatchObject({ featureCode: 'FILE_RECONCILIATION_REQUIRED' });
    expect(store.delete).not.toHaveBeenCalled(); expect((await list())[0]!.state).toBe('READY');
    await expect(upload(request)).resolves.toMatchObject({ state: 'READY' }); expect(store.put).toHaveBeenCalledOnce();
    expect(await t.seed.select().from(schema.auditEvents)).toHaveLength(1);
  });
  it('compensates an in-flight upload removed before finalization without reviving the association', async () => {
    let release!: () => void; let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; }); const finish = new Promise<void>((resolve) => { release = resolve; });
    store.put.mockImplementationOnce(async (key, bytes) => { entered(); await finish; store.objects.set(key, bytes); });
    const pending = upload(); const rejected = expect(pending).rejects.toMatchObject({ featureCode: 'FILE_RECONCILIATION_REQUIRED' });
    await started; const [intent] = await list(); await remove(intent!.id); release(); await rejected;
    expect(await list()).toEqual([]); expect(store.delete).toHaveBeenCalledOnce();
    expect((await t.seed.select().from(schema.auditEvents)).map((event) => event.action)).toEqual(['AnnouncementAttachmentRemoved']);
  });
  it('preserves unresolved PUT intent, denies retries and publication, and creates no success audit', async () => {
    const request = input(); store.put.mockRejectedValueOnce(new Error('private-provider-error'));
    await expect(upload(request)).rejects.toMatchObject({ featureCode: 'FILE_RECONCILIATION_REQUIRED' });
    await expect(upload(request)).rejects.toMatchObject({ featureCode: 'FILE_RECONCILIATION_REQUIRED' });
    await expect(publish()).rejects.toMatchObject({ featureCode: 'FILE_NOT_READY' });
    await expect(publish(new Date('2035-01-01'))).rejects.toMatchObject({ featureCode: 'FILE_NOT_READY' });
    expect(store.put).toHaveBeenCalledOnce(); expect(store.delete).not.toHaveBeenCalled();
    expect((await list())[0]!.state).toBe('UPLOADING'); expect(await t.seed.select().from(schema.auditEvents)).toHaveLength(0);
    expect(await t.seed.select().from(schema.announcementPublications)).toHaveLength(0);
  });
  it.each([false, true])('compensates only its own successful PUT after audit rollback; cleanup failure=%s remains reconciliation-required', async (cleanupFails) => {
    vi.spyOn(audit, 'recordAnnouncementAudit').mockRejectedValueOnce(new Error('audit failure'));
    if (cleanupFails) store.delete.mockRejectedValueOnce(new Error('cleanup failure'));
    await expect(upload()).rejects.toMatchObject({ featureCode: 'FILE_RECONCILIATION_REQUIRED' });
    expect(store.delete).toHaveBeenCalledOnce(); expect(store.delete.mock.calls[0]![0]).toBe(store.put.mock.calls[0]![0]);
    expect((await list())[0]!.state).toBe(cleanupFails ? 'UPLOADING' : 'REJECTED');
    expect(await t.seed.select().from(schema.auditEvents)).toHaveLength(0);
  });
  it('rolls back logical removal if audit persistence fails', async () => {
    const result = await upload(); vi.spyOn(audit, 'recordAnnouncementAudit').mockRejectedValueOnce(new Error('audit failure'));
    await expect(remove(result.id)).rejects.toThrow(); expect(await list()).toEqual([result]); expect(store.delete).not.toHaveBeenCalled();
  });
  it('blocks schedule during in-flight upload, then freezes READY set and due processing remains idempotent', async () => {
    await parentRecipient(); let release!: () => void; let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; }); const finish = new Promise<void>((resolve) => { release = resolve; });
    store.put.mockImplementationOnce(async (key, bytes) => { entered(); await finish; store.objects.set(key, bytes); });
    const pending = upload(); await started;
    await expect(publish(new Date('2035-01-01'))).rejects.toMatchObject({ featureCode: 'FILE_NOT_READY' });
    release(); await pending;
    const publication = await publish(new Date('2035-01-01'));
    await t.seed.update(schema.announcementPublications).set({ scheduledAt: new Date('2020-01-01') }).where(eq(schema.announcementPublications.id, publication.publicationId));
    await expect(publishDueAnnouncement(t.db, { publicationId: publication.publicationId })).resolves.toMatchObject({ eventEmitted: true });
    await expect(publishDueAnnouncement(t.db, { publicationId: publication.publicationId })).resolves.toMatchObject({ eventEmitted: false });
    expect(await t.seed.select().from(schema.outboxEvents)).toHaveLength(1);
  });
  it('detects corrupt/missing object bytes without returning a download', async () => {
    const result = await upload(); store.get.mockResolvedValueOnce(Buffer.from('corrupt'));
    await expect(attachments.downloadManagedAttachment(t.db, store, actor, announcement.announcementId, announcement.versionId, result.id)).rejects.toMatchObject({ featureCode: 'FILE_STORAGE_UNAVAILABLE' });
  });
});
