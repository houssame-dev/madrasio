// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sessionFixture } from './session-fixture';
const mocks = vi.hoisted(() => ({ db: null as unknown, context: null as unknown, error: null as unknown }));
vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: async () => { if (mocks.error) throw mocks.error; return mocks.context; } }));
import { dailyAttendancePUT, sessionRosterGET, sessionRosterPUT, sessionsGET, studentAttendanceGET } from '@/lib/api/attendance';
import { UnauthenticatedError } from '@/lib/errors';
let f: Awaited<ReturnType<typeof sessionFixture>>;
beforeEach(async () => { f = await sessionFixture(); mocks.db = f.db; mocks.context = { userId: f.teacherActor.userId, schoolContext: { schoolId: f.schoolId } }; mocks.error = null; }, 30000);
afterEach(async () => { await f?.test.client.close(); });
function request(body?: unknown, origin: string | null = 'http://local', extra = '') {
  return new Request(`http://local/api/v1/attendance/session?${new URLSearchParams(f.identity)}${extra}`, body ? { method: 'PUT', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) } : undefined);
}
const body = () => ({ records: [{ studentId: f.student.id, status: 'PRESENT', expectedVersion: null }] });
describe('Attendance session HTTP boundary', () => {
  it('saves and reads only verified Teacher session context; all responses are private', async () => {
    const saved = await sessionRosterPUT(request(body())); expect(saved.status).toBe(200); expect(saved.headers.get('cache-control')).toBe('private, no-store');
    const read = await sessionRosterGET(request()); expect(read.status).toBe(200); expect(await read.json()).toMatchObject({ data: { students: [{ attendance: { status: 'PRESENT', version: 1 } }] } });
    const sessions = await sessionsGET(new Request(`http://local?date=${f.identity.date}`)); expect(sessions.status).toBe(200);
  });
  it('denies Admin direct writes and all legacy daily PUTs, retaining Admin GET', async () => {
    mocks.context = { userId: f.admin.userId, schoolContext: { schoolId: f.schoolId } };
    expect((await sessionRosterGET(request())).status).toBe(200);
    const denied = await sessionRosterPUT(request(body())); expect(denied.status).toBe(403); expect(denied.headers.get('cache-control')).toBe('private, no-store');
    for (const actor of [f.admin, f.teacherActor]) { mocks.context = { userId: actor.userId, schoolContext: { schoolId: f.schoolId } }; expect((await dailyAttendancePUT(request({ records: [{ studentId: f.student.id, status: 'PRESENT' }] }), { params: Promise.resolve({ id: f.classAId, date: f.identity.date }) })).status).toBe(403); }
  });
  it('fails closed for Origin, repeated/foreign keys and spoofed identifiers', async () => {
    for (const origin of [null, 'null', 'http://foreign', 'http://local/']) expect((await sessionRosterPUT(request(body(), origin))).status).toBe(403);
    for (const extra of ['&teacherId='+randomUUID(), '&schoolId='+randomUUID(), '&lessonKey='+randomUUID()]) expect((await sessionRosterPUT(request(body(), 'http://local', extra))).status).toBe(400);
    expect((await sessionRosterPUT(request({ ...body(), role: 'SCHOOL_ADMIN' }))).status).toBe(400);
  });
  it('retains unauthenticated and raw-history isolation errors without exposing records', async () => {
    mocks.error = new UnauthenticatedError(); const denied = await sessionRosterGET(request()); expect(denied.status).toBe(401); expect(denied.headers.get('cache-control')).toBe('private, no-store');
    mocks.error = null;
    const history = await studentAttendanceGET(new Request('http://local'), { params: Promise.resolve({ id: randomUUID() }) }); expect(history.status).toBe(404);
  });
});
