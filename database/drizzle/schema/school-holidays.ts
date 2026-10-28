import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { schools } from './schools';
import { users } from './users';

export const schoolHolidayType = pgEnum('school_holiday_type', ['PUBLIC_HOLIDAY', 'SCHOOL_HOLIDAY']);
/** School civil-date override. Removal is a tombstone; audit/history never cascades. */
export const schoolHolidays = pgTable('school_holidays', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  name: text('name').notNull(), type: schoolHolidayType('type').notNull(),
  startDate: date('start_date').notNull(), endDate: date('end_date').notNull(),
  description: text('description'), revision: integer('revision').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedBy: uuid('updated_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
}, t => [
  check('school_holidays_dates_check', sql`${t.startDate} <= ${t.endDate}`),
  check('school_holidays_name_check', sql`length(btrim(${t.name})) between 1 and 160`),
  check('school_holidays_description_check', sql`${t.description} is null or length(${t.description}) <= 2000`),
  check('school_holidays_revision_check', sql`${t.revision} > 0`),
  index('school_holidays_school_range_idx').on(t.schoolId, t.startDate, t.endDate).where(sql`${t.removedAt} is null`),
]);
