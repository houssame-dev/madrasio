import { foreignKey, index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { files } from './files';
import { homeworkSubmissions } from './homework';

/** Append-only evidence on one logical submission. No arbitrary reassociation/removal API. */
export const homeworkSubmissionAttachments = pgTable('homework_submission_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').notNull(),
  submissionId: uuid('submission_id').notNull(),
  fileId: uuid('file_id').notNull(),
  // Server-owned snapshot identifies the recording to which the upload was added.
  submissionRecordedAt: timestamp('submission_recorded_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'homework_attachments_school_submission_fk', columns: [t.schoolId, t.submissionId], foreignColumns: [homeworkSubmissions.schoolId, homeworkSubmissions.id] }).onDelete('restrict'),
  foreignKey({ name: 'homework_attachments_school_file_fk', columns: [t.schoolId, t.fileId], foreignColumns: [files.schoolId, files.id] }).onDelete('restrict'),
  unique('homework_attachments_file_unique').on(t.fileId),
  index('homework_attachments_submission_idx').on(t.schoolId, t.submissionId),
]).enableRLS();
