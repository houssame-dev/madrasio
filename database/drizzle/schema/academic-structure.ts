import { foreignKey, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { schools } from './schools';

/**
 * Stage / Level / Track statuses (per-entity enums, no giant shared enum).
 */
export const stageStatus = pgEnum('stage_status', ['ACTIVE', 'INACTIVE']);
export const levelStatus = pgEnum('level_status', ['ACTIVE', 'INACTIVE']);
export const trackStatus = pgEnum('track_status', ['ACTIVE', 'INACTIVE']);

/**
 * Stage — School-scoped educational stage (e.g. Primary, Middle, Secondary).
 *
 * No global system-wide Stage rows. Names/identities must not be duplicated
 * within one School; `sequence` provides deterministic ordering.
 */
export const stages = pgTable(
  'stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    sequence: integer('sequence').notNull(),
    status: stageStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('stages_school_name_unique').on(table.schoolId, table.name),
    unique('stages_school_id_unique').on(table.schoolId, table.id),
  ],
);

/**
 * Level — belongs to one Stage (and therefore indirectly to one School).
 *
 * A Level must not reference a Stage from another School: the composite FK
 * `(school_id, stage_id)` references `stages(school_id, id)`.
 * Duplicate logical Levels inside the same Stage are rejected.
 */
export const levels = pgTable(
  'levels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    stageId: uuid('stage_id').notNull(),
    name: text('name').notNull(),
    sequence: integer('sequence').notNull(),
    status: levelStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'levels_school_stage_fk',
      columns: [table.schoolId, table.stageId],
      foreignColumns: [stages.schoolId, stages.id],
    }).onDelete('restrict'),
    uniqueIndex('levels_stage_name_unique').on(table.stageId, table.name),
    unique('levels_school_id_unique').on(table.schoolId, table.id),
    index('levels_school_stage_idx').on(table.schoolId, table.stageId),
  ],
);

/**
 * Track — OPTIONAL School-scoped specialization/pathway.
 *
 * Track must not be forced onto academic models that do not use it; it stays
 * optional in downstream entities such as Class (`track_id` is nullable).
 * Duplicate logical Track definitions within the same School are rejected.
 */
export const tracks = pgTable(
  'tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    sequence: integer('sequence').notNull(),
    status: trackStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tracks_school_name_unique').on(table.schoolId, table.name),
    unique('tracks_school_id_unique').on(table.schoolId, table.id),
  ],
);