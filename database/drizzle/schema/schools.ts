import { sql } from 'drizzle-orm';
import { check, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const schoolStatus = pgEnum('school_status', ['ACTIVE', 'INACTIVE']);

/**
 * School — the tenant boundary (ADR-007).
 *
 * Finance currency is fixed once monetary records exist. Status provides
 * a clear lifecycle without destroying data.
 */
export const schools = pgTable('schools', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: schoolStatus('status').notNull().default('ACTIVE'),
  timezone: text('timezone').notNull().default('UTC'),
  financeCurrency: text('finance_currency').notNull().default('MAD'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique('schools_finance_currency_unique').on(t.id, t.financeCurrency),
  check('schools_finance_currency_check', sql`${t.financeCurrency} in ('MAD','EUR','USD','GBP')`),
]);
