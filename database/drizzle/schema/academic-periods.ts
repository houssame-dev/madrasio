import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { academicYears } from './academic-years';

/**
 * AcademicPeriod lifecycle (own enum, no giant shared status enum).
 */
export const academicPeriodStatus = pgEnum('academic_period_status', ['PLANNED', 'ACTIVE', 'CLOSED']);

/**
 * AcademicPeriod — a configurable period within one AcademicYear
 * (BR-ACADEMIC-002).
 *
 * Not all schools use three terms; the `sequence` + `name` allow any period
 * structure. Ordering within an AcademicYear is deterministic and unique
 * (`(academic_year_id, sequence)`), and period identity is unique too
 * (`(academic_year_id, name)`).
 *
 * IMPORTANT: an AcademicPeriod is NOT an AnnualResult.
 *
 * Tenant integrity: the `(school_id, academic_year_id)` composite foreign key
 * references `academic_years(school_id, id)`, so a period can never reference
 * another School's AcademicYear even with a valid UUID.
 */
export const academicPeriods = pgTable(
  'academic_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    name: text('name').notNull(),
    sequence: integer('sequence').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    status: academicPeriodStatus('status').notNull().default('PLANNED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'academic_periods_school_year_fk',
      columns: [table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.schoolId, academicYears.id],
    }).onDelete('restrict'),
    uniqueIndex('academic_periods_year_sequence_unique').on(table.academicYearId, table.sequence),
    uniqueIndex('academic_periods_year_name_unique').on(table.academicYearId, table.name),
    index('academic_periods_school_year_idx').on(table.schoolId, table.academicYearId),
    check('academic_periods_date_range_check', sql`${table.startDate} < ${table.endDate}`),
  ],
);