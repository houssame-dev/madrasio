/**
 * Reference to the Supabase-managed `auth.users` table.
 *
 * Supabase owns the real `auth.users` table and all of its columns. We use the
 * official existing-table reference from `drizzle-orm/supabase` (ADR-018) so
 * the application `users` table can express the foreign key:
 *
 *   auth.users.id = public.users.id
 *
 * This table is NOT exported from the schema entrypoint (`index.ts`), so
 * `drizzle-kit generate` never emits `CREATE SCHEMA "auth"` or
 * `CREATE TABLE "auth"."users"` — those objects belong to Supabase. The
 * application must never write to this reference.
 */
export { authUsers } from 'drizzle-orm/supabase';