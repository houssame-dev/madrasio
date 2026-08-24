import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '@school/database';

import { AuthError } from '@/lib/auth/auth-errors';
import type { CurrentContext } from '@/lib/authorization/context';
import { UnauthenticatedError } from '@/lib/errors';
import {
  createNotificationsTestDb,
  seedSchool,
  seedUser,
  type NotificationsTestDb,
  type SeededSchool,
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
  notificationGET,
  notificationReadPOST,
  notificationsGET,
  notificationsReadAllPOST,
  notificationsUnreadCountGET,
} from '@/lib/api/notifications';

let test: NotificationsTestDb;
let school: SeededSchool;
let userId: string;

function current(id: string, schoolId: string, role: CurrentContext['role']): CurrentContext {
  return {
    userId: id,
    userActive: true,
    membership: { schoolId, status: 'ACTIVE' },
    schoolContext: { schoolId, isValid: true },
    role,
    scope: { teacherAssignments: [], parentStudents: [] },
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(body?: unknown) {
  return new Request('http://local', body === undefined ? { method: 'POST' } : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function notification(recipient = userId, targetSchool = school.schoolId, readAt?: Date) {
  const [row] = await test.seed.insert(schema.notifications).values({
    schoolId: targetSchool,
    recipientUserId: recipient,
    notificationType: 'ANNOUNCEMENT_PUBLISHED',
    sourceType: 'ANNOUNCEMENT_PUBLICATION',
    sourceId: randomUUID(),
    sourceEventId: randomUUID(),
    title: 'API notification',
    body: 'Persisted body.',
    readAt,
  }).returning({ id: schema.notifications.id });
  return row.id;
}

beforeEach(async () => {
  test = await createNotificationsTestDb();
  school = await seedSchool(test.seed);
  userId = await seedUser(test.seed, school.schoolId, 'PARENT');
  mocks.db = test.db;
  mocks.context = current(userId, school.schoolId, 'PARENT');
  mocks.error = null;
});

describe('Notification inbox HTTP contracts', () => {
  it('lists, filters, details, and counts only safe self-owned payloads', async () => {
    const id = await notification();
    let response = await notificationsGET(new Request(
      'http://local?page=1&pageSize=10&status=UNREAD&notificationType=ANNOUNCEMENT_PUBLISHED',
    ));
    expect(response.status).toBe(200);
    const list = await response.json();
    expect(list).toMatchObject({
      data: [{ id, readAt: null }], meta: { page: 1, pageSize: 10, total: 1 },
    });
    expect(list.data[0]).not.toHaveProperty('recipientUserId');
    expect(list.data[0]).not.toHaveProperty('schoolId');
    expect(list.data[0]).not.toHaveProperty('sourceEventId');

    response = await notificationGET(new Request('http://local'), params(id));
    expect(await response.json()).toMatchObject({ data: { id, readAt: null } });
    response = await notificationsUnreadCountGET();
    expect(await response.json()).toEqual({ data: { count: 1 } });
  });

  it('marks one and all read idempotently without accepting client authority', async () => {
    const firstId = await notification();
    await notification();
    let response = await notificationReadPOST(post(), params(firstId));
    const first = (await response.json()).data;
    expect(first).toMatchObject({ id: firstId });
    expect(first.readAt).toBeTruthy();
    response = await notificationReadPOST(post(), params(firstId));
    expect((await response.json()).data.readAt).toBe(first.readAt);

    response = await notificationsReadAllPOST(post());
    expect(await response.json()).toEqual({ data: { updatedCount: 1 } });
    response = await notificationsReadAllPOST(post());
    expect(await response.json()).toEqual({ data: { updatedCount: 0 } });

    for (const body of [{ schoolId: school.schoolId }, { recipientUserId: userId }, { readAt: new Date() }]) {
      expect((await notificationsReadAllPOST(post(body))).status).toBe(400);
    }
  });

  it('strictly rejects malformed ids, query values, unknown filters, and action bodies', async () => {
    expect((await notificationsGET(new Request('http://local?status=INVALID'))).status).toBe(400);
    expect((await notificationsGET(new Request('http://local?notificationType=ANNOUNCEMENT'))).status).toBe(400);
    expect((await notificationsGET(new Request('http://local?pageSize=101'))).status).toBe(400);
    expect((await notificationsGET(new Request('http://local?unknown=value'))).status).toBe(400);
    expect((await notificationsGET(new Request(
      'http://local?createdFrom=2026-02-01T00%3A00%3A00Z&createdTo=2026-01-01T00%3A00%3A00Z',
    ))).status).toBe(400);
    expect((await notificationGET(new Request('http://local'), params('bad-id'))).status).toBe(400);
    expect((await notificationReadPOST(post({ sourceEventId: randomUUID() }), params(randomUUID()))).status).toBe(400);
  });

  it('maps canonical authentication and current-context failures', async () => {
    mocks.error = new UnauthenticatedError();
    expect((await notificationsGET(new Request('http://local'))).status).toBe(401);
    expect((await notificationsUnreadCountGET()).status).toBe(401);
    mocks.error = new AuthError('USER_INACTIVE', 'Inactive.');
    expect((await notificationsGET(new Request('http://local'))).status).toBe(403);
    mocks.error = new AuthError('SCHOOL_CONTEXT_REQUIRED', 'Select a School.');
    expect((await notificationsReadAllPOST(post())).status).toBe(403);
  });

  it('hides another recipient and another School for every role, including administrators', async () => {
    const otherUser = await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN');
    const otherId = await notification(otherUser);
    expect((await notificationGET(new Request('http://local'), params(otherId))).status).toBe(404);
    expect((await notificationReadPOST(post(), params(otherId))).status).toBe(404);

    const schoolB = await seedSchool(test.seed, 'School B');
    await test.seed.insert(schema.schoolMemberships).values({
      schoolId: schoolB.schoolId, userId, role: 'PARENT', status: 'ACTIVE',
    });
    const foreignId = await notification(userId, schoolB.schoolId);
    expect((await notificationGET(new Request('http://local'), params(foreignId))).status).toBe(404);

    mocks.context = current(otherUser, school.schoolId, 'SCHOOL_ADMIN');
    const response = await notificationsGET(new Request('http://local'));
    expect((await response.json()).data.map((row: { id: string }) => row.id)).toEqual([otherId]);
  });
});
