/**
 * Announcement persistence — repository for the Announcements module
 * (Task 009, Task 011).
 *
 * This is the ONLY place Drizzle specifics touch the Announcements domain.
 * Use Cases consume plain records; the engine never sees the database
 * (ADR-004, CLAUDE.md §24).
 *
 * The `AnnouncementsDb` surface mirrors `GradesDb`/`NotificationsDb`: both the
 * node-postgres client (`lib/db/client.ts`) and the PGlite test client
 * satisfy it, keeping every function driver-agnostic and testable against the
 * committed migrations.
 *
 * Tenant integrity: every lookup is filtered by `schoolId`, so a valid UUID
 * from another School can never resolve (CLAUDE.md §13/§26). Composite foreign
 * keys in the schema provide the final database-level guarantee.
 *
 * Recipient candidates are loaded from the CURRENT relationship snapshot at
 * publication time (Parents via Parent + ParentStudent + StudentEnrollment +
 * active SchoolMembership; Teachers via Teacher + TeacherAssignment + active
 * SchoolMembership). The pure resolver (`domain/recipients.ts`) turns the
 * candidates into the deterministic, deduplicated snapshot that is persisted
 * with the publication (BR-ANNOUNCEMENT-009/010).
 */

import {
  and, count, desc, eq, exists, gte, ilike, inArray, isNotNull, lte, or, sql,
  type SQL,
} from 'drizzle-orm';
import * as schema from '@school/database';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type {
  AnnouncementListInput,
  AnnouncementAudience,
  AnnouncementTargetType,
  ParentRecipientCandidate,
  TeacherRecipientCandidate,
} from '../../domain';

/** The minimal typed Drizzle surface the Announcements module needs. */
export type AnnouncementsDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface AnnouncementRow {
  id: string;
  schoolId: string;
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnnouncementVersionRow {
  id: string;
  schoolId: string;
  announcementId: string;
  versionNumber: number;
  title: string;
  body: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnnouncementTargetRow {
  id: string;
  schoolId: string;
  announcementVersionId: string;
  audience: AnnouncementAudience;
  targetType: AnnouncementTargetType;
  academicYearId: string;
  classId: string | null;
}

export interface AnnouncementPublicationRow {
  id: string;
  schoolId: string;
  announcementId: string;
  announcementVersionId: string;
  publicationVersion: number;
  status: 'SCHEDULED' | 'PUBLISHED';
  scheduledAt: Date | null;
  publishedAt: Date | null;
  publishedBy: string;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Paging { limit: number; offset: number }

function where(conditions: (SQL | undefined)[]): SQL | undefined {
  return and(...conditions.filter((condition): condition is SQL => condition !== undefined));
}

function teacherManagementScope(schoolId: string, userId: string): SQL {
  return sql`(
    ${schema.announcements.createdBy} = ${userId}
    AND EXISTS (
      SELECT 1 FROM teachers teacher
      JOIN teacher_assignments assignment
        ON assignment.teacher_id = teacher.id
       AND assignment.school_id = teacher.school_id
      WHERE teacher.school_id = ${schoolId}
        AND teacher.user_id = ${userId}
        AND teacher.status = 'ACTIVE'
        AND assignment.status = 'ACTIVE'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM announcement_targets target
      JOIN announcement_versions version
        ON version.id = target.announcement_version_id
       AND version.school_id = target.school_id
      WHERE version.school_id = ${schoolId}
        AND version.announcement_id = ${schema.announcements.id}
        AND version.version_number = (
          SELECT MAX(latest.version_number)
          FROM announcement_versions latest
          WHERE latest.school_id = ${schoolId}
            AND latest.announcement_id = ${schema.announcements.id}
        )
        AND (
          target.target_type = 'SCHOOL'
          OR NOT EXISTS (
            SELECT 1 FROM teachers scoped_teacher
            JOIN teacher_assignments scoped_assignment
              ON scoped_assignment.teacher_id = scoped_teacher.id
             AND scoped_assignment.school_id = scoped_teacher.school_id
            WHERE scoped_teacher.school_id = ${schoolId}
              AND scoped_teacher.user_id = ${userId}
              AND scoped_teacher.status = 'ACTIVE'
              AND scoped_assignment.status = 'ACTIVE'
              AND scoped_assignment.class_id = target.class_id
              AND scoped_assignment.academic_year_id = target.academic_year_id
          )
        )
    )
  )`;
}

export async function listAnnouncements(
  db: AnnouncementsDb,
  schoolId: string,
  paging: Paging,
  filters: AnnouncementListInput,
  teacherUserId?: string,
) {
  const targetFilter = filters.audience || filters.targetType || filters.classId ? exists(
    db.select({ id: schema.announcementTargets.id }).from(schema.announcementTargets)
      .innerJoin(schema.announcementVersions, and(
        eq(schema.announcementVersions.schoolId, schema.announcementTargets.schoolId),
        eq(schema.announcementVersions.id, schema.announcementTargets.announcementVersionId),
      )).where(and(
        eq(schema.announcementVersions.schoolId, schoolId),
        eq(schema.announcementVersions.announcementId, schema.announcements.id),
        filters.audience ? eq(schema.announcementTargets.audience, filters.audience) : undefined,
        filters.targetType ? eq(schema.announcementTargets.targetType, filters.targetType) : undefined,
        filters.classId ? eq(schema.announcementTargets.classId, filters.classId) : undefined,
      )),
  ) : undefined;
  const publicationFilter = filters.publicationStatus ? exists(
    db.select({ id: schema.announcementPublications.id }).from(schema.announcementPublications).where(and(
      eq(schema.announcementPublications.schoolId, schoolId),
      eq(schema.announcementPublications.announcementId, schema.announcements.id),
      eq(schema.announcementPublications.status, filters.publicationStatus),
    )),
  ) : undefined;
  const searchFilter = filters.search ? exists(
    db.select({ id: schema.announcementVersions.id }).from(schema.announcementVersions).where(and(
      eq(schema.announcementVersions.schoolId, schoolId),
      eq(schema.announcementVersions.announcementId, schema.announcements.id),
      or(
        ilike(schema.announcementVersions.title, `%${filters.search}%`),
        ilike(schema.announcementVersions.body, `%${filters.search}%`),
      ),
    )),
  ) : undefined;
  const condition = where([
    eq(schema.announcements.schoolId, schoolId),
    filters.status ? eq(schema.announcements.status, filters.status) : undefined,
    filters.createdFrom ? gte(schema.announcements.createdAt, filters.createdFrom) : undefined,
    filters.createdTo ? lte(schema.announcements.createdAt, filters.createdTo) : undefined,
    targetFilter,
    publicationFilter,
    searchFilter,
    teacherUserId ? teacherManagementScope(schoolId, teacherUserId) : undefined,
  ]);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.announcements).where(condition)
      .orderBy(desc(schema.announcements.createdAt), desc(schema.announcements.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.announcements).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

/** The candidate universe for one publication resolution (domain/recipients). */
export interface RecipientCandidates {
  parents: ParentRecipientCandidate[];
  teachers: TeacherRecipientCandidate[];
}

export async function findAnnouncement(
  db: AnnouncementsDb,
  schoolId: string,
  announcementId: string,
): Promise<AnnouncementRow | null> {
  const [row] = await db
    .select()
    .from(schema.announcements)
    .where(and(eq(schema.announcements.schoolId, schoolId), eq(schema.announcements.id, announcementId)))
    .limit(1);

  return row
    ? {
        id: row.id, schoolId: row.schoolId, status: row.status, createdBy: row.createdBy,
        createdAt: row.createdAt, updatedAt: row.updatedAt,
      }
    : null;
}

export async function insertAnnouncement(
  db: AnnouncementsDb,
  input: typeof schema.announcements.$inferInsert,
) {
  const [row] = await db.insert(schema.announcements).values(input).returning();
  return row;
}

export async function findLatestVersion(db: AnnouncementsDb, schoolId: string, announcementId: string) {
  const [row] = await db.select().from(schema.announcementVersions).where(and(
    eq(schema.announcementVersions.schoolId, schoolId),
    eq(schema.announcementVersions.announcementId, announcementId),
  )).orderBy(desc(schema.announcementVersions.versionNumber), desc(schema.announcementVersions.id)).limit(1);
  return row ?? null;
}

/** Loads at most one latest Version for every requested current-School Announcement. */
export async function findLatestVersions(
  db: AnnouncementsDb,
  schoolId: string,
  announcementIds: string[],
): Promise<AnnouncementVersionRow[]> {
  if (announcementIds.length === 0) return [];
  return db.selectDistinctOn([
    schema.announcementVersions.announcementId,
  ]).from(schema.announcementVersions).where(and(
    eq(schema.announcementVersions.schoolId, schoolId),
    inArray(schema.announcementVersions.announcementId, announcementIds),
  )).orderBy(
    schema.announcementVersions.announcementId,
    desc(schema.announcementVersions.versionNumber),
    desc(schema.announcementVersions.id),
  );
}

export async function listVersions(
  db: AnnouncementsDb, schoolId: string, announcementId: string, paging: Paging,
) {
  const condition = and(
    eq(schema.announcementVersions.schoolId, schoolId),
    eq(schema.announcementVersions.announcementId, announcementId),
  );
  const [rows, totals] = await Promise.all([
    db.select().from(schema.announcementVersions).where(condition)
      .orderBy(desc(schema.announcementVersions.versionNumber), desc(schema.announcementVersions.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.announcementVersions).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function insertVersion(
  db: AnnouncementsDb,
  input: typeof schema.announcementVersions.$inferInsert,
) {
  const [row] = await db.insert(schema.announcementVersions).values(input).returning();
  return row;
}

/**
 * Loads the exact Version the caller asked to publish. The lookup is scoped to
 * the Announcement + School, so a Version from another School (or another
 * Announcement) can never resolve (tenant isolation + BR-ANNOUNCEMENT-002).
 */
export async function findVersionForAnnouncement(
  db: AnnouncementsDb,
  schoolId: string,
  announcementId: string,
  versionId: string,
): Promise<AnnouncementVersionRow | null> {
  const [row] = await db
    .select()
    .from(schema.announcementVersions)
    .where(
      and(
        eq(schema.announcementVersions.schoolId, schoolId),
        eq(schema.announcementVersions.announcementId, announcementId),
        eq(schema.announcementVersions.id, versionId),
      ),
    )
    .limit(1);

  return row
    ? {
        id: row.id,
        schoolId: row.schoolId,
        announcementId: row.announcementId,
        versionNumber: row.versionNumber,
        title: row.title,
        body: row.body,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    : null;
}

export async function findTargets(
  db: AnnouncementsDb,
  schoolId: string,
  versionId: string,
): Promise<AnnouncementTargetRow[]> {
  const rows = await db
    .select()
    .from(schema.announcementTargets)
    .where(
      and(
        eq(schema.announcementTargets.schoolId, schoolId),
        eq(schema.announcementTargets.announcementVersionId, versionId),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    schoolId: row.schoolId,
    announcementVersionId: row.announcementVersionId,
    audience: row.audience,
    targetType: row.targetType,
    academicYearId: row.academicYearId,
    classId: row.classId,
  }));
}

export async function versionHasPublication(
  db: AnnouncementsDb, schoolId: string, announcementVersionId: string,
) {
  const [row] = await db.select({ id: schema.announcementPublications.id })
    .from(schema.announcementPublications).where(and(
      eq(schema.announcementPublications.schoolId, schoolId),
      eq(schema.announcementPublications.announcementVersionId, announcementVersionId),
    )).limit(1);
  return row !== undefined;
}

export async function hasScheduledPublication(db: AnnouncementsDb, schoolId: string, announcementId: string) {
  const [row] = await db.select({ id: schema.announcementPublications.id })
    .from(schema.announcementPublications).where(and(
      eq(schema.announcementPublications.schoolId, schoolId),
      eq(schema.announcementPublications.announcementId, announcementId),
      eq(schema.announcementPublications.status, 'SCHEDULED'),
    )).limit(1);
  return row !== undefined;
}

export async function findAcademicYears(db: AnnouncementsDb, schoolId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(schema.academicYears).where(and(
    eq(schema.academicYears.schoolId, schoolId), inArray(schema.academicYears.id, ids),
  ));
}

export async function findClasses(db: AnnouncementsDb, schoolId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(schema.classes).where(and(
    eq(schema.classes.schoolId, schoolId), inArray(schema.classes.id, ids),
  ));
}

export async function insertTargets(
  db: AnnouncementsDb,
  inputs: (typeof schema.announcementTargets.$inferInsert)[],
) {
  return db.insert(schema.announcementTargets).values(inputs).returning();
}

export async function countTargets(db: AnnouncementsDb, schoolId: string, announcementVersionId: string) {
  const [row] = await db.select({ value: count() }).from(schema.announcementTargets).where(and(
    eq(schema.announcementTargets.schoolId, schoolId),
    eq(schema.announcementTargets.announcementVersionId, announcementVersionId),
  ));
  return row?.value ?? 0;
}

export async function countPublications(db: AnnouncementsDb, schoolId: string, announcementId: string) {
  const [row] = await db.select({ value: count() }).from(schema.announcementPublications).where(and(
    eq(schema.announcementPublications.schoolId, schoolId),
    eq(schema.announcementPublications.announcementId, announcementId),
  ));
  return row?.value ?? 0;
}

export async function listPublications(
  db: AnnouncementsDb, schoolId: string, announcementId: string, paging: Paging,
) {
  const condition = and(
    eq(schema.announcementPublications.schoolId, schoolId),
    eq(schema.announcementPublications.announcementId, announcementId),
  );
  const [rows, totals] = await Promise.all([
    db.select({
      id: schema.announcementPublications.id,
      announcementId: schema.announcementPublications.announcementId,
      announcementVersionId: schema.announcementPublications.announcementVersionId,
      publicationVersion: schema.announcementPublications.publicationVersion,
      status: schema.announcementPublications.status,
      scheduledAt: schema.announcementPublications.scheduledAt,
      publishedAt: schema.announcementPublications.publishedAt,
      publishedBy: schema.announcementPublications.publishedBy,
      createdAt: schema.announcementPublications.createdAt,
      recipientCount: count(schema.publicationRecipientSnapshots.id),
    }).from(schema.announcementPublications).leftJoin(
      schema.publicationRecipientSnapshots,
      and(
        eq(schema.publicationRecipientSnapshots.schoolId, schema.announcementPublications.schoolId),
        eq(schema.publicationRecipientSnapshots.publicationId, schema.announcementPublications.id),
      ),
    ).where(condition).groupBy(schema.announcementPublications.id)
      .orderBy(desc(schema.announcementPublications.publicationVersion), desc(schema.announcementPublications.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.announcementPublications).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function findLatestPublication(
  db: AnnouncementsDb,
  schoolId: string,
  announcementId: string,
): Promise<AnnouncementPublicationRow | null> {
  const [row] = await db
    .select()
    .from(schema.announcementPublications)
    .where(
      and(
        eq(schema.announcementPublications.schoolId, schoolId),
        eq(schema.announcementPublications.announcementId, announcementId),
      ),
    )
    .orderBy(desc(schema.announcementPublications.publicationVersion))
    .limit(1);

  return row ? toPublicationRow(row) : null;
}

export async function findPublicationByVersion(
  db: AnnouncementsDb,
  schoolId: string,
  announcementId: string,
  announcementVersionId: string,
): Promise<AnnouncementPublicationRow | null> {
  const [row] = await db
    .select()
    .from(schema.announcementPublications)
    .where(
      and(
        eq(schema.announcementPublications.schoolId, schoolId),
        eq(schema.announcementPublications.announcementId, announcementId),
        eq(schema.announcementPublications.announcementVersionId, announcementVersionId),
      ),
    )
    .limit(1);

  return row ? toPublicationRow(row) : null;
}

/**
 * Idempotency replay lookup (Task 009 §17). Scoped to the School so a key
 * belonging to another School can never resolve. The `idempotency_key` unique
 * constraint is the database-level guarantee that a retry never duplicates a
 * publication.
 */
export async function findPublicationByIdempotencyKey(
  db: AnnouncementsDb,
  schoolId: string,
  idempotencyKey: string,
): Promise<AnnouncementPublicationRow | null> {
  const [row] = await db
    .select()
    .from(schema.announcementPublications)
    .where(
      and(
        eq(schema.announcementPublications.schoolId, schoolId),
        eq(schema.announcementPublications.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);

  return row ? toPublicationRow(row) : null;
}

export async function findPublication(
  db: AnnouncementsDb,
  publicationId: string,
): Promise<AnnouncementPublicationRow | null> {
  const [row] = await db
    .select()
    .from(schema.announcementPublications)
    .where(eq(schema.announcementPublications.id, publicationId))
    .limit(1);

  return row ? toPublicationRow(row) : null;
}

export interface PublicationInsert {
  schoolId: string;
  announcementId: string;
  announcementVersionId: string;
  publicationVersion: number;
  status: 'SCHEDULED' | 'PUBLISHED';
  scheduledAt: Date | null;
  publishedAt: Date | null;
  publishedBy: string;
  idempotencyKey: string;
}

export async function insertPublication(
  db: AnnouncementsDb,
  input: PublicationInsert,
): Promise<AnnouncementPublicationRow> {
  const [row] = await db
    .insert(schema.announcementPublications)
    .values({
      schoolId: input.schoolId,
      announcementId: input.announcementId,
      announcementVersionId: input.announcementVersionId,
      publicationVersion: input.publicationVersion,
      status: input.status,
      scheduledAt: input.scheduledAt,
      publishedAt: input.publishedAt,
      publishedBy: input.publishedBy,
      idempotencyKey: input.idempotencyKey,
    })
    .returning();

  return toPublicationRow(row);
}

export interface RecipientSnapshotInsert {
  schoolId: string;
  publicationId: string;
  recipientUserId: string;
  audiences: AnnouncementAudience[];
}

/** Persists the immutable recipient snapshot (BR-ANNOUNCEMENT-009/010). */
export async function insertRecipientSnapshots(
  db: AnnouncementsDb,
  rows: RecipientSnapshotInsert[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await db
    .insert(schema.publicationRecipientSnapshots)
    .values(
      rows.map((row) => ({
        schoolId: row.schoolId,
        publicationId: row.publicationId,
        recipientUserId: row.recipientUserId,
        audiences: row.audiences as unknown as typeof schema.publicationRecipientSnapshots.$inferInsert['audiences'],
      })),
    );
}

export async function updateAnnouncementStatus(
  db: AnnouncementsDb,
  schoolId: string,
  announcementId: string,
  status: AnnouncementRow['status'],
): Promise<void> {
  await db
    .update(schema.announcements)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(schema.announcements.schoolId, schoolId), eq(schema.announcements.id, announcementId)));
}

/**
 * Compare-and-swap transition SCHEDULED → PUBLISHED (BR-ANNOUNCEMENT-012/013):
 * only a row still in SCHEDULED is transitioned, so two concurrent due-work
 * workers can never both emit an event for the same publication. Returns the
 * updated row, or null when another worker already published it.
 */
export async function markPublicationPublished(
  db: AnnouncementsDb,
  publicationId: string,
): Promise<AnnouncementPublicationRow | null> {
  const [row] = await db
    .update(schema.announcementPublications)
    .set({ status: 'PUBLISHED', publishedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.announcementPublications.id, publicationId),
        eq(schema.announcementPublications.status, 'SCHEDULED'),
      ),
    )
    .returning();

  return row ? toPublicationRow(row) : null;
}

/**
 * Loads the parent User candidates for recipient resolution (Task 009 §24).
 * Eligible: ACTIVE Parent profiles with a User identity in this School, with
 * their active SchoolMembership status and the Class ids of children currently
 * linked via ACTIVE ParentStudent + ACTIVE StudentEnrollment. Aggregated into
 * one candidate per User (deduplication happens in the pure resolver).
 */
export async function loadParentRecipientCandidates(
  db: AnnouncementsDb,
  schoolId: string,
): Promise<ParentRecipientCandidate[]> {
  const rows = await db
    .select({
      userId: schema.parents.userId,
      membershipStatus: schema.schoolMemberships.status,
      classId: schema.studentEnrollments.classId,
    })
    .from(schema.parents)
    .leftJoin(
      schema.schoolMemberships,
      and(
        eq(schema.schoolMemberships.userId, schema.parents.userId),
        eq(schema.schoolMemberships.schoolId, schema.parents.schoolId),
      ),
    )
    .leftJoin(
      schema.parentStudents,
      and(
        eq(schema.parentStudents.parentId, schema.parents.id),
        eq(schema.parentStudents.schoolId, schema.parents.schoolId),
        eq(schema.parentStudents.status, 'ACTIVE'),
      ),
    )
    .leftJoin(
      schema.studentEnrollments,
      and(
        eq(schema.studentEnrollments.studentId, schema.parentStudents.studentId),
        eq(schema.studentEnrollments.schoolId, schema.parents.schoolId),
        eq(schema.studentEnrollments.status, 'ACTIVE'),
      ),
    )
    .where(
      and(
        eq(schema.parents.schoolId, schoolId),
        isNotNull(schema.parents.userId),
        eq(schema.parents.status, 'ACTIVE'),
      ),
    );

  const byUser = new Map<string, { activeSchoolMembership: boolean; childClassIds: string[] }>();
  for (const row of rows) {
    const userId = row.userId as string;
    let entry = byUser.get(userId);
    if (!entry) {
      entry = { activeSchoolMembership: row.membershipStatus === 'ACTIVE', childClassIds: [] };
      byUser.set(userId, entry);
    }
    if (row.classId !== null && !entry.childClassIds.includes(row.classId)) {
      entry.childClassIds.push(row.classId);
    }
  }

  return [...byUser.entries()].map(([userId, entry]) => ({
    userId,
    activeSchoolMembership: entry.activeSchoolMembership,
    childClassIds: entry.childClassIds,
  }));
}

/**
 * Loads the teacher User candidates for recipient resolution (Task 009 §25).
 * Eligible: ACTIVE Teacher profiles with a User identity in this School, with
 * their active SchoolMembership status and the Class ids covered by CURRENT
 * ACTIVE TeacherAssignments (ENDED assignments never grant current recipients).
 */
export async function loadTeacherRecipientCandidates(
  db: AnnouncementsDb,
  schoolId: string,
): Promise<TeacherRecipientCandidate[]> {
  const rows = await db
    .select({
      userId: schema.teachers.userId,
      membershipStatus: schema.schoolMemberships.status,
      classId: schema.teacherAssignments.classId,
    })
    .from(schema.teachers)
    .leftJoin(
      schema.schoolMemberships,
      and(
        eq(schema.schoolMemberships.userId, schema.teachers.userId),
        eq(schema.schoolMemberships.schoolId, schema.teachers.schoolId),
      ),
    )
    .leftJoin(
      schema.teacherAssignments,
      and(
        eq(schema.teacherAssignments.teacherId, schema.teachers.id),
        eq(schema.teacherAssignments.schoolId, schema.teachers.schoolId),
        eq(schema.teacherAssignments.status, 'ACTIVE'),
      ),
    )
    .where(
      and(
        eq(schema.teachers.schoolId, schoolId),
        isNotNull(schema.teachers.userId),
        eq(schema.teachers.status, 'ACTIVE'),
      ),
    );

  const byUser = new Map<string, { activeSchoolMembership: boolean; assignmentClassIds: string[] }>();
  for (const row of rows) {
    const userId = row.userId as string;
    let entry = byUser.get(userId);
    if (!entry) {
      entry = { activeSchoolMembership: row.membershipStatus === 'ACTIVE', assignmentClassIds: [] };
      byUser.set(userId, entry);
    }
    if (row.classId !== null && !entry.assignmentClassIds.includes(row.classId)) {
      entry.assignmentClassIds.push(row.classId);
    }
  }

  return [...byUser.entries()].map(([userId, entry]) => ({
    userId,
    activeSchoolMembership: entry.activeSchoolMembership,
    assignmentClassIds: entry.assignmentClassIds,
  }));
}

/** Convenience loader for the full candidate universe of one School. */
export async function loadRecipientCandidates(db: AnnouncementsDb, schoolId: string): Promise<RecipientCandidates> {
  const [parents, teachers] = await Promise.all([
    loadParentRecipientCandidates(db, schoolId),
    loadTeacherRecipientCandidates(db, schoolId),
  ]);
  return { parents, teachers };
}

function toPublicationRow(row: typeof schema.announcementPublications.$inferSelect): AnnouncementPublicationRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    announcementId: row.announcementId,
    announcementVersionId: row.announcementVersionId,
    publicationVersion: row.publicationVersion,
    status: row.status,
    scheduledAt: row.scheduledAt,
    publishedAt: row.publishedAt,
    publishedBy: row.publishedBy,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
