import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { schools } from './schools';
import { users } from './users';
import { announcementVersions } from './announcements';

/** Private object metadata only. UPLOADING is a durable reconciliation intent, never a usable file. */
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  requestId: uuid('request_id').notNull(),
  originalName: text('original_name').notNull(),
  mediaType: text('media_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  sha256: text('sha256').notNull(),
  objectKey: text('object_key').notNull(),
  state: text('state').$type<'UPLOADING' | 'READY' | 'REJECTED'>().notNull().default('UPLOADING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('files_school_id_unique').on(t.schoolId, t.id),
  unique('files_upload_request_unique').on(t.schoolId, t.createdBy, t.requestId),
  unique('files_object_key_unique').on(t.objectKey),
  check('files_state_check', sql`${t.state} IN ('UPLOADING', 'READY', 'REJECTED')`),
  check('files_size_check', sql`${t.byteSize} > 0 AND ${t.byteSize} <= 2097152`),
  check('files_sha256_check', sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
  check('files_name_check', sql`length(${t.originalName}) BETWEEN 1 AND 180 AND ${t.originalName} !~ '[[:cntrl:]/]' AND strpos(${t.originalName}, chr(92)) = 0`),
  check('files_media_type_check', sql`${t.mediaType} IN ('application/pdf', 'image/png', 'image/jpeg')`),
]).enableRLS();

/** No implicit copy between Versions. Removal is logical and only before the Version freezes. */
export const announcementAttachments = pgTable('announcement_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').notNull(),
  announcementVersionId: uuid('announcement_version_id').notNull(),
  fileId: uuid('file_id').notNull(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'announcement_attachments_school_version_fk', columns: [t.schoolId, t.announcementVersionId], foreignColumns: [announcementVersions.schoolId, announcementVersions.id] }).onDelete('restrict'),
  foreignKey({ name: 'announcement_attachments_school_file_fk', columns: [t.schoolId, t.fileId], foreignColumns: [files.schoolId, files.id] }).onDelete('restrict'),
  unique('announcement_attachments_file_unique').on(t.fileId),
  index('announcement_attachments_version_idx').on(t.schoolId, t.announcementVersionId),
]).enableRLS();
