/**
 * Schema entrypoint.
 *
 * Identity + Tenant foundation:
 * - `users` — application user (shared UUID with Supabase Auth, ADR-018),
 *   canonical email lookup projection (ADR-019), and global lifecycle `status`
 *   (ACTIVE / SUSPENDED / DISABLED, Task 014.1)
 * - `schools` — tenant
 * - `school_memberships` — User ↔ School connection with V1 roles
 *
 * The `auth.users` table is Supabase-owned. We reference it via
 * `drizzle-orm/supabase`'s `authUsers` (see `./auth`), but it is intentionally
 * NOT exported from this entrypoint so `drizzle-kit generate` never creates
 * Supabase Auth objects (`auth` schema / `auth.users`).
 *
 * Academic Structure Foundation (Task 003):
 * - `academic_years` — School-scoped academic year
 * - `academic_periods` — period within one AcademicYear
 * - `stages` / `levels` / `tracks` — School academic structure
 * - `curricula` / `curriculum_versions` / `curriculum_subjects` — versioned
 *   curriculum configuration (coefficients live here, never on Subject)
 * - `subjects` — School-scoped subject identity (no coefficient)
 * - `classes` — Academic-Year-specific class context
 *
 * People + Access Scope Foundation (Task 004):
 * - `students` — School-scoped academic identity (no User account in V1)
 * - `student_enrollments` — ONLY source of truth for placement history
 * - `teachers` — School-scoped academic profile (optional User link)
 * - `teacher_assignments` — ONLY source of truth for Teacher academic scope
 * - `parents` — School-scoped parent/guardian profile (optional User link)
 * - `parent_students` — Parent ↔ Student relationship (Parent child scope)
 *
 * Grades — Grading Configuration Foundation (Task 006A, ADR-011):
 * - `grading_configurations` — School-scoped logical grading configuration
 * - `grading_configuration_versions` — immutable ruleset snapshots (DRAFT /
 *   ACTIVE / ARCHIVED lifecycle) with a JSONB `rules` payload
 *
 * Grades — Gradebook + Assessment Foundation (Task 006B):
 * - `gradebooks` — grading context for School + AcademicYear + AcademicPeriod +
 *   Class + Subject bound to ONE specific GradingConfigurationVersion
 * - `assessments` — one evaluation inside exactly one Gradebook
 *
 * Grades — Grade + Result Model (Task 006C):
 * - `grades` — a Student's raw/recorded outcome for exactly one Assessment
 *   (VALID / MISSING / ABSENT / EXCUSED state, not Gradebook status)
 * - `subject_results` — calculated result for one Student + Subject + Period
 * - `period_results` — aggregate result for one Student + AcademicPeriod
 * - `annual_results` — annual result across the year (distinct from Period)
 *   All three results bind the exact GradingConfigurationVersion used.
 *
 * Attendance Foundation (Task 007):
 * - `attendance_records` — one Student's attendance state in one Class context
 *   for one attendance DATE (PRESENT / ABSENT / LATE / EXCUSED), preserving
 *   School + AcademicYear context through composite FKs.
 *
 * Homework Foundation (Task 008):
 * - `homework` — Teacher-created academic assignment with School/Teacher/
 *   Subject/AcademicYear/AcademicPeriod context (DRAFT / PUBLISHED / CLOSED /
 *   ARCHIVED). Independent from Grades — no Grade/Assessment/Result FKs.
 * - `homework_targets` — explicit intended audience (CLASS targeting only),
 *   the source of truth for who the Homework was assigned to.
 * - `homework_submissions` — one Student's submission per Homework (SUBMITTED /
 *   LATE / REVIEWED / RETURNED; NOT_SUBMITTED = absence of a row).
 *
 * Announcements Foundation (Task 009):
 * - `announcements` — the logical communication object (no publishable content;
 *   DRAFT / SCHEDULED / PUBLISHED / ARCHIVED lifecycle, created_by author User)
 * - `announcement_versions` — immutable-content snapshots of one Announcement
 *   (version_number unique WITHIN an Announcement, title + plain-text body)
 * - `announcement_targets` — explicit audience (PARENTS | TEACHERS) + target
 *   (SCHOOL | CLASS) combinations for one Version, with duplicate-logical-target
 *   prevention via partial unique indexes
 * - `announcement_publications` — explicit publication of ONE exact Version
 *   (SCHEDULED → PUBLISHED; per-Announcement publication sequence +
 *   idempotency_key unique)
 * - `publication_recipient_snapshots` — immutable write-once recipient list per
 *   publication (dedup by publication_id + recipient_user_id; no updated_at).
 *
 * Same-School integrity uses the established composite-FK strategy; Class
 * targets use the triple `(school_id, academic_year_id, class_id)` FK so a
 * Version can never target another School's Class. Authors/publishers/
 * recipients reference `users.id` directly (Users are platform identity,
 * ADR-018); active SchoolMembership validation is Application-layer.
 *
 * Notifications Foundation (Task 010):
 * - `notifications` — persisted, school-scoped delivery records (ADR-013).
 *   The database record is the source of truth for delivery; realtime is NOT
 *   mandatory in V1 (ADR-014). Produced ONLY by the Notifications processor
 *   from durable `outbox_events` (ADR-012, `./outbox`); the recipient must
 *   hold a SchoolMembership in the SAME School (composite FK on
 *   `school_memberships(school_id, user_id)`, ADR-007), and UNIQUE
 *   `(source_event_id, recipient_user_id)` makes processing idempotent
 *   (at-least-once, PRD.md §32).
 *
 * The remaining V1 domain schema (files, etc.) is intentionally not declared
 * yet. Schemas will be added by the dedicated database schema tasks, after
 * the corresponding domain rules are locked in.
 *
 * Repositories live in each module's `infrastructure/` folder, never here.
 */

export * from './users';
export * from './schools';
export * from './memberships';
export * from './academic-years';
export * from './academic-periods';
export * from './academic-structure';
export * from './curricula';
export * from './subjects';
export * from './classes';
export * from './students';
export * from './teachers';
export * from './parents';
export * from './enrollments';
export * from './assignments';
export * from './parent-students';
export * from './grading';
export * from './gradebooks';
export * from './assessments';
export * from './grades';
export * from './results';
export * from './publications';
export * from './outbox';
export * from './attendance';
export * from './homework';
export * from './announcements';
export * from './notifications';
