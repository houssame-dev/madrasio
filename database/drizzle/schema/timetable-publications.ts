import { sql } from 'drizzle-orm';
import { pgTable, uuid, integer, date, timestamp, text, jsonb, foreignKey, unique, check } from 'drizzle-orm/pg-core';
import { timetableDrafts } from './timetable-drafts';
import { users } from './users';

export interface PublishedTimetableLesson {
  lessonKey: string; weekday: number; start: string; end: string; subjectId: string; subjectName: string;
  teacherAssignmentId: string; teacherId: string; teacherName: string; roomId: string | null; roomName: string | null;
}
export interface TimetablePublicationSnapshot {
  className: string; yearName: string; periodName: string; timezone: string; lessons: PublishedTimetableLesson[];
}
/** Immutable event. Its effective end is derived from the next publication, never written back. */
export const timetablePublications = pgTable('timetable_publications', {
  id: uuid('id').primaryKey().defaultRandom(), schoolId: uuid('school_id').notNull(), academicYearId: uuid('academic_year_id').notNull(),
  classId: uuid('class_id').notNull(), draftId: uuid('draft_id').notNull(), sequence: integer('sequence').notNull(),
  effectiveFrom: date('effective_from').notNull(), validUntil: date('valid_until').notNull(),
  snapshot: jsonb('snapshot').$type<TimetablePublicationSnapshot>().notNull(),
  requestKey: uuid('request_key').notNull(), requestHash: text('request_hash').notNull(),
  publishedBy: uuid('published_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique('timetable_publication_context_id_unique').on(t.schoolId, t.academicYearId, t.classId, t.id),
  foreignKey({ columns: [t.schoolId, t.academicYearId, t.classId, t.draftId], foreignColumns: [timetableDrafts.schoolId, timetableDrafts.academicYearId, timetableDrafts.classId, timetableDrafts.id], name: 'timetable_publication_draft_fk' }).onDelete('restrict'),
  unique('timetable_publication_sequence_unique').on(t.schoolId, t.classId, t.sequence),
  unique('timetable_publication_date_unique').on(t.schoolId, t.classId, t.effectiveFrom),
  unique('timetable_publication_request_unique').on(t.schoolId, t.requestKey),
  check('timetable_publication_validity_check', sql`${t.sequence}>0 and ${t.effectiveFrom}<=${t.validUntil}`),
]).enableRLS();
