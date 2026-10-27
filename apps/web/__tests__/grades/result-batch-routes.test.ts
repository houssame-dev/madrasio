// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createGradesTestDb, type GradesTestDb } from './test-helpers';
import { seedBatchScenario } from './batch-test-helpers';
const mocks = vi.hoisted(() => ({ db: null as unknown, context: null as unknown }));
vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: async () => mocks.context }));
import { batchGET, batchPOST } from '@/lib/api/result-batch';
let test: GradesTestDb;
let f: Awaited<ReturnType<typeof seedBatchScenario>>;
beforeEach(async () => {
  test = await createGradesTestDb();
  f = await seedBatchScenario(test);
  mocks.db = test.db;
  mocks.context = { userId: f.actor.userId, schoolContext: { schoolId: f.actor.schoolId } };
});
afterEach(async () => {
  vi.restoreAllMocks();
  await test.client.close();
});
const post = (body: unknown, origin: string | null = 'http://local') =>
  new Request('http://local/api/v1/results/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
describe('Result batch HTTP boundary', () => {
  it('returns bounded private previews and accepts only explicitly confirmed scoped operations', async () => {
    const q = new URLSearchParams({ ...f.scope, operation: 'CALCULATE' });
    const response = await batchGET(new Request(`http://local/api/v1/results/batch?${q}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
    const body = await response.json();
    const row = body.data.data[0];
    const write = await batchPOST(
      post({
        scope: f.scope,
        operation: 'CALCULATE',
        confirm: true,
        entries: [{ studentId: row.student.id, resultId: null, expectedToken: row.expectedToken }],
      }),
    );
    expect(write.status).toBe(200);
    expect((await write.json()).data.outcomes[0]).toMatchObject({
      status: 'COMPLETED',
      code: 'CALCULATED',
    });
  });
  it('denies Origin violations and rejects spoofed authority, repeated/unknown queries and over-limit inputs', async () => {
    for (const origin of [null, 'null', 'https://foreign.test'])
      expect((await batchPOST(post({}, origin))).status).toBe(403);
    for (const suffix of ['&schoolId=' + f.school.schoolId, '&operation=PUBLISH'])
      expect(
        (
          await batchGET(
            new Request(
              'http://local/api/v1/results/batch?' +
                new URLSearchParams({ ...f.scope, operation: 'CALCULATE' }) +
                suffix,
            ),
          )
        ).status,
      ).toBe(400);
    const invalid = await batchPOST(
      post({
        scope: f.scope,
        operation: 'CALCULATE',
        confirm: true,
        schoolId: f.school.schoolId,
        entries: [],
      }),
    );
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get('cache-control')).toBe('private, no-store');
  });
  it('denies a Teacher or Parent even if the route context is forged to resemble Admin', async () => {
    for (const userId of [f.actors.teacherUserId, f.actors.parentUserId]) {
      mocks.context = {
        userId,
        role: 'SCHOOL_ADMIN',
        schoolContext: { schoolId: f.school.schoolId },
      };
      const r = await batchGET(
        new Request(
          'http://local/api/v1/results/batch?' +
            new URLSearchParams({ ...f.scope, operation: 'PUBLISH' }),
        ),
      );
      expect(r.status).toBe(403);
    }
  });
});
