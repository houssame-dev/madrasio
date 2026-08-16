import { pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { schools } from './schools';

export const subjectStatus = pgEnum('subject_status', ['ACTIVE', 'INACTIVE']);

/**
 * Subject — School-scoped subject identity (BR-SUBJECT-001).
 *
 * IMPORTANT: Subject must NOT own the academic coefficient (BR-SUBJECT-002).
 * The coefficient belongs to CurriculumSubject. No `coefficient` column here.
 *
 * Duplicate logical Subject identity within the same School (natural key:
 * `name`) is rejected. `code` is an optional, non-unique presentation helper.
 */
export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    code: text('code'),
    status: subjectStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('subjects_school_name_unique').on(table.schoolId, table.name),
    unique('subjects_school_id_unique').on(table.schoolId, table.id),
  ],
);