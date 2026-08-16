import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { academicYears } from './academic-years';
import { classes } from './classes';
import { students } from './students';

/**
 * StudentEnrollment lifecycle (own enum, no giant shared status enum).
 *
 * - ACTIVE — the current enrollment
 * - ENDED  — historical; ending removes current placement but never rewrites
 *            what Class/context the Student was in (BR-STUDENT-007)
 */
export const studentEnrollmentStatus = pgEnum('student_enrollment_status', ['ACTIVE', 'ENDED']);

/**
 * StudentEnrollment — the ONLY source of truth for academic placement history
 * (ADR-008, BR-STUDENT-003/004, domain-model §21/§22).
 *
 * It references School, Student, AcademicYear and Class. Student transfers
 * are explicit business operations: end the old enrollment, create a new one.
 * The old enrollment stays queryable and still points to its original Class —
 * a transfer never overwrites a mutable Student `class_id` (there is none).
 *
 * Tenant integrity (BR-INTEGRITY-002): all referenced entities must belong to
 * the same School. This is enforced with composite foreign keys following the
 * Task 003 strategy — a valid UUID from another School can never create a
 * valid enrollment:
 *
 *   (school_id, student_id)        → students(school_id, id)
 *   (school_id, academic_year_id)  → academic_years(school_id, id)
 *
 * Academic-context integrity (Task 004 §5): the Class must belong to the SAME
 * AcademicYear as the enrollment. Enforced at the database level by the
 * triple composite FK:
 *
 *   (school_id, academic_year_id, class_id) → classes(school_id, academic_year_id, id)
 *
 * Active-overlap invariant (BR-STUDENT-005): a Student cannot have two
 * simultaneously ACTIVE enrollments for the same School + AcademicYear.
 * Enforced by a PARTIAL UNIQUE INDEX on (school_id, student_id,
 * academic_year_id) WHERE status = 'ACTIVE'. ENDED rows are historical and may
 * coexist (transfers within the same year: A ENDED + B ACTIVE is legal).
 *
 * Effective dates are DATE (academic calendar dates, not event timestamps):
 * `effective_from` is required; `effective_until` is set when the enrollment
 * ends. A CHECK guard keeps `effective_until >= effective_from` when present.
 *
 * DELETE behavior is RESTRICT everywhere: historical enrollments must never
 * disappear accidentally (Task 004 §22).
 */
export const studentEnrollments = pgTable(
  'student_enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    studentId: uuid('student_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    classId: uuid('class_id').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveUntil: date('effective_until'),
    status: studentEnrollmentStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'student_enrollments_school_student_fk',
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'student_enrollments_school_academic_year_fk',
      columns: [table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.schoolId, academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'student_enrollments_school_year_class_fk',
      columns: [table.schoolId, table.academicYearId, table.classId],
      foreignColumns: [classes.schoolId, classes.academicYearId, classes.id],
    }).onDelete('restrict'),
    uniqueIndex('student_enrollments_school_student_year_active_unique')
      .on(table.schoolId, table.studentId, table.academicYearId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index('student_enrollments_school_year_idx').on(table.schoolId, table.academicYearId),
    index('student_enrollments_school_student_idx').on(table.schoolId, table.studentId),
    index('student_enrollments_school_class_idx').on(table.schoolId, table.classId),
    check(
      'student_enrollments_effective_range_check',
      sql`${table.effectiveUntil} IS NULL OR ${table.effectiveUntil} >= ${table.effectiveFrom}`,
    ),
  ],
);