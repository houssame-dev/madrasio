import { sql } from 'drizzle-orm';
import { foreignKey, index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { parents } from './parents';
import { students } from './students';

/**
 * ParentStudent relationship lifecycle (own enum, no giant shared status enum).
 *
 * - ACTIVE — grants the Parent current access to the Student
 * - ENDED  — historical; no longer grants current access (BR-PARENT-004) but
 *            the row remains for history
 */
export const parentStudentStatus = pgEnum('parent_student_status', ['ACTIVE', 'ENDED']);

/**
 * ParentStudent — the primary Parent ↔ Student relationship
 * (BR-PARENT-002, domain-model §27/§28).
 *
 *   Parent ──▶ ParentStudent ──▶ Student
 *
 * School-scoped: both the Parent and the Student must belong to the SAME
 * School as the relationship. Enforced with composite foreign keys
 * (Task 003 strategy):
 *
 *   (school_id, parent_id)   → parents(school_id, id)
 *   (school_id, student_id)  → students(school_id, id)
 *
 * Duplicate-prevention: one ACTIVE relationship per Parent + Student pair.
 * Enforced by a PARTIAL UNIQUE INDEX on (school_id, parent_id, student_id)
 * WHERE status = 'ACTIVE'. ENDED rows are historical and may coexist with a
 * later ACTIVE relationship.
 *
 * An ended/inactive relationship must no longer grant current Parent access;
 * the schema supports this through status (the future authorization layer
 * filters on ACTIVE). Historical relationships are preserved, never deleted.
 *
 * DELETE behavior is RESTRICT: historical relationships must never disappear
 * accidentally (Task 004 §22).
 */
export const parentStudents = pgTable(
  'parent_students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    parentId: uuid('parent_id').notNull(),
    studentId: uuid('student_id').notNull(),
    status: parentStudentStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'parent_students_school_parent_fk',
      columns: [table.schoolId, table.parentId],
      foreignColumns: [parents.schoolId, parents.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'parent_students_school_student_fk',
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
    }).onDelete('restrict'),
    uniqueIndex('parent_students_school_pair_active_unique')
      .on(table.schoolId, table.parentId, table.studentId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index('parent_students_school_parent_idx').on(table.schoolId, table.parentId),
    index('parent_students_school_student_idx').on(table.schoolId, table.studentId),
  ],
);