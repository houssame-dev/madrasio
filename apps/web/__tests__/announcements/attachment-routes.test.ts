import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UnauthenticatedError } from '@/lib/errors';
import {
  createAnnouncementsTestDb,
  seedAnnouncement,
  seedSchool,
  seedUser,
  type AnnouncementsTestDb,
} from './test-helpers';

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  context: null as unknown,
  error: null as unknown,
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  getDb: () => mocks.db,
}));

vi.mock('@/lib/auth/require-context', () => ({
  requireCurrentContext: async () => {
    if (mocks.error) throw mocks.error;
    return mocks.context;
  },
}));

vi.mock('@/lib/files/storage', () => ({
  R2PrivateFileStore: class {
    put = mocks.put;
    get = mocks.get;
    delete = mocks.delete;
  },
}));

import {
  managedAttachmentsGET,
  managedAttachmentsPOST,
  managedAttachmentDELETE,
  managedAttachmentDownloadGET,
  recipientAttachmentsGET,
  recipientAttachmentDownloadGET,
} from '@/lib/api/announcement-attachments';

let t: AnnouncementsTestDb;
let id: string;
let versionId: string;

const pdf = '%PDF-1.7 fixture';

const context = (attachmentId?: string) => ({
  params: Promise.resolve({
    id,
    versionId,
    ...(attachmentId ? { attachmentId } : {}),
  }),
});

function request(overrides: RequestInit = {}, query = '') {
  return new Request(
    `https://app.example/api/v1/announcements/${id}/versions/${versionId}/attachments${query}`,
    {
      method: 'POST',
      body: pdf,
      headers: {
        'content-type': 'application/pdf',
        'x-file-name': 'notice.pdf',
        'idempotency-key': randomUUID(),
      },
      ...overrides,
    },
  );
}

/**
 * Vitest's Request implementation strips browser-managed headers such as
 * Origin when reconstructing a Request. The application handler receives
 * Origin from the real HTTP request, so this helper simulates that
 * server-visible header without weakening the production route.
 */
function requestWithServerHeader(name: string, value: string) {
  const result = request();
  const headers = new Headers(result.headers);
  headers.set(name, value);

  Object.defineProperty(result, 'headers', {
    configurable: true,
    value: headers,
  });

  return result;
}

beforeEach(async () => {
  t = await createAnnouncementsTestDb();

  const school = await seedSchool(t.seed);
  const userId = await seedUser(
    t.seed,
    school.schoolId,
    'SCHOOL_ADMIN',
  );

  const announcement = await seedAnnouncement(
    t.seed,
    school.schoolId,
    userId,
  );

  id = announcement.announcementId;
  versionId = announcement.versionId;

  mocks.db = t.db;
  mocks.context = {
    userId,
    schoolContext: {
      schoolId: school.schoolId,
    },
  };
  mocks.error = null;

  mocks.put.mockReset().mockResolvedValue(undefined);
  mocks.get.mockReset().mockResolvedValue(Buffer.from(pdf));
  mocks.delete.mockReset().mockResolvedValue(undefined);
}, 30_000);

afterEach(async () => {
  await t?.client.close();
});

it('requires authentication before body consumption or storage on all endpoints', async () => {
  mocks.error = new UnauthenticatedError();

  const upload = request();
  const read = new Request('https://app.example');

  expect(
    (await managedAttachmentsPOST(upload, context())).status,
  ).toBe(401);

  expect(upload.bodyUsed).toBe(false);

  for (const handler of [
    managedAttachmentsGET,
    managedAttachmentDELETE,
    managedAttachmentDownloadGET,
    recipientAttachmentsGET,
    recipientAttachmentDownloadGET,
  ]) {
    expect(
      (await handler(read, context(randomUUID()))).status,
    ).toBe(401);
  }

  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
});

it('rejects client authority query fields, JSON association injection, invalid metadata and cross-origin upload', async () => {
  for (const field of [
    'schoolId',
    'userId',
    'fileId',
    'objectKey',
    'role',
  ]) {
    const response = await managedAttachmentsPOST(
      request({}, `?${field}=forged`),
      context(),
    );

    expect(response.ok).toBe(false);
  }

  const injectedAssociation = await managedAttachmentsPOST(
    request({
      body: JSON.stringify({
        fileId: randomUUID(),
        objectKey: 'forged',
      }),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        'x-file-name': 'notice.pdf',
      },
    }),
    context(),
  );

  expect(injectedAssociation.ok).toBe(false);

  /*
   * Exercise the real stream-size boundary rather than relying on a synthetic
   * Content-Length header. The handler also performs an early Content-Length
   * check when that server-provided header is available.
   */
  const oversized = `${pdf}${'x'.repeat(2 * 1024 * 1024)}`;

  const oversizedResponse = await managedAttachmentsPOST(
    request({
      body: oversized,
    }),
    context(),
  );

  expect(oversizedResponse.ok).toBe(false);

  for (const headers of [
    {
      'x-file-name': 'a%0D%0Ab.pdf',
    },
    {
      'x-file-name': '%broken',
    },
    {
      'idempotency-key': 'invalid',
    },
  ]) {
    const base = request();
    const combined = new Headers(base.headers);

    for (const [name, value] of Object.entries(headers)) {
      combined.set(name, value);
    }

    const response = await managedAttachmentsPOST(
      request({
        headers: combined,
      }),
      context(),
    );

    expect(response.ok).toBe(false);
  }

  /*
   * Origin is a browser-managed header. The Vitest Request implementation
   * removes it during Request reconstruction, so expose it exactly as the
   * application handler would receive it from the HTTP server.
   */
  const crossOriginResponse = await managedAttachmentsPOST(
    requestWithServerHeader(
      'origin',
      'https://outside.example',
    ),
    context(),
  );

  expect(crossOriginResponse.ok).toBe(false);

  expect(mocks.put).not.toHaveBeenCalled();
});

it('returns only bounded metadata and a no-store forced download, never object URLs/keys or credentials', async () => {
  const response = await managedAttachmentsPOST(
    request(),
    context(),
  );

  expect(response.status).toBe(201);

  const payload = (await response.json()) as {
    data: {
      id: string;
      state: string;
    };
  };

  expect(payload.data.state).toBe('READY');

  expect(
    Object.keys(payload.data).sort(),
  ).toEqual([
    'byteSize',
    'id',
    'mediaType',
    'name',
    'state',
  ]);

  const download = await managedAttachmentDownloadGET(
    new Request('https://app.example'),
    context(payload.data.id),
  );

  expect(download.status).toBe(200);

  expect(
    download.headers.get('content-type'),
  ).toBe('application/octet-stream');

  expect(
    download.headers.get('content-disposition'),
  ).toBe(
    'attachment; filename="attachment"; filename*=UTF-8\'\'notice.pdf',
  );

  expect(
    download.headers.get('x-content-type-options'),
  ).toBe('nosniff');

  expect(
    download.headers.get('cache-control'),
  ).toBe('private, no-store');

  expect(
    download.headers.get('location'),
  ).toBeNull();

  expect(
    await download.text(),
  ).toBe(pdf);
});