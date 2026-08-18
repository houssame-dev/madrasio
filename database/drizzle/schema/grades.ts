import { sql } from 'drizzle-orm';
import { check, foreignKey, index, numeric, pgEnum, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { assessments } from './assessments';
import { students } from './students';

/**
 * Grade state (own enum, no giant shared status enum).
 *
 * A Grade's raw outcome is either a recorded/valid score or an explicit
 * non-numeric business state. NULL score alone must NEVER substitute for every
 * business state (BR-GRADE-006, domain-model §33):
 *
 * - VALID   — a recorded, valid numeric score is present
 * - MISSING — no grade was recorded for the Assessment
 * - ABSENT  — the Student was absent for the Assessment
 * - EXCUSED — the Student was excused for the Assessment
 *
 * The state↔score invariant is DB-enforced: state = 'VALID' requires a
 * non-null score; every non-VALID state requires a NULL score. So a "valid
 * grade without a score" or a "missing/absent/excused grade carrying a score"
 * can never be stored (BR-GRADE-006).
 */
export const gradeState = pgEnum('grade_state', ['VALID', 'MISSING', 'ABSENT', 'EXCUSED']);

/**
 * Grade — a Student's raw/recorded outcome for exactly ONE Assessment
 * (BR-GRADE-004, domain-model §32).
 *
 *   Assessment + Student → Grade
 *
 * Grade state is NOT Gradebook status: a CLOSED/ARCHIVED Gradebook must never
 * be understood as Grade deletion — Grade rows remain historical data, and the
 * future Application layer decides whether editing is allowed based on
 * Gradebook state + permissions (Task 006C §6).
 *
 * Historical context: the Grade's academic meaning (School, AcademicYear,
 * AcademicPeriod, Class, Subject) is reconstructable from its references to
 * Gradebook → Assessment. The academic columns are deliberately NOT duplicated
 * here; the Gradebook chain is the single historical context pointer
 * (Task 006C §2/§7). The Student does not need to remain currently enrolled —
 * the Grade stays tied to its historical context through the Assessment/
 * Gradebook relationships (Task 006C §3).
 *
 * Tenant + context integrity (Task 006C §25, BR-INTEGRITY-002):
 *
 *   (school_id, gradebook_id, assessment_id) → assessments(school_id, gradebook_id, id)
 *
 * enforces that the Assessment belongs to the SAME School AND the SAME
 * Gradebook as the Grade — a cross-school or cross-gradebook Assessment can
 * never form a valid Grade. This required the `(school_id, gradebook_id, id)`
 * unique target added to `assessments`.
 *
 *   (school_id, student_id) → students(school_id, id)
 *
 * enforces that the Student belongs to the same School — a School A Gradebook
 * can never receive a School B Student (Task 006C §3).
 *
 * Uniqueness (Task 006C §4): exactly one logical Grade per Assessment + Student
 * (BR-GRADE-004). Multiple attempts are NOT in V1.
 *
 * Score storage: exact `numeric` (never float), non-negative, and bounded by
 * the Assessment's `maximum_score` (BR-GRADE-005). The lower bound is a DB
 * CHECK; the `score <= assessment.maximum_score` upper bound is a cross-table
 * invariant that CANNOT be expressed as a CHECK (no subqueries in CHECK) and
 * MUST be enforced by the future Application layer (Task 006C §5).
 *
 * DELETE behavior: RESTRICT everywhere — historical Grades must never be
 * destroyed accidentally when a Student/Assessment/Gradebook is archived
 * (Task 006C §46).
 */
export const grades = pgTable(
  'grades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    gradebookId: uuid('gradebook_id').notNull(),
    assessmentId: uuid('assessment_id').notNull(),
    studentId: uuid('student_id').notNull(),
    score: numeric('score', { precision: 6, scale: 2 }),
    state: gradeState('state').notNull().default('VALID'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'grades_school_gradebook_assessment_fk',
      columns: [table.schoolId, table.gradebookId, table.assessmentId],
      foreignColumns: [assessments.schoolId, assessments.gradebookId, assessments.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'grades_school_student_fk',
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
    }).onDelete('restrict'),
    unique('grades_assessment_student_unique').on(table.assessmentId, table.studentId),
    index('grades_school_student_idx').on(table.schoolId, table.studentId),
    index('grades_school_assessment_idx').on(table.schoolId, table.assessmentId),
    check(
      'grades_state_score_check',
      sql`(${table.state} = 'VALID' AND ${table.score} IS NOT NULL) OR (${table.state} <> 'VALID' AND ${table.score} IS NULL)`,
    ),
    check('grades_score_nonnegative_check', sql`${table.score} IS NULL OR ${table.score} >= 0`),
  ],
);
