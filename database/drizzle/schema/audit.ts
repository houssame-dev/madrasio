import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { schools } from './schools';
import { users } from './users';
import { schoolMemberships } from './memberships';

export const auditScope = pgEnum('audit_scope', ['SCHOOL', 'PLATFORM']);
export const auditActorKind = pgEnum('audit_actor_kind', ['USER', 'SYSTEM']);

/** Accountability, not delivery or business snapshots. Application access is append/read only. */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: text('action').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    scope: auditScope('scope').notNull(),
    schoolId: uuid('school_id').references(() => schools.id, { onDelete: 'restrict' }),
    actorKind: auditActorKind('actor_kind').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'restrict' }),
    systemActor: text('system_actor'),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    metadata: jsonb('metadata').$type<Record<string, string>>().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'audit_events_school_actor_fk',
      columns: [table.schoolId, table.actorUserId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.userId],
    }).onDelete('restrict'),
    check(
      'audit_events_scope_check',
      sql`(${table.scope} = 'SCHOOL' and ${table.schoolId} is not null) or (${table.scope} = 'PLATFORM' and ${table.schoolId} is null)`,
    ),
    check(
      'audit_events_actor_check',
      sql`(${table.actorKind} = 'USER' and ${table.actorUserId} is not null and ${table.systemActor} is null) or (${table.actorKind} = 'SYSTEM' and ${table.actorUserId} is null and ${table.systemActor} is not null and ${table.systemActor} ~ '^[A-Z][A-Z0-9_]{0,63}$')`,
    ),
    check('audit_events_action_check', sql`${table.action} ~ '^[A-Z][A-Za-z0-9]{0,95}$'`),
    check('audit_events_resource_check', sql`${table.resourceType} ~ '^[A-Z][A-Za-z0-9]{0,63}$'`),
    check(
      'audit_events_metadata_check',
      sql`jsonb_typeof(${table.metadata}) = 'object' and octet_length(${table.metadata}::text) <= 1024`,
    ),
    index('audit_events_school_occurred_idx').on(table.schoolId, table.occurredAt, table.id),
    index('audit_events_resource_idx').on(
      table.schoolId,
      table.resourceType,
      table.resourceId,
      table.occurredAt,
      table.id,
    ),
  ],
).enableRLS();
