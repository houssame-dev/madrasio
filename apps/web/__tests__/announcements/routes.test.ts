import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@school/database';

import type { CurrentContext } from '@/lib/authorization/context';
import { UnauthenticatedError } from '@/lib/errors';
import type { AnnouncementsDb } from '@/lib/modules/announcements/infrastructure/repositories/announcement-repository';

import {
  createAnnouncementsTestDb, seedAssignment, seedSchool, seedTeacher, seedUser,
  type AnnouncementsTestDb, type SeededSchool,
} from './test-helpers';

const mocks = vi.hoisted(() => ({ db: null as unknown, context: null as unknown, error: null as unknown }));
vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/lib/auth/require-context', () => ({
  requireCurrentContext: async () => {
    if (mocks.error) throw mocks.error;
    return mocks.context;
  },
}));

import {
  announcementGET, announcementPATCH, announcementPublicationsGET, announcementPublishPOST,
  announcementTargetsGET, announcementTargetsPOST, announcementVersionsGET,
  announcementVersionsPOST, announcementsGET, announcementsPOST,
} from '@/lib/api/announcements';

let test: AnnouncementsTestDb;
let school: SeededSchool;
let adminId: string;

function current(userId: string, schoolId: string, role: CurrentContext['role']): CurrentContext {
  return {
    userId, userActive: true, membership: { schoolId, status: 'ACTIVE' },
    schoolContext: { schoolId, isValid: true }, role,
    scope: { teacherAssignments: [], parentStudents: [] },
  };
}
function json(value: unknown, method = 'POST') {
  return new Request('http://local', {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  test = await createAnnouncementsTestDb();
  school = await seedSchool(test.seed);
  adminId = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
  mocks.db = test.seed as unknown as AnnouncementsDb;
  mocks.context = current(adminId, school.schoolId, 'SCHOOL_ADMIN');
  mocks.error = null;
});

async function create() {
  const response = await announcementsPOST(json({ title: 'API notice', body: 'Complete body.' }));
  expect(response.status).toBe(201);
  return (await response.json()).data as {
    announcement: { id: string }; version: { id: string; versionNumber: number };
  };
}

describe('Announcement management HTTP contracts', () => {
  it('creates, lists, reads, archives, and strictly rejects authoritative input', async () => {
    const created = await create();
    let response = await announcementsGET(new Request('http://local?page=1&pageSize=10&status=DRAFT&search=notice'));
    expect(await response.json()).toMatchObject({
      data: [{ id: created.announcement.id, latestVersion: { id: created.version.id } }],
      meta: { total: 1 },
    });
    response = await announcementGET(new Request('http://local'), params(created.announcement.id));
    expect(await response.json()).toMatchObject({
      data: { announcement: { id: created.announcement.id }, targetSummary: { count: 0 } },
    });
    expect((await announcementsPOST(json({
      title: 'Bad', body: 'Bad', schoolId: school.schoolId,
    }))).status).toBe(400);
    expect((await announcementsPOST(json({
      title: 'Bad', body: 'Bad', createdBy: adminId,
    }))).status).toBe(400);
    response = await announcementPATCH(json({ status: 'ARCHIVED' }, 'PATCH'), params(created.announcement.id));
    expect(await response.json()).toMatchObject({ data: { status: 'ARCHIVED' } });
    const invalid = await announcementPATCH(json({ status: 'DRAFT' }, 'PATCH'), params(created.announcement.id));
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      error: { featureCode: 'INVALID_ANNOUNCEMENT_STATUS_TRANSITION' },
    });
  });

  it('creates explicit Versions, manages latest-version targets, and reports duplicate conflicts', async () => {
    const created = await create();
    let response = await announcementVersionsPOST(
      json({ title: 'Revision', body: 'Revised body.' }), params(created.announcement.id),
    );
    expect(response.status).toBe(201);
    const second = (await response.json()).data;
    response = await announcementVersionsGET(new Request('http://local?pageSize=10'), params(created.announcement.id));
    expect((await response.json()).data.map((item: { versionNumber: number }) => item.versionNumber)).toEqual([2, 1]);
    const targetBody = {
      announcementVersionId: second.id,
      targets: [{
        audience: 'PARENTS', targetType: 'CLASS', academicYearId: school.yearId, classId: school.classAId,
      }],
    };
    response = await announcementTargetsPOST(json(targetBody), params(created.announcement.id));
    expect(response.status).toBe(201);
    response = await announcementTargetsGET(
      new Request(`http://local?announcementVersionId=${second.id}`), params(created.announcement.id),
    );
    expect(await response.json()).toMatchObject({ data: [{ classId: school.classAId }] });
    response = await announcementTargetsPOST(json(targetBody), params(created.announcement.id));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { featureCode: 'DUPLICATE_ANNOUNCEMENT_TARGET' } });
  });

  it('reuses immediate publication and returns bounded publication metadata', async () => {
    const created = await create();
    const teacherUserId = await seedUser(test.seed, school.schoolId, 'TEACHER');
    await seedTeacher(test.seed, school.schoolId, teacherUserId);
    await announcementTargetsPOST(json({
      announcementVersionId: created.version.id,
      targets: [{ audience: 'TEACHERS', targetType: 'SCHOOL', academicYearId: school.yearId }],
    }), params(created.announcement.id));
    let response = await announcementPublishPOST(json({
      announcementVersionId: created.version.id,
      idempotencyKey: crypto.randomUUID(),
    }), params(created.announcement.id));
    expect(response.status).toBe(201);
    const publication = (await response.json()).data;
    expect(publication).toMatchObject({ status: 'PUBLISHED', eventEmitted: true });
    expect(publication).not.toHaveProperty('schoolId');
    response = await announcementPublicationsGET(new Request('http://local'), params(created.announcement.id));
    expect(await response.json()).toMatchObject({
      data: [{ announcementVersionId: created.version.id, recipientCount: 1 }], meta: { total: 1 },
    });
    expect(await test.seed.select().from(schema.notifications)).toHaveLength(0);
  });

  it('preserves scheduling semantics and rejects client School/snapshot authority', async () => {
    const created = await create();
    await announcementTargetsPOST(json({
      announcementVersionId: created.version.id,
      targets: [{ audience: 'TEACHERS', targetType: 'SCHOOL', academicYearId: school.yearId }],
    }), params(created.announcement.id));
    let response = await announcementPublishPOST(json({
      announcementVersionId: created.version.id,
      idempotencyKey: crypto.randomUUID(),
      scheduledAt: '2099-01-01T00:00:00.000Z',
    }), params(created.announcement.id));
    expect(await response.json()).toMatchObject({ data: { status: 'SCHEDULED', eventEmitted: false } });
    expect(await test.seed.select().from(schema.publicationRecipientSnapshots)).toHaveLength(0);
    expect(await test.seed.select().from(schema.outboxEvents)).toHaveLength(0);
    response = await announcementPublishPOST(json({
      schoolId: school.schoolId,
      announcementVersionId: created.version.id,
      idempotencyKey: crypto.randomUUID(),
    }), params(created.announcement.id));
    expect(response.status).toBe(400);
    response = await announcementPublishPOST(json({
      announcementVersionId: created.version.id,
      idempotencyKey: crypto.randomUUID(),
      recipientUserIds: [adminId],
    }), params(created.announcement.id));
    expect(response.status).toBe(400);
  });

  it('enforces Teacher ownership/scope, Parent denial, authentication, and tenant hiding', async () => {
    const teacherUserId = await seedUser(test.seed, school.schoolId, 'TEACHER');
    const teacherId = await seedTeacher(test.seed, school.schoolId, teacherUserId);
    await seedAssignment(test.seed, school.schoolId, teacherId, school.classAId, school.yearId, school.subjectId);
    mocks.context = current(teacherUserId, school.schoolId, 'TEACHER');
    const created = await create();
    expect((await announcementTargetsPOST(json({
      announcementVersionId: created.version.id,
      targets: [{
        audience: 'PARENTS', targetType: 'CLASS', academicYearId: school.yearId, classId: school.classBId,
      }],
    }), params(created.announcement.id))).status).toBe(403);
    const parentUserId = await seedUser(test.seed, school.schoolId, 'PARENT');
    mocks.context = current(parentUserId, school.schoolId, 'PARENT');
    expect((await announcementsGET(new Request('http://local'))).status).toBe(403);
    mocks.error = new UnauthenticatedError();
    expect((await announcementsGET(new Request('http://local'))).status).toBe(401);
    mocks.error = null;
    mocks.context = current(adminId, school.schoolId, 'SCHOOL_ADMIN');
    expect((await announcementGET(new Request('http://local'), params(crypto.randomUUID()))).status).toBe(404);
  });
});
