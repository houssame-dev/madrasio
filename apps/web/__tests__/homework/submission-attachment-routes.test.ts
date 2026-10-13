import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UnauthenticatedError } from '@/lib/errors';
import { createHomeworkSubmission } from '@/lib/modules/homework/application';
import { createActor, seedParentRelationship } from '../students/test-helpers';
import { deliveryFixture, type DeliveryFixture } from './delivery-test-helpers';
const mocks = vi.hoisted(() => ({ db: null as unknown, context: null as unknown, error: null as unknown,
  put: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: async () => { if (mocks.error) throw mocks.error; return mocks.context; } }));
vi.mock('@/lib/files/storage', () => ({ R2PrivateFileStore: class { put = mocks.put; get = mocks.get; delete = mocks.delete; } }));
import { attachmentsGET, attachmentsPOST, attachmentDownloadGET } from '@/lib/api/homework-attachments';
import { homeworkSubmissionsPOST } from '@/lib/api/homework';

let t: DeliveryFixture; let id: string;
const pdf = '%PDF-1.7 private homework';
const params = (attachmentId?: string) => ({ params: Promise.resolve({ id, ...(attachmentId ? { attachmentId } : {}) }) });
const read = () => new Request('https://app.example');
function request(body = pdf, query = '') {
  return new Request(`https://app.example/api/v1/homework-submissions/${id}/attachments${query}`, { method: 'POST', body,
    headers: { 'content-type': 'application/pdf', 'x-file-name': 'work.pdf', 'idempotency-key': randomUUID() } });
}
beforeEach(async () => {
  vi.clearAllMocks(); t = await deliveryFixture(); mocks.db = t.homeworkDb; mocks.error = null;
  mocks.context = { userId: t.teacher.userId, schoolContext: { schoolId: t.schoolId } };
  mocks.get.mockResolvedValue(Buffer.from(pdf));
  id = (await createHomeworkSubmission(t.homeworkDb, t.teacher, t.homework.id, { studentId: t.child.id })).id;
}, 30_000);
afterEach(async () => { await t?.test.client.close(); });

it('rejects unauthenticated callers before consuming bytes or touching storage', async () => {
  mocks.error = new UnauthenticatedError(); const upload = request();
  expect((await attachmentsPOST(upload, params())).status).toBe(401); expect(upload.bodyUsed).toBe(false);
  expect((await attachmentsGET(read(), params())).status).toBe(401);
  expect((await attachmentDownloadGET(read(), params(randomUUID()))).status).toBe(401);
  expect(mocks.put).not.toHaveBeenCalled(); expect(mocks.get).not.toHaveBeenCalled();
});
it('Parent write denial precedes body consumption; own-child list remains read-only', async () => {
  const parent = await createActor(t.test, t.schoolId, 'PARENT'); await seedParentRelationship(t, parent, t.child.id);
  mocks.context = { userId: parent.userId, schoolContext: { schoolId: t.schoolId } };
  const upload = request(); expect((await attachmentsPOST(upload, params())).status).toBe(403);
  expect(upload.bodyUsed).toBe(false); expect((await attachmentsGET(read(), params())).status).toBe(200);
  expect(mocks.put).not.toHaveBeenCalled();
});
it('rejects authority injection, oversized bytes and cross-origin writes', async () => {
  for (const field of ['schoolId', 'studentId', 'fileId', 'objectKey', 'userId']) {
    expect((await attachmentsPOST(request(pdf, `?${field}=forged`), params())).ok).toBe(false);
  }
  expect((await attachmentsPOST(request(pdf + 'x'.repeat(2 * 1024 * 1024)), params())).ok).toBe(false);
  const crossOrigin = request(); const headers = new Headers(crossOrigin.headers); headers.set('origin', 'https://foreign.example');
  Object.defineProperty(crossOrigin, 'headers', { value: headers });
  expect((await attachmentsPOST(crossOrigin, params())).ok).toBe(false);
  expect(mocks.put).not.toHaveBeenCalled();
});
it('serves bounded metadata and a no-store forced download only via the authorized submission', async () => {
  const response = await attachmentsPOST(request(), params()); expect(response.status).toBe(201);
  const payload = await response.json() as { data: { id: string } };
  expect(Object.keys(payload.data).sort()).toEqual(['byteSize', 'id', 'mediaType', 'name', 'state', 'submissionRecordedAt']);
  const download = await attachmentDownloadGET(read(), params(payload.data.id));
  expect(download.status).toBe(200);
  expect(download.headers.get('content-type')).toBe('application/octet-stream');
  expect(download.headers.get('content-disposition')).toContain('attachment;');
  expect(download.headers.get('cache-control')).toBe('private, no-store');
  expect(download.headers.get('x-content-type-options')).toBe('nosniff');
  expect(download.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
  expect(download.headers.get('location')).toBeNull(); expect(await download.text()).toBe(pdf);
});
it('validates actual time via the submission HTTP contract and preserves server recording authority', async () => {
  const child = await t.student('api');
  const submit = (actualHandedInAt: string) => homeworkSubmissionsPOST(new Request('https://app.example', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId: child.id, actualHandedInAt }),
  }), { params: Promise.resolve({ id: t.homework.id }) });
  expect((await submit('2025-02-29T12:00:00Z')).status).toBe(400);
  expect((await submit('9999-01-01T00:00:00Z')).status).toBe(400);
  const good = await submit('2025-10-10T12:00:00Z'); expect(good.status).toBe(201);
  expect(await good.json()).toMatchObject({ data: { status: 'SUBMITTED', actualHandedInAt: '2025-10-10T12:00:00.000Z' } });
});
