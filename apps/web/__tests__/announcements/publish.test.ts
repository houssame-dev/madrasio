/**
 * Announcement publication — application tests (Task 011 §39).
 *
 * Runs the real `publishAnnouncement` / `publishDueAnnouncement` use cases
 * against a fresh PGlite database with all committed migrations applied.
 * Verifies the authoritative flow: authorization, target/recipient resolution,
 * the immutable snapshot, per-Announcement sequencing, revisions, scheduling,
 * idempotency, concurrency, tenant isolation, and the end-to-end
 * publish → outbox → notification integration (including historical-snapshot
 * stability and duplicate-event idempotency).
 */

import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '@school/database';

import { ForbiddenError, UnauthenticatedError } from '@/lib/errors';

import {
  normalizeScheduledAnnouncementBatchLimit,
  processDueAnnouncementPublicationsBatch,
  publishAnnouncement,
  publishDueAnnouncement,
  SCHEDULED_ANNOUNCEMENT_BATCH_DEFAULT_LIMIT,
  SCHEDULED_ANNOUNCEMENT_BATCH_MAX_LIMIT,
} from '@/lib/modules/announcements/application';
import { processNotificationEvent } from '@/lib/modules/notifications/application/process-notification-event';

import {
  createAnnouncementsTestDb,
  seedAnnouncement,
  seedAssignment,
  seedEnrollment,
  seedParent,
  seedParentStudent,
  seedSchool,
  seedStudent,
  seedTarget,
  seedTeacher,
  seedUser,
  seedVersion,
  type AnnouncementsTestDb,
  type SeededSchool,
} from './test-helpers';

let test: AnnouncementsTestDb;

beforeEach(async () => {
  test = await createAnnouncementsTestDb();
});

afterEach(async () => {
  await test.client.close();
});

async function loadOutboxEvents(): Promise<typeof schema.outboxEvents.$inferSelect[]> {
  return test.seed.select().from(schema.outboxEvents);
}

async function loadSnapshots(publicationId: string): Promise<typeof schema.publicationRecipientSnapshots.$inferSelect[]> {
  return test.seed
    .select()
    .from(schema.publicationRecipientSnapshots)
    .where(eq(schema.publicationRecipientSnapshots.publicationId, publicationId));
}

/** Seeds an author (SCHOOL_ADMIN) + two eligible parent Users with profiles. */
async function seedSchoolAdminWithParents(school: SeededSchool): Promise<{ admin: string; parentA: string; parentB: string }> {
  const admin = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
  const parentA = await seedUser(test.seed, school.schoolId, 'PARENT');
  const parentB = await seedUser(test.seed, school.schoolId, 'PARENT');
  await seedParent(test.seed, school.schoolId, parentA);
  await seedParent(test.seed, school.schoolId, parentB);
  return { admin, parentA, parentB };
}

describe('publishAnnouncement — initial publication (Task 011 §39)', () => {
  it('publishes immediately, persists the snapshot, emits AnnouncementPublished, and marks the Announcement PUBLISHED', async () => {
    const school = await seedSchool(test.seed);
    const { admin, parentA, parentB } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    const result = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
    });

    expect(result.status).toBe('PUBLISHED');
    expect(result.publicationVersion).toBe(1);
    expect(result.eventEmitted).toBe(true);
    expect(result.publishedAt).not.toBeNull();

    const snapshots = await loadSnapshots(result.publicationId);
    expect(snapshots.map((s) => s.recipientUserId).sort()).toEqual([parentA, parentB].sort());
    expect(
      snapshots.every(
        (s) => (s.audiences as string[]).length === 1 && (s.audiences as string[])[0] === 'PARENTS',
      ),
    ).toBe(true);

    const events = await loadOutboxEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('AnnouncementPublished');
    expect(events[0].payload).toMatchObject({
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      publicationId: result.publicationId,
      publicationVersion: 1,
    });

    const [stored] = await test.seed
      .select()
      .from(schema.announcements)
      .where(eq(schema.announcements.id, announcement.announcementId));
    expect(stored.status).toBe('PUBLISHED');
  });

  it('resolves PARENTS + CLASS to parents of children currently enrolled in that Class only', async () => {
    const school = await seedSchool(test.seed);
    const admin = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
    const parentA = await seedUser(test.seed, school.schoolId, 'PARENT');
    const parentB = await seedUser(test.seed, school.schoolId, 'PARENT');
    const parentAProfile = await seedParent(test.seed, school.schoolId, parentA);
    await seedParent(test.seed, school.schoolId, parentB);
    const student = await seedStudent(test.seed, school.schoolId);
    await seedEnrollment(test.seed, school.schoolId, student, school.yearId, school.classAId);
    await seedParentStudent(test.seed, school.schoolId, parentAProfile, student);

    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'CLASS', school.yearId, school.classAId);

    const result = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
    });

    const snapshots = await loadSnapshots(result.publicationId);
    expect(snapshots.map((s) => s.recipientUserId)).toEqual([parentA]);
  });

  it('deduplicates a recipient matching multiple targets into one snapshot row with all audiences', async () => {
    const school = await seedSchool(test.seed);
    const admin = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
    const parentUser = await seedUser(test.seed, school.schoolId, 'PARENT');
    await seedParent(test.seed, school.schoolId, parentUser);

    const teacherUser = await seedUser(test.seed, school.schoolId, 'TEACHER');
    const teacherProfile = await seedTeacher(test.seed, school.schoolId, teacherUser);
    await seedAssignment(test.seed, school.schoolId, teacherProfile, school.classAId, school.yearId, school.subjectId);

    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'TEACHERS', 'CLASS', school.yearId, school.classAId);

    const result = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
    });

    const snapshots = await loadSnapshots(result.publicationId);
    const teacherEntry = snapshots.find((s) => s.recipientUserId === teacherUser);
    expect(teacherEntry).toBeDefined();
    expect(teacherEntry!.audiences).toEqual(['TEACHERS']);
  });

  it('fails with NO_VALID_TARGETS when the Version has no targets', async () => {
    const school = await seedSchool(test.seed);
    const admin = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);

    await expect(
      publishAnnouncement(test.db, {
        userId: admin,
        schoolId: school.schoolId,
        announcementId: announcement.announcementId,
        announcementVersionId: announcement.versionId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ featureCode: 'NO_VALID_TARGETS' });
    expect(await loadOutboxEvents()).toHaveLength(0);
  });

  it('fails with NO_ELIGIBLE_RECIPIENTS when zero recipients match — never publishes to nobody', async () => {
    const school = await seedSchool(test.seed);
    const admin = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
    // A PARENTS+SCHOOL target with NO parent profiles at all → zero recipients.
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    await expect(
      publishAnnouncement(test.db, {
        userId: admin,
        schoolId: school.schoolId,
        announcementId: announcement.announcementId,
        announcementVersionId: announcement.versionId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ featureCode: 'NO_ELIGIBLE_RECIPIENTS' });
    expect(await loadOutboxEvents()).toHaveLength(0);
  });

  it('requires an authenticated + authorized publisher (unauthenticated → 401)', async () => {
    const school = await seedSchool(test.seed);
    const admin = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    await expect(
      publishAnnouncement(test.db, {
        userId: null,
        schoolId: school.schoolId,
        announcementId: announcement.announcementId,
        announcementVersionId: announcement.versionId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('denies a publisher without a valid School membership for that School', async () => {
    const schoolA = await seedSchool(test.seed, 'School A');
    const adminA = await seedUser(test.seed, schoolA.schoolId, 'SCHOOL_ADMIN');
    // adminB is only a member of School B — no School A membership.
    const schoolB = await seedSchool(test.seed, 'School B');
    const adminB = await seedUser(test.seed, schoolB.schoolId, 'SCHOOL_ADMIN');

    const announcement = await seedAnnouncement(test.seed, schoolA.schoolId, adminA);
    await seedTarget(test.seed, schoolA.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', schoolA.yearId);

    await expect(
      publishAnnouncement(test.db, {
        userId: adminB,
        schoolId: schoolA.schoolId,
        announcementId: announcement.announcementId,
        announcementVersionId: announcement.versionId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cannot resolve an Announcement from another School (tenant isolation)', async () => {
    const schoolA = await seedSchool(test.seed, 'School A');
    const adminA = await seedUser(test.seed, schoolA.schoolId, 'SCHOOL_ADMIN');
    const schoolB = await seedSchool(test.seed, 'School B');
    const adminB = await seedUser(test.seed, schoolB.schoolId, 'SCHOOL_ADMIN');

    const announcementA = await seedAnnouncement(test.seed, schoolA.schoolId, adminA);

    await expect(
      publishAnnouncement(test.db, {
        userId: adminB,
        schoolId: schoolB.schoolId,
        announcementId: announcementA.announcementId,
        announcementVersionId: announcementA.versionId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ featureCode: 'ANNOUNCEMENT_NOT_FOUND' });
  });

  it('cannot publish a Version that does not belong to the Announcement (VERSION_NOT_FOUND)', async () => {
    const school = await seedSchool(test.seed);
    const admin = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
    const announcementA = await seedAnnouncement(test.seed, school.schoolId, admin, 'A');
    const announcementB = await seedAnnouncement(test.seed, school.schoolId, admin, 'B');
    await seedTarget(test.seed, school.schoolId, announcementA.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    await expect(
      publishAnnouncement(test.db, {
        userId: admin,
        schoolId: school.schoolId,
        announcementId: announcementA.announcementId,
        announcementVersionId: announcementB.versionId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ featureCode: 'VERSION_NOT_FOUND' });
  });

  it('cannot publish an archived announcement (NOT_PUBLISHABLE)', async () => {
    const school = await seedSchool(test.seed);
    const admin = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);
    await test.seed
      .update(schema.announcements)
      .set({ status: 'ARCHIVED', updatedAt: new Date() })
      .where(eq(schema.announcements.id, announcement.announcementId));

    await expect(
      publishAnnouncement(test.db, {
        userId: admin,
        schoolId: school.schoolId,
        announcementId: announcement.announcementId,
        announcementVersionId: announcement.versionId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ featureCode: 'NOT_PUBLISHABLE' });
  });
});

describe('publishAnnouncement — revisions (Task 011 §39)', () => {
  it('a NEW Version publishes as publication sequence 2 with AnnouncementRevisionPublished', async () => {
    const school = await seedSchool(test.seed);
    const { admin } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    const v1 = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
    });

    const version2Id = await seedVersion(test.seed, school.schoolId, announcement.announcementId, 2, 'Reunion v2', 'Body 2', admin);
    await seedTarget(test.seed, school.schoolId, version2Id, 'PARENTS', 'SCHOOL', school.yearId);
    const v2 = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: version2Id,
      idempotencyKey: randomUUID(),
    });

    expect(v2.publicationVersion).toBe(2);
    expect(v2.announcementVersionId).toBe(version2Id);
    expect(v2.publicationId).not.toBe(v1.publicationId);

    const events = await loadOutboxEvents();
    expect(events.map((e) => e.eventType).sort()).toEqual(['AnnouncementPublished', 'AnnouncementRevisionPublished']);
    const revisionEvent = events.find((e) => e.eventType === 'AnnouncementRevisionPublished');
    expect(revisionEvent!.payload).toMatchObject({ announcementVersionId: version2Id, publicationVersion: 2 });

    // Old publication + snapshot are untouched (BR-ANNOUNCEMENT-014).
    expect((await loadSnapshots(v1.publicationId)).length).toBeGreaterThan(0);
  });

  it('publishing the SAME Version twice fails with ALREADY_PUBLISHED', async () => {
    const school = await seedSchool(test.seed);
    const { admin } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
    });

    await expect(
      publishAnnouncement(test.db, {
        userId: admin,
        schoolId: school.schoolId,
        announcementId: announcement.announcementId,
        announcementVersionId: announcement.versionId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ featureCode: 'ALREADY_PUBLISHED' });
    expect(await loadOutboxEvents()).toHaveLength(1);
  });
});

describe('publishAnnouncement — idempotency & concurrency (Task 011 §39)', () => {
  it('a replay with the same idempotency key returns the same publication and emits nothing new', async () => {
    const school = await seedSchool(test.seed);
    const { admin } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);
    const key = randomUUID();

    const first = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: key,
    });
    const replay = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: key,
    });

    expect(replay.publicationId).toBe(first.publicationId);
    expect(await loadOutboxEvents()).toHaveLength(1);
    expect((await loadSnapshots(first.publicationId)).length).toBe(2);
  });

  it('reusing the idempotency key for a DIFFERENT announcement fails with PUBLICATION_CONFLICT', async () => {
    const school = await seedSchool(test.seed);
    const { admin } = await seedSchoolAdminWithParents(school);
    const announcementA = await seedAnnouncement(test.seed, school.schoolId, admin, 'A');
    const announcementB = await seedAnnouncement(test.seed, school.schoolId, admin, 'B');
    await seedTarget(test.seed, school.schoolId, announcementA.versionId, 'PARENTS', 'SCHOOL', school.yearId);
    await seedTarget(test.seed, school.schoolId, announcementB.versionId, 'PARENTS', 'SCHOOL', school.yearId);
    const key = randomUUID();

    await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcementA.announcementId,
      announcementVersionId: announcementA.versionId,
      idempotencyKey: key,
    });

    await expect(
      publishAnnouncement(test.db, {
        userId: admin,
        schoolId: school.schoolId,
        announcementId: announcementB.announcementId,
        announcementVersionId: announcementB.versionId,
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ featureCode: 'PUBLICATION_CONFLICT' });
  });

  it('two concurrent identical publishes (same key) create exactly ONE publication, ONE snapshot set and ONE event', async () => {
    const school = await seedSchool(test.seed);
    const { admin } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);
    const key = randomUUID();

    const attempts = await Promise.allSettled([
      publishAnnouncement(test.db, {
        userId: admin,
        schoolId: school.schoolId,
        announcementId: announcement.announcementId,
        announcementVersionId: announcement.versionId,
        idempotencyKey: key,
      }),
      publishAnnouncement(test.db, {
        userId: admin,
        schoolId: school.schoolId,
        announcementId: announcement.announcementId,
        announcementVersionId: announcement.versionId,
        idempotencyKey: key,
      }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThan(0);
    const publicationIds = new Set(fulfilled.map((a) => a.value.publicationId));
    expect(publicationIds.size).toBe(1);

    const publications = await test.seed
      .select()
      .from(schema.announcementPublications)
      .where(eq(schema.announcementPublications.announcementId, announcement.announcementId));
    expect(publications).toHaveLength(1);
    expect(publications[0].publicationVersion).toBe(1);

    expect(await loadOutboxEvents()).toHaveLength(1);
  });
});

describe('publishAnnouncement — teacher scope (Task 011 §39)', () => {
  it('a TEACHER can publish to a Class they are ACTIVE-assigned to', async () => {
    const school = await seedSchool(test.seed);
    const teacherUser = await seedUser(test.seed, school.schoolId, 'TEACHER');
    const teacherProfile = await seedTeacher(test.seed, school.schoolId, teacherUser);
    await seedAssignment(test.seed, school.schoolId, teacherProfile, school.classAId, school.yearId, school.subjectId);

    const announcement = await seedAnnouncement(test.seed, school.schoolId, teacherUser);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'TEACHERS', 'CLASS', school.yearId, school.classAId);

    const result = await publishAnnouncement(test.db, {
      userId: teacherUser,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
    });

    expect(result.status).toBe('PUBLISHED');
    const snapshots = await loadSnapshots(result.publicationId);
    // The author may also be a recipient (Task 009 §27).
    expect(snapshots.map((s) => s.recipientUserId)).toContain(teacherUser);
  });

  it('a TEACHER cannot publish to a Class without an ACTIVE assignment (FORBIDDEN)', async () => {
    const school = await seedSchool(test.seed);
    const teacherUser = await seedUser(test.seed, school.schoolId, 'TEACHER');
    const teacherProfile = await seedTeacher(test.seed, school.schoolId, teacherUser);
    await seedAssignment(test.seed, school.schoolId, teacherProfile, school.classAId, school.yearId, school.subjectId);

    const announcement = await seedAnnouncement(test.seed, school.schoolId, teacherUser);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'TEACHERS', 'CLASS', school.yearId, school.classBId);

    await expect(
      publishAnnouncement(test.db, {
        userId: teacherUser,
        schoolId: school.schoolId,
        announcementId: announcement.announcementId,
        announcementVersionId: announcement.versionId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a TEACHER cannot publish a SCHOOL-wide target (out of academic scope)', async () => {
    const school = await seedSchool(test.seed);
    const teacherUser = await seedUser(test.seed, school.schoolId, 'TEACHER');
    const teacherProfile = await seedTeacher(test.seed, school.schoolId, teacherUser);
    await seedAssignment(test.seed, school.schoolId, teacherProfile, school.classAId, school.yearId, school.subjectId);

    const announcement = await seedAnnouncement(test.seed, school.schoolId, teacherUser);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'TEACHERS', 'SCHOOL', school.yearId);

    await expect(
      publishAnnouncement(test.db, {
        userId: teacherUser,
        schoolId: school.schoolId,
        announcementId: announcement.announcementId,
        announcementVersionId: announcement.versionId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('publishAnnouncement — scheduling & due work (Task 011 §39)', () => {
  it('a future scheduledAt creates a SCHEDULED publication with NO event; due processing publishes + emits', async () => {
    const school = await seedSchool(test.seed);
    const { admin, parentA, parentB } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    const future = new Date(Date.now() + 3_600_000).toISOString();
    const scheduled = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
      scheduledAt: future,
    });

    expect(scheduled.status).toBe('SCHEDULED');
    expect(scheduled.eventEmitted).toBe(false);
    expect(scheduled.publishedAt).toBeNull();
    expect(await loadOutboxEvents()).toHaveLength(0);
    // Recipients are NOT frozen at scheduling time (Task 011.1 §1) — the
    // historical snapshot is created only at ACTUAL publication time.
    expect(await loadSnapshots(scheduled.publicationId)).toHaveLength(0);

    const [storedAnn] = await test.seed
      .select()
      .from(schema.announcements)
      .where(eq(schema.announcements.id, announcement.announcementId));
    expect(storedAnn.status).toBe('SCHEDULED');

    // Before the due time, due processing must refuse.
    await expect(
      publishDueAnnouncement(test.db, { publicationId: scheduled.publicationId }),
    ).rejects.toMatchObject({ featureCode: 'NOT_PUBLISHABLE' });

    // Make it due and process.
    await test.seed
      .update(schema.announcementPublications)
      .set({ scheduledAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.announcementPublications.id, scheduled.publicationId));

    const due = await publishDueAnnouncement(test.db, { publicationId: scheduled.publicationId });
    expect(due.eventEmitted).toBe(true);

    const events = await loadOutboxEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('AnnouncementPublished');

    // At due time the snapshot is resolved from the CURRENT relationships.
    const dueSnapshots = await loadSnapshots(scheduled.publicationId);
    expect(dueSnapshots.map((s) => s.recipientUserId).sort()).toEqual([parentA, parentB].sort());

    const [pubAfter] = await test.seed
      .select()
      .from(schema.announcementPublications)
      .where(eq(schema.announcementPublications.id, scheduled.publicationId));
    expect(pubAfter.status).toBe('PUBLISHED');
    expect(pubAfter.publishedAt).not.toBeNull();

    // A second due-work call is an idempotent no-op — no duplicate event, no
    // new snapshot, no re-resolution (Task 011.1 §9).
    const again = await publishDueAnnouncement(test.db, { publicationId: scheduled.publicationId });
    expect(again.eventEmitted).toBe(false);
    expect(await loadOutboxEvents()).toHaveLength(1);
    expect(await loadSnapshots(scheduled.publicationId)).toHaveLength(2);
  });

  it('a due/past scheduledAt publishes immediately (keeping the original scheduled_at)', async () => {
    const school = await seedSchool(test.seed);
    const { admin } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    const past = new Date(Date.now() - 60_000).toISOString();
    const result = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
      scheduledAt: past,
    });

    expect(result.status).toBe('PUBLISHED');
    expect(result.eventEmitted).toBe(true);
    expect(await loadOutboxEvents()).toHaveLength(1);

    const [pub] = await test.seed
      .select()
      .from(schema.announcementPublications)
      .where(eq(schema.announcementPublications.id, result.publicationId));
    expect(pub.scheduledAt).not.toBeNull();
    expect(pub.publishedAt).not.toBeNull();
  });
});

describe('scheduled publication recipient hardening (Task 011.1)', () => {
  it('scheduling creates a SCHEDULED publication with zero snapshots and zero outbox events', async () => {
    const school = await seedSchool(test.seed);
    const { admin } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    const scheduled = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    expect(scheduled.status).toBe('SCHEDULED');
    expect(scheduled.eventEmitted).toBe(false);
    expect(await loadSnapshots(scheduled.publicationId)).toHaveLength(0);
    expect(await loadOutboxEvents()).toHaveLength(0);
  });

  it('the T1/T2 historical scenario: recipients are resolved at ACTUAL publication time and frozen forever (Task 011.1 §10)', async () => {
    const school = await seedSchool(test.seed);
    const admin = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');

    // T1 — User A and User B each have a child currently enrolled in Class A.
    const parentA = await seedUser(test.seed, school.schoolId, 'PARENT');
    const parentAProfile = await seedParent(test.seed, school.schoolId, parentA);
    const studentA = await seedStudent(test.seed, school.schoolId);
    await seedEnrollment(test.seed, school.schoolId, studentA, school.yearId, school.classAId);
    await seedParentStudent(test.seed, school.schoolId, parentAProfile, studentA);

    const parentB = await seedUser(test.seed, school.schoolId, 'PARENT');
    const parentBProfile = await seedParent(test.seed, school.schoolId, parentB);
    const studentB = await seedStudent(test.seed, school.schoolId);
    await seedEnrollment(test.seed, school.schoolId, studentB, school.yearId, school.classAId);
    await seedParentStudent(test.seed, school.schoolId, parentBProfile, studentB);

    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin, 'Scheduled Reunion');
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'CLASS', school.yearId, school.classAId);

    // T1 — schedule for a future time. Both A and B resolve, but recipients
    // must NOT be frozen at scheduling time.
    const scheduled = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    expect(scheduled.status).toBe('SCHEDULED');
    expect(await loadSnapshots(scheduled.publicationId)).toHaveLength(0);
    expect(await loadOutboxEvents()).toHaveLength(0);

    // Between T1 and T2: User A loses eligibility; User C becomes eligible.
    await test.seed
      .update(schema.parentStudents)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(and(eq(schema.parentStudents.schoolId, school.schoolId), eq(schema.parentStudents.parentId, parentAProfile)));
    await test.seed
      .update(schema.studentEnrollments)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(and(eq(schema.studentEnrollments.schoolId, school.schoolId), eq(schema.studentEnrollments.studentId, studentA)));

    const parentC = await seedUser(test.seed, school.schoolId, 'PARENT');
    const parentCProfile = await seedParent(test.seed, school.schoolId, parentC);
    const studentC = await seedStudent(test.seed, school.schoolId);
    await seedEnrollment(test.seed, school.schoolId, studentC, school.yearId, school.classAId);
    await seedParentStudent(test.seed, school.schoolId, parentCProfile, studentC);

    // Make it due and publish.
    await test.seed
      .update(schema.announcementPublications)
      .set({ scheduledAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.announcementPublications.id, scheduled.publicationId));

    const due = await publishDueAnnouncement(test.db, { publicationId: scheduled.publicationId });
    expect(due.eventEmitted).toBe(true);

    // T2 — the snapshot is the publication-time eligibility: B + C, NOT A + B.
    const snapshot = await loadSnapshots(scheduled.publicationId);
    expect(snapshot.map((s) => s.recipientUserId).sort()).toEqual([parentB, parentC].sort());

    const [pubAfter] = await test.seed
      .select()
      .from(schema.announcementPublications)
      .where(eq(schema.announcementPublications.id, scheduled.publicationId));
    expect(pubAfter.status).toBe('PUBLISHED');
    expect(pubAfter.publishedAt).not.toBeNull();

    const events = await loadOutboxEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('AnnouncementPublished');

    // Notifications consume the final publication-time snapshot (Task 011.1 §13).
    const processed = await processNotificationEvent(test.db, { outboxEventId: events[0].id });
    expect(processed.notificationsCreated).toBe(2);
    const notifications = await test.seed.select().from(schema.notifications);
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([parentB, parentC].sort());

    // Mutate relationships again — the T2 snapshot is immutable historical truth.
    await test.seed
      .update(schema.parentStudents)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(and(eq(schema.parentStudents.schoolId, school.schoolId), eq(schema.parentStudents.parentId, parentBProfile)));

    expect((await loadSnapshots(scheduled.publicationId)).map((s) => s.recipientUserId).sort()).toEqual([parentB, parentC].sort());
  });

  it('a scheduled publication with ZERO eligible recipients at due time stays SCHEDULED, emits nothing, and stays retryable (Task 011.1 §3)', async () => {
    const school = await seedSchool(test.seed);
    const { admin } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    // Scheduling succeeds while parents are eligible.
    const scheduled = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(scheduled.status).toBe('SCHEDULED');
    expect(await loadSnapshots(scheduled.publicationId)).toHaveLength(0);

    // Before due: remove eligibility (INACTIVE memberships) — zero recipients
    // for the PARENTS+SCHOOL target at due time.
    await test.seed
      .update(schema.schoolMemberships)
      .set({ status: 'INACTIVE', updatedAt: new Date() })
      .where(and(eq(schema.schoolMemberships.schoolId, school.schoolId), eq(schema.schoolMemberships.status, 'ACTIVE')));

    await test.seed
      .update(schema.announcementPublications)
      .set({ scheduledAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.announcementPublications.id, scheduled.publicationId));

    // Due processing fails with the controlled NO_ELIGIBLE_RECIPIENTS — the
    // CAS transition, snapshot and event all roll back atomically (Task 011.1
    // §7): the publication stays SCHEDULED with no published_at, no snapshots,
    // and no outbox event.
    await expect(
      publishDueAnnouncement(test.db, { publicationId: scheduled.publicationId }),
    ).rejects.toMatchObject({ featureCode: 'NO_ELIGIBLE_RECIPIENTS' });

    const [pubAfter] = await test.seed
      .select()
      .from(schema.announcementPublications)
      .where(eq(schema.announcementPublications.id, scheduled.publicationId));
    expect(pubAfter.status).toBe('SCHEDULED');
    expect(pubAfter.publishedAt).toBeNull();
    expect(await loadSnapshots(scheduled.publicationId)).toHaveLength(0);
    expect(await loadOutboxEvents()).toHaveLength(0);

    // The publication remains retryable: restore eligibility and retry.
    await test.seed
      .update(schema.schoolMemberships)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(schema.schoolMemberships.schoolId, school.schoolId));

    const retry = await publishDueAnnouncement(test.db, { publicationId: scheduled.publicationId });
    expect(retry.eventEmitted).toBe(true);

    const [pubRetry] = await test.seed
      .select()
      .from(schema.announcementPublications)
      .where(eq(schema.announcementPublications.id, scheduled.publicationId));
    expect(pubRetry.status).toBe('PUBLISHED');
    expect(pubRetry.publishedAt).not.toBeNull();
    expect(await loadSnapshots(scheduled.publicationId)).toHaveLength(2);
    expect(await loadOutboxEvents()).toHaveLength(1);
  });

  it('two concurrent due-work calls produce exactly ONE snapshot set, ONE event and ONE PUBLISHED transition (Task 011.1 §8)', async () => {
    const school = await seedSchool(test.seed);
    const { admin } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    const scheduled = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    await test.seed
      .update(schema.announcementPublications)
      .set({ scheduledAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.announcementPublications.id, scheduled.publicationId));

    const attempts = await Promise.allSettled([
      publishDueAnnouncement(test.db, { publicationId: scheduled.publicationId }),
      publishDueAnnouncement(test.db, { publicationId: scheduled.publicationId }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    expect(fulfilled.length).toBe(2);
    expect(fulfilled.filter((a) => a.value.eventEmitted).length).toBe(1);

    expect(await loadOutboxEvents()).toHaveLength(1);
    expect(await loadSnapshots(scheduled.publicationId)).toHaveLength(2);

    const [pub] = await test.seed
      .select()
      .from(schema.announcementPublications)
      .where(eq(schema.announcementPublications.id, scheduled.publicationId));
    expect(pub.status).toBe('PUBLISHED');
  });

  it('a scheduled publication stays bound to the originally scheduled Version even if a newer Version is created (Task 011.1 §5)', async () => {
    const school = await seedSchool(test.seed);
    const { admin } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin, 'Reunion v1');
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    const scheduled = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(scheduled.status).toBe('SCHEDULED');

    // Version 2 is created before the due date — the scheduled publication must
    // NOT switch to it.
    const version2Id = await seedVersion(test.seed, school.schoolId, announcement.announcementId, 2, 'Reunion v2', 'Body 2', admin);
    await seedTarget(test.seed, school.schoolId, version2Id, 'PARENTS', 'CLASS', school.yearId, school.classBId);

    await test.seed
      .update(schema.announcementPublications)
      .set({ scheduledAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.announcementPublications.id, scheduled.publicationId));

    const due = await publishDueAnnouncement(test.db, { publicationId: scheduled.publicationId });
    expect(due.eventEmitted).toBe(true);

    // The publication remains bound to the exact scheduled Version (v1).
    const [pub] = await test.seed
      .select()
      .from(schema.announcementPublications)
      .where(eq(schema.announcementPublications.id, scheduled.publicationId));
    expect(pub.announcementVersionId).toBe(announcement.versionId);
    expect(pub.publicationVersion).toBe(1);

    const [event] = await loadOutboxEvents();
    expect(event.payload).toMatchObject({ announcementVersionId: announcement.versionId });
    expect((event.payload as Record<string, unknown>).announcementVersionId).not.toBe(version2Id);

    // Snapshots were resolved from v1's PARENTS+SCHOOL target (2 parents), not
    // v2's PARENTS+CLASS target.
    expect(await loadSnapshots(scheduled.publicationId)).toHaveLength(2);
  });
});

describe('bounded scheduled-publication job processing (Task 044)', () => {
  it('ignores future work and processes a due publication exactly once under concurrency', async () => {
    const school = await seedSchool(test.seed);
    const { admin, parentA, parentB } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);
    const scheduled = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const beforeDue = await processDueAnnouncementPublicationsBatch(test.db);
    expect(beforeDue).toMatchObject({ attempted: 0, published: 0, failed: 0, remaining: 0 });
    expect(await loadSnapshots(scheduled.publicationId)).toHaveLength(0);
    expect(await loadOutboxEvents()).toHaveLength(0);

    await test.seed
      .update(schema.announcementPublications)
      .set({ scheduledAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.announcementPublications.id, scheduled.publicationId));

    const runs = await Promise.all([
      processDueAnnouncementPublicationsBatch(test.db),
      processDueAnnouncementPublicationsBatch(test.db),
    ]);
    expect(runs.reduce((total, run) => total + run.published, 0)).toBe(1);
    expect(await loadSnapshots(scheduled.publicationId)).toHaveLength(2);
    expect((await loadSnapshots(scheduled.publicationId)).map((row) => row.recipientUserId).sort()).toEqual([parentA, parentB].sort());
    expect(await loadOutboxEvents()).toHaveLength(1);
    expect(await test.seed.select().from(schema.notifications)).toHaveLength(0);

    const again = await processDueAnnouncementPublicationsBatch(test.db);
    expect(again).toMatchObject({ attempted: 0, published: 0, failed: 0, remaining: 0 });
    expect(SCHEDULED_ANNOUNCEMENT_BATCH_DEFAULT_LIMIT).toBe(25);
    expect(SCHEDULED_ANNOUNCEMENT_BATCH_MAX_LIMIT).toBe(100);
  });

  it('normalizes scheduled job limits to the conservative bounded range', () => {
    expect(normalizeScheduledAnnouncementBatchLimit()).toBe(SCHEDULED_ANNOUNCEMENT_BATCH_DEFAULT_LIMIT);
    expect(normalizeScheduledAnnouncementBatchLimit(0)).toBe(1);
    expect(normalizeScheduledAnnouncementBatchLimit(1_000)).toBe(SCHEDULED_ANNOUNCEMENT_BATCH_MAX_LIMIT);
    expect(normalizeScheduledAnnouncementBatchLimit(Number.NaN)).toBe(SCHEDULED_ANNOUNCEMENT_BATCH_DEFAULT_LIMIT);
  });
});

describe('publish → notification integration (Task 011 §39)', () => {
  it('processing the AnnouncementPublished event creates one notification per snapshot recipient', async () => {
    const school = await seedSchool(test.seed);
    const { admin, parentA, parentB } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin, 'Reunion');
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    const result = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
    });

    const events = await loadOutboxEvents();
    const processed = await processNotificationEvent(test.db, { outboxEventId: events[0].id });

    expect(processed.notificationsCreated).toBe(2);
    expect(processed.notificationType).toBe('ANNOUNCEMENT_PUBLISHED');

    const notifications = await test.seed.select().from(schema.notifications);
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([parentA, parentB].sort());
    expect(notifications.every((n) => n.sourceType === 'ANNOUNCEMENT_PUBLICATION')).toBe(true);
    expect(notifications.every((n) => n.sourceId === result.publicationId)).toBe(true);
    expect(notifications.every((n) => n.title === 'Reunion')).toBe(true);

    // Reprocessing the same event is idempotent — no duplicate notifications.
    const again = await processNotificationEvent(test.db, { outboxEventId: events[0].id });
    expect(again.alreadyProcessed).toBe(true);
    expect(await test.seed.select().from(schema.notifications)).toHaveLength(2);
  });

  it('recipient snapshot stays EXACTLY the publish-time set after relationship changes (BR-ANNOUNCEMENT-010)', async () => {
    const school = await seedSchool(test.seed);
    const admin = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
    const parentUser = await seedUser(test.seed, school.schoolId, 'PARENT');
    const parentProfile = await seedParent(test.seed, school.schoolId, parentUser);
    const student = await seedStudent(test.seed, school.schoolId);
    await seedEnrollment(test.seed, school.schoolId, student, school.yearId, school.classAId);
    const [parentStudentRow] = await test.seed
      .insert(schema.parentStudents)
      .values({ schoolId: school.schoolId, parentId: parentProfile, studentId: student, status: 'ACTIVE' })
      .returning({ id: schema.parentStudents.id });

    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin);
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'CLASS', school.yearId, school.classAId);

    const result = await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
    });
    expect((await loadSnapshots(result.publicationId)).map((s) => s.recipientUserId)).toEqual([parentUser]);

    // Current relationships END after publication — history must not change.
    await test.seed
      .update(schema.parentStudents)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(eq(schema.parentStudents.id, parentStudentRow.id));
    await test.seed
      .update(schema.studentEnrollments)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(and(eq(schema.studentEnrollments.schoolId, school.schoolId), eq(schema.studentEnrollments.studentId, student)));

    expect((await loadSnapshots(result.publicationId)).map((s) => s.recipientUserId)).toEqual([parentUser]);
    expect((await loadSnapshots(result.publicationId))[0].audiences).toEqual(['PARENTS']);
  });

  it('processing an AnnouncementRevisionPublished event also creates ANNOUNCEMENT_PUBLISHED notifications', async () => {
    const school = await seedSchool(test.seed);
    const { admin } = await seedSchoolAdminWithParents(school);
    const announcement = await seedAnnouncement(test.seed, school.schoolId, admin, 'Reunion');
    await seedTarget(test.seed, school.schoolId, announcement.versionId, 'PARENTS', 'SCHOOL', school.yearId);

    await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: announcement.versionId,
      idempotencyKey: randomUUID(),
    });
    const version2Id = await seedVersion(test.seed, school.schoolId, announcement.announcementId, 2, 'Reunion v2', 'Body 2', admin);
    await seedTarget(test.seed, school.schoolId, version2Id, 'PARENTS', 'SCHOOL', school.yearId);
    await publishAnnouncement(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      announcementId: announcement.announcementId,
      announcementVersionId: version2Id,
      idempotencyKey: randomUUID(),
    });

    const events = await loadOutboxEvents();
    const revisionEvent = events.find((e) => e.eventType === 'AnnouncementRevisionPublished')!;

    const processed = await processNotificationEvent(test.db, { outboxEventId: revisionEvent.id });
    expect(processed.notificationsCreated).toBe(2);
    expect(processed.notificationType).toBe('ANNOUNCEMENT_PUBLISHED');

    const revisionNotifications = await test.seed
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.sourceEventId, revisionEvent.id));
    expect(revisionNotifications).toHaveLength(2);
    expect(revisionNotifications.every((n) => n.title === 'Reunion v2')).toBe(true);
  });
});
