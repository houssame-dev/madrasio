import { index, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { schools } from './schools';
import { users } from './users';

/**
 * Teacher lifecycle (own enum, no giant shared status enum).
 *
 * - ACTIVE    — currently teaching in the School
 * - INACTIVE  — temporarily not active; historical assignments remain valid
 * - ARCHIVED  — fully historical; row must never be deleted while assignments
 *               (or any academic history) reference it
 *
 * A Teacher can become inactive/archived without deleting historical
 * assignments (BR-TEACHER-005/006).
 */
export const teacherStatus = pgEnum('teacher_status', ['ACTIVE', 'INACTIVE', 'ARCHIVED']);

/**
 * Teacher — the academic profile of a teacher within one School
 * (BR-TEACHER-001, domain-model §23).
 *
 * A Teacher MAY be associated with an authenticated User via the existing
 * shared-UUID identity foundation (ADR-018): `user_id` references `users.id`
 * which is the same UUID as `auth.users.id`. Identity and Teacher domain
 * concepts stay separate:
 *
 *   User ─── optional ───▶ Teacher
 *
 * - a Teacher can exist without a User account (no forced equality)
 * - a User can have a Teacher profile, a Parent profile, or both, in one or
 *   more Schools — no universal `profile_type` discriminator is added
 * - no authentication credentials are stored here
 * - the existence of a User does NOT imply that User belongs to the profile's
 *   School; future authorization still relies on active SchoolMembership
 *   (BR-AUTHZ / BR-SCHOOL). The schema preserves that separation.
 *
 * `user_id` uses ON DELETE RESTRICT (consistent with Task 002 memberships):
 * deleting a User must not silently destroy a Teacher profile.
 *
 * Teacher scope comes ONLY from TeacherAssignment (ADR-009, BR-TEACHER-002),
 * never from a mutable field here.
 *
 * `teacher_code` is an OPTIONAL School-scoped identifier (unique within a
 * School, never globally). No national/government identifier is stored.
 */
export const teachers = pgTable(
  'teachers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    teacherCode: text('teacher_code'),
    status: teacherStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('teachers_school_code_unique').on(table.schoolId, table.teacherCode),
    unique('teachers_school_id_unique').on(table.schoolId, table.id),
    index('teachers_school_status_idx').on(table.schoolId, table.status),
    index('teachers_user_idx').on(table.userId),
  ],
);