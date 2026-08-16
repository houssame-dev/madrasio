import { foreignKey, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { academicYears } from './academic-years';
import { curriculumVersions } from './curricula';
import { levels, tracks } from './academic-structure';
import { schools } from './schools';

/**
 * Class lifecycle (own enum, no giant shared status enum).
 *
 * - ACTIVE  — the running class of the current AcademicYear
 * - CLOSED  — AcademicYear finished; historical academic records remain
 * - ARCHIVED — fully historical; must never be deleted while history exists
 */
export const classStatus = pgEnum('class_status', ['ACTIVE', 'CLOSED', 'ARCHIVED']);

/**
 * Class — a concrete academic class/group (BR-CLASS-001/002/004).
 *
 * Class is Academic-Year specific: a new AcademicYear creates a new Class
 * context. This table is never a reusable global entity shared across years.
 * No mutable "current class" field belongs here or on Student — enrollment is
 * the source of truth (ADR-008, implemented later).
 *
 * Tenant integrity: every academic reference (AcademicYear, Level, Track,
 * CurriculumVersion) is guarded by a composite FK
 * `(school_id, <entity>_id)` → `<entity>(school_id, id)`, so a School A Class
 * can never point at School B academic context — even with valid UUIDs.
 *
 * `track_id` is nullable and, per PostgreSQL MATCH SIMPLE, a NULL value makes
 * the composite track FK trivially satisfied → Track stays optional.
 *
 * Uniqueness: within the same School + AcademicYear, the Class `name`/code
 * must be unique. The same name is allowed in a different AcademicYear
 * (e.g. 2025/2026 "Class A" and 2026/2027 "Class A").
 */
export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    academicYearId: uuid('academic_year_id').notNull(),
    levelId: uuid('level_id').notNull(),
    trackId: uuid('track_id'),
    curriculumVersionId: uuid('curriculum_version_id').notNull(),
    name: text('name').notNull(),
    status: classStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'classes_school_academic_year_fk',
      columns: [table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.schoolId, academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'classes_school_level_fk',
      columns: [table.schoolId, table.levelId],
      foreignColumns: [levels.schoolId, levels.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'classes_school_track_fk',
      columns: [table.schoolId, table.trackId],
      foreignColumns: [tracks.schoolId, tracks.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'classes_school_curriculum_version_fk',
      columns: [table.schoolId, table.curriculumVersionId],
      foreignColumns: [curriculumVersions.schoolId, curriculumVersions.id],
    }).onDelete('restrict'),
    uniqueIndex('classes_school_year_name_unique').on(table.schoolId, table.academicYearId, table.name),
    index('classes_school_year_idx').on(table.schoolId, table.academicYearId),
  ],
);