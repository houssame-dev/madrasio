import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { schools } from './schools';
import { users } from './users';

export const membershipRole = pgEnum('membership_role', [
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'TEACHER',
  'PARENT',
]);

export const membershipStatus = pgEnum('membership_status', ['ACTIVE', 'INACTIVE']);

/**
 * School membership — connects a User to a School.
 *
 * A user may belong to multiple schools; a school may have multiple members.
 * A user must not have a duplicate logical membership in the same school,
 * enforced by a unique constraint on (school_id, user_id).
 *
 * There is intentionally NO STUDENT role in V1.
 *
 * Deleting a School must not cascade into this table; access is disabled by
 * moving the membership to INACTIVE, preserving historical membership data.
 */
export const schoolMemberships = pgTable(
  'school_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    role: membershipRole('role').notNull(),
    status: membershipStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('school_memberships_school_user_unique').on(table.schoolId, table.userId),
    index('school_memberships_school_idx').on(table.schoolId),
    index('school_memberships_user_idx').on(table.userId),
  ],
);