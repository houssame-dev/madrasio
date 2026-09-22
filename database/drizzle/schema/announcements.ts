import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { classes } from './classes';
import { schools } from './schools';
import { users } from './users';

/**
 * Announcement lifecycle (own enum, no giant shared status enum — Task 009 §2):
 *
 * - DRAFT     — being authored, not yet available to anyone
 * - SCHEDULED — a scheduled publication exists for the Announcement (Task 009 §2)
 * - PUBLISHED — at least one publication has been completed
 * - ARCHIVED  — historical; versions/publications/snapshots are never deleted
 *
 * Announcement status is NOT a replacement for Publication state (Task 009 §2):
 * the Announcement tracks the logical object's lifecycle while each
 * AnnouncementPublication carries its own publication state
 * (SCHEDULED → PUBLISHED). Historical publications are never converted when
 * the current Announcement status changes.
 */
export const announcementStatus = pgEnum('announcement_status', ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']);

/**
 * V1 Announcement audiences (Task 009 §7). The audience identifies WHO should
 * receive the Announcement.
 *
 * - PARENTS  — parent/guardian Users
 * - TEACHERS — teacher Users
 *
 * STUDENTS is intentionally NOT an audience in V1 because there is no Student
 * login (Task 009 §7, BR-AUTH-002). No additional audiences are invented.
 */
export const announcementAudience = pgEnum('announcement_audience', ['PARENTS', 'TEACHERS']);

/**
 * V1 Announcement target types (Task 009 §8). The target identifies WHERE the
 * audience applies (Task 009 §11).
 *
 * - SCHOOL — School-wide; applies to the whole School audience
 * - CLASS  — applies to one Class (which carries its own School + AcademicYear)
 *
 * No INDIVIDUAL_STUDENT / LEVEL / TRACK / SUBJECT / PARENT_GROUP /
 * TEACHER_GROUP targets in V1 (Task 009 §8).
 */
export const announcementTargetType = pgEnum('announcement_target_type', ['SCHOOL', 'CLASS']);

/**
 * Publication lifecycle (Task 009 §2/§15/§38) — deliberately SEPARATE from
 * Announcement status.
 *
 * - SCHEDULED — a future `scheduled_at` exists; NOT yet published
 * - PUBLISHED — `published_at` set; the AnnouncementVersion + recipient
 *               snapshot are live and historical
 *
 * A scheduled publication must not be treated as published before it is due
 * (Task 009 §38). Publication state, Announcement status and version content
 * are kept as distinct concepts.
 */
export const announcementPublicationStatus = pgEnum('announcement_publication_status', ['SCHEDULED', 'PUBLISHED']);

/**
 * Announcement — the logical communication object (domain-model §47,
 * Task 009 §1).
 *
 *   Announcement → AnnouncementVersion → AnnouncementPublication →
 *   PublicationRecipientSnapshot
 *
 * The Announcement itself carries NO publishable content: the publishable body
 * lives in AnnouncementVersion so versioning stays unambiguous (Task 009 §1).
 * A title/body change creates a new Version, never a silent mutation of the
 * Announcement.
 *
 * `created_by` is the authenticated application User who created the
 * Announcement (Task 009 §6). Users are platform-level identity (ADR-018), NOT
 * School-scoped, so the FK is a plain `users.id` reference. Whether the author
 * has a valid ACTIVE SchoolMembership in THIS School is an Application-layer
 * authorization concern (Task 009 §6/§12) — the database cannot express it.
 *
 * `(school_id, id)` unique is the composite-FK target so AnnouncementVersion
 * and AnnouncementPublication can enforce same-School integrity.
 *
 * DELETE behavior is RESTRICT (Task 009 §32): an Announcement with Versions
 * must never be silently destroyed.
 */
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    status: announcementStatus('status').notNull().default('DRAFT'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Composite FK target: Version/Publication `(school_id, announcement_id)`.
    unique('announcements_school_id_unique').on(table.schoolId, table.id),
    // Query-driven indexes (Task 009 §39).
    index('announcements_school_status_idx').on(table.schoolId, table.status),
    index('announcements_school_created_by_idx').on(table.schoolId, table.createdBy),
  ],
);

/**
 * AnnouncementVersion — a content snapshot of one Announcement
 * (domain-model §51, Task 009 §3).
 *
 *   Announcement → AnnouncementVersion (1, 2, 3 …)
 *
 * `version_number` is unique WITHIN an Announcement (Task 009 §3) — there is NO
 * global version counter across Schools/Announcements.
 *
 * VERSION IMMUTABILITY (Task 009 §4/§29): once a Version has been used for a
 * publication, its meaning must not be silently mutated. Future changes create
 * a NEW Version. Full mutation-blocking is an Application-layer responsibility
 * (a published Version must never be updated); the schema guarantees each
 * Version remains a distinct, reconstructable content snapshot.
 *
 * `title` + `body` are both required (NOT NULL): a Version represents a
 * complete publishable state (PRD.md §11). Body is stored as PLAIN TEXT —
 * there is no shared rich-text/sanitization pipeline in the project yet, so
 * rich-text rendering is deferred (Task 009 §5/§34). Raw user HTML must never
 * be rendered as trusted content without sanitization.
 *
 * `created_by` is the authenticated User who authored this Version (Task 009 §6).
 *
 * Tenant integrity (Task 009 §12/§13): `(school_id, announcement_id)` composite
 * FK → `announcements(school_id, id)` guarantees the Version belongs to the
 * SAME School as its Announcement — a School A Announcement can never get a
 * School B Version.
 *
 * DELETE is RESTRICT: a Version referenced by targets/publications must never
 * be destroyed (Task 009 §32).
 */
export const announcementVersions = pgTable(
  'announcement_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    announcementId: uuid('announcement_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'announcement_versions_school_announcement_fk',
      columns: [table.schoolId, table.announcementId],
      foreignColumns: [announcements.schoolId, announcements.id],
    }).onDelete('restrict'),
    // Composite FK target: Target/Publication `(school_id, announcement_version_id)`.
    unique('announcement_versions_school_id_unique').on(table.schoolId, table.id),
    // Version number unique within one Announcement (Task 009 §3/§40). The
    // `(announcement_id, version_number)` lookup is served by this constraint.
    unique('announcement_versions_announcement_version_unique').on(table.announcementId, table.versionNumber),
    index('announcement_versions_announcement_idx').on(table.schoolId, table.announcementId),
  ],
);

/**
 * AnnouncementTarget — the explicit audience + target combination for one
 * AnnouncementVersion (domain-model §48/§49/§50, Task 009 §8–§11).
 *
 *   AnnouncementVersion → Target → (SCHOOL | CLASS)
 *
 * The AUDIENCE identifies WHO should receive it (PARENTS | TEACHERS); the
 * TARGET_TYPE identifies WHERE the audience applies (SCHOOL-wide | one CLASS)
 * (Task 009 §11).
 *
 * TARGET INVARIANTS (Task 009 §9) enforced by CHECK:
 * - a CLASS target MUST have a `class_id`
 * - a SCHOOL target MUST NOT carry a Class reference
 *
 * Tenant + academic-context integrity:
 * - `(school_id, announcement_version_id)` composite FK → the target belongs
 *   to the SAME School as its Version
 * - the Class FK uses the established triple pattern
 *   `(school_id, academic_year_id, class_id)` → `classes(school_id,
 *   academic_year_id, id)`, so a School A Version can never target a School B
 *   Class (Task 009 §12/§13).
 *
 * `academic_year_id` is stored on the target for the SAME database-integrity
 * reason as the homework/attendance models (Task 009 §14): `classes` exposes
 * `(school_id, academic_year_id, id)` (not `(school_id, id)`), so same-School
 * Class integrity at the database level requires the triple FK. The Class
 * remains the source of its academic context; the stored year only makes the
 * integrity enforceable. With PostgreSQL MATCH SIMPLE, a NULL `class_id`
 * (SCHOOL target) makes the triple FK trivially satisfied.
 *
 * DUPLICATE LOGICAL TARGETS (Task 009 §10/§40) are rejected by partial unique
 * indexes:
 * - CLASS targets: UNIQUE `(school_id, announcement_version_id, audience,
 *   target_type, class_id)` WHERE `class_id IS NOT NULL` — one Class cannot be
 *   targeted twice for the same audience of the same Version
 * - SCHOOL targets: UNIQUE `(school_id, announcement_version_id, audience,
 *   target_type)` WHERE `target_type = 'SCHOOL'` — a School-wide target cannot
 *   be repeated for the same audience of the same Version (NULL `class_id`
 *   would otherwise never collide in PostgreSQL unique indexes)
 *
 * A Version may still have MULTIPLE targets (e.g. PARENTS+Class A,
 * PARENTS+Class B, TEACHERS+Class A, PARENTS+SCHOOL) — each is a distinct
 * logical target (Task 009 §10/§14).
 *
 * DELETE is RESTRICT: a target referenced by a published history must not be
 * destroyed when the Announcement is archived (Task 009 §31/§32).
 */
export const announcementTargets = pgTable(
  'announcement_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    announcementVersionId: uuid('announcement_version_id').notNull(),
    audience: announcementAudience('audience').notNull(),
    targetType: announcementTargetType('target_type').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    classId: uuid('class_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'announcement_targets_school_version_fk',
      columns: [table.schoolId, table.announcementVersionId],
      foreignColumns: [announcementVersions.schoolId, announcementVersions.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'announcement_targets_school_year_class_fk',
      columns: [table.schoolId, table.academicYearId, table.classId],
      foreignColumns: [classes.schoolId, classes.academicYearId, classes.id],
    }).onDelete('restrict'),
    // Duplicate logical CLASS target prevention (Task 009 §10/§40).
    uniqueIndex('announcement_targets_class_unique')
      .on(table.schoolId, table.announcementVersionId, table.audience, table.targetType, table.classId)
      .where(sql`${table.classId} IS NOT NULL`),
    // Duplicate logical SCHOOL target prevention (NULL class_id must not
    // escape uniqueness).
    uniqueIndex('announcement_targets_school_unique')
      .on(table.schoolId, table.announcementVersionId, table.audience, table.targetType)
      .where(sql`${table.targetType} = 'SCHOOL'`),
    // Query-driven indexes (Task 009 §39). The `(school_id,
    // announcement_version_id)` lookup is served by the partial uniques'
    // leftmost prefixes.
    index('announcement_targets_school_class_idx').on(table.schoolId, table.classId),
    check(
      'announcement_targets_type_class_check',
      sql`(
        (${table.targetType} = 'CLASS' AND ${table.classId} IS NOT NULL) OR
        (${table.targetType} = 'SCHOOL' AND ${table.classId} IS NULL)
      )`,
    ),
  ],
);

/**
 * AnnouncementPublication — the explicit publication of ONE exact
 * AnnouncementVersion (domain-model §52, Task 009 §15).
 *
 *   Announcement → Version (N) → Publication (N)
 *
 * Publishing is an explicit business operation (Task 009, BR-GLOBAL-005). A
 * publication references EXACTLY one AnnouncementVersion and is NEVER
 * overwritten by a later revision — a new revision publishes a new Version as
 * a new Publication row (Task 009 §15/§29/§30).
 *
 * `publication_version` is the per-Announcement deterministic sequence
 * (1, 2, 3 …). It is enforced unique per logical Announcement (Task 009
 * §16/§40) via UNIQUE `(announcement_id, publication_version)` — there is NO
 * global sequence across Schools. `announcement_id` is denormalized on the
 * publication (like the Grades result_publications snapshot pattern, Task
 * 006D) because a per-Announcement unique sequence cannot be expressed through
 * a join.
 *
 * IDEMPOTENCY (Task 009 §17): `idempotency_key` is the stable caller-supplied
 * publication identity. Its unique constraint is the database-level guarantee
 * that retrying the same logical publish request never creates a duplicate
 * publication row.
 *
 * CONCURRENCY (Task 009 §19): two concurrent workers attempting to publish the
 * same scheduled Announcement are protected by the idempotency unique + the
 * per-Announcement `(announcement_id, publication_version)` unique. No Redis
 * locks (ADR-015); the Application use case resolves races the same way the
 * Grades publication use case does (catch 23505 + re-read canonical row).
 *
 * SCHEDULING (Task 009 §18): `scheduled_at` in the future means not yet
 * published (status SCHEDULED); once due, processing publishes it (status
 * PUBLISHED + `published_at`). Correctness is "due work" based — it never
 * depends on a timer firing at the exact second. A due `scheduled_at` is a
 * legitimate state; no CHECK restricts it to the future.
 *
 * Tenant integrity (Task 009 §12): composite FKs guarantee the publication's
 * Version and Announcement belong to the SAME School.
 *
 * DELETE is RESTRICT: a publication referenced by a recipient snapshot must
 * never be destroyed (Task 009 §32).
 */
export const announcementPublications = pgTable(
  'announcement_publications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    announcementId: uuid('announcement_id').notNull(),
    announcementVersionId: uuid('announcement_version_id').notNull(),
    publicationVersion: integer('publication_version').notNull(),
    status: announcementPublicationStatus('status').notNull().default('SCHEDULED'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'announcement_publications_school_announcement_fk',
      columns: [table.schoolId, table.announcementId],
      foreignColumns: [announcements.schoolId, announcements.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'announcement_publications_school_version_fk',
      columns: [table.schoolId, table.announcementVersionId],
      foreignColumns: [announcementVersions.schoolId, announcementVersions.id],
    }).onDelete('restrict'),
    // Composite FK target for recipient snapshots `(school_id, publication_id)`.
    unique('announcement_publications_school_id_unique').on(table.schoolId, table.id),
    // Per-Announcement publication sequence (Task 009 §16/§40).
    unique('announcement_publications_announcement_version_unique').on(table.announcementId, table.publicationVersion),
    // Idempotency (Task 009 §17).
    unique('announcement_publications_idempotency_key_unique').on(table.idempotencyKey),
    // Query-driven indexes (Task 009 §39).
    index('announcement_publications_school_version_idx').on(table.schoolId, table.announcementVersionId),
    index('announcement_publications_school_announcement_idx').on(table.schoolId, table.announcementId),
    index('announcement_publications_school_scheduled_at_idx').on(table.schoolId, table.scheduledAt),
    check('announcement_publications_version_positive_check', sql`${table.publicationVersion} > 0`),
    check(
      'announcement_publications_status_timestamps_check',
      sql`(
        (${table.status} = 'PUBLISHED' AND ${table.publishedAt} IS NOT NULL) OR
        (${table.status} = 'SCHEDULED' AND ${table.publishedAt} IS NULL AND ${table.scheduledAt} IS NOT NULL)
      )`,
    ),
    check(
      'announcement_publications_schedule_order_check',
      sql`${table.scheduledAt} IS NULL OR ${table.publishedAt} IS NULL OR ${table.scheduledAt} <= ${table.publishedAt}`,
    ),
  ],
);

/**
 * PublicationRecipientSnapshot — the immutable historical recipient list of
 * one AnnouncementPublication (domain-model §53, Task 009 §20–§23).
 *
 *   AnnouncementVersion → Targets → resolve recipients → deduplicate →
 *   persist immutable snapshot
 *
 * At publication time the Application layer resolves recipients (Parents via
 * Parent + ParentStudent + StudentEnrollment + active SchoolMembership;
 * Teachers via Teacher + TeacherAssignment + active SchoolMembership),
 * deduplicates them, and persists one row per recipient. This is the source of
 * truth for "who was published to" — it is NEVER rebuilt from current
 * relationships (Task 009 §21/§28, BR-ANNOUNCEMENT-010).
 *
 * The V1 recipient is an authenticated application User (Task 009 §22).
 * Students are never direct recipients in V1. `recipient_user_id` references
 * `users.id` directly (Users are platform-level identity, not School-scoped).
 *
 * `audiences` is a JSONB array of controlled `announcement_audience`
 * identifiers (e.g. `["PARENTS", "TEACHERS"]`) preserving ALL audiences the
 * recipient was resolved through at publication time (Task 009.1). A single
 * User may legitimately qualify for multiple audiences (e.g. both PARENT and
 * TEACHER) or match several targets under the same audience; the resolver
 * deduplicates the User into ONE logical snapshot row and stores every matched
 * audience. The CHECK guarantees the payload is a non-empty array of known
 * audience identifiers with no duplicates and no arbitrary values.
 *
 * IMMUTABILITY: this table has NO `updated_at` on purpose — snapshot rows are
 * write-once historical data. DELETE is RESTRICT (Task 009 §32).
 */
export const publicationRecipientSnapshots = pgTable(
  'publication_recipient_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    publicationId: uuid('publication_id').notNull(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    audiences: jsonb('audiences').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'publication_recipient_snapshots_school_publication_fk',
      columns: [table.schoolId, table.publicationId],
      foreignColumns: [announcementPublications.schoolId, announcementPublications.id],
    }).onDelete('restrict'),
    // Recipient deduplication per publication (Task 009 §23/§40).
    unique('publication_recipient_snapshots_publication_recipient_unique').on(
      table.publicationId,
      table.recipientUserId,
    ),
    // Query-driven indexes (Task 009 §39). The `publication_id` lookup is
    // served by the unique constraint's leftmost prefix.
    index('publication_recipient_snapshots_school_recipient_idx').on(table.schoolId, table.recipientUserId),
    // Audiences payload invariant (Task 009.1): the payload is a non-empty
    // JSONB array of known audience identifiers with no duplicates and no
    // arbitrary values. CHECK constraints cannot contain subqueries in
    // PostgreSQL, so the valid payloads are enumerated explicitly — the V1
    // audience vocabulary is frozen (PARENTS, TEACHERS), so this is a complete,
    // subquery-free invariant.
    check(
      'publication_recipient_snapshots_audiences_check',
      sql`(
        jsonb_typeof(${table.audiences}) = 'array'
        AND (
          ${table.audiences} = CAST('["PARENTS"]' AS jsonb)
          OR ${table.audiences} = CAST('["TEACHERS"]' AS jsonb)
          OR ${table.audiences} = CAST('["PARENTS","TEACHERS"]' AS jsonb)
          OR ${table.audiences} = CAST('["TEACHERS","PARENTS"]' AS jsonb)
        )
      )`,
    ),
  ],
);