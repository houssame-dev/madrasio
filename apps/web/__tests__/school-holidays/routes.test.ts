// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sessionFixture } from '../attendance/session-fixture';
import { UnauthenticatedError } from '@/lib/errors';
const boundary = vi.hoisted(() => ({ db: null as unknown, context: null as unknown, error: null as Error | null }));
vi.mock('@/lib/db/client', () => ({ getDb: () => boundary.db }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: () => { if (boundary.error) throw boundary.error; return boundary.context; } }));
import { createPOST, detailGET, listGET, removeDELETE, updatePATCH } from '@/lib/api/school-holidays';
let f: Awaited<ReturnType<typeof sessionFixture>>;
const input = { name: 'API closure', type: 'PUBLIC_HOLIDAY', startDate: '2025-10-10', endDate: '2025-10-10' };
const request = (body?: unknown, origin: string | null = 'http://local', query = '') => new Request('http://local/api/v1/school-holidays' + query, body ? { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) } : undefined);
beforeEach(async () => { f = await sessionFixture(); boundary.db = f.db; boundary.context = { userId: f.admin.userId, schoolContext: { schoolId: f.schoolId } }; boundary.error = null; }, 30000);
afterEach(async () => { await f.test.client.close(); });
it('serves conventional scoped CRUD with private responses and explicit delete confirmation', async () => {
  const created = await createPOST(request(input)); expect(created.status).toBe(200);
  expect(created.headers.get('cache-control')).toBe('private, no-store');
  const row = (await created.json()).data, route = { params: Promise.resolve({ id: row.id }) };
  expect((await listGET(request())).status).toBe(200);
  expect((await detailGET(request(), route)).status).toBe(200);
  expect((await updatePATCH(request({ ...input, name: 'Edited', expectedRevision: 1 }), route)).status).toBe(200);
  expect((await removeDELETE(request({ expectedRevision: 2, confirmed: false }), route)).status).toBe(400);
  expect((await removeDELETE(request({ expectedRevision: 2, confirmed: true }), route)).status).toBe(200);
  expect((await detailGET(request(), route)).status).toBe(404);
});
it('rejects missing/foreign/null Origin, injected authority and repeated scope filters', async () => {
  for (const origin of [null, 'null', 'http://foreign', 'http://local/']) expect((await createPOST(request(input, origin))).status).toBe(403);
  expect((await createPOST(request({ ...input, schoolId: f.schoolId }))).status).toBe(400);
  expect((await listGET(request(undefined, null, '?page=1&page=2'))).status).toBe(400);
  expect((await listGET(request(undefined, null, '?teacherId=spoofed'))).status).toBe(400);
});
it('does not rely on UI roles and never leaks student identities in a historical conflict', async () => {
  boundary.context = { userId: f.teacherActor.userId, schoolContext: { schoolId: f.schoolId } };
  expect((await createPOST(request(input))).status).toBe(403);
  boundary.context = { userId: f.admin.userId, schoolContext: { schoolId: f.schoolId } };
  await f.test.client.query("insert into attendance_records(school_id,student_id,class_id,academic_year_id,attendance_date,status)values($1,$2,$3,$4,'2025-10-10','PRESENT')", [f.schoolId, f.student.id, f.classAId, f.yearId]);
  const result = await createPOST(request(input)), body = await result.text();
  expect(result.status).toBe(409); expect(body).toContain('HOLIDAY_ATTENDANCE_CONFLICT');
  expect(body).not.toContain(f.student.id); expect(body).not.toContain(f.student.firstName);
  boundary.error = new UnauthenticatedError();
  expect((await listGET(request())).status).toBe(401);
});
