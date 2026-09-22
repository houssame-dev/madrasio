import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { schoolMemberships } from './memberships';
import { schools } from './schools';
import { users } from './users';

/**
 * V1 notification type vocabulary (Task 010 §3/§6).
 *
 * Event-oriented and deliberately small. A notification is a durable record
 * that a domain EVENT happened; the type names the event.
 *
 * - ANNOUNCEMENT_PUBLISHED — an AnnouncementPublication was completed
 * - RESULT_PUBLISHED      — a Result was published (initial publication)
 * - RESULT_REVISED        — a Result was re-published as a revision
 *
 * No ATTENDANCE_ALERT / HOMEWORK / PUSH / EMAIL / PAYMENT / CHAT types in V1
 * (Task 010 §3). No STUDENT recipients in V1 (no Student login).
 */
export const notificationType = pgEnum('notification_type', [
  'ANNOUNCEMENT_PUBLISHED',
  'RESULT_PUBLISHED',
  'RESULT_REVISED',
]);

/**
 * V1 notification source kinds (Task 010 §4).
 *
 * Explicit `source_type` + `source_id` (no polymorphic FK, documented in the
 * table header). Each source type maps to exactly the types that reference it
 * via the `notifications_type_source_check` CHECK.
 *
 * A notification NEVER grants access to its source — resolving the source
 * still requires the normal server-side authorization pipeline (Task 010
 * §4/§31, BR-NOTIFICATION-006).
 */
export const notificationSourceType = pgEnum('notification_source_type', [
  'ANNOUNCEMENT_PUBLICATION',
  'RESULT_PUBLICATION',
]);

/**
 * Notification — a persisted, school-scoped notification delivered to one
 * authenticated User (domain-model §63, Task 010 §2).
 *
 * The notification DATABASE record is the source of truth for delivery
 * (ADR-013, PRD.md §12); realtime/queue delivery is NOT. There is no
 * realtime/WebSocket/email/SMS/push channel in V1 (ADR-014/ADR-015).
 *
 * PROCESSING SOURCE (Task 010 §13): notifications are produced by the
 * Notifications processor, which consumes durable `outbox_events`
 * (ADR-012). The processor is the ONLY producer. There is no direct
 * notification creation API.
 *
 * TENANT + RECIPIENT INTEGRITY (Task 010 §16, ADR-007): the composite FK
 * `(school_id, recipient_user_id)` → `school_memberships(school_id, user_id)`
 * guarantees at the database level that a notification can only ever target a
 * User who has a SchoolMembership in the SAME School. `school_memberships`
 * exposes a unique on `(school_id, user_id)` (its one-membership-per-School
 * invariant) and rows are never deleted (INACTIVE = disabled), so the FK
 * (a) is valid, and (b) keeps historical notifications intact even after a
 * membership is deactivated (Task 010 §23).
 *
 * IDEMPOTENCY (Task 010 §12/§25, BR-NOTIFICATION-005): UNIQUE
 * `(source_event_id, recipient_user_id)` — one logical event + one recipient
 * ⇒ at most one notification. `source_event_id` is the outbox_events.id of the
 * consumed event. It deliberately has NO FK to `outbox_events` because the
 * outbox is infrastructure that may be pruned; the unique is a plain value
 * constraint. Notifications are inserted with `ON CONFLICT DO NOTHING`, so a
 * retry of a partially-observed event can never duplicate a logical
 * notification.
 *
 * SOURCE REFERENCE (Task 010 §4): `source_type` + `source_id` point at the
 * source-domain record (an AnnouncementPublication id or a ResultPublication
 * id). The combination is documented per type; the CHECK below guarantees
 * notification_type ↔ source_type consistency. There is NO polymorphic FK:
 * source lookups stay in the owning module and require school-scoped
 * authorization.
 *
 * CONTENT (Task 010 §7/§21): `title` + `body` are written ONCE from the
 * immutable source-domain snapshot at processing time (AnnouncementVersion for
 * announcements). Content is NOT re-derived from live source rows, so later
 * revisions/archival cannot change an already-created notification.
 *
 * READ STATE (Task 010 §8/§26): `read_at IS NULL` ⇒ unread. `read_at` is set
 * only by the recipient (Application layer), never moves backward, and marking
 * an already-read notification is idempotent. There is no UNREAD flag — NULL
 * IS the unread state.
 *
 * DELETION (Task 010 §28): RESTRICT on schools/users. Notifications survive
 * source archival/revision. School-scoped lookup is always by
 * `recipient_user_id` + `school_id` (BR-NOTIFICATION-002/004).
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    notificationType: notificationType('notification_type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    sourceEventId: uuid('source_event_id').notNull(),
    sourceType: notificationSourceType('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Tenant integrity: the recipient MUST hold a SchoolMembership in THIS
    // School (Task 010 §16, ADR-007). The membership FK target exists via the
    // school_memberships (school_id, user_id) unique. INACTIVE rows satisfy
    // the FK, so historical notifications survive membership deactivation
    // (Task 010 §23).
    foreignKey({
      name: 'notifications_school_membership_fk',
      columns: [table.schoolId, table.recipientUserId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.userId],
    }).onDelete('restrict'),
    // Idempotency (Task 010 §12/§25): one event + one recipient ⇒ one
    // notification. Processor uses ON CONFLICT DO NOTHING on this.
    unique('notifications_source_event_recipient_unique').on(table.sourceEventId, table.recipientUserId),
    // Query-driven indexes (Task 010 §24). (school_id, recipient_user_id,
    // read_at) covers list + unread-count via its leftmost prefix.
    index('notifications_school_recipient_read_idx').on(table.schoolId, table.recipientUserId, table.readAt),
    index('notifications_school_created_at_idx').on(table.schoolId, table.createdAt),
    index('notifications_school_type_idx').on(table.schoolId, table.notificationType),
    // Notification type ↔ source kind invariant (Task 010 §6).
    check(
      'notifications_type_source_check',
      sql`(
        (${table.notificationType} = 'ANNOUNCEMENT_PUBLISHED' AND ${table.sourceType} = 'ANNOUNCEMENT_PUBLICATION') OR
        (${table.notificationType} IN ('RESULT_PUBLISHED', 'RESULT_REVISED') AND ${table.sourceType} = 'RESULT_PUBLICATION')
      )`,
    ),
  ],
);