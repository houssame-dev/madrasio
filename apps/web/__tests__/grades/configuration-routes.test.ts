import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UnauthenticatedError } from '@/lib/errors';
import { createGradebookTestContext, type GradebookTestContext } from './gradebook-test-helpers';
import { DEFAULT_RULES } from './test-helpers';
const mocks = vi.hoisted(() => ({
  db: null as unknown,
  context: null as unknown,
  error: null as unknown,
}));
vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/lib/auth/require-context', () => ({
  requireCurrentContext: async () => {
    if (mocks.error) throw mocks.error;
    return mocks.context;
  },
}));
import {
  configurationsGET,
  configurationsPOST,
  configurationGET,
  configurationPATCH,
  versionsPOST,
  versionPATCH,
} from '@/lib/api/grading-configurations';
let c: GradebookTestContext;
beforeEach(async () => {
  c = await createGradebookTestContext();
  mocks.db = c.db;
  mocks.error = null;
  mocks.context = { userId: c.admin.userId, schoolContext: { schoolId: c.admin.schoolId } };
});
afterEach(async () => {
  await c.test.client.close();
});
const request = (method = 'GET', body?: unknown) =>
  new Request('http://local/api/v1/grading-configurations', {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json', 'x-role': 'SCHOOL_ADMIN' },
        }
      : {}),
  });
const params = (id: string, versionId?: string) => ({ params: Promise.resolve({ id, versionId }) });
it('supports School-scoped creation, draft edit, activation and retained reads with private envelopes', async () => {
  const created = await configurationsPOST(
    request('POST', { name: 'API rules', rules: DEFAULT_RULES }),
  );
  expect(created.status).toBe(201);
  const id = (await created.json()).data.id;
  const listed = await configurationsGET(request());
  expect(listed.status).toBe(200);
  expect(listed.headers.get('cache-control')).toBe('private, no-store');
  const detail = (await (await configurationGET(request(), params(id))).json()).data;
  const versionId = detail.versions[0].id;
  expect(
    (await versionPATCH(request('PATCH', { rules: DEFAULT_RULES }), params(id, versionId))).status,
  ).toBe(200);
  expect(
    (await versionPATCH(request('PATCH', { status: 'ACTIVE' }), params(id, versionId))).status,
  ).toBe(200);
  expect(
    (await versionPATCH(request('PATCH', { rules: DEFAULT_RULES }), params(id, versionId))).status,
  ).toBe(409);
  expect((await versionsPOST(request('POST', { rules: DEFAULT_RULES }), params(id))).status).toBe(
    201,
  );
  expect(
    (await configurationPATCH(request('PATCH', { status: 'INACTIVE' }), params(id))).status,
  ).toBe(200);
});
it('denies unauthenticated/Teacher requests and rejects body authority and malformed identifiers', async () => {
  mocks.error = new UnauthenticatedError();
  expect((await configurationsGET(request())).status).toBe(401);
  mocks.error = null;
  mocks.context = { userId: c.teacher.userId, schoolContext: { schoolId: c.admin.schoolId } };
  expect(
    (await configurationsPOST(request('POST', { name: 'No', rules: DEFAULT_RULES }))).status,
  ).toBe(403);
  mocks.context = { userId: c.admin.userId, schoolContext: { schoolId: c.admin.schoolId } };
  expect(
    (
      await configurationsPOST(
        request('POST', { name: 'No', rules: DEFAULT_RULES, schoolId: c.admin.schoolId }),
      )
    ).status,
  ).toBe(400);
  expect((await configurationGET(request(), params('invalid'))).status).toBe(400);
  expect(
    (
      await configurationsGET(
        new Request('http://local/api/v1/grading-configurations?schoolId=forged'),
      )
    ).status,
  ).toBe(400);
});
