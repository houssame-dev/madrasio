// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStudentsTestContext, seedStudent } from '../students/test-helpers';
import { UnauthenticatedError } from '@/lib/errors';
const boundary = vi.hoisted(() => ({ db: null as unknown, context: null as unknown, error: null as Error | null }));
vi.mock('@/lib/db/client', () => ({ getDb: () => boundary.db }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: () => { if (boundary.error) throw boundary.error; return boundary.context; } }));
import { searchGET } from '@/lib/api/search';
let f: Awaited<ReturnType<typeof createStudentsTestContext>>;
beforeEach(async () => { f = await createStudentsTestContext(); boundary.db = f.test.seed; boundary.context = { userId: f.admin.userId, schoolContext: { schoolId: f.schoolId } }; boundary.error = null; }, 30000);
afterEach(async () => { await f.test.client.close(); });
const request = (query: string) => new Request('http://local/api/v1/search?' + query);
it('returns only safe authorized projections with private no-store and no mutation endpoint', async () => {
  await seedStudent(f.test, f.schoolId);
  const response = await searchGET(request('q=Amine')); expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store'); expect(response.headers.get('Vary')).toBe('Cookie');
  const data = await response.json(); expect(data.data).toHaveLength(1); expect(data.data[0].href).toMatch(/^\/students\//);
});
it('rejects malformed/repeated/authority query parameters and expired sessions safely', async () => {
  for (const query of ['q=a', 'q=ok&q=other', 'q=ok&category=classes&category=students', 'q=ok&schoolId=spoof', 'q=ok&role=SCHOOL_ADMIN', 'q=ok&category=payments']) expect((await searchGET(request(query))).status).toBe(400);
  boundary.error = new UnauthenticatedError();
  const response = await searchGET(request('q=privatequery')); expect(response.status).toBe(401); expect(await response.text()).not.toContain('privatequery'); expect(response.headers.get('cache-control')).toBe('private, no-store');
});
