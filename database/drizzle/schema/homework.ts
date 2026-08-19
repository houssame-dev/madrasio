import { date, foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { academicPeriods } from './academic-periods';
import { academicYears } from './academic-years';
import { classes } from './classes';
import { schools } from './schools';
import { students } from './students';
import { subjects } from './subjects';
import { teachers } from './teachers';

/**
 * Homework lifecycle (own enum, no giant shared status enum — Task 008 §4/§27):
 *
 * - DRAFT     — not yet available to students (BR-HOMEWORK-004)
 * - PUBLISHED — visible/available to the intended students
 * - CLOSED    — no longer accepts normal submissions (NOT deleted)
 * - ARCHIVED  — historical/inactive
 *
 * Homework status is deliberately SEPARATE from submission status (Task 008 §4).
 */
export const homeworkStatus = pgEnum('homework_status', ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']);

/**
 * Homework — an academic assignment created by an authorized Teacher
 * (BR-HOMEWORK-001/002, domain-model §42, Task 008 §1/§2).
 *
 * Teacher authorization is NOT duplicated here: Teacher scope comes ONLY from
 * TeacherAssignment (ADR-009, Task 008 §3). The `teacher_id` is the creator
 * reference; whether that Teacher may create/manage this Homework is verified
 * by the future CreateHomework use case (TeacherAssignment + Permission +
 * Class + Subject + AcademicYear). No TeacherAssignment data is copied.
 *
 * Tenant integrity (BR-INTEGRITY-002, ADR-007, Task 008 §2/§23): every
 * reference is guarded by a composite FK against the same-School target, so a
 * valid UUID from another School can never make a Homework valid:
 *
 *   (school_id, teacher_id)       → teachers(school_id, id)
 *   (school_id, subject_id)       → subjects(school_id, id)
 *   (school_id, academic_year_id) → academic_years(school_id, id)
 *
 * AcademicPeriod↔AcademicYear integrity (Task 008 §18): the AcademicPeriod must
 * belong to the SAME AcademicYear as the Homework. Enforced by the triple
 * composite FK `(school_id, academic_year_id, academic_period_id)` — the exact
 * pattern used by the Grade/Result model.
 *
 * `due_date` is a calendar DATE (Task 008 §5), NOT a precise instant. No
 * database rule ties it to the AcademicPeriod dates (Task 008 §5): due-date
 * validity for the academic context is an Application-layer concern.
 *
 * The Homework does NOT carry a Class. The intended audience lives in
 * HomeworkTarget — the target relation is the source of truth for who the
 * Homework was assigned to (Task 008 §16). No mutable `current_class_id`.
 *
 * Homework is independent from Grades (BR-HOMEWORK-001/007, domain-model §45,
 * Task 008 §19/§36): NO FK to Assessment/Grade/Result entities exists here.
 * `description` is stored as plain TEXT — there is no shared rich-text
 * pipeline yet, so rich rendering is deferred (Task 008 §22). Title is NOT
 * unique (Task 008 §26).
 *
 * DELETE behavior is RESTRICT everywhere (Task 008 §24): Homework must never
 * disappear because a Teacher becomes inactive, a Class is closed, a Student
 * is archived, or a ParentStudent relationship ends.
 */
export const homework = pgTable(
  'homework',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    teacherId: uuid('teacher_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    academicPeriodId: uuid('academic_period_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: date('due_date').notNull(),
    status: homeworkStatus('status').notNull().default('DRAFT'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'homework_school_teacher_fk',
      columns: [table.schoolId, table.teacherId],
      foreignColumns: [teachers.schoolId, teachers.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'homework_school_subject_fk',
      columns: [table.schoolId, table.subjectId],
      foreignColumns: [subjects.schoolId, subjects.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'homework_school_academic_year_fk',
      columns: [table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.schoolId, academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'homework_school_year_period_fk',
      columns: [table.schoolId, table.academicYearId, table.academicPeriodId],
      foreignColumns: [academicPeriods.schoolId, academicPeriods.academicYearId, academicPeriods.id],
    }).onDelete('restrict'),
    // Composite FK target for HomeworkTarget / HomeworkSubmission same-School
    // integrity: `(school_id, homework_id)` → this unique.
    unique('homework_school_id_unique').on(table.schoolId, table.id),
    // Query-driven indexes (Task 008 §25).
    index('homework_school_status_idx').on(table.schoolId, table.status),
    index('homework_school_teacher_idx').on(table.schoolId, table.teacherId),
    index('homework_school_subject_idx').on(table.schoolId, table.subjectId),
    index('homework_school_year_period_idx').on(table.schoolId, table.academicYearId, table.academicPeriodId),
    index('homework_school_due_date_idx').on(table.schoolId, table.dueDate),
  ],
);

/**
 * HomeworkTarget type (own enum, V1 only — Task 008 §6/§7/§8).
 *
 * - CLASS — the Homework is assigned to one Class (AcademicYear-specific).
 *
 * No other target types (Student/Parent/Level/Track/School-wide) are declared:
 * expanding targeting is an explicit future domain change, not a schema
 * shortcut now.
 */
export const homeworkTargetType = pgEnum('homework_target_type', ['CLASS']);

/**
 * HomeworkTarget — the explicit, intended audience of one Homework
 * (BR-HOMEWORK-003, domain-model §43, Task 008 §6–§9).
 *
 *   Homework → HomeworkTarget → Class
 *
 * V1 supports Class targeting only. The target relation is the source of truth
 * for who the Homework was assigned to; Homework itself never carries a Class
 * (Task 008 §16).
 *
 * Tenant + academic-context integrity (Task 008 §8/§23): the target belongs to
 * the same School as the Homework, and its Class must belong to the SAME
 * AcademicYear as the Homework — enforced at the database level by the triple
 * composite FKs:
 *
 *   (school_id, homework_id)                → homework(school_id, id)
 *   (school_id, academic_year_id, class_id) → classes(school_id, academic_year_id, id)
 *
 * `academic_year_id` is stored on the target for the same database-integrity
 * reason as the attendance model (Task 008 §8 "where practical"): it lets
 * Class↔same-School AND Class↔same-AcademicYear integrity be enforced by the
 * established triple-FK pattern.
 *
 * Duplicate logical target prevention (Task 008 §9/§26): UNIQUE
 * `(school_id, homework_id, class_id)` — a Homework can never target the same
 * Class twice.
 *
 * Closing/archiving a Homework does NOT delete its targets (Task 008 §15/§24):
 * the Homework retains its historical target set. DELETE is RESTRICT.
 */
export const homeworkTargets = pgTable(
  'homework_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    homeworkId: uuid('homework_id').notNull(),
    targetType: homeworkTargetType('target_type').notNull().default('CLASS'),
    academicYearId: uuid('academic_year_id').notNull(),
    classId: uuid('class_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'homework_targets_school_homework_fk',
      columns: [table.schoolId, table.homeworkId],
      foreignColumns: [homework.schoolId, homework.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'homework_targets_school_year_class_fk',
      columns: [table.schoolId, table.academicYearId, table.classId],
      foreignColumns: [classes.schoolId, classes.academicYearId, classes.id],
    }).onDelete('restrict'),
    // Logical target identity: one Homework + one Class target.
    unique('homework_targets_school_homework_class_unique').on(table.schoolId, table.homeworkId, table.classId),
    // Query-driven indexes (Task 008 §25). The (school_id, homework_id) lookup
    // is already served by the unique constraint above (leftmost prefix).
    index('homework_targets_school_class_idx').on(table.schoolId, table.classId),
  ],
);

/**
 * HomeworkSubmission status (own enum, separate from Homework status and from
 * any Grade status — Task 008 §12/§27):
 *
 * - SUBMITTED — the Student submitted
 * - LATE      — submitted after the due date (determined by the business
 *               operation, Task 008 §13)
 * - REVIEWED  — an authorized Teacher reviewed it (basic reviewed state only;
 *               no review workflow, rubric, feedback or grading records yet,
 *               Task 008 §20)
 * - RETURNED  — returned to the Student (e.g. for revision)
 *
 * NOT_SUBMITTED is intentionally NOT stored as a status (Task 008 §27): a
 * Student who has not submitted simply has NO row in this table. Absence of a
 * submission row represents NOT_SUBMITTED; a row exists only once a submission
 * is made. This avoids storing redundant NOT_SUBMITTED placeholder state.
 *
 * No numeric grade/score exists here — a submission status must never become a
 * Grade status and no Homework→Grades FKs exist (Task 008 §12/§19/§36).
 */
export const homeworkSubmissionStatus = pgEnum('homework_submission_status', [
  'SUBMITTED',
  'LATE',
  'REVIEWED',
  'RETURNED',
]);

/**
 * HomeworkSubmission — one Student's submission for one Homework
 * (BR-HOMEWORK-005, domain-model §44, Task 008 §10–§15).
 *
 *   Homework + Student → HomeworkSubmission
 *
 * V1 assumes ONE logical current submission per Homework + Student
 * (Task 008 §11): enforced by UNIQUE `(school_id, homework_id, student_id)`.
 * No attempts table exists — multiple attempts would be a deliberate future
 * domain change.
 *
 * Tenant integrity (Task 008 §23): composite FKs guarantee the submission's
 * Homework and Student belong to the SAME School:
 *
 *   (school_id, homework_id) → homework(school_id, id)
 *   (school_id, student_id)  → students(school_id, id)
 *
 * `submitted_at` is a precise timestamptz instant (Task 008 §13). On-time/late
 * determination (submitted_at vs due_date) is an Application-layer concern and
 * is NOT encoded as a database CHECK (timestamps vs dates). The status may
 * represent LATE when the business operation determines it.
 *
 * Student eligibility for the target Class (enrollment in the Homework's
 * target Class, Task 008 §14) is an Application-layer invariant: it is NOT
 * enforced by database triggers. Historical integrity (Task 008 §15): a
 * submission stays attached to Homework + Student even after the Student
 * transfers classes, leaves the School or Parent relationships change — it is
 * never reassigned to a new Class (the Homework retains its target).
 *
 * `content` is optional plain text. No Grade/Assessment/Result IDs exist here
 * (Task 008 §10/§19). DELETE is RESTRICT (Task 008 §24).
 */
export const homeworkSubmissions = pgTable(
  'homework_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    homeworkId: uuid('homework_id').notNull(),
    studentId: uuid('student_id').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    content: text('content'),
    status: homeworkSubmissionStatus('status').notNull().default('SUBMITTED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'homework_submissions_school_homework_fk',
      columns: [table.schoolId, table.homeworkId],
      foreignColumns: [homework.schoolId, homework.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'homework_submissions_school_student_fk',
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
    }).onDelete('restrict'),
    // Logical submission identity: one current submission per Homework + Student.
    unique('homework_submissions_school_homework_student_unique').on(
      table.schoolId,
      table.homeworkId,
      table.studentId,
    ),
    // Query-driven indexes (Task 008 §25). The (school_id, homework_id) and
    // (school_id, homework_id, student_id) lookups are already served by the
    // unique constraint above (leftmost prefixes).
    index('homework_submissions_school_student_idx').on(table.schoolId, table.studentId),
    index('homework_submissions_school_status_idx').on(table.schoolId, table.status),
  ],
);