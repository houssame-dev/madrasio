import { index, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { schools } from './schools';
import { users } from './users';

/**
 * Parent lifecycle (own enum, no giant shared status enum).
 *
 * - ACTIVE    — currently linked to the School context
 * - INACTIVE  — temporarily not active
 * - ARCHIVED  — fully historical; row must never be deleted while
 *               ParentStudent history references it
 *
 * Ending/deactivating a Parent must not delete historical ParentStudent
 * relationships (BR-PARENT-004).
 */
export const parentStatus = pgEnum('parent_status', ['ACTIVE', 'INACTIVE', 'ARCHIVED']);

/**
 * Parent — the parent/guardian profile within one School
 * (BR-PARENT-001, domain-model §26).
 *
 * A Parent MAY be associated with an authenticated User via the existing
 * shared-UUID identity foundation (ADR-018): `user_id` references `users.id`
 * (same UUID as `auth.users.id`). Identity and Parent domain data stay
 * separate — no credentials, no universal `profile_type` discriminator, and a
 * User's existence never implies School membership for the profile's School.
 *
 * `user_id` uses ON DELETE RESTRICT (consistent with Task 002 memberships):
 * deleting a User must not silently destroy a Parent profile.
 *
 * Parent access to Students flows exclusively through ParentStudent
 * (BR-PARENT-002, domain-model §27/§28).
 *
 * `parent_code` is an OPTIONAL School-scoped identifier (unique within a
 * School, never globally). No national/government identifier is stored.
 */
export const parents = pgTable(
  'parents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    parentCode: text('parent_code'),
    status: parentStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('parents_school_code_unique').on(table.schoolId, table.parentCode),
    unique('parents_school_id_unique').on(table.schoolId, table.id),
    index('parents_school_status_idx').on(table.schoolId, table.status),
    index('parents_user_idx').on(table.userId),
  ],
);