import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, numeric, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { gradebooks } from './gradebooks';

/**
 * Controlled, extensible assessment-type vocabulary (Task 006B §12). Starts
 * small for V1; expanded only through an explicit domain change.
 */
export const assessmentType = pgEnum('assessment_type', ['QUIZ', 'TEST', 'EXAM', 'ORAL', 'PROJECT', 'HOMEWORK']);

/**
 * Assessment lifecycle (own enum, no giant shared status enum).
 *
 * - DRAFT     — editable (title/type/max score/weight may change)
 * - PUBLISHED — activated/visible; begins receiving Grade data in Task 006C
 * - ARCHIVED  — historical; preserved
 *
 * Assessment status must NOT be confused with Gradebook status: a Gradebook
 * may be CLOSED while its Assessments remain historically available.
 */
export const assessmentStatus = pgEnum('assessment_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);

/**
 * Assessment — one evaluation inside exactly one Gradebook (BR-GRADE-003).
 *
 * Examples: Quiz, Test, Exam, Oral, Project, Homework Assessment.
 *
 * Assessment belongs to the Gradebook's School: the composite FK
 * `(school_id, gradebook_id)` → `gradebooks(school_id, id)` prevents a
 * School A Assessment ever attaching to a School B Gradebook. `school_id` is
 * duplicated here solely for that same-school composite integrity reason
 * (Task 006B §11).
 *
 * `maximum_score` is an exact `numeric` (never float, not integer-only) and
 * must be > 0 (BR-GRADE-005 foundation). `weight` is also exact `numeric`
 * (> 0) — its calculation semantics are defined later by the Grading
 * Configuration / Calculation task, not hard-coded here (Task 006B §14).
 *
 * `assessment_date` is a calendar DATE (not timestamptz). Enforcing that the
 * date falls inside the Gradebook's AcademicPeriod is a cross-table invariant
 * the schema cannot safely enforce → left to Application validation.
 *
 * Historical immutability boundary (Task 006B §17): once an Assessment
 * receives Grade data, `maximum_score` / `weight` / `type` become
 * historically protected — changes require a controlled correction mechanism
 * (Task 006C). No revision system is introduced yet.
 *
 * Uniqueness: assessment `title` is intentionally NOT unique — two
 * Assessments in the same Gradebook may share a title unless the business
 * model explicitly forbids it (Task 006B §21).
 */
export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    gradebookId: uuid('gradebook_id').notNull(),
    title: text('title').notNull(),
    assessmentType: assessmentType('assessment_type').notNull(),
    maximumScore: numeric('maximum_score', { precision: 6, scale: 2 }).notNull(),
    weight: numeric('weight', { precision: 6, scale: 2 }).notNull().default('1'),
    status: assessmentStatus('status').notNull().default('DRAFT'),
    assessmentDate: date('assessment_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'assessments_school_gradebook_fk',
      columns: [table.schoolId, table.gradebookId],
      foreignColumns: [gradebooks.schoolId, gradebooks.id],
    }).onDelete('restrict'),
    // Composite FK target for future Grade rows: (school_id, assessment_id).
    unique('assessments_school_id_unique').on(table.schoolId, table.id),
    index('assessments_gradebook_idx').on(table.gradebookId),
    index('assessments_school_date_idx').on(table.schoolId, table.assessmentDate),
    check('assessments_maximum_score_check', sql`${table.maximumScore} > 0`),
    check('assessments_weight_check', sql`${table.weight} > 0`),
  ],
);