import { and, eq } from 'drizzle-orm';
import { files, homeworkSubmissionAttachments as attachments } from '@school/database';
import type { HomeworkDb } from './homework-repository';

export async function attachmentRows(db: HomeworkDb, schoolId: string, submissionId: string) {
  return db.select({ file: files, attachment: attachments }).from(attachments)
    .innerJoin(files, and(eq(files.id, attachments.fileId), eq(files.schoolId, attachments.schoolId)))
    .where(and(eq(attachments.schoolId, schoolId), eq(attachments.submissionId, submissionId)))
    .orderBy(attachments.createdAt, attachments.id);
}
export async function uploadRequest(db: HomeworkDb, schoolId: string, userId: string, requestId: string) {
  const [row] = await db.select({ file: files, attachment: attachments }).from(files)
    .leftJoin(attachments, eq(attachments.fileId, files.id))
    .where(and(eq(files.schoolId, schoolId), eq(files.createdBy, userId), eq(files.requestId, requestId))).limit(1);
  return row;
}
export async function insertIntent(db: HomeworkDb, input: typeof files.$inferInsert, submissionId: string, submittedAt: Date) {
  const [file] = await db.insert(files).values(input).returning();
  const [attachment] = await db.insert(attachments).values({ schoolId: input.schoolId, fileId: file!.id, submissionId, submissionRecordedAt: submittedAt }).returning();
  return { file: file!, attachment: attachment! };
}
