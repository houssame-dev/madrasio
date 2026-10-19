import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, date, timestamp, foreignKey, unique, check } from 'drizzle-orm/pg-core';
import { schools } from './schools';
import { users } from './users';
import { academicPeriods } from './academic-periods';
import { classes } from './classes';
import { curriculumVersions } from './curricula';
import { subjects } from './subjects';
import { teachers } from './teachers';
import { teacherAssignments } from './assignments';
import { timetableConfigurations, timetableRooms } from './timetable';

/** A complete immutable draft revision, never a publication or a teacher permission. */
export const timetableDrafts = pgTable('timetable_drafts', {
  id: uuid('id').primaryKey().defaultRandom(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  academicYearId: uuid('academic_year_id').notNull(), academicPeriodId: uuid('academic_period_id').notNull(), classId: uuid('class_id').notNull(),
  configurationId: uuid('configuration_id').notNull(), curriculumVersionId: uuid('curriculum_version_id').notNull(),
  startDate: date('start_date').notNull(), endDate: date('end_date').notNull(), revision: integer('revision').notNull(),
  requestKey: uuid('request_key').notNull(), requestHash: text('request_hash').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique('timetable_draft_context_revision_unique').on(t.schoolId, t.academicYearId, t.academicPeriodId, t.classId, t.revision),
  unique('timetable_draft_request_unique').on(t.schoolId, t.requestKey),
  unique('timetable_draft_class_id_unique').on(t.schoolId, t.academicYearId, t.classId, t.id),
  foreignKey({ columns: [t.schoolId, t.academicYearId, t.classId], foreignColumns: [classes.schoolId, classes.academicYearId, classes.id], name: 'timetable_draft_class_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.academicYearId, t.academicPeriodId], foreignColumns: [academicPeriods.schoolId, academicPeriods.academicYearId, academicPeriods.id], name: 'timetable_draft_period_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.academicYearId, t.configurationId], foreignColumns: [timetableConfigurations.schoolId, timetableConfigurations.academicYearId, timetableConfigurations.id], name: 'timetable_draft_configuration_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.curriculumVersionId], foreignColumns: [curriculumVersions.schoolId, curriculumVersions.id], name: 'timetable_draft_curriculum_fk' }).onDelete('restrict'),
  check('timetable_draft_revision_check', sql`${t.revision}>0`), check('timetable_draft_dates_check', sql`${t.startDate}<=${t.endDate}`),
]).enableRLS();

/** Rows belong to an immutable revision. lessonKey is stable when a lesson is moved/edited. */
export const timetableLessons = pgTable('timetable_lessons', {
  id: uuid('id').primaryKey().defaultRandom(), schoolId: uuid('school_id').notNull(), academicYearId: uuid('academic_year_id').notNull(), classId: uuid('class_id').notNull(),
  draftId: uuid('draft_id').notNull(), lessonKey: uuid('lesson_key').notNull(), weekday: integer('weekday').notNull(),
  startMinute: integer('start_minute').notNull(), endMinute: integer('end_minute').notNull(),
  subjectId: uuid('subject_id').notNull(), teacherAssignmentId: uuid('teacher_assignment_id').notNull(), teacherId: uuid('teacher_id').notNull(), roomId: uuid('room_id'),
}, t => [
  unique('timetable_lesson_key_unique').on(t.schoolId, t.draftId, t.lessonKey),
  foreignKey({ columns: [t.schoolId, t.academicYearId, t.classId, t.draftId], foreignColumns: [timetableDrafts.schoolId, timetableDrafts.academicYearId, timetableDrafts.classId, timetableDrafts.id], name: 'timetable_lesson_draft_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.academicYearId, t.classId, t.subjectId, t.teacherAssignmentId], foreignColumns: [teacherAssignments.schoolId, teacherAssignments.academicYearId, teacherAssignments.classId, teacherAssignments.subjectId, teacherAssignments.id], name: 'timetable_lesson_assignment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.subjectId], foreignColumns: [subjects.schoolId, subjects.id], name: 'timetable_lesson_subject_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.teacherId], foreignColumns: [teachers.schoolId, teachers.id], name: 'timetable_lesson_teacher_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.roomId], foreignColumns: [timetableRooms.schoolId, timetableRooms.id], name: 'timetable_lesson_room_fk' }).onDelete('restrict'),
  check('timetable_lesson_time_check', sql`${t.weekday} between 1 and 7 and ${t.startMinute}>=0 and ${t.endMinute}<=1440 and ${t.startMinute}<${t.endMinute}`),
]).enableRLS();
