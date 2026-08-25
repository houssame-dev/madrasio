import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@school/database';

import * as app from '@/lib/modules/announcements/application';
import {
  announcementCreateSchema, announcementTargetsCreateSchema,
} from '@/lib/modules/announcements/domain';

import {
  createAnnouncementsTestDb, seedAssignment, seedParent, seedParentStudent, seedSchool,
  seedStudent, seedTeacher, seedUser, type AnnouncementsTestDb, type SeededSchool,
} from './test-helpers';

let test: AnnouncementsTestDb;
let school: SeededSchool;
let adminId: string;
let admin: { userId: string; schoolId: string };

beforeEach(async () => {
  test = await createAnnouncementsTestDb();
  school = await seedSchool(test.seed);
  adminId = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
  admin = { userId: adminId, schoolId: school.schoolId };
});

async function create(title = 'School news', body = 'Complete announcement body.') {
  return app.createAnnouncement(test.db, admin, { title, body });
}

async function addClassTarget(announcementId: string, versionId: string, classId = school.classAId) {
  return app.addAnnouncementTargets(test.db, admin, announcementId, {
    announcementVersionId: versionId,
    targets: [{
      audience: 'PARENTS', targetType: 'CLASS', academicYearId: school.yearId, classId,
    }],
  });
}

describe('Announcement management and version history', () => {
  it('strictly rejects authoritative fields and creates logical Announcement + Version 1 atomically', async () => {
    expect(announcementCreateSchema.safeParse({ title: 'News', body: 'Body' }).success).toBe(true);
    expect(announcementCreateSchema.safeParse({
      title: 'News', body: 'Body', schoolId: school.schoolId,
    }).success).toBe(false);
    expect(announcementCreateSchema.safeParse({
      title: 'News', body: 'Body', createdBy: adminId,
    }).success).toBe(false);
    const created = await create();
    expect(created).toMatchObject({
      announcement: { status: 'DRAFT', createdBy: adminId },
      version: { versionNumber: 1, title: 'School news' },
    });
    expect(created.announcement).not.toHaveProperty('schoolId');
    expect(await test.seed.select().from(schema.announcements)).toHaveLength(1);
    expect(await test.seed.select().from(schema.announcementVersions)).toHaveLength(1);
    expect(await test.seed.select().from(schema.announcementPublications)).toHaveLength(0);
    expect(await test.seed.select().from(schema.outboxEvents)).toHaveLength(0);
  });

  it('lists current-School data with filters, deterministic paging, and bounded detail summaries', async () => {
    const first = await create('Alpha notice');
    await addClassTarget(first.announcement.id, first.version.id);
    await create('Beta notice');
    const list = await app.listAnnouncements(test.db, admin, {
      page: 1, pageSize: 1, status: 'DRAFT', audience: 'PARENTS',
      targetType: 'CLASS', classId: school.classAId, search: 'Alpha',
    });
    expect(list).toMatchObject({ data: [{ id: first.announcement.id }], meta: { page: 1, pageSize: 1, total: 1 } });
    const detail = await app.getAnnouncement(test.db, admin, first.announcement.id);
    expect(detail).toMatchObject({
      announcement: { id: first.announcement.id },
      latestVersion: { id: first.version.id },
      targetSummary: { count: 1, audiences: ['PARENTS'], targetTypes: ['CLASS'] },
      publicationSummary: { count: 0, latest: null },
    });
    expect(detail).not.toHaveProperty('recipientSnapshots');
  });

  it('loads each paginated Announcement latest Version set-wise without changing list semantics', async () => {
    const first = await create('First v1');
    const firstV2 = await app.createAnnouncementVersion(test.db, admin, first.announcement.id, {
      title: 'First v2', body: 'Latest first body',
    });
    const second = await create('Second v1');
    await app.createAnnouncementVersion(test.db, admin, second.announcement.id, {
      title: 'Second v2', body: 'Older second body',
    });
    const secondV3 = await app.createAnnouncementVersion(test.db, admin, second.announcement.id, {
      title: 'Second v3', body: 'Latest second body',
    });
    const other = await seedSchool(test.seed, 'Other');
    const otherAdminId = await seedUser(test.seed, other.schoolId, 'SCHOOL_ADMIN');
    const foreign = await app.createAnnouncement(test.db, {
      userId: otherAdminId, schoolId: other.schoolId,
    }, { title: 'Foreign', body: 'Foreign body' });

    const list = await app.listAnnouncements(test.db, admin, { page: 1, pageSize: 50 });
    const latest = new Map(list.data.map((item) => [item.id, item.latestVersion]));
    expect(list.meta).toEqual({ page: 1, pageSize: 50, total: 2 });
    expect(latest.get(first.announcement.id)).toMatchObject({ id: firstV2.id, versionNumber: 2 });
    expect(latest.get(second.announcement.id)).toMatchObject({ id: secondV3.id, versionNumber: 3 });
    expect(latest.has(foreign.announcement.id)).toBe(false);

    const page1 = await app.listAnnouncements(test.db, admin, { page: 1, pageSize: 1 });
    const page2 = await app.listAnnouncements(test.db, admin, { page: 2, pageSize: 1 });
    expect(page1.data).toHaveLength(1);
    expect(page2.data).toHaveLength(1);
    expect(page1.data[0].id).not.toBe(page2.data[0].id);
    expect(page1.meta.total).toBe(2);
    expect(page2.meta.total).toBe(2);

    expect(await app.listAnnouncements(test.db, admin, { page: 99, pageSize: 50 }))
      .toEqual({ data: [], meta: { page: 99, pageSize: 50, total: 2 } });
  });

  it('preserves the existing null latestVersion behavior for an unexpected Version-less row', async () => {
    const [orphan] = await test.seed.insert(schema.announcements).values({
      schoolId: school.schoolId, createdBy: adminId,
    }).returning();
    const list = await app.listAnnouncements(test.db, admin, { page: 1, pageSize: 50 });
    expect(list.data.find((item) => item.id === orphan.id)?.latestVersion).toBeNull();
  });

  it('creates immutable sequential content snapshots and returns deterministic history', async () => {
    const created = await create('Version 1', 'Original');
    const second = await app.createAnnouncementVersion(test.db, admin, created.announcement.id, {
      title: 'Version 2', body: 'Revision',
    });
    expect(second).toMatchObject({ versionNumber: 2, title: 'Version 2' });
    const history = await app.listAnnouncementVersions(
      test.db, admin, created.announcement.id, { page: 1, pageSize: 50 },
    );
    expect(history.data.map((version) => [version.versionNumber, version.title])).toEqual([
      [2, 'Version 2'], [1, 'Version 1'],
    ]);
    expect((await test.seed.select().from(schema.announcementVersions).where(
      eq(schema.announcementVersions.id, created.version.id),
    ))[0]).toMatchObject({ title: 'Version 1', body: 'Original' });
  });

  it('keeps version numbers unique under concurrent server allocation', async () => {
    const created = await create();
    const settled = await Promise.allSettled([
      app.createAnnouncementVersion(test.db, admin, created.announcement.id, { title: 'A', body: 'A' }),
      app.createAnnouncementVersion(test.db, admin, created.announcement.id, { title: 'B', body: 'B' }),
    ]);
    const versions = await test.seed.select().from(schema.announcementVersions);
    expect(new Set(versions.map((version) => version.versionNumber)).size).toBe(versions.length);
    expect(settled.filter((result) => result.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    for (const rejected of settled.filter((result) => result.status === 'rejected')) {
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({
        featureCode: 'ANNOUNCEMENT_VERSION_CONFLICT',
      });
    }
  });

  it('archives safely without deleting history and blocks archive while a schedule exists', async () => {
    const created = await create();
    await addClassTarget(created.announcement.id, created.version.id);
    const parentUser = await seedUser(test.seed, school.schoolId, 'PARENT');
    const parentId = await seedParent(test.seed, school.schoolId, parentUser);
    const studentId = await seedStudent(test.seed, school.schoolId);
    await seedParentStudent(test.seed, school.schoolId, parentId, studentId);
    await test.seed.insert(schema.studentEnrollments).values({
      schoolId: school.schoolId, studentId, academicYearId: school.yearId,
      classId: school.classAId, status: 'ACTIVE', effectiveFrom: '2025-09-01',
    });
    await app.publishAnnouncement(test.db, {
      ...admin, announcementId: created.announcement.id, announcementVersionId: created.version.id,
      idempotencyKey: randomUUID(), scheduledAt: '2099-01-01T00:00:00.000Z',
    });
    await expect(app.patchAnnouncement(test.db, admin, created.announcement.id, { status: 'ARCHIVED' }))
      .rejects.toMatchObject({ featureCode: 'ANNOUNCEMENT_NOT_EDITABLE' });
    expect(await test.seed.select().from(schema.announcementVersions)).toHaveLength(1);
    expect(await test.seed.select().from(schema.announcementPublications)).toHaveLength(1);

    const plain = await create('Disposable draft');
    expect(await app.patchAnnouncement(test.db, admin, plain.announcement.id, { status: 'ARCHIVED' }))
      .toMatchObject({ status: 'ARCHIVED' });
    await expect(app.createAnnouncementVersion(test.db, admin, plain.announcement.id, { title: 'No', body: 'No' }))
      .rejects.toMatchObject({ featureCode: 'ANNOUNCEMENT_NOT_EDITABLE' });
  });

  it('hides foreign Announcements and denies Parent administration', async () => {
    const created = await create();
    const other = await seedSchool(test.seed, 'Other');
    const otherAdminId = await seedUser(test.seed, other.schoolId, 'SCHOOL_ADMIN');
    await expect(app.getAnnouncement(test.db, {
      userId: otherAdminId, schoolId: other.schoolId,
    }, created.announcement.id)).rejects.toMatchObject({ featureCode: 'ANNOUNCEMENT_NOT_FOUND' });
    const parentId = await seedUser(test.seed, school.schoolId, 'PARENT');
    await expect(app.listAnnouncements(test.db, {
      userId: parentId, schoolId: school.schoolId,
    }, { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies inactive Users and memberships through the real authorization pipeline', async () => {
    const created = await create();
    await test.seed.update(schema.users).set({ status: 'SUSPENDED' }).where(eq(schema.users.id, adminId));
    await expect(app.getAnnouncement(test.db, admin, created.announcement.id))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await test.seed.update(schema.users).set({ status: 'ACTIVE' }).where(eq(schema.users.id, adminId));
    await test.seed.update(schema.schoolMemberships).set({ status: 'INACTIVE' })
      .where(eq(schema.schoolMemberships.userId, adminId));
    await expect(app.listAnnouncements(test.db, admin, { page: 1, pageSize: 50 }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Announcement target and authorization management', () => {
  it('adds valid SCHOOL and multiple CLASS targets and controls logical duplicates', async () => {
    const created = await create();
    const input = {
      announcementVersionId: created.version.id,
      targets: [
        { audience: 'TEACHERS' as const, targetType: 'SCHOOL' as const, academicYearId: school.yearId },
        { audience: 'PARENTS' as const, targetType: 'CLASS' as const, academicYearId: school.yearId, classId: school.classAId },
        { audience: 'PARENTS' as const, targetType: 'CLASS' as const, academicYearId: school.yearId, classId: school.classBId },
      ],
    };
    expect(announcementTargetsCreateSchema.safeParse(input).success).toBe(true);
    expect(await app.addAnnouncementTargets(test.db, admin, created.announcement.id, input)).toHaveLength(3);
    await expect(app.addAnnouncementTargets(test.db, admin, created.announcement.id, {
      announcementVersionId: created.version.id,
      targets: [input.targets[0]],
    })).rejects.toMatchObject({ featureCode: 'DUPLICATE_ANNOUNCEMENT_TARGET' });
  });

  it('rejects foreign, closed, cross-year, and malformed target contexts', async () => {
    const created = await create();
    await test.seed.update(schema.classes).set({ status: 'CLOSED' })
      .where(eq(schema.classes.id, school.classBId));
    await expect(addClassTarget(created.announcement.id, created.version.id, school.classBId))
      .rejects.toMatchObject({ featureCode: 'INVALID_ANNOUNCEMENT_CONTEXT' });
    await expect(addClassTarget(created.announcement.id, created.version.id, randomUUID()))
      .rejects.toMatchObject({ featureCode: 'INVALID_ANNOUNCEMENT_CONTEXT' });
    expect(announcementTargetsCreateSchema.safeParse({
      announcementVersionId: created.version.id,
      targets: [{ audience: 'PARENTS', targetType: 'SCHOOL', academicYearId: school.yearId, classId: school.classAId }],
    }).success).toBe(false);
  });

  it('freezes scheduled/published Version targets while a later Version gets independent targets', async () => {
    const created = await create();
    await addClassTarget(created.announcement.id, created.version.id);
    await app.publishAnnouncement(test.db, {
      ...admin, announcementId: created.announcement.id, announcementVersionId: created.version.id,
      idempotencyKey: randomUUID(), scheduledAt: '2099-01-01T00:00:00.000Z',
    });
    await expect(addClassTarget(created.announcement.id, created.version.id, school.classBId))
      .rejects.toMatchObject({ featureCode: 'ANNOUNCEMENT_VERSION_IMMUTABLE' });
    const second = await app.createAnnouncementVersion(test.db, admin, created.announcement.id, {
      title: 'Updated', body: 'Updated body',
    });
    await expect(addClassTarget(created.announcement.id, second.id, school.classBId)).resolves.toHaveLength(1);
    const publication = (await test.seed.select().from(schema.announcementPublications))[0];
    expect(publication.announcementVersionId).toBe(created.version.id);
    expect(await test.seed.select().from(schema.publicationRecipientSnapshots)).toHaveLength(0);
    expect(await test.seed.select().from(schema.outboxEvents)).toHaveLength(0);
  });

  it('allows only the authoring Teacher with ACTIVE assigned Class scope and denies SCHOOL targets', async () => {
    const teacherUserId = await seedUser(test.seed, school.schoolId, 'TEACHER');
    const teacherId = await seedTeacher(test.seed, school.schoolId, teacherUserId);
    await seedAssignment(
      test.seed, school.schoolId, teacherId, school.classAId, school.yearId, school.subjectId,
    );
    const teacher = { userId: teacherUserId, schoolId: school.schoolId };
    const created = await app.createAnnouncement(test.db, teacher, { title: 'Teacher', body: 'Teacher body' });
    await create('Admin-only');
    await expect(app.addAnnouncementTargets(test.db, teacher, created.announcement.id, {
      announcementVersionId: created.version.id,
      targets: [{
        audience: 'PARENTS', targetType: 'CLASS', academicYearId: school.yearId, classId: school.classAId,
      }],
    })).resolves.toHaveLength(1);
    const teacherList = await app.listAnnouncements(test.db, teacher, { page: 1, pageSize: 50 });
    expect(teacherList.data.map((item) => item.id)).toEqual([created.announcement.id]);
    await expect(app.addAnnouncementTargets(test.db, teacher, created.announcement.id, {
      announcementVersionId: created.version.id,
      targets: [{
        audience: 'PARENTS', targetType: 'CLASS', academicYearId: school.yearId, classId: school.classBId,
      }],
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const second = await app.createAnnouncementVersion(test.db, teacher, created.announcement.id, {
      title: 'Teacher v2', body: 'Body v2',
    });
    await expect(app.addAnnouncementTargets(test.db, teacher, created.announcement.id, {
      announcementVersionId: second.id,
      targets: [{ audience: 'TEACHERS', targetType: 'SCHOOL', academicYearId: school.yearId }],
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const otherTeacherUserId = await seedUser(test.seed, school.schoolId, 'TEACHER');
    const otherTeacherId = await seedTeacher(test.seed, school.schoolId, otherTeacherUserId);
    await seedAssignment(test.seed, school.schoolId, otherTeacherId, school.classAId, school.yearId, school.subjectId);
    await expect(app.getAnnouncement(test.db, {
      userId: otherTeacherUserId, schoolId: school.schoolId,
    }, created.announcement.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('removes Teacher management scope after assignment/profile deactivation without rewriting history', async () => {
    const teacherUserId = await seedUser(test.seed, school.schoolId, 'TEACHER');
    const teacherId = await seedTeacher(test.seed, school.schoolId, teacherUserId);
    await seedAssignment(test.seed, school.schoolId, teacherId, school.classAId, school.yearId, school.subjectId);
    const teacher = { userId: teacherUserId, schoolId: school.schoolId };
    const created = await app.createAnnouncement(test.db, teacher, { title: 'Teacher', body: 'Body' });
    await app.addAnnouncementTargets(test.db, teacher, created.announcement.id, {
      announcementVersionId: created.version.id,
      targets: [{
        audience: 'PARENTS', targetType: 'CLASS', academicYearId: school.yearId, classId: school.classAId,
      }],
    });
    await test.seed.update(schema.teacherAssignments).set({ status: 'ENDED', effectiveUntil: '2025-10-01' });
    await expect(app.getAnnouncement(test.db, teacher, created.announcement.id))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await test.seed.select().from(schema.announcementTargets)).toHaveLength(1);
    await test.seed.update(schema.teacherAssignments).set({ status: 'ACTIVE', effectiveUntil: null });
    await test.seed.update(schema.teachers).set({ status: 'INACTIVE' }).where(eq(schema.teachers.id, teacherId));
    await expect(app.getAnnouncement(test.db, teacher, created.announcement.id))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Announcement publication history integration', () => {
  it('returns bounded metadata and recipient counts without raw snapshots or idempotency keys', async () => {
    const created = await create();
    const teacherUserId = await seedUser(test.seed, school.schoolId, 'TEACHER');
    await seedTeacher(test.seed, school.schoolId, teacherUserId);
    await app.addAnnouncementTargets(test.db, admin, created.announcement.id, {
      announcementVersionId: created.version.id,
      targets: [{ audience: 'TEACHERS', targetType: 'SCHOOL', academicYearId: school.yearId }],
    });
    await app.publishAnnouncement(test.db, {
      ...admin, announcementId: created.announcement.id, announcementVersionId: created.version.id,
      idempotencyKey: randomUUID(),
    });
    const page = await app.listAnnouncementPublications(
      test.db, admin, created.announcement.id, { page: 1, pageSize: 50 },
    );
    expect(page).toMatchObject({ data: [{
      announcementVersionId: created.version.id, publicationVersion: 1,
      status: 'PUBLISHED', recipientCount: 1,
    }], meta: { total: 1 } });
    expect(page.data[0]).not.toHaveProperty('idempotencyKey');
    expect(page.data[0]).not.toHaveProperty('recipientUserId');
    expect(await test.seed.select().from(schema.notifications)).toHaveLength(0);
  });
});
