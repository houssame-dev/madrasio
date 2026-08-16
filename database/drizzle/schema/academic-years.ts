import { sql } from 'drizzle-orm';
import { check, date, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { schools } from './schools';

/**
 * AcademicYear lifecycle (own enum, no giant shared status enum).
 *
 * - PLANNED  — upcoming / not yet started
 * - ACTIVE   — current
 * - CLOSED   — finished; no longer the current year
 * - ARCHIVED — fully historical; row must never be deleted while history exists
 */
export const academicYearStatus = pgEnum('academic_year_status', ['PLANNED', 'ACTIVE', 'CLOSED', 'ARCHIVED']);

/**
 * AcademicYear — a School's academic year (BR-ACADEMIC-001).
 *
 * School-scoped. Two different Schools may use the same year label
 * (e.g. "2025/2026"); within one School the label must be unique.
 *
 * The `(school_id, id)` unique index exists so that same-School integrity can
 * be enforced with composite foreign keys from AcademicPeriod (and later
 * enrollment/class contexts) — a valid UUID from another School must not make
 * a cross-school relationship valid.
 */
export const academicYears = pgTable(
  'academic_years',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    status: academicYearStatus('status').notNull().default('PLANNED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('academic_years_school_name_unique').on(table.schoolId, table.name),
    // Table-level UNIQUE constraint (emitted inline in CREATE TABLE) so the
    // composite foreign keys referencing (school_id, id) can be created after
    // it. A standalone unique index would be emitted later in the migration
    // and PostgreSQL would reject the FK ("no unique constraint matching").
    unique('academic_years_school_id_unique').on(table.schoolId, table.id),
    check('academic_years_date_range_check', sql`${table.startDate} < ${table.endDate}`),
  ],
);