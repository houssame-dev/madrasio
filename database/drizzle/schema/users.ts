import { sql } from 'drizzle-orm';
import { check, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { authUsers } from './auth';

/**
 * Application User lifecycle status (Task 014.1).
 *
 * Answers "may this application User operate AT ALL?" — globally, across every
 * School. This is deliberately DISTINCT from SchoolMembership status, which
 * answers "may this User operate in THIS School?". Both must pass for any
 * protected operation:
 *
 *   Authenticated → users.status = ACTIVE → ACTIVE membership → current School
 *
 * - ACTIVE    → normal application operation allowed (subject to membership +
 *   authorization)
 * - SUSPENDED → current application operation denied globally; historical
 *   records remain
 * - DISABLED  → current application operation denied globally; historical
 *   records remain
 *
 * Deactivation is a LIFECYCLE state, never destructive deletion. A changed
 * status must not delete memberships, teacher/parent profiles, results,
 * announcements, notifications, or historical authorship. The enum type is
 * named `user_status`; the column is `users.status` (project naming: snake_case
 * column, singular enum type).
 */
export const userStatus = pgEnum('user_status', ['ACTIVE', 'SUSPENDED', 'DISABLED']);

/**
 * Application user.
 *
 * Per ADR-018, `id` is the SAME UUID as the Supabase Auth user
 * (`auth.users.id`), enforced with a foreign key. The application must never
 * store passwords, hashes, sessions, or Supabase credentials here — those are
 * owned by Supabase Auth. `email` is only the canonical application lookup
 * projection accepted by ADR-019; Auth remains the source identity and exact
 * UUID/email verification is required before reuse.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    status: userStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('users_email_unique').on(table.email),
    check(
      'users_email_canonical_check',
      sql`${table.email} = lower(btrim(${table.email})) and length(${table.email}) > 0`,
    ),
  ],
);
