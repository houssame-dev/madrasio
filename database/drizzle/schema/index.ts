/**
 * Schema entrypoint.
 *
 * Identity + Tenant foundation:
 * - `users` — application user (shared UUID with Supabase Auth, ADR-018)
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
 * Same-School integrity is enforced with composite foreign keys on the
 * `(school_id, id)` unique targets, and Class↔AcademicYear compatibility is
 * enforced with the triple FK `(school_id, academic_year_id, class_id)`.
 * Active-duplicate prevention uses partial unique indexes
 * (`WHERE status = 'ACTIVE'`).
 *
 * The remaining V1 domain schema (grades, attendance, homework, announcements,
 * notifications, etc.) is intentionally not declared yet. Schemas will be
 * added by the dedicated database schema tasks, after the corresponding domain
 * rules are locked in.
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