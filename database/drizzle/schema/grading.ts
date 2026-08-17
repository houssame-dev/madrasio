import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { schools } from './schools';

/**
 * Grading Configuration Foundation (Task 006A, ADR-011).
 *
 * Grading rules are contextual and versioned:
 *
 *   GradingConfiguration
 *          ↓
 *   GradingConfigurationVersion
 *
 * Historical academic calculations must stay associated with the exact
 * configuration/version that was applicable when they were calculated or
 * published. Changing the current configuration must NEVER silently rewrite
 * historical academic results (BR-GRADE-013, BR-HISTORY-004).
 *
 * Per-entity status enums only — no giant global status enum.
 */

export const gradingConfigurationStatus = pgEnum('grading_configuration_status', ['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export const gradingConfigurationVersionStatus = pgEnum('grading_configuration_version_status', ['DRAFT', 'ACTIVE', 'ARCHIVED']);

/**
 * GradingConfiguration — a logical, School-scoped grading configuration.
 *
 * It is the reusable configuration object, NOT a historical calculation
 * snapshot. It may describe concepts such as assessment weighting, subject
 * weighting/coefficient usage, period/annual calculation strategies, rounding,
 * passing thresholds and required/optional assessment semantics — carried by
 * its versions.
 *
 * Tenant integrity: belongs to exactly one School. `(school_id, id)` is a
 * unique composite target so versions can never attach to another School's
 * configuration. Duplicate logical configuration names within one School are
 * rejected; the same name in a different School is allowed (BR-INTEGRITY-002).
 */
export const gradingConfigurations = pgTable(
  'grading_configurations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    status: gradingConfigurationStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('grading_configurations_school_name_unique').on(table.schoolId, table.name),
    unique('grading_configurations_school_id_unique').on(table.schoolId, table.id),
    index('grading_configurations_school_status_idx').on(table.schoolId, table.status),
  ],
);

/**
 * GradingConfigurationVersion — one immutable ruleset snapshot of a
 * GradingConfiguration (ADR-011).
 *
 * A version is independently addressable and historically stable. Once a
 * version has been used by an academic calculation or published result its
 * semantic content must not be changed; future changes create a NEW version.
 * Lifecycle status carries this: DRAFT (editable) → ACTIVE (currently usable)
 * → ARCHIVED (historical). Archiving preserves the row (BR-HISTORY-004).
 *
 * The `rules` JSONB payload is configuration metadata/rules only — it must
 * never contain Grade/Assessment/Student/Result rows (those remain relational
 * entities). The exact formula is intentionally not hard-coded yet (the full
 * calculation engine arrives with the Grades domain tasks); the payload shape
 * is documented in `apps/web/lib/modules/grades/domain/grading-rules.ts` and
 * validated there. The database enforces structural JSONB integrity.
 *
 * Version identity: an integer version number per configuration. Duplicate
 * version numbers within one GradingConfiguration are rejected; the same
 * number under different Configurations is allowed (no global counter).
 *
 * Current-version invariant: at most ONE version per GradingConfiguration may
 * have status = ACTIVE at a given time (partial unique index on
 * `grading_configuration_id` WHERE status = 'ACTIVE'). This is a per-
 * configuration constraint, NOT a school-wide one — every configuration may
 * have its own single ACTIVE version while retaining any number of DRAFT /
 * ARCHIVED historical versions.
 *
 * Tenant integrity: the composite FK `(school_id, grading_configuration_id)`
 * references `grading_configurations(school_id, id)`, so a version can never
 * belong to another School's configuration. `(school_id, id)` is a unique
 * composite target so future Gradebook/Result references can preserve School
 * context without cross-tenant shortcuts (BR-GRADE-011).
 */
export const gradingConfigurationVersions = pgTable(
  'grading_configuration_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    gradingConfigurationId: uuid('grading_configuration_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    status: gradingConfigurationVersionStatus('status').notNull().default('DRAFT'),
    rules: jsonb('rules').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'grading_configuration_versions_school_config_fk',
      columns: [table.schoolId, table.gradingConfigurationId],
      foreignColumns: [gradingConfigurations.schoolId, gradingConfigurations.id],
    }).onDelete('restrict'),
    uniqueIndex('grading_configuration_versions_config_number_unique').on(
      table.gradingConfigurationId,
      table.versionNumber,
    ),
    uniqueIndex('grading_configuration_versions_one_active_unique')
      .on(table.gradingConfigurationId)
      .where(sql`${table.status} = 'ACTIVE'`),
    unique('grading_configuration_versions_school_id_unique').on(table.schoolId, table.id),
    index('grading_configuration_versions_school_config_idx').on(
      table.schoolId,
      table.gradingConfigurationId,
    ),
    index('grading_configuration_versions_config_status_idx').on(
      table.gradingConfigurationId,
      table.status,
    ),
    check(
      'grading_configuration_versions_number_check',
      sql`${table.versionNumber} > 0`,
    ),
    check(
      'grading_configuration_versions_rules_object_check',
      sql`jsonb_typeof(${table.rules}) = 'object'`,
    ),
  ],
);
