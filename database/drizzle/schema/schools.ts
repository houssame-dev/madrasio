import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const schoolStatus = pgEnum('school_status', ['ACTIVE', 'INACTIVE']);

/**
 * School — the tenant boundary (ADR-007).
 *
 * No billing/subscription or payment fields in V1. Status provides a clear
 * lifecycle without destroying data.
 */
export const schools = pgTable('schools', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: schoolStatus('status').notNull().default('ACTIVE'),
  timezone: text('timezone').notNull().default('UTC'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});