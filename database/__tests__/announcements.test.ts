import { and, eq, sql } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../drizzle/schema';
import { createTestDb, type Db } from './helpers';

/**
 * Announcements foundation — database integration tests (Task 009 §43–§45).
 *
 * These tests verify the SCHEMA invariants only:
 * - Announcement logical object + lifecycle + archive
 * - AnnouncementVersion uniqueness/immutability
 * - Target audience + SCHOOL/CLASS invariants + duplicate-logical-target
 *   prevention + tenant isolation
 * - Publication: exact-version reference, scheduling, idempotency,
 *   per-Announcement sequence, concurrency-safe uniqueness
 * - Recipient snapshots: deduplication, immutability after relationship
 *   changes (§44), tenant isolation (§45)
 * - RESTRICT delete behavior (§32)
 *
 * Application-layer rules (author active SchoolMembership, recipient active
 * SchoolMembership, recipient resolution from current relationships) are
 * Task 009 §6/§24–§27/§46 and are NOT enforced by the database — the pure
 * resolver is tested in apps/web.
 */
let db: Db;

async function createSchool(name: string) {
  const [school] = await db.insert(schema.schools).values({ name }).returning();
  return school;
}

async function createUser() {
  const id = randomUUID();
  await db.insert(authUsers).values({ id, email: `${id}@test.example` });
  await db.insert(schema.users).values({ id, email: `${id}@test.example` });
  return id;
}

async function createAcademicYear(schoolId: string, name: string, startDate = '2025-09-01', endDate = '2026-07-01') {
  const [row] = await db
    .insert(schema.academicYears)
    .values({ schoolId, name, startDate, endDate })
    .returning();
  return row;
}

async function createAcademicPeriod(
  schoolId: string,
  academicYearId: string,
  name: string,
  sequence = 1,
  startDate = '2025-09-01',
  endDate = '2025-12-20',
) {
  const [row] = await db
    .insert(schema.academicPeriods)
    .values({ schoolId, academicYearId, name, sequence, startDate, endDate })
    .returning();
  return row;
}

async function createStage(schoolId: string, name: string, sequence = 1) {
  const [row] = await db.insert(schema.stages).values({ schoolId, name, sequence }).returning();
  return row;
}

async function createLevel(schoolId: string, stageId: string, name: string, sequence = 1) {
  const [row] = await db
    .insert(schema.levels)
    .values({ schoolId, stageId, name, sequence })
    .returning();
  return row;
}

async function createCurriculum(schoolId: string, name: string) {
  const [row] = await db.insert(schema.curricula).values({ schoolId, name }).returning();
  return row;
}

async function createCurriculumVersion(schoolId: string, curriculumId: string, name: string) {
  const [row] = await db
    .insert(schema.curriculumVersions)
    .values({ schoolId, curriculumId, name })
    .returning();
  return row;
}

async function createClass(
  schoolId: string,
  academicYearId: string,
  levelId: string,
  curriculumVersionId: string,
  name: string,
) {
  const [row] = await db
    .insert(schema.classes)
    .values({ schoolId, academicYearId, levelId, curriculumVersionId, name })
    .returning();
  return row;
}

/** Creates the academic scaffolding (year + period + curriculum/version + stage/level + class). */
async function academicContext(schoolId: string, yearName = '2025/2026', className = 'Class A') {
  const year = await createAcademicYear(schoolId, yearName);
  const period = await createAcademicPeriod(schoolId, year.id, 'Term 1');
  const curriculum = await createCurriculum(schoolId, 'National Curriculum');
  const version = await createCurriculumVersion(schoolId, curriculum.id, '2025-2026');
  const stage = await createStage(schoolId, 'Primary');
  const level = await createLevel(schoolId, stage.id, '1st Year');
  const klass = await createClass(schoolId, year.id, level.id, version.id, className);
  return { year, period, version, level, klass };
}

/** Creates an ADDITIONAL Class inside an already-existing academic context. */
async function addClass(
  schoolId: string,
  year: { id: string },
  levelId: string,
  curriculumVersionId: string,
  name: string,
) {
  return createClass(schoolId, year.id, levelId, curriculumVersionId, name);
}

async function createStudent(schoolId: string, firstName = 'Amine', lastName = 'Benali') {
  const [row] = await db
    .insert(schema.students)
    .values({ schoolId, firstName, lastName })
    .returning();
  return row;
}

async function createTeacher(schoolId: string, firstName = 'Karim', lastName = 'Alaoui') {
  const [row] = await db
    .insert(schema.teachers)
    .values({ schoolId, firstName, lastName })
    .returning();
  return row;
}

async function createSubject(schoolId: string, name: string) {
  const [row] = await db.insert(schema.subjects).values({ schoolId, name }).returning();
  return row;
}

async function createParent(schoolId: string, userId: string, firstName = 'Nadia', lastName = 'Benali') {
  const [row] = await db
    .insert(schema.parents)
    .values({ schoolId, userId, firstName, lastName })
    .returning();
  return row;
}

async function createParentStudent(
  schoolId: string,
  parentId: string,
  studentId: string,
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
) {
  const [row] = await db
    .insert(schema.parentStudents)
    .values({ schoolId, parentId, studentId, status })
    .returning();
  return row;
}

async function createEnrollment(
  schoolId: string,
  studentId: string,
  academicYearId: string,
  classId: string,
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
  effectiveFrom = '2025-09-01',
  effectiveUntil?: string,
) {
  const [row] = await db
    .insert(schema.studentEnrollments)
    .values({ schoolId, studentId, academicYearId, classId, status, effectiveFrom, effectiveUntil })
    .returning();
  return row;
}

async function createAssignment(
  schoolId: string,
  teacherId: string,
  classId: string,
  subjectId: string,
  academicYearId: string,
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
  effectiveFrom = '2025-09-01',
  effectiveUntil?: string,
) {
  const [row] = await db
    .insert(schema.teacherAssignments)
    .values({ schoolId, teacherId, classId, subjectId, academicYearId, status, effectiveFrom, effectiveUntil })
    .returning();
  return row;
}

async function createMembership(schoolId: string, userId: string, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') {
  const [row] = await db
    .insert(schema.schoolMemberships)
    .values({ schoolId, userId, role: 'PARENT', status })
    .returning();
  return row;
}

async function createAnnouncement(schoolId: string, createdBy: string, status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED' = 'DRAFT') {
  const [row] = await db.insert(schema.announcements).values({ schoolId, createdBy, status }).returning();
  return row;
}

async function createVersion(
  schoolId: string,
  announcementId: string,
  versionNumber: number,
  title: string,
  body: string,
  createdBy: string,
) {
  const [row] = await db
    .insert(schema.announcementVersions)
    .values({ schoolId, announcementId, versionNumber, title, body, createdBy })
    .returning();
  return row;
}

async function createTarget(
  schoolId: string,
  announcementVersionId: string,
  audience: 'PARENTS' | 'TEACHERS',
  targetType: 'SCHOOL' | 'CLASS',
  academicYearId: string,
  classId: string | null = null,
) {
  const [row] = await db
    .insert(schema.announcementTargets)
    .values({ schoolId, announcementVersionId, audience, targetType, academicYearId, classId })
    .returning();
  return row;
}

interface PublicationOptions {
  status?: 'SCHEDULED' | 'PUBLISHED';
  scheduledAt?: Date;
  publishedAt?: Date;
}

async function createPublication(
  schoolId: string,
  announcementId: string,
  announcementVersionId: string,
  publicationVersion: number,
  publishedBy: string,
  idempotencyKey: string = randomUUID(),
  options: PublicationOptions = { status: 'PUBLISHED', publishedAt: new Date() },
) {
  const [row] = await db
    .insert(schema.announcementPublications)
    .values({ schoolId, announcementId, announcementVersionId, publicationVersion, publishedBy, idempotencyKey, ...options })
    .returning();
  return row;
}

async function createSnapshot(schoolId: string, publicationId: string, recipientUserId: string, audiences: string[]) {
  const [row] = await db
    .insert(schema.publicationRecipientSnapshots)
    .values({ schoolId, publicationId, recipientUserId, audiences })
    .returning();
  return row;
}

beforeEach(async () => {
  ({ db } = await createTestDb());
});

describe('announcements — logical object (Task 009 §43.1–§43.4)', () => {
  it('creates a valid school-owned announcement', async () => {
    const school = await createSchool('School A');
    const author = await createUser();

    const ann = await createAnnouncement(school.id, author);

    expect(ann.id).toBeDefined();
    expect(ann.schoolId).toBe(school.id);
    expect(ann.createdBy).toBe(author);
    expect(ann.status).toBe('DRAFT');
    expect(ann.createdAt).toBeInstanceOf(Date);
  });

  it('rejects an announcement without a valid author User (FK)', async () => {
    const school = await createSchool('School A');

    await expect(createAnnouncement(school.id, randomUUID())).rejects.toThrow();
  });

  it('supports the DRAFT → SCHEDULED → PUBLISHED → ARCHIVED lifecycle', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);

    const scheduled = await db
      .update(schema.announcements)
      .set({ status: 'SCHEDULED', updatedAt: new Date() })
      .where(eq(schema.announcements.id, ann.id))
      .returning();
    expect(scheduled[0].status).toBe('SCHEDULED');

    const published = await db
      .update(schema.announcements)
      .set({ status: 'PUBLISHED', updatedAt: new Date() })
      .where(eq(schema.announcements.id, ann.id))
      .returning();
    expect(published[0].status).toBe('PUBLISHED');

    const archived = await db
      .update(schema.announcements)
      .set({ status: 'ARCHIVED', updatedAt: new Date() })
      .where(eq(schema.announcements.id, ann.id))
      .returning();
    expect(archived[0].status).toBe('ARCHIVED');
  });

  it('rejects an invalid Announcement status', async () => {
    const school = await createSchool('School A');
    const author = await createUser();

    await expect(
      db.execute(
        sql`INSERT INTO announcements (school_id, created_by, status) VALUES (${school.id}, ${author}, 'VOID')`,
      ),
    ).rejects.toThrow();
  });

  it('archiving preserves Versions, Publications and recipient snapshots', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const { year } = await academicContext(school.id);
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'Reunion', 'Body', author);
    const pub = await createPublication(school.id, ann.id, version.id, 1, author);
    const recipient = await createUser();
    await createSnapshot(school.id, pub.id, recipient, ['PARENTS']);

    const archived = await db
      .update(schema.announcements)
      .set({ status: 'ARCHIVED', updatedAt: new Date() })
      .where(eq(schema.announcements.id, ann.id))
      .returning();
    expect(archived[0].status).toBe('ARCHIVED');

    expect(year.id).toBeDefined();
    const versions = await db
      .select()
      .from(schema.announcementVersions)
      .where(eq(schema.announcementVersions.announcementId, ann.id));
    const pubs = await db
      .select()
      .from(schema.announcementPublications)
      .where(eq(schema.announcementPublications.announcementId, ann.id));
    const snaps = await db
      .select()
      .from(schema.publicationRecipientSnapshots)
      .where(eq(schema.publicationRecipientSnapshots.publicationId, pub.id));
    expect(versions).toHaveLength(1);
    expect(pubs).toHaveLength(1);
    expect(snaps).toHaveLength(1);
  });
});

describe('announcement_versions — versioning (Task 009 §43.5–§43.8)', () => {
  it('creates a Version that belongs to its Announcement', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);

    const version = await createVersion(school.id, ann.id, 1, 'Reunion', 'Body', author);

    expect(version.id).toBeDefined();
    expect(version.announcementId).toBe(ann.id);
    expect(version.schoolId).toBe(school.id);
    expect(version.versionNumber).toBe(1);
    expect(version.title).toBe('Reunion');
    expect(version.body).toBe('Body');
    expect(version.createdBy).toBe(author);
  });

  it('rejects a duplicate version number within the same Announcement', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);
    await createVersion(school.id, ann.id, 1, 'Reunion', 'Body', author);

    await expect(createVersion(school.id, ann.id, 1, 'Reunion v2', 'Body 2', author)).rejects.toThrow();
  });

  it('allows multiple sequential versions', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);

    const v1 = await createVersion(school.id, ann.id, 1, 'Draft', 'First', author);
    const v2 = await createVersion(school.id, ann.id, 2, 'Draft', 'Second', author);
    const v3 = await createVersion(school.id, ann.id, 3, 'Draft', 'Third', author);

    expect([v1.versionNumber, v2.versionNumber, v3.versionNumber]).toEqual([1, 2, 3]);
  });

  it('allows the same version number in a DIFFERENT Announcement', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const annA = await createAnnouncement(school.id, author);
    const annB = await createAnnouncement(school.id, author);

    await createVersion(school.id, annA.id, 1, 'A', 'a', author);
    const b = await createVersion(school.id, annB.id, 1, 'B', 'b', author);

    expect(b.versionNumber).toBe(1);
  });

  it('keeps Versions historically distinct content snapshots', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);

    const v1 = await createVersion(school.id, ann.id, 1, 'Original', 'Original body', author);
    const v2 = await createVersion(school.id, ann.id, 2, 'Revised', 'Revised body', author);

    const [storedV1] = await db
      .select()
      .from(schema.announcementVersions)
      .where(and(eq(schema.announcementVersions.id, v1.id), eq(schema.announcementVersions.announcementId, ann.id)));
    expect(storedV1.title).toBe('Original');
    expect(storedV1.body).toBe('Original body');
    expect(v2.title).toBe('Revised');
    expect(v2.body).toBe('Revised body');
  });
});

describe('announcement_targets — targeting (Task 009 §43.9–§43.14)', () => {
  it('creates a SCHOOL target', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const { year } = await academicContext(school.id);
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'School-wide', 'Body', author);

    const target = await createTarget(school.id, version.id, 'PARENTS', 'SCHOOL', year.id);

    expect(target.targetType).toBe('SCHOOL');
    expect(target.audience).toBe('PARENTS');
    expect(target.classId).toBeNull();
  });

  it('creates a CLASS target', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const { year, klass } = await academicContext(school.id);
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'Class news', 'Body', author);

    const target = await createTarget(school.id, version.id, 'PARENTS', 'CLASS', year.id, klass.id);

    expect(target.targetType).toBe('CLASS');
    expect(target.classId).toBe(klass.id);
  });

  it('rejects a CLASS target without a Class (CHECK)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const { year } = await academicContext(school.id);
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);

    await expect(
      db.execute(
        sql`INSERT INTO announcement_targets (school_id, announcement_version_id, audience, target_type, academic_year_id, class_id)
            VALUES (${school.id}, ${version.id}, 'PARENTS', 'CLASS', ${year.id}, NULL)`,
      ),
    ).rejects.toThrow();
  });

  it('rejects a SCHOOL target that carries a Class reference (CHECK)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const { year, klass } = await academicContext(school.id);
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);

    await expect(
      db.execute(
        sql`INSERT INTO announcement_targets (school_id, announcement_version_id, audience, target_type, academic_year_id, class_id)
            VALUES (${school.id}, ${version.id}, 'PARENTS', 'SCHOOL', ${year.id}, ${klass.id})`,
      ),
    ).rejects.toThrow();
  });

  it('rejects a CLASS target that references an unknown Class (FK)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const { year } = await academicContext(school.id);
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);

    await expect(createTarget(school.id, version.id, 'PARENTS', 'CLASS', year.id, randomUUID())).rejects.toThrow();
  });

  it('rejects a duplicate logical CLASS target (same version + audience + Class)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const { year, klass } = await academicContext(school.id);
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);

    await createTarget(school.id, version.id, 'PARENTS', 'CLASS', year.id, klass.id);
    await expect(createTarget(school.id, version.id, 'PARENTS', 'CLASS', year.id, klass.id)).rejects.toThrow();
  });

  it('rejects a duplicate logical SCHOOL target (same version + audience)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const { year } = await academicContext(school.id);
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);

    await createTarget(school.id, version.id, 'PARENTS', 'SCHOOL', year.id);
    await expect(createTarget(school.id, version.id, 'PARENTS', 'SCHOOL', year.id)).rejects.toThrow();
  });

  it('allows multiple valid targets across audiences and Classes', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const { year, level, version: cv, klass: classA } = await academicContext(school.id);
    const classB = await addClass(school.id, year, level.id, cv.id, 'Class B');
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);

    await createTarget(school.id, version.id, 'PARENTS', 'CLASS', year.id, classA.id);
    await createTarget(school.id, version.id, 'PARENTS', 'CLASS', year.id, classB.id);
    await createTarget(school.id, version.id, 'TEACHERS', 'CLASS', year.id, classA.id);
    await createTarget(school.id, version.id, 'PARENTS', 'SCHOOL', year.id);
    await createTarget(school.id, version.id, 'TEACHERS', 'SCHOOL', year.id);

    const targets = await db.select().from(schema.announcementTargets).where(eq(schema.announcementTargets.announcementVersionId, version.id));
    expect(targets).toHaveLength(5);
  });

  it('rejects an unsupported audience', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const { year } = await academicContext(school.id);
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);

    await expect(
      db.execute(
        sql`INSERT INTO announcement_targets (school_id, announcement_version_id, audience, target_type, academic_year_id, class_id)
            VALUES (${school.id}, ${version.id}, 'STUDENTS', 'SCHOOL', ${year.id}, NULL)`,
      ),
    ).rejects.toThrow();
  });
});

describe('announcement_publications — publication (Task 009 §43.15–§43.19)', () => {
  it('creates a publication referencing exactly one Version', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);

    const pub = await createPublication(school.id, ann.id, version.id, 1, author);

    expect(pub.announcementVersionId).toBe(version.id);
    expect(pub.announcementId).toBe(ann.id);
    expect(pub.publicationVersion).toBe(1);
    expect(pub.publishedBy).toBe(author);
    expect(pub.status).toBe('PUBLISHED');
    expect(pub.publishedAt).toBeInstanceOf(Date);
  });

  it('stores a scheduled publication with scheduled_at', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    const scheduledAt = new Date(Date.now() + 3_600_000);

    const pub = await createPublication(school.id, ann.id, version.id, 1, author, randomUUID(), {
      status: 'SCHEDULED',
      scheduledAt,
    });

    expect(pub.status).toBe('SCHEDULED');
    expect(pub.scheduledAt).toBeInstanceOf(Date);
    expect(pub.scheduledAt.getTime()).toBe(scheduledAt.getTime());
    expect(pub.publishedAt).toBeNull();
  });

  it('rejects a PUBLISHED publication without published_at (CHECK)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);

    await expect(
      createPublication(school.id, ann.id, version.id, 1, author, randomUUID(), { status: 'PUBLISHED' }),
    ).rejects.toThrow();
  });

  it('rejects a SCHEDULED publication without scheduled_at (CHECK)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);

    await expect(
      createPublication(school.id, ann.id, version.id, 1, author, randomUUID(), { status: 'SCHEDULED' }),
    ).rejects.toThrow();
  });

  it('rejects a publication whose scheduled_at is after published_at (CHECK)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);

    await expect(
      createPublication(school.id, ann.id, version.id, 1, author, randomUUID(), {
        status: 'PUBLISHED',
        scheduledAt: new Date(Date.now() + 3_600_000),
        publishedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate idempotency key (idempotency constraint)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    const idempotencyKey = randomUUID();

    await createPublication(school.id, ann.id, version.id, 1, author, idempotencyKey);
    await expect(createPublication(school.id, ann.id, version.id, 2, author, idempotencyKey)).rejects.toThrow();
  });

  it('rejects a duplicate publication version within the same Announcement', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const v1 = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    const v2 = await createVersion(school.id, ann.id, 2, 'T', 'c', author);

    await createPublication(school.id, ann.id, v1.id, 1, author);
    await expect(createPublication(school.id, ann.id, v2.id, 1, author)).rejects.toThrow();
  });

  it('allows the same publication version number in DIFFERENT Announcements (per-Announcement sequence)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const annA = await createAnnouncement(school.id, author);
    const annB = await createAnnouncement(school.id, author);
    const va = await createVersion(school.id, annA.id, 1, 'A', 'a', author);
    const vb = await createVersion(school.id, annB.id, 1, 'B', 'b', author);

    const pa = await createPublication(school.id, annA.id, va.id, 1, author);
    const pb = await createPublication(school.id, annB.id, vb.id, 1, author);

    expect(pa.publicationVersion).toBe(1);
    expect(pb.publicationVersion).toBe(1);
  });
});

describe('publication_recipient_snapshots — snapshots (Task 009 §43.20–§43.23)', () => {
  it('creates a valid recipient snapshot', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const recipient = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    const pub = await createPublication(school.id, ann.id, version.id, 1, author);

    const snap = await createSnapshot(school.id, pub.id, recipient, ['PARENTS']);

    expect(snap.publicationId).toBe(pub.id);
    expect(snap.schoolId).toBe(school.id);
    expect(snap.recipientUserId).toBe(recipient);
    expect(snap.audiences).toEqual(['PARENTS']);
  });

  it('stores ALL matched audiences for one recipient in a single snapshot row (Task 009.1)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const recipient = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    const pub = await createPublication(school.id, ann.id, version.id, 1, author);

    const snap = await createSnapshot(school.id, pub.id, recipient, ['PARENTS', 'TEACHERS']);

    expect(snap.recipientUserId).toBe(recipient);
    expect(snap.audiences).toEqual(['PARENTS', 'TEACHERS']);
  });

  it('rejects an audiences payload containing an unknown audience (CHECK)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const recipient = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    const pub = await createPublication(school.id, ann.id, version.id, 1, author);

    await expect(
      db.execute(
        sql`INSERT INTO publication_recipient_snapshots (school_id, publication_id, recipient_user_id, audiences)
            VALUES (${school.id}, ${pub.id}, ${recipient}, CAST('["PARENTS","STUDENTS"]' AS jsonb))`,
      ),
    ).rejects.toThrow();
  });

  it('rejects an empty audiences array (CHECK)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const recipient = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    const pub = await createPublication(school.id, ann.id, version.id, 1, author);

    await expect(
      db.execute(
        sql`INSERT INTO publication_recipient_snapshots (school_id, publication_id, recipient_user_id, audiences)
            VALUES (${school.id}, ${pub.id}, ${recipient}, CAST('[]' AS jsonb))`,
      ),
    ).rejects.toThrow();
  });

  it('rejects a non-array audiences payload (CHECK)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const recipient = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    const pub = await createPublication(school.id, ann.id, version.id, 1, author);

    await expect(
      db.execute(
        sql`INSERT INTO publication_recipient_snapshots (school_id, publication_id, recipient_user_id, audiences)
            VALUES (${school.id}, ${pub.id}, ${recipient}, CAST('{"audience":"PARENTS"}' AS jsonb))`,
      ),
    ).rejects.toThrow();
  });

  it('rejects duplicate audiences in one snapshot payload (CHECK)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const recipient = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    const pub = await createPublication(school.id, ann.id, version.id, 1, author);

    await expect(
      db.execute(
        sql`INSERT INTO publication_recipient_snapshots (school_id, publication_id, recipient_user_id, audiences)
            VALUES (${school.id}, ${pub.id}, ${recipient}, CAST('["PARENTS","PARENTS"]' AS jsonb))`,
      ),
    ).rejects.toThrow();
  });

  it('rejects a duplicate recipient for the same publication (deduplication)', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const recipient = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    const pub = await createPublication(school.id, ann.id, version.id, 1, author);

    await createSnapshot(school.id, pub.id, recipient, ['PARENTS']);
    await expect(createSnapshot(school.id, pub.id, recipient, ['PARENTS'])).rejects.toThrow();
  });

  it('allows the same recipient in DIFFERENT publications', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const recipient = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const v1 = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    const v2 = await createVersion(school.id, ann.id, 2, 'T', 'c', author);
    const pub1 = await createPublication(school.id, ann.id, v1.id, 1, author);
    const pub2 = await createPublication(school.id, ann.id, v2.id, 2, author);

    await createSnapshot(school.id, pub1.id, recipient, ['PARENTS']);
    const snap2 = await createSnapshot(school.id, pub2.id, recipient, ['PARENTS']);

    expect(snap2.recipientUserId).toBe(recipient);
  });

  it('recipient snapshot survives current relationship changes (§44 historical snapshot)', async () => {
    const school = await createSchool('School A');
    const { year, level, version: cv, klass: classA } = await academicContext(school.id);
    const classB = await addClass(school.id, year, level.id, cv.id, 'Class B');
    const subject = await createSubject(school.id, 'Mathematics');

    const author = await createUser();
    const parentUser = await createUser();
    const teacherUser = await createUser();
    const parent = await createParent(school.id, parentUser);
    const teacher = await createTeacher(school.id, 'Karim', 'Alaoui');
    await db.update(schema.teachers).set({ userId: teacherUser }).where(eq(schema.teachers.id, teacher.id));
    const student = await createStudent(school.id);

    await createEnrollment(school.id, student.id, year.id, classA.id);
    await createParentStudent(school.id, parent.id, student.id);
    await createAssignment(school.id, teacher.id, classA.id, subject.id, year.id);
    await createMembership(school.id, parentUser);

    // Publish #1: PARENTS + TEACHERS → Class A.
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'Reunion', 'Body', author);
    await createTarget(school.id, version.id, 'PARENTS', 'CLASS', year.id, classA.id);
    await createTarget(school.id, version.id, 'TEACHERS', 'CLASS', year.id, classA.id);
    const pub = await createPublication(school.id, ann.id, version.id, 1, author);
    await createSnapshot(school.id, pub.id, parentUser, ['PARENTS']);
    await createSnapshot(school.id, pub.id, teacherUser, ['TEACHERS']);

    // Current state changes: Student leaves Class A (enrollment ENDED), a new
    // enrollment opens in Class B, ParentStudent ENDED, TeacherAssignment ENDED,
    // membership INACTIVE.
    await db
      .update(schema.studentEnrollments)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(
        and(
          eq(schema.studentEnrollments.schoolId, school.id),
          eq(schema.studentEnrollments.classId, classA.id),
          eq(schema.studentEnrollments.status, 'ACTIVE'),
        ),
      );
    await createEnrollment(school.id, student.id, year.id, classB.id);
    await db
      .update(schema.parentStudents)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(eq(schema.parentStudents.parentId, parent.id));
    const [assignment] = await db
      .select()
      .from(schema.teacherAssignments)
      .where(
        and(
          eq(schema.teacherAssignments.schoolId, school.id),
          eq(schema.teacherAssignments.teacherId, teacher.id),
          eq(schema.teacherAssignments.classId, classA.id),
          eq(schema.teacherAssignments.subjectId, subject.id),
        ),
      );
    await db
      .update(schema.teacherAssignments)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(eq(schema.teacherAssignments.id, assignment.id));
    await db.update(schema.schoolMemberships).set({ status: 'INACTIVE' }).where(eq(schema.schoolMemberships.userId, parentUser));

    // The historical recipient snapshot must remain EXACTLY as it was.
    const snaps = await db
      .select()
      .from(schema.publicationRecipientSnapshots)
      .where(eq(schema.publicationRecipientSnapshots.publicationId, pub.id))
      .orderBy(schema.publicationRecipientSnapshots.recipientUserId);
    expect(snaps).toHaveLength(2);
    expect(snaps.map((s) => s.recipientUserId).sort()).toEqual([parentUser, teacherUser].sort());
    expect(snaps.map((s) => s.audiences).sort()).toEqual([['PARENTS'], ['TEACHERS']].sort());
    expect(snaps.every((s) => s.schoolId === school.id)).toBe(true);

    // The version + publication rows are untouched too.
    const [storedPub] = await db
      .select()
      .from(schema.announcementPublications)
      .where(eq(schema.announcementPublications.id, pub.id));
    expect(storedPub.announcementVersionId).toBe(version.id);
  });
});

describe('announcements — tenant isolation (Task 009 §45)', () => {
  it('rejects a School B Version for a School A Announcement', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const author = await createUser();
    const ann = await createAnnouncement(schoolA.id, author);

    await expect(createVersion(schoolB.id, ann.id, 1, 'T', 'b', author)).rejects.toThrow();
  });

  it('rejects a School B Class target for a School A Version', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const author = await createUser();
    const { year: yearA } = await academicContext(schoolA.id);
    const { year: yearB, klass: classB } = await academicContext(schoolB.id);
    const ann = await createAnnouncement(schoolA.id, author);
    const version = await createVersion(schoolA.id, ann.id, 1, 'T', 'b', author);

    await expect(
      createTarget(schoolA.id, version.id, 'PARENTS', 'CLASS', yearB.id, classB.id),
    ).rejects.toThrow();
    expect(yearA.id).toBeDefined();
  });

  it('rejects a School B Version referenced by a School A Publication', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const author = await createUser();
    const ann = await createAnnouncement(schoolA.id, author);
    const versionB = await createVersion(schoolB.id, (await createAnnouncement(schoolB.id, author)).id, 1, 'T', 'b', author);

    await expect(createPublication(schoolA.id, ann.id, versionB.id, 1, author)).rejects.toThrow();
  });

  it('rejects a recipient snapshot whose School does not match its Publication', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const author = await createUser();
    const recipient = await createUser();
    const ann = await createAnnouncement(schoolA.id, author);
    const version = await createVersion(schoolA.id, ann.id, 1, 'T', 'b', author);
    const pub = await createPublication(schoolA.id, ann.id, version.id, 1, author);

    await expect(createSnapshot(schoolB.id, pub.id, recipient, ['PARENTS'])).rejects.toThrow();
  });
});

describe('announcements — delete behavior (Task 009 §32)', () => {
  it('restricts deleting a School that still has Announcements', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    await createAnnouncement(school.id, author);

    await expect(db.delete(schema.schools).where(eq(schema.schools.id, school.id))).rejects.toThrow();
  });

  it('restricts deleting an author User that still has Announcements', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    await createAnnouncement(school.id, author);

    await expect(db.delete(schema.users).where(eq(schema.users.id, author))).rejects.toThrow();
  });

  it('restricts deleting an Announcement that still has Versions', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const ann = await createAnnouncement(school.id, author);
    await createVersion(school.id, ann.id, 1, 'T', 'b', author);

    await expect(db.delete(schema.announcements).where(eq(schema.announcements.id, ann.id))).rejects.toThrow();
  });

  it('restricts deleting a Version that still has targets or publications', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const { year } = await academicContext(school.id);
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    await createTarget(school.id, version.id, 'PARENTS', 'SCHOOL', year.id);
    await createPublication(school.id, ann.id, version.id, 1, author);

    await expect(db.delete(schema.announcementVersions).where(eq(schema.announcementVersions.id, version.id))).rejects.toThrow();
  });

  it('restricts deleting a Publication that still has recipient snapshots', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const recipient = await createUser();
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'T', 'b', author);
    const pub = await createPublication(school.id, ann.id, version.id, 1, author);
    await createSnapshot(school.id, pub.id, recipient, ['PARENTS']);

    await expect(
      db.delete(schema.announcementPublications).where(eq(schema.announcementPublications.id, pub.id)),
    ).rejects.toThrow();
  });
});
