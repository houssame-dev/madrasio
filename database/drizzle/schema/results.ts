import { sql } from 'drizzle-orm';
import { check, foreignKey, index, numeric, pgEnum, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { academicPeriods } from './academic-periods';
import { academicYears } from './academic-years';
import { classes } from './classes';
import { gradingConfigurationVersions } from './grading';
import { students } from './students';
import { subjects } from './subjects';

/**
 * Result lifecycle (shared by the three Result entities only).
 *
 * This is intentionally NOT a "giant" cross-domain status enum: it carries the
 * exact same lifecycle vocabulary (CALCULATED → FINALIZED) for SubjectResult,
 * PeriodResult and AnnualResult, and is deliberately separate from Grade,
 * Gradebook and Assessment statuses (Task 006C §20). Publication is NOT part
 * of the lifecycle — it belongs to Task 006D.
 *
 * - CALCULATED — the value has been computed from the relevant Grades /
 *   Assessments and the selected GradingConfigurationVersion
 * - FINALIZED  — semantically immutable; must NOT be silently overwritten.
 *   Full mutation blocking is an Application-layer responsibility because SQL
 *   CHECK constraints cannot express it and triggers are prohibited
 *   (Task 006C §21/§39).
 */
export const resultStatus = pgEnum('result_status', ['CALCULATED', 'FINALIZED']);

/**
 * SubjectResult — the calculated result of one Student for one
 * School + AcademicYear + AcademicPeriod + Class + Subject (Task 006C §8).
 *
 * It is NOT the raw Grade and NOT a PeriodResult alias. It will later be
 * calculated from the relevant Grades/Assessments and the selected grading
 * rules; this task only defines its storage foundation.
 *
 * ConfigurationVersion binding (Task 006C §10/§17, BR-GRADE-011): the exact
 * `grading_configuration_version_id` is the historical calculation boundary.
 * Only the version reference is stored — the JSONB rules payload is NEVER
 * copied into the result row (Task 006C §17/§45). Creating a later version
 * must not change existing results' references.
 *
 * Uniqueness (Task 006C §9): exactly one logical SubjectResult per context —
 * a second competing result is NOT created because the calculated value
 * changed. Future revision handling belongs to Task 006D.
 *
 * Tenant + context integrity (Task 006C §25–§29): every reference is guarded
 * by a composite FK against the same-School target; the Class and the
 * AcademicPeriod must both belong to the SAME AcademicYear via the triple
 * composite FKs.
 */
export const subjectResults = pgTable(
  'subject_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    studentId: uuid('student_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    academicPeriodId: uuid('academic_period_id').notNull(),
    classId: uuid('class_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    gradingConfigurationVersionId: uuid('grading_configuration_version_id').notNull(),
    value: numeric('value', { precision: 6, scale: 2 }).notNull(),
    status: resultStatus('status').notNull().default('CALCULATED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'subject_results_school_student_fk',
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'subject_results_school_academic_year_fk',
      columns: [table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.schoolId, academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'subject_results_school_year_period_fk',
      columns: [table.schoolId, table.academicYearId, table.academicPeriodId],
      foreignColumns: [academicPeriods.schoolId, academicPeriods.academicYearId, academicPeriods.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'subject_results_school_year_class_fk',
      columns: [table.schoolId, table.academicYearId, table.classId],
      foreignColumns: [classes.schoolId, classes.academicYearId, classes.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'subject_results_school_subject_fk',
      columns: [table.schoolId, table.subjectId],
      foreignColumns: [subjects.schoolId, subjects.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'subject_results_school_configuration_version_fk',
      columns: [table.schoolId, table.gradingConfigurationVersionId],
      foreignColumns: [gradingConfigurationVersions.schoolId, gradingConfigurationVersions.id],
    }).onDelete('restrict'),
    unique('subject_results_school_id_unique').on(table.schoolId, table.id),
    unique('subject_results_school_context_unique').on(
      table.schoolId,
      table.academicYearId,
      table.academicPeriodId,
      table.classId,
      table.studentId,
      table.subjectId,
    ),
    index('subject_results_school_student_idx').on(table.schoolId, table.studentId),
    index('subject_results_school_class_idx').on(table.schoolId, table.classId),
    index('subject_results_school_subject_idx').on(table.schoolId, table.subjectId),
    check('subject_results_value_nonnegative_check', sql`${table.value} >= 0`),
  ],
);

/**
 * PeriodResult — the aggregate result of one Student for one AcademicPeriod
 * (Task 006C §12). It is NOT a SubjectResult alias and NOT an AnnualResult.
 *
 *   Student + AcademicYear + AcademicPeriod + Class → PeriodResult
 *
 * It will later be calculated from multiple SubjectResults; the schema does
 * NOT store a single `subject_result_id` — a PeriodResult aggregates many
 * subjects (Task 006C §23).
 *
 * Uniqueness (Task 006C §13): at most one logical PeriodResult per context.
 *
 * Configuration binding and tenant/context integrity follow the SubjectResult
 * rules above.
 */
export const periodResults = pgTable(
  'period_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    studentId: uuid('student_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    academicPeriodId: uuid('academic_period_id').notNull(),
    classId: uuid('class_id').notNull(),
    gradingConfigurationVersionId: uuid('grading_configuration_version_id').notNull(),
    value: numeric('value', { precision: 6, scale: 2 }).notNull(),
    status: resultStatus('status').notNull().default('CALCULATED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'period_results_school_student_fk',
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'period_results_school_academic_year_fk',
      columns: [table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.schoolId, academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'period_results_school_year_period_fk',
      columns: [table.schoolId, table.academicYearId, table.academicPeriodId],
      foreignColumns: [academicPeriods.schoolId, academicPeriods.academicYearId, academicPeriods.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'period_results_school_year_class_fk',
      columns: [table.schoolId, table.academicYearId, table.classId],
      foreignColumns: [classes.schoolId, classes.academicYearId, classes.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'period_results_school_configuration_version_fk',
      columns: [table.schoolId, table.gradingConfigurationVersionId],
      foreignColumns: [gradingConfigurationVersions.schoolId, gradingConfigurationVersions.id],
    }).onDelete('restrict'),
    unique('period_results_school_id_unique').on(table.schoolId, table.id),
    unique('period_results_school_context_unique').on(
      table.schoolId,
      table.academicYearId,
      table.academicPeriodId,
      table.classId,
      table.studentId,
    ),
    index('period_results_school_student_idx').on(table.schoolId, table.studentId),
    index('period_results_school_class_idx').on(table.schoolId, table.classId),
    check('period_results_value_nonnegative_check', sql`${table.value} >= 0`),
  ],
);

/**
 * AnnualResult — the annual academic result of one Student (Task 006C §14).
 *
 *   Student + School + AcademicYear + Class → AnnualResult
 *
 * It is a DISTINCT business concept, NOT "the latest PeriodResult" and NOT a
 * generic result-period entity (Task 006C §14–§16, BR-GRADE-009). There is no
 * `academic_period_id` here and no `period_result_id` link — AnnualResult
 * spans the year and remains its own aggregate entity (Task 006C §24). The
 * Class is part of the approved annual model (Task 006C §15) and appears in
 * the unique key.
 *
 * Uniqueness (Task 006C §15/§31): one logical AnnualResult per
 * School + AcademicYear + Class + Student.
 */
export const annualResults = pgTable(
  'annual_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    studentId: uuid('student_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    classId: uuid('class_id').notNull(),
    gradingConfigurationVersionId: uuid('grading_configuration_version_id').notNull(),
    value: numeric('value', { precision: 6, scale: 2 }).notNull(),
    status: resultStatus('status').notNull().default('CALCULATED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'annual_results_school_student_fk',
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'annual_results_school_academic_year_fk',
      columns: [table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.schoolId, academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'annual_results_school_year_class_fk',
      columns: [table.schoolId, table.academicYearId, table.classId],
      foreignColumns: [classes.schoolId, classes.academicYearId, classes.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'annual_results_school_configuration_version_fk',
      columns: [table.schoolId, table.gradingConfigurationVersionId],
      foreignColumns: [gradingConfigurationVersions.schoolId, gradingConfigurationVersions.id],
    }).onDelete('restrict'),
    unique('annual_results_school_id_unique').on(table.schoolId, table.id),
    unique('annual_results_school_context_unique').on(
      table.schoolId,
      table.academicYearId,
      table.classId,
      table.studentId,
    ),
    index('annual_results_school_student_idx').on(table.schoolId, table.studentId),
    index('annual_results_school_class_idx').on(table.schoolId, table.classId),
    check('annual_results_value_nonnegative_check', sql`${table.value} >= 0`),
  ],
);
