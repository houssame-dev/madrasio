import 'server-only';
import { randomUUID } from 'node:crypto';
import { isUniqueViolation } from './homework-errors';
import { z } from 'zod';
import { FileError, fileDigest, validateFile } from '@/lib/files/policy';
import { findFile, markFileReady, markFileRejected } from '@/lib/files/repository';
import type { PrivateFileStore } from '@/lib/files/storage';
import { recordHomeworkAudit } from '@/lib/audit/homework';
import { requireSubmissionAttachmentAccess, type HomeworkActor } from './homework-service';
import { withHomeworkLock, type HomeworkDb } from '../infrastructure/repositories/homework-repository';
import * as repo from '../infrastructure/repositories/attachment-repository';

type Row = Awaited<ReturnType<typeof repo.attachmentRows>>[number];
function dto(row: Row) {
  return { id: row.attachment.id, name: row.file.originalName, mediaType: row.file.mediaType,
    byteSize: row.file.byteSize, state: row.file.state, submissionRecordedAt: row.attachment.submissionRecordedAt };
}
export async function listSubmissionAttachments(db: HomeworkDb, actor: HomeworkActor, id: string) {
  await requireSubmissionAttachmentAccess(db, actor, id);
  // Incomplete intents are not delivered files; no recipient sees an incomplete download.
  return (await repo.attachmentRows(db, actor.schoolId, id)).filter((row) => row.file.state === 'READY').map(dto);
}
export async function uploadSubmissionAttachment(db: HomeworkDb, store: PrivateFileStore, actor: HomeworkActor, id: string,
  input: { requestId: string; name: string; mediaType: string; bytes: Uint8Array }) {
  const submission = await requireSubmissionAttachmentAccess(db, actor, id, true);
  const metadata = validateFile(input);
  if (!z.string().uuid().safeParse(input.requestId).success) throw new FileError('FILE_INVALID');
  const reservation = await withHomeworkLock(db, actor.schoolId, submission.homeworkId, async (tx) => {
    const current = await requireSubmissionAttachmentAccess(tx, actor, id, true);
    const existing = await repo.uploadRequest(tx, actor.schoolId, actor.userId!, input.requestId);
    if (existing) {
      if (!existing.attachment || existing.attachment.submissionId !== id
        || existing.file.sha256 !== metadata.sha256 || existing.file.byteSize !== metadata.byteSize
        || existing.file.originalName !== metadata.originalName || existing.file.mediaType !== metadata.mediaType) throw new FileError('FILE_REQUEST_CONFLICT');
      if (existing.file.state !== 'READY') throw new FileError('FILE_RECONCILIATION_REQUIRED');
      return { file: existing.file, attachment: existing.attachment, replay: true };
    }
    if ((await repo.attachmentRows(tx, actor.schoolId, id)).length >= 10) throw new FileError('FILE_LIMIT_REACHED');
    const intent = await repo.insertIntent(tx, { ...metadata, id: randomUUID(), schoolId: actor.schoolId,
      createdBy: actor.userId!, requestId: input.requestId, objectKey: `application-files/${actor.schoolId}/${randomUUID()}`, state: 'UPLOADING' }, id, current.submittedAt);
    return { ...intent, replay: false };
  }).catch((error: unknown) => {
    if (isUniqueViolation(error)) throw new FileError('FILE_REQUEST_CONFLICT');
    throw error;
  });
  if (reservation.replay) return dto(reservation);
  try { await store.put(reservation.file.objectKey, input.bytes, metadata.sha256); }
  catch { throw new FileError('FILE_RECONCILIATION_REQUIRED'); }
  try {
    return await withHomeworkLock(db, actor.schoolId, submission.homeworkId, async (tx) => {
      const current = await requireSubmissionAttachmentAccess(tx, actor, id, true);
      if (current.submittedAt.getTime() !== reservation.attachment.submissionRecordedAt.getTime()) throw new FileError('FILE_REQUEST_CONFLICT');
      const ready = await markFileReady(tx, actor.schoolId, reservation.file.id);
      if (!ready) throw new FileError('FILE_REQUEST_CONFLICT');
      await recordHomeworkAudit(tx, actor, { action: 'HomeworkSubmissionAttachmentAdded', resourceId: id,
        metadata: { homeworkId: current.homeworkId, studentId: current.studentId, status: current.status,
          recordedAt: current.submittedAt.toISOString(), actualHandedInAt: current.actualHandedInAt?.toISOString() ?? null,
          attachmentId: reservation.attachment.id, fileId: ready.id } });
      return dto({ file: ready, attachment: reservation.attachment });
    });
  } catch {
    try {
      const current = await findFile(db, actor.schoolId, reservation.file.id);
      if (current?.state !== 'UPLOADING') throw new Error();
      await store.delete(reservation.file.objectKey);
      await markFileRejected(db, actor.schoolId, current.id);
    } catch { /* Ambiguous outcome: preserve intent, never expose provider/SQL details or delete a READY file. */ }
    throw new FileError('FILE_RECONCILIATION_REQUIRED');
  }
}
export async function downloadSubmissionAttachment(db: HomeworkDb, store: PrivateFileStore, actor: HomeworkActor, id: string, attachmentId: string) {
  await requireSubmissionAttachmentAccess(db, actor, id);
  const row = (await repo.attachmentRows(db, actor.schoolId, id)).find((item) => item.attachment.id === attachmentId && item.file.state === 'READY');
  if (!row) throw new FileError('FILE_UNAVAILABLE');
  let bytes: Uint8Array;
  try { bytes = await store.get(row.file.objectKey); } catch { throw new FileError('FILE_STORAGE_UNAVAILABLE'); }
  if (bytes.length !== row.file.byteSize || fileDigest(bytes) !== row.file.sha256) throw new FileError('FILE_STORAGE_UNAVAILABLE');
  return { bytes, name: row.file.originalName };
}
