import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, foreignKey, unique, check } from 'drizzle-orm/pg-core';
import { schools } from './schools';
import { users } from './users';
import { academicYears } from './academic-years';
import { stages, levels } from './academic-structure';
import { classes } from './classes';
import { subjects } from './subjects';
import { curriculumVersions } from './curricula';
import { teacherAssignments } from './assignments';

export interface TimetableDay { day: number; slots: { kind: 'LESSON' | 'BREAK'; start: string; end: string }[] }

/** Append-only revisions. Future timetable versions reference an exact configuration ID. */
export const timetableConfigurations = pgTable('timetable_configurations', {
  id: uuid('id').primaryKey().defaultRandom(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  academicYearId: uuid('academic_year_id').notNull(), stageId: uuid('stage_id'), levelId: uuid('level_id'),
  scopeKey: text('scope_key').notNull(), revision: integer('revision').notNull(), enabled: boolean('enabled').notNull().default(true),
  days: jsonb('days').$type<TimetableDay[]>().notNull(), createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  foreignKey({ columns: [t.schoolId, t.academicYearId], foreignColumns: [academicYears.schoolId, academicYears.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.stageId], foreignColumns: [stages.schoolId, stages.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.levelId], foreignColumns: [levels.schoolId, levels.id] }).onDelete('restrict'),
  unique('timetable_config_revision_unique').on(t.schoolId, t.academicYearId, t.scopeKey, t.revision),
  unique('timetable_config_year_id_unique').on(t.schoolId, t.academicYearId, t.id),
  check('timetable_config_scope_check', sql`(${t.stageId} is null and ${t.levelId} is null and ${t.scopeKey}='school') or (${t.stageId} is not null and ${t.levelId} is null and ${t.scopeKey}='stage:' || ${t.stageId}::text) or (${t.levelId} is not null and ${t.stageId} is null and ${t.scopeKey}='level:' || ${t.levelId}::text)`),
  check('timetable_config_revision_check', sql`${t.revision}>0`),
  check('timetable_config_days_check', sql`jsonb_typeof(${t.days})='array' and jsonb_array_length(${t.days}) between 1 and 7`),
]).enableRLS();

/** Rooms are never deleted. Deactivation preserves references in historical requirements. */
export const timetableRooms = pgTable('timetable_rooms', {
  id: uuid('id').primaryKey().defaultRandom(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  name: text('name').notNull(), kind: text('kind', { enum: ['ROOM', 'LAB'] }).notNull(), active: boolean('active').notNull().default(true),
  revision: integer('revision').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedBy: uuid('updated_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('timetable_rooms_school_id_unique').on(t.schoolId, t.id), unique('timetable_rooms_name_unique').on(t.schoolId, t.name),
  check('timetable_rooms_kind_check', sql`${t.kind} in ('ROOM','LAB')`), check('timetable_rooms_revision_check', sql`${t.revision}>0`),
  check('timetable_rooms_name_check', sql`length(trim(${t.name})) between 1 and 100`),
]).enableRLS();

/** Class/Subject requirements are not teacher authorization. Only TeacherAssignment grants that scope. */
export const timetableLoads = pgTable('timetable_loads', {
  id: uuid('id').primaryKey().defaultRandom(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  academicYearId: uuid('academic_year_id').notNull(), classId: uuid('class_id').notNull(), subjectId: uuid('subject_id').notNull(),
  curriculumVersionId: uuid('curriculum_version_id').notNull(), teacherAssignmentId: uuid('teacher_assignment_id').notNull().references(() => teacherAssignments.id, { onDelete: 'restrict' }),
  roomId: uuid('room_id'), lessonsPerWeek: integer('lessons_per_week').notNull(), durationMinutes: integer('duration_minutes').notNull(),
  enabled: boolean('enabled').notNull().default(true), revision: integer('revision').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  foreignKey({ columns: [t.schoolId, t.academicYearId, t.classId], foreignColumns: [classes.schoolId, classes.academicYearId, classes.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.subjectId], foreignColumns: [subjects.schoolId, subjects.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.academicYearId, t.classId, t.subjectId, t.teacherAssignmentId], foreignColumns: [teacherAssignments.schoolId, teacherAssignments.academicYearId, teacherAssignments.classId, teacherAssignments.subjectId, teacherAssignments.id], name: 'timetable_load_assignment_context_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.curriculumVersionId], foreignColumns: [curriculumVersions.schoolId, curriculumVersions.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.roomId], foreignColumns: [timetableRooms.schoolId, timetableRooms.id] }).onDelete('restrict'),
  unique('timetable_load_revision_unique').on(t.schoolId, t.classId, t.subjectId, t.revision),
  check('timetable_load_values_check', sql`${t.revision}>0 and ${t.lessonsPerWeek} between 1 and 60 and ${t.durationMinutes} between 5 and 240`),
]).enableRLS();
