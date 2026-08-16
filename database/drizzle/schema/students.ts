import { index, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { schools } from './schools';

/**
 * Student lifecycle (own enum, no giant shared status enum).
 *
 * - ACTIVE    — currently enrolled/attending in the School context
 * - INACTIVE  — temporarily not active (e.g. suspended/absent), no deletion
 * - WITHDRAWN — formally withdrawn from the School
 * - ARCHIVED  — fully historical; row must never be deleted while history exists
 *
 * Deletion is NOT the primary lifecycle mechanism (BR-STUDENT-008): archiving
 * or withdrawing a Student must never destroy enrollments, grades, attendance
 * or relationships.
 */
export const studentStatus = pgEnum('student_status', ['ACTIVE', 'INACTIVE', 'WITHDRAWN', 'ARCHIVED']);

/**
 * Student — the academic identity of a student within one School
 * (BR-STUDENT-001, domain-model §19).
 *
 * A Student is NOT a User and does NOT require an authentication account in
 * V1 (BR-AUTH-002). No `user_id` column exists here on purpose.
 *
 * Student must NOT own a mutable "current class" — class placement lives in
 * StudentEnrollment (ADR-008, BR-STUDENT-002/003).
 *
 * Identity/profile fields are intentionally minimal (V1 needs). `student_code`
 * is an OPTIONAL, School-scoped identifier: uniqueness is evaluated within a
 * School only (unique index on `(school_id, student_code)`), never globally.
 * NULL codes are allowed and do not collide (PostgreSQL treats NULLs as
 * distinct in unique indexes). No national/government identifier is stored.
 *
 * The `(school_id, id)` unique constraint is the composite foreign-key target
 * for StudentEnrollment and ParentStudent same-School integrity.
 */
export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    studentCode: text('student_code'),
    status: studentStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('students_school_code_unique').on(table.schoolId, table.studentCode),
    unique('students_school_id_unique').on(table.schoolId, table.id),
    index('students_school_status_idx').on(table.schoolId, table.status),
  ],
);