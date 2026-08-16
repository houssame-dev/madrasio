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
 * The remaining V1 domain schema (students, teachers, parents, academic
 * structure, classes, grades, attendance, homework, announcements,
 * notifications, etc.) is intentionally not declared yet. Schemas will be added
 * by the dedicated database schema tasks, after the corresponding domain rules
 * are locked in.
 *
 * Repositories live in each module's `infrastructure/` folder, never here.
 */

export * from './users';
export * from './schools';
export * from './memberships';