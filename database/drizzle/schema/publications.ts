import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, numeric, pgEnum, pgTable, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { academicPeriods } from './academic-periods';
import { academicYears } from './academic-years';
import { classes } from './classes';
import { gradingConfigurationVersions } from './grading';
import { annualResults, periodResults, subjectResults } from './results';
import { schools } from './schools';
import { students } from './students';
import { users } from './users';

/**
 * Result type vocabulary for publications (Task 006D).
 *
 * A publication is tied to exactly one of the three Result entities; this
 * enum makes the type explicit and queryable while the nullable composite
 * foreign keys below enforce referential + same-School integrity.
 */
export const resultType = pgEnum('result_type', ['SUBJECT', 'PERIOD', 'ANNUAL']);

/**
 * ResultPublication — the immutable historical snapshot of a published Result
 * (Task 006D Part H).
 *
 *   Result
 *     ↓
 *   ResultPublication (one row per published version of a Result)
 *
 * A FINALIZED result may be published. Publishing creates ONE row that is BOTH
 * the publication record AND its historical snapshot: it denormalizes the
 * published `result_value`, the full academic context (School / Student /
 * AcademicYear / AcademicPeriod when applicable / Class), the exact
 * `grading_configuration_version_id` and the publication metadata
 * (version/sequence, published_by, published_at).
 *
 * IMMUTABILITY (Part H2 / BR-GRADE-010 / BR-HISTORY-005): once written, the
 * row must never be mutated by the Application layer. Later changes to the
 * current Result row, the current configuration, CurriculumSubject
 * coefficients, Student Class, Teacher Assignment or ParentStudent must NOT
 * change this snapshot. Revisions create a NEW publication row with the next
 * `publication_version`; the old rows are never deleted or rewritten
 * (Part H3 / Part I).
 *
 * `publication_version` is the per-Result sequence (1, 2, 3 …). The partial
 * unique indexes `(subject_result_id | period_result_id | annual_result_id,
 * publication_version) WHERE … IS NOT NULL` guarantee that two concurrent
 * publishes of the same Result can never create two identical versions
 * (Part N / BR-CONCURRENCY-002).
 *
 * `idempotency_key` is the stable caller-supplied publication identity (Part
 * L): retrying the same logical publication request returns the existing row
 * instead of creating a duplicate. Its unique constraint is the database-level
 * idempotency guarantee (BR-CONCURRENCY-002).
 *
 * Tenant + context integrity (BR-INTEGRITY-002, ADR-007): every school-scoped
 * reference uses the composite `(school_id, <entity>_id)` FK strategy, so a
 * valid UUID from another School can never form a valid publication. The
 * exactly-one-result CHECK guarantees a publication always references exactly
 * one of the three Result tables, and the `result_type` matches that
 * reference. The `academic_period_id` snapshot column is present for SUBJECT /
 * PERIOD publications and structurally NULL for ANNUAL ones.
 *
 * DELETE behavior: RESTRICT everywhere — published history must never be
 * destroyed by deleting a Result/Student/Class/… (BR-HISTORY-005).
 */
export const resultPublications = pgTable(
  'result_publications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    resultType: resultType('result_type').notNull(),
    subjectResultId: uuid('subject_result_id'),
    periodResultId: uuid('period_result_id'),
    annualResultId: uuid('annual_result_id'),
    studentId: uuid('student_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    academicPeriodId: uuid('academic_period_id'),
    classId: uuid('class_id').notNull(),
    resultValue: numeric('result_value', { precision: 6, scale: 2 }).notNull(),
    gradingConfigurationVersionId: uuid('grading_configuration_version_id').notNull(),
    publicationVersion: integer('publication_version').notNull(),
    publishedBy: uuid('published_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'result_publications_school_student_fk',
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'result_publications_school_academic_year_fk',
      columns: [table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.schoolId, academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'result_publications_school_year_period_fk',
      columns: [table.schoolId, table.academicYearId, table.academicPeriodId],
      foreignColumns: [academicPeriods.schoolId, academicPeriods.academicYearId, academicPeriods.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'result_publications_school_year_class_fk',
      columns: [table.schoolId, table.academicYearId, table.classId],
      foreignColumns: [classes.schoolId, classes.academicYearId, classes.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'result_publications_school_subject_result_fk',
      columns: [table.schoolId, table.subjectResultId],
      foreignColumns: [subjectResults.schoolId, subjectResults.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'result_publications_school_period_result_fk',
      columns: [table.schoolId, table.periodResultId],
      foreignColumns: [periodResults.schoolId, periodResults.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'result_publications_school_annual_result_fk',
      columns: [table.schoolId, table.annualResultId],
      foreignColumns: [annualResults.schoolId, annualResults.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'result_publications_school_configuration_version_fk',
      columns: [table.schoolId, table.gradingConfigurationVersionId],
      foreignColumns: [gradingConfigurationVersions.schoolId, gradingConfigurationVersions.id],
    }).onDelete('restrict'),
    uniqueIndex('result_publications_subject_version_unique')
      .on(table.subjectResultId, table.publicationVersion)
      .where(sql`${table.subjectResultId} IS NOT NULL`),
    uniqueIndex('result_publications_period_version_unique')
      .on(table.periodResultId, table.publicationVersion)
      .where(sql`${table.periodResultId} IS NOT NULL`),
    uniqueIndex('result_publications_annual_version_unique')
      .on(table.annualResultId, table.publicationVersion)
      .where(sql`${table.annualResultId} IS NOT NULL`),
    unique('result_publications_idempotency_key_unique').on(table.idempotencyKey),
    index('result_publications_school_student_idx').on(table.schoolId, table.studentId),
    index('result_publications_school_subject_result_idx').on(table.schoolId, table.subjectResultId),
    index('result_publications_school_period_result_idx').on(table.schoolId, table.periodResultId),
    index('result_publications_school_annual_result_idx').on(table.schoolId, table.annualResultId),
    check(
      'result_publications_result_type_check',
      sql`(
        (${table.resultType} = 'SUBJECT' AND ${table.subjectResultId} IS NOT NULL AND ${table.periodResultId} IS NULL AND ${table.annualResultId} IS NULL) OR
        (${table.resultType} = 'PERIOD' AND ${table.periodResultId} IS NOT NULL AND ${table.subjectResultId} IS NULL AND ${table.annualResultId} IS NULL) OR
        (${table.resultType} = 'ANNUAL' AND ${table.annualResultId} IS NOT NULL AND ${table.subjectResultId} IS NULL AND ${table.periodResultId} IS NULL)
      )`,
    ),
    check(
      'result_publications_period_column_check',
      sql`(
        (${table.resultType} = 'ANNUAL' AND ${table.academicPeriodId} IS NULL) OR
        (${table.resultType} <> 'ANNUAL' AND ${table.academicPeriodId} IS NOT NULL)
      )`,
    ),
    check('result_publications_version_positive_check', sql`${table.publicationVersion} > 0`),
  ],
);