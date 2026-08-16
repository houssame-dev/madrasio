import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { authUsers } from './auth';

/**
 * Application user.
 *
 * Per ADR-018, `id` is the SAME UUID as the Supabase Auth user
 * (`auth.users.id`), enforced with a foreign key. The application must never
 * store passwords, hashes, sessions, or Supabase credentials here — those are
 * owned by Supabase Auth. Profile fields stay minimal until V1 domain profiles
 * (teacher/parent/school admin) require them.
 */
export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});