// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@/lib/errors';
const mock = vi.hoisted(() => ({ context: vi.fn(), state: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getDb: () => 'synthetic-db' }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: mock.context }));
vi.mock('@/lib/modules/timetable/application/service', () => ({ state: mock.state, saveRoom: mock.save, saveConfiguration: mock.save, saveLoad: mock.save }));
import { GET, roomPUT, configurationPUT, loadPUT } from '@/lib/api/timetable';
const id = '10000000-0000-4000-8000-000000000001';
beforeEach(() => { vi.resetAllMocks(); mock.context.mockResolvedValue({ userId: 'admin', schoolContext: { schoolId: 'school' } }); mock.state.mockResolvedValue({ rooms: [] }); mock.save.mockResolvedValue({ id }); });
const input = { name: 'Lab', kind: 'LAB', active: true, expectedRevision: 0 };
function request(body: unknown, origin: string | null = 'https://school.example.test') { return new Request('https://school.example.test/api/v1/timetable/rooms', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }); }
function privateResponse(response: Response) { expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('vary')).toBe('Cookie'); }
it('binds writes to verified School context and keeps success private', async () => {
  const response = await roomPUT(request(input)); expect(response.status).toBe(200); privateResponse(response);
  expect(mock.save).toHaveBeenCalledWith('synthetic-db', { userId: 'admin', schoolId: 'school' }, input);
});
it.each([null, 'null', 'broken', 'https://school.example.test.evil', 'https://school.example.test/path', 'https://foreign.test'])('rejects Origin %s without a write', async origin => {
  const response = await roomPUT(request(input, origin)); expect(response.status).toBe(403); privateResponse(response); expect(mock.save).not.toHaveBeenCalled();
});
it('strictly validates every endpoint and protects errors from caching', async () => {
  for (const handler of [roomPUT, configurationPUT, loadPUT]) { const response = await handler(request({ ...input, schoolId: id })); expect(response.status).toBe(400); privateResponse(response); }
  expect(mock.save).not.toHaveBeenCalled();
  mock.context.mockRejectedValue(new ForbiddenError()); const response = await roomPUT(request(input)); expect(response.status).toBe(403); privateResponse(response);
});
it('rejects extra, repeated and invalid year queries and uses selected year only after authentication', async () => {
  for (const query of ['?schoolId=x', '?academicYearId=x', `?academicYearId=${id}&academicYearId=${id}`]) { const response = await GET(new Request(`https://school.example.test/api/v1/timetable${query}`)); expect(response.status).toBe(400); privateResponse(response); }
  const response = await GET(new Request(`https://school.example.test/api/v1/timetable?academicYearId=${id}`)); expect(response.status).toBe(200); privateResponse(response); expect(mock.state).toHaveBeenCalledWith('synthetic-db', { userId: 'admin', schoolId: 'school' }, id);
});
