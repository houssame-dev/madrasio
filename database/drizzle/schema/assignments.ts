import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { academicYears } from './academic-years';
import { classes } from './classes';
import { subjects } from './subjects';
import { teachers } from './teachers';

/**
 * TeacherAssignment lifecycle (own enum, no giant shared status enum).
 *
 * - ACTIVE — grants current academic scope
 * - ENDED  — historical; removes future scope but never rewrites historical
 *            records (BR-TEACHER-005/006)
 */
export const teacherAssignmentStatus = pgEnum('teacher_assignment_status', ['ACTIVE', 'ENDED']);

/**
 * TeacherAssignment — the ONLY source of truth for Teacher academic scope
 * (ADR-009, BR-TEACHER-002/003, domain-model §24/§25).
 *
 * It references School, Teacher, Class, Subject and AcademicYear. Assignments
 * are historical data: ending an assignment removes future scope but the row
 * stays queryable.
 *
 * Tenant integrity (BR-INTEGRITY-002): all referenced entities must belong to
 * the same School, enforced with composite foreign keys (Task 003 strategy):
 *
 *   (school_id, teacher_id)       → teachers(school_id, id)
 *   (school_id, subject_id)       → subjects(school_id, id)
 *   (school_id, academic_year_id) → academic_years(school_id, id)
 *
 * Academic-context integrity (Task 004 §12): the assigned Class must belong to
 * the SAME AcademicYear. Enforced at the database level by the triple
 * composite FK:
 *
 *   (school_id, academic_year_id, class_id) → classes(school_id, academic_year_id, id)
 *
 * Duplicate-prevention (BR-TEACHER-004): the exact same Teacher + Class +
 * Subject + AcademicYear must not be ACTIVE twice. Enforced by a PARTIAL
 * UNIQUE INDEX on (school_id, teacher_id, class_id, subject_id,
 * academic_year_id) WHERE status = 'ACTIVE'. ENDED assignments are historical
 * and may coexist (reassignment: A ENDED + B ACTIVE is legal).
 *
 * Effective dates are DATE (academic calendar dates). `effective_from` is
 * required; `effective_until` is set when the assignment ends. A CHECK guard
 * keeps `effective_until >= effective_from` when present.
 *
 * DELETE behavior is RESTRICT everywhere: historical assignments must never
 * disappear accidentally (Task 004 §22).
 */
export const teacherAssignments = pgTable(
  'teacher_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    teacherId: uuid('teacher_id').notNull(),
    classId: uuid('class_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveUntil: date('effective_until'),
    status: teacherAssignmentStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'teacher_assignments_school_teacher_fk',
      columns: [table.schoolId, table.teacherId],
      foreignColumns: [teachers.schoolId, teachers.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'teacher_assignments_school_subject_fk',
      columns: [table.schoolId, table.subjectId],
      foreignColumns: [subjects.schoolId, subjects.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'teacher_assignments_school_academic_year_fk',
      columns: [table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.schoolId, academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'teacher_assignments_school_year_class_fk',
      columns: [table.schoolId, table.academicYearId, table.classId],
      foreignColumns: [classes.schoolId, classes.academicYearId, classes.id],
    }).onDelete('restrict'),
    uniqueIndex('teacher_assignments_school_context_active_unique')
      .on(table.schoolId, table.teacherId, table.classId, table.subjectId, table.academicYearId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index('teacher_assignments_school_year_idx').on(table.schoolId, table.academicYearId),
    index('teacher_assignments_school_teacher_idx').on(table.schoolId, table.teacherId),
    index('teacher_assignments_school_class_idx').on(table.schoolId, table.classId),
    index('teacher_assignments_school_subject_idx').on(table.schoolId, table.subjectId),
    check(
      'teacher_assignments_effective_range_check',
      sql`${table.effectiveUntil} IS NULL OR ${table.effectiveUntil} >= ${table.effectiveFrom}`,
    ),
  ],
);