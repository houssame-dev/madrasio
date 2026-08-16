import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, numeric, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { schools } from './schools';
import { subjects } from './subjects';

/**
 * Curriculum / CurriculumVersion / CurriculumSubject statuses
 * (per-entity enums, no giant shared enum).
 */
export const curriculumStatus = pgEnum('curriculum_status', ['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export const curriculumVersionStatus = pgEnum('curriculum_version_status', ['DRAFT', 'ACTIVE', 'ARCHIVED']);
export const curriculumSubjectStatus = pgEnum('curriculum_subject_status', ['ACTIVE', 'INACTIVE']);

/**
 * Curriculum — School-scoped conceptual container for an academic curriculum.
 *
 * Subject coefficients are intentionally NOT stored here (or on Subject);
 * they belong to CurriculumSubject (BR-SUBJECT-002).
 */
export const curricula = pgTable(
  'curricula',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    status: curriculumStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('curricula_school_name_unique').on(table.schoolId, table.name),
    unique('curricula_school_id_unique').on(table.schoolId, table.id),
  ],
);

/**
 * CurriculumVersion — a specific version of a Curriculum (ADR-010).
 *
 * This is the historical configuration boundary: a version already used by
 * academic structures/history must not be silently rewritten. Future Class
 * records reference the exact CurriculumVersion active for them.
 *
 * Tenant integrity: the composite FK `(school_id, curriculum_id)` references
 * `curricula(school_id, id)`, so a version can never belong to another
 * School's Curriculum. Duplicate logical versions within one Curriculum are
 * rejected via `(curriculum_id, name)`.
 */
export const curriculumVersions = pgTable(
  'curriculum_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    curriculumId: uuid('curriculum_id').notNull(),
    name: text('name').notNull(),
    status: curriculumVersionStatus('status').notNull().default('DRAFT'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'curriculum_versions_school_curriculum_fk',
      columns: [table.schoolId, table.curriculumId],
      foreignColumns: [curricula.schoolId, curricula.id],
    }).onDelete('restrict'),
    uniqueIndex('curriculum_versions_curriculum_name_unique').on(table.curriculumId, table.name),
    unique('curriculum_versions_school_id_unique').on(table.schoolId, table.id),
    index('curriculum_versions_school_curriculum_idx').on(table.schoolId, table.curriculumId),
  ],
);

/**
 * CurriculumSubject — CurriculumVersion + Subject + curriculum-specific
 * configuration (coefficient).
 *
 * The coefficient belongs HERE, not on Subject (BR-SUBJECT-002/003/005):
 *
 *   Curriculum Version A + Mathematics → coefficient 7
 *   Curriculum Version B + Mathematics → coefficient 5
 *
 * Coefficient uses `numeric`, not float, and is not integer-only.
 *
 * Tenant integrity: two composite FKs (`(school_id, curriculum_version_id)`
 * → curriculum_versions, `(school_id, subject_id)` → subjects) guarantee a
 * CurriculumSubject can never connect a School A CurriculumVersion with a
 * School B Subject. Duplicate `(curriculum_version_id, subject_id)`
 * relationships are rejected.
 */
export const curriculumSubjects = pgTable(
  'curriculum_subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    curriculumVersionId: uuid('curriculum_version_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    coefficient: numeric('coefficient', { precision: 4, scale: 2 }).notNull(),
    displayOrder: integer('display_order'),
    status: curriculumSubjectStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'curriculum_subjects_school_version_fk',
      columns: [table.schoolId, table.curriculumVersionId],
      foreignColumns: [curriculumVersions.schoolId, curriculumVersions.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'curriculum_subjects_school_subject_fk',
      columns: [table.schoolId, table.subjectId],
      foreignColumns: [subjects.schoolId, subjects.id],
    }).onDelete('restrict'),
    uniqueIndex('curriculum_subjects_version_subject_unique').on(
      table.curriculumVersionId,
      table.subjectId,
    ),
    index('curriculum_subjects_school_version_idx').on(table.schoolId, table.curriculumVersionId),
    check('curriculum_subjects_coefficient_check', sql`${table.coefficient} > 0`),
  ],
);