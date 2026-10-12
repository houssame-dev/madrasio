import 'server-only';
import { randomUUID } from 'node:crypto';
import * as fileRepo from '../infrastructure/repositories/attachment-repository';
import { activeAttachmentRows as rows, type FileRow, type AttachmentRow } from '../infrastructure/repositories/attachment-repository';
import { recordAnnouncementAudit } from '@/lib/audit/announcements';
import { FileError, fileDigest, MAX_VERSION_ATTACHMENTS, validateFile } from '@/lib/files/policy';
import type { PrivateFileStore } from '@/lib/files/storage';
import * as repo from '../infrastructure/repositories/announcement-repository';
import { requireManagement, type AnnouncementActor } from './announcement-management';
import { getRecipientAnnouncement } from './announcement-experience';

type Db = repo.AnnouncementsDb;
function unavailable(): never { throw new FileError('FILE_UNAVAILABLE'); }
function view(row: { file: FileRow; attachment: AttachmentRow }) {
  return { id: row.attachment.id, name: row.file.originalName, mediaType: row.file.mediaType,
    byteSize: row.file.byteSize, state: row.file.state };
}
export async function requireAttachmentManagement(db: Db, actor: AnnouncementActor, id: string, versionId: string, mutable = false) {
  const announcement = await repo.findAnnouncement(db, actor.schoolId, id);
  const version = await repo.findVersionForAnnouncement(db, actor.schoolId, id, versionId);
  if (!announcement || !version) unavailable();
  await requireManagement(db, actor, announcement, mutable ? 'announcements.create' : 'announcements.read', versionId);
  if (mutable && (announcement.status === 'ARCHIVED' || (await repo.findLatestVersion(db, actor.schoolId, id))?.id !== versionId
    || await repo.versionHasPublication(db, actor.schoolId, versionId))) throw new FileError('FILE_VERSION_FROZEN');
}
export async function assertAnnouncementAttachmentsReady(db: Db, schoolId: string, versionId: string) {
  if ((await rows(db, schoolId, versionId)).some(({ file }) => file.state !== 'READY')) throw new FileError('FILE_NOT_READY');
}
export async function listManagedAttachments(db: Db, actor: AnnouncementActor, id: string, versionId: string) {
  await requireAttachmentManagement(db, actor, id, versionId);
  return (await rows(db, actor.schoolId, versionId)).map(view);
}
async function recipientVersion(db: Db, actor: AnnouncementActor, publicationId: string) {
  await getRecipientAnnouncement(db, actor, publicationId);
  const publication = await repo.findPublication(db, publicationId);
  if (!publication || publication.schoolId !== actor.schoolId || publication.status !== 'PUBLISHED') unavailable();
  return publication.announcementVersionId;
}
export async function listRecipientAttachments(db: Db, actor: AnnouncementActor, publicationId: string) {
  const versionId = await recipientVersion(db, actor, publicationId);
  return (await rows(db, actor.schoolId, versionId)).filter(({ file }) => file.state === 'READY').map(view);
}

export async function uploadAnnouncementAttachment(db: Db, store: PrivateFileStore, actor: AnnouncementActor,
  id: string, versionId: string, input: { requestId: string; name: string; mediaType: string; bytes: Uint8Array }) {
  await requireAttachmentManagement(db, actor, id, versionId, true);
  const metadata = validateFile(input);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId)) throw new FileError('FILE_INVALID');
  const reservation = await repo.withAnnouncementLock(db, actor.schoolId, id, async (tx) => {
    await requireAttachmentManagement(tx, actor, id, versionId, true);
    const existing = await fileRepo.findUploadRequest(tx, actor.schoolId, actor.userId!, input.requestId);
    if (existing) {
      const row = existing;
      if (row.attachment.announcementVersionId !== versionId || row.attachment.removedAt
        || row.file.sha256 !== metadata.sha256 || row.file.originalName !== metadata.originalName || row.file.mediaType !== metadata.mediaType || row.file.byteSize !== metadata.byteSize) throw new FileError('FILE_REQUEST_CONFLICT');
      if (row.file.state !== 'READY') throw new FileError('FILE_RECONCILIATION_REQUIRED');
      return { ...row, replay: true };
    }
    if ((await rows(tx, actor.schoolId, versionId)).length >= MAX_VERSION_ATTACHMENTS) throw new FileError('FILE_LIMIT_REACHED');
    const fileId = randomUUID();
    const intent = await fileRepo.insertUploadIntent(tx, { ...metadata, id: fileId, schoolId: actor.schoolId, createdBy: actor.userId!,
      requestId: input.requestId, objectKey: `application-files/${actor.schoolId}/${randomUUID()}`, state: 'UPLOADING' }, versionId);
    return { ...intent, replay: false };
  });
  if (reservation.replay) return view(reservation);
  try { await store.put(reservation.file.objectKey, input.bytes, metadata.sha256); }
  catch {
    // A transport failure cannot prove whether PUT committed. Keep intent; never blindly delete/retry.
    throw new FileError('FILE_RECONCILIATION_REQUIRED');
  }
  try {
    return await repo.withAnnouncementLock(db, actor.schoolId, id, async (tx) => {
      await requireAttachmentManagement(tx, actor, id, versionId, true);
      const current = (await rows(tx, actor.schoolId, versionId)).find((row) => row.attachment.id === reservation.attachment.id);
      if (!current || current.file.state !== 'UPLOADING') throw new FileError('FILE_REQUEST_CONFLICT');
      const ready = await fileRepo.markFileReady(tx, actor.schoolId, current.file.id);
      if (!ready) throw new FileError('FILE_REQUEST_CONFLICT');
      await recordAnnouncementAudit(tx, actor, { action: 'AnnouncementAttachmentAdded', resourceId: id,
        metadata: { versionId, attachmentId: current.attachment.id, fileId: current.file.id } });
      return view({ attachment: current.attachment, file: ready! });
    });
  } catch {
    // Confirm a failed (not ambiguously committed) transaction before deleting this request's object.
    // No other request may finalize this reservation; replays never perform storage I/O.
    try {
      const current = await fileRepo.findFile(db, actor.schoolId, reservation.file.id);
      if (current?.state !== 'UPLOADING') throw new Error();
      await store.delete(reservation.file.objectKey);
      await fileRepo.markFileRejected(db, actor.schoolId, current.id);
    } catch { /* Preserve reconciliation intent; never expose provider/SQL errors or assume success. */ }
    throw new FileError('FILE_RECONCILIATION_REQUIRED');
  }
}

export async function removeAnnouncementAttachment(db: Db, actor: AnnouncementActor, id: string, versionId: string, attachmentId: string) {
  return repo.withAnnouncementLock(db, actor.schoolId, id, async (tx) => {
    await requireAttachmentManagement(tx, actor, id, versionId, true);
    const row = await fileRepo.findAttachment(tx, actor.schoolId, versionId, attachmentId);
    if (!row) unavailable();
    if (row.removedAt) return { removed: true };
    await fileRepo.markAttachmentRemoved(tx, actor.schoolId, row.id);
    await recordAnnouncementAudit(tx, actor, { action: 'AnnouncementAttachmentRemoved', resourceId: id,
      metadata: { versionId, attachmentId, fileId: row.fileId } });
    return { removed: true };
  });
}

async function download(db: Db, store: PrivateFileStore, schoolId: string, versionId: string, attachmentId: string) {
  const row = (await rows(db, schoolId, versionId)).find((item) => item.attachment.id === attachmentId && item.file.state === 'READY');
  if (!row) unavailable();
  let bytes: Uint8Array;
  try { bytes = await store.get(row.file.objectKey); } catch { throw new FileError('FILE_STORAGE_UNAVAILABLE'); }
  if (bytes.length !== row.file.byteSize || fileDigest(bytes) !== row.file.sha256) throw new FileError('FILE_STORAGE_UNAVAILABLE');
  return { bytes, name: row.file.originalName };
}
export async function downloadManagedAttachment(db: Db, store: PrivateFileStore, actor: AnnouncementActor, id: string, versionId: string, attachmentId: string) {
  await requireAttachmentManagement(db, actor, id, versionId);
  return download(db, store, actor.schoolId, versionId, attachmentId);
}
export async function downloadRecipientAttachment(db: Db, store: PrivateFileStore, actor: AnnouncementActor, publicationId: string, attachmentId: string) {
  return download(db, store, actor.schoolId, await recipientVersion(db, actor, publicationId), attachmentId);
}
