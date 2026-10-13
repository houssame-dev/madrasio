import { and, eq, isNull } from 'drizzle-orm';
import { announcementAttachments, files } from '@school/database';
import type { AnnouncementsDb } from './announcement-repository';

export type FileRow = typeof files.$inferSelect;
export type AttachmentRow = typeof announcementAttachments.$inferSelect;
export async function activeAttachmentRows(db: AnnouncementsDb, schoolId: string, versionId: string) {
  return db.select({ file: files, attachment: announcementAttachments }).from(announcementAttachments)
    .innerJoin(files, and(eq(files.id, announcementAttachments.fileId), eq(files.schoolId, announcementAttachments.schoolId)))
    .where(and(eq(announcementAttachments.schoolId, schoolId), eq(announcementAttachments.announcementVersionId, versionId), isNull(announcementAttachments.removedAt)))
    .orderBy(announcementAttachments.createdAt, announcementAttachments.id);
}
export async function findUploadRequest(db: AnnouncementsDb, schoolId: string, userId: string, requestId: string) {
  const [row] = await db.select({ file: files, attachment: announcementAttachments }).from(files)
    .innerJoin(announcementAttachments, eq(announcementAttachments.fileId, files.id))
    .where(and(eq(files.schoolId, schoolId), eq(files.createdBy, userId), eq(files.requestId, requestId))).limit(1);
  return row;
}
export async function insertUploadIntent(db: AnnouncementsDb, input: typeof files.$inferInsert, versionId: string) {
  const [file] = await db.insert(files).values(input).returning();
  const [attachment] = await db.insert(announcementAttachments).values({ schoolId: input.schoolId, announcementVersionId: versionId, fileId: file!.id }).returning();
  return { file: file!, attachment: attachment! };
}
export { markFileReady, findFile, markFileRejected } from '@/lib/files/repository';
export async function findAttachment(db: AnnouncementsDb, schoolId: string, versionId: string, id: string) {
  const [row] = await db.select().from(announcementAttachments).where(and(eq(announcementAttachments.schoolId, schoolId),
    eq(announcementAttachments.announcementVersionId, versionId), eq(announcementAttachments.id, id)));
  return row;
}
export async function markAttachmentRemoved(db: AnnouncementsDb, schoolId: string, id: string) {
  await db.update(announcementAttachments).set({ removedAt: new Date() }).where(and(eq(announcementAttachments.schoolId, schoolId), eq(announcementAttachments.id, id)));
}
