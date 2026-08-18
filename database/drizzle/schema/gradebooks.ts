import { foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { academicPeriods } from './academic-periods';
import { academicYears } from './academic-years';
import { classes } from './classes';
import { gradingConfigurationVersions } from './grading';
import { schools } from './schools';
import { subjects } from './subjects';

/**
 * Gradebook lifecycle (own enum, no giant shared status enum).
 *
 * - DRAFT    — assessments can be created/edited; not yet operational
 * - OPEN     — active grading context; assessments are in use and Grades may
 *              be entered later
 * - CLOSED   — grading context finished; CLOSED must prevent normal
 *              Grade/Assessment mutation (enforced by the future Application
 *              layer); historical records remain queryable
 * - ARCHIVED — fully historical; preserved
 *
 * IMPORTANT: Gradebook status must NEVER be a substitute for Result
 * publication. Publication is a separate later concept (BR-GRADE-010).
 */
export const gradebookStatus = pgEnum('gradebook_status', ['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED']);

/**
 * Gradebook — the grading context for one exact academic + grading context
 * (BR-GRADE-001/002, ADR-011):
 *
 *   School + AcademicYear + AcademicPeriod + Class + Subject +
 *   GradingConfigurationVersion → Gradebook
 *
 * The Gradebook binds ONE specific GradingConfigurationVersion (NOT a generic
 * GradingConfiguration). Historical reproducibility comes from that immutable
 * versioned reference; the full JSONB rules payload is NOT copied here
 * (Task 006B §37).
 *
 * Configuration immutability (Task 006B §8): once a Gradebook becomes
 * operational / accumulates academic data its bound version is historically
 * significant. Grade rows (Task 006C) reference the Gradebook, so the bound
 * version cannot silently change; the Application layer enforces
 * "version chosen before use" + "no casual re-assignment after use".
 *
 * Period/Year consistency: the triple FK `(school_id, academic_year_id,
 * academic_period_id)` → academic_periods guarantees the referenced
 * AcademicPeriod belongs to the SAME School AND AcademicYear. The triple FK
 * `(school_id, academic_year_id, class_id)` → classes guarantees the Class
 * belongs to the same School + AcademicYear.
 *
 * Tenant integrity: every academic reference is guarded by a composite FK
 * against `(school_id, id)` (or the triple) target — a valid UUID from
 * another School must never create a valid Gradebook.
 *
 * Uniqueness: exactly ONE logical Gradebook per
 * `(school_id, academic_year_id, academic_period_id, class_id, subject_id)`.
 * `grading_configuration_version_id` is deliberately NOT part of uniqueness —
 * two Gradebooks for the same Class/Subject/Period must not exist merely
 * because they use different versions (Task 006B §7). Same Class + Subject in
 * a different Period or Year is a different context and is allowed.
 *
 * Teacher scope: Gradebook does NOT own Teacher scope — access flows through
 * TeacherAssignment (Task 006B §23).
 */
export const gradebooks = pgTable(
  'gradebooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    academicYearId: uuid('academic_year_id').notNull(),
    academicPeriodId: uuid('academic_period_id').notNull(),
    classId: uuid('class_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    gradingConfigurationVersionId: uuid('grading_configuration_version_id').notNull(),
    name: text('name'),
    status: gradebookStatus('status').notNull().default('DRAFT'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'gradebooks_school_academic_year_fk',
      columns: [table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.schoolId, academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'gradebooks_school_period_fk',
      columns: [table.schoolId, table.academicYearId, table.academicPeriodId],
      foreignColumns: [academicPeriods.schoolId, academicPeriods.academicYearId, academicPeriods.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'gradebooks_school_class_fk',
      columns: [table.schoolId, table.academicYearId, table.classId],
      foreignColumns: [classes.schoolId, classes.academicYearId, classes.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'gradebooks_school_subject_fk',
      columns: [table.schoolId, table.subjectId],
      foreignColumns: [subjects.schoolId, subjects.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'gradebooks_school_configuration_version_fk',
      columns: [table.schoolId, table.gradingConfigurationVersionId],
      foreignColumns: [gradingConfigurationVersions.schoolId, gradingConfigurationVersions.id],
    }).onDelete('restrict'),
    uniqueIndex('gradebooks_school_context_unique').on(
      table.schoolId,
      table.academicYearId,
      table.academicPeriodId,
      table.classId,
      table.subjectId,
    ),
    // Composite FK target for Assessment (and future Grade): an Assessment can
    // never attach to another School's Gradebook.
    unique('gradebooks_school_id_unique').on(table.schoolId, table.id),
    index('gradebooks_school_class_subject_idx').on(table.schoolId, table.classId, table.subjectId),
    index('gradebooks_school_subject_idx').on(table.schoolId, table.subjectId),
  ],
);