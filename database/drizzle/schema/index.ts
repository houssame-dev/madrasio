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
 * The remaining V1 domain schema (students, teachers, parents, grades,
 * attendance, homework, announcements, notifications, etc.) is intentionally
 * not declared yet. Schemas will be added by the dedicated database schema
 * tasks, after the corresponding domain rules are locked in.
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