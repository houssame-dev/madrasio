import { date, foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { academicYears } from './academic-years';
import { classes } from './classes';
import { schools } from './schools';
import { students } from './students';

/**
 * AttendanceRecord status (own enum, no giant shared status enum).
 *
 * V1 daily attendance statuses (CLAUDE.md §9, BR-ATTENDANCE-*, domain-model
 * §40, Task 007 §2):
 *
 * - PRESENT — attended
 * - ABSENT  — absent without an accepted excuse
 * - LATE    — attended late
 * - EXCUSED — absent with an accepted excuse
 *
 * Future statuses (HALF_DAY, LEFT_EARLY, REMOTE, MEDICAL, SICK, OTHER …) are
 * NOT declared here: expanding the vocabulary is an explicit domain change
 * (Task 007 §2). No numeric score/percentage belongs to attendance
 * (Task 007 §17).
 */
export const attendanceStatus = pgEnum('attendance_status', ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);

/**
 * AttendanceRecord — the attendance state of ONE Student in ONE Class context
 * for ONE attendance date (BR-ATTENDANCE-002, domain-model §40, Task 007 §1).
 *
 * Conceptual identity:
 *
 *   Student + Class + Attendance Date → AttendanceRecord
 *
 * `attendance_date` is a calendar DATE (Task 007 §15): it is the attended day,
 * NOT the record creation timestamp. `created_at` records when the row was
 * written.
 *
 * The Class is Academic-Year specific (BR-CLASS-002, BR-ACADEMIC-004), so the
 * record preserves the AcademicYear context through the Class relationship.
 * A direct `academic_year_id` column IS stored here because there is a clear
 * database-integrity reason (Task 007 §5 exception): it lets the SAME-School
 * and Class↔AcademicYear integrity be enforced at the database level by the
 * triple composite FK `(school_id, academic_year_id, class_id)` — the exact
 * pattern used by `student_enrollments`, `teacher_assignments`,
 * `subject_results`/`period_results`/`annual_results` and `result_publications`.
 *
 * Tenant integrity (BR-INTEGRITY-002, ADR-007): every reference is guarded by
 * a composite FK against the same-School target, so a valid UUID from another
 * School can never make a record valid (Task 007 §4):
 *
 *   (school_id, student_id)       → students(school_id, id)
 *   (school_id, academic_year_id) → academic_years(school_id, id)
 *   (school_id, academic_year_id, class_id) → classes(school_id, academic_year_id, id)
 *
 * One logical daily record (BR-ATTENDANCE-003, Task 007 §3/§20): the UNIQUE
 * constraint `(school_id, class_id, student_id, attendance_date)` is the
 * logical identity. It is NOT `student_id + attendance_date` — a Student may
 * have historically attended different Classes, so the same Student + date in
 * different Classes must remain structurally possible (Task 007 §10).
 *
 * Student enrollment validity on the attendance date (Task 007 §6) —
 * `StudentEnrollment.effective_from <= attendance_date <= effective_until` —
 * CANNOT be expressed by a safe normal FK/constraint (it is a date-range join,
 * and triggers are prohibited). It is therefore NOT enforced here; it is an
 * Application-layer invariant, documented and exposed by the minimal domain
 * helper `apps/web/lib/modules/attendance/domain`. A historical AttendanceRecord
 * must remain valid even after the Student later transfers classes: it always
 * points to the Class it was recorded against and is never rewritten to the
 * Student's current Class (Task 007 §7, BR-GLOBAL-003).
 *
 * Corrections are allowed as an explicit business operation (BR-ATTENDANCE-005,
 * Task 007 §8/§29): `status` is mutable so ABSENT → EXCUSED does not require
 * delete + re-insert. No revision-history table exists yet (Task 007 §8).
 *
 * `note` is optional human-entered metadata (Task 007 §9). Business logic must
 * not be encoded into free text; it is NOT required for any status.
 *
 * DELETE behavior is RESTRICT everywhere (Task 007 §18): historical attendance
 * must never disappear because a Student is archived, a Class is closed, an
 * enrollment ends, a TeacherAssignment ends or a ParentStudent relationship
 * ends.
 */
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id').notNull(),
    classId: uuid('class_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    attendanceDate: date('attendance_date').notNull(),
    status: attendanceStatus('status').notNull().default('PRESENT'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'attendance_records_school_student_fk',
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'attendance_records_school_academic_year_fk',
      columns: [table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.schoolId, academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'attendance_records_school_year_class_fk',
      columns: [table.schoolId, table.academicYearId, table.classId],
      foreignColumns: [classes.schoolId, classes.academicYearId, classes.id],
    }).onDelete('restrict'),
    // Logical identity: one daily record per School + Class + Student + Date.
    unique('attendance_records_school_class_student_date_unique').on(
      table.schoolId,
      table.classId,
      table.studentId,
      table.attendanceDate,
    ),
    // Query-driven indexes (Task 007 §19). The (school_id, class_id) lookup is
    // already served by the unique constraint above (leftmost prefix), so no
    // separate index is added for it.
    index('attendance_records_school_date_idx').on(table.schoolId, table.attendanceDate),
    index('attendance_records_school_student_idx').on(table.schoolId, table.studentId),
    index('attendance_records_school_class_date_idx').on(table.schoolId, table.classId, table.attendanceDate),
    index('attendance_records_school_student_date_idx').on(table.schoolId, table.studentId, table.attendanceDate),
  ],
);