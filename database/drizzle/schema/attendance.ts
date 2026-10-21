import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timetablePublications, type PublishedTimetableLesson } from './timetable-publications';
import { users } from './users';

import { academicYears } from './academic-years';
import { classes } from './classes';
import { schools } from './schools';
import { students } from './students';

/**
 * AttendanceRecord status (own enum, no giant shared status enum).
 *
 * V1 daily attendance statuses (PRD.md §9, BR-ATTENDANCE-*, domain-model
 * §40, Task 007 §2):
 *
 * - PRESENT — attended
 * - ABSENT  — absent without an accepted excuse
 * - LATE    — attended late
 * - EXCUSED — absent with an accepted excuse
 *
 * Future statuses (HALF_DAY, LEFT_EARLY, REMOTE, MEDICAL, SICK, OTHER …) are
 * NOT declared here: expanding the vocabulary is an explicit domain change
 * (Task 007 §2). No numeric score/percentage belongs to attendance
 * (Task 007 §17).
 */
export const attendanceStatus = pgEnum('attendance_status', ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);

/**
 * Session identity: School + publication + lesson + calendar date + Student.
 * The publication/context FK and partial unique indexes preserve tenant identity.
 * Session JSON is copied exclusively from the applicable immutable publication.
 *
 * Legacy daily rows keep NULL session references and their original daily unique
 * identity. No migration assigns them to a lesson; all application writes now use
 * the session service. Date/enrollment/Teacher applicability is checked under the
 * same School lock as publication, not inferred from current student placement.
 *
 * Corrections preserve identity, use expected versions and append an atomic audit.
 * All FKs are RESTRICT. See docs/architecture/attendance-api.md and BR-ATTENDANCE.
 */
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id').notNull(),
    classId: uuid('class_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    attendanceDate: date('attendance_date').notNull(),
    status: attendanceStatus('status').notNull().default('PRESENT'),
    note: text('note'),
    // NULL denotes an unchanged legacy daily record. New writes require a published session.
    publicationId: uuid('publication_id'),
    lessonKey: uuid('lesson_key'),
    session: jsonb('session').$type<PublishedTimetableLesson>(),
    version: integer('version').notNull().default(1),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'attendance_records_school_student_fk',
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'attendance_records_school_academic_year_fk',
      columns: [table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.schoolId, academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'attendance_records_school_year_class_fk',
      columns: [table.schoolId, table.academicYearId, table.classId],
      foreignColumns: [classes.schoolId, classes.academicYearId, classes.id],
    }).onDelete('restrict'),
    // Logical identity: one daily record per School + Class + Student + Date.
    uniqueIndex('attendance_records_legacy_daily_unique').on(
      table.schoolId,
      table.classId,
      table.studentId,
      table.attendanceDate,
    ).where(sql`${table.publicationId} is null`),
    uniqueIndex('attendance_records_session_student_unique').on(table.schoolId, table.publicationId, table.lessonKey, table.attendanceDate, table.studentId).where(sql`${table.publicationId} is not null`),
    foreignKey({ name: 'attendance_records_publication_context_fk', columns: [table.schoolId, table.academicYearId, table.classId, table.publicationId], foreignColumns: [timetablePublications.schoolId, timetablePublications.academicYearId, timetablePublications.classId, timetablePublications.id] }).onDelete('restrict'),
    check('attendance_records_session_check', sql`(${table.publicationId} is null and ${table.lessonKey} is null and ${table.session} is null) or (${table.publicationId} is not null and ${table.lessonKey} is not null and ${table.session} is not null and jsonb_typeof(${table.session})='object' and coalesce(${table.session}->>'lessonKey'=${table.lessonKey}::text,false))`),
    check('attendance_records_version_check', sql`${table.version}>0`),
    // Query-driven indexes (Task 007 §19). The (school_id, class_id) lookup is
    // already served by the unique constraint above (leftmost prefix), so no
    // separate index is added for it.
    index('attendance_records_school_date_idx').on(table.schoolId, table.attendanceDate),
    index('attendance_records_school_student_idx').on(table.schoolId, table.studentId),
    index('attendance_records_school_class_date_idx').on(table.schoolId, table.classId, table.attendanceDate),
    index('attendance_records_school_student_date_idx').on(table.schoolId, table.studentId, table.attendanceDate),
  ],
);
