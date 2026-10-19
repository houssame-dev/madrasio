// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { ConflictError, ForbiddenError } from '@/lib/errors';
const mock = vi.hoisted(() => ({ context: vi.fn(), get: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getDb: () => 'synthetic-db' }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: mock.context }));
vi.mock('@/lib/modules/timetable/application/builder', () => ({ getDraft: mock.get, saveDraft: mock.save }));
import { draftGET, draftPUT } from '@/lib/api/timetable';
import * as route from '@/app/api/v1/timetable/draft/route';
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = { academicYearId: id(1), academicPeriodId: id(2), classId: id(3), configurationId: id(4), curriculumVersionId: id(5), startDate: '2025-09-01', endDate: '2025-12-20', requestKey: id(6), expectedRevision: 0, lessons: [] };
const query = new URLSearchParams({ academicYearId: id(1), academicPeriodId: id(2), classId: id(3) });
beforeEach(() => { vi.resetAllMocks(); mock.context.mockResolvedValue({ userId: 'admin', schoolContext: { schoolId: 'school' } }); mock.get.mockResolvedValue({ draft: null }); mock.save.mockResolvedValue({ id: id(7), revision: 1 }); });
function request(body: unknown, origin: string | null = 'https://school.example.test') { return new Request('https://school.example.test/api/v1/timetable/draft', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }); }
function privateResponse(response: Response) { expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('vary')).toBe('Cookie'); }
it('exposes only draft read/write, using verified actor and private envelopes', async () => {
  expect(Object.keys(route).sort()).toEqual(['GET', 'PUT', 'dynamic'].sort());
  const read = await draftGET(new Request(`https://school.example.test/api/v1/timetable/draft?${query}`)); expect(read.status).toBe(200); privateResponse(read);
  const saved = await draftPUT(request(input)); expect(saved.status).toBe(200); privateResponse(saved); expect(mock.save).toHaveBeenCalledWith('synthetic-db', { userId: 'admin', schoolId: 'school' }, input);
});
it.each([null, 'null', 'broken', 'https://school.example.test.evil', 'https://school.example.test/path', 'https://foreign.test'])('rejects invalid Origin %s without forwarding a write', async origin => {
  const response = await draftPUT(request(input, origin)); expect(response.status).toBe(403); privateResponse(response); expect(mock.save).not.toHaveBeenCalled();
});
it('rejects injected authority and incomplete/repeated query context', async () => {
  for (const body of [{ ...input, schoolId: id(8) }, { ...input, expectedRevision: -1 }, { ...input, lessons: [{ teacherId: id(9) }] }]) { const response = await draftPUT(request(body)); expect(response.status).toBe(400); privateResponse(response); }
  for (const suffix of ['', `?${query}&classId=${id(3)}`, `?${query}&schoolId=${id(9)}`]) expect((await draftGET(new Request(`https://school.example.test/api/v1/timetable/draft${suffix}`))).status).toBe(400);
  expect(mock.save).not.toHaveBeenCalled();
});
it('preserves actionable conflict details and denies unauthenticated context without cacheable errors', async () => {
  mock.save.mockRejectedValue(new ConflictError('Scheduling conflict', { kind: 'SCHEDULING_CONFLICT', conflicts: [{ kind: 'TEACHER', otherClass: 'B' }] }));
  const conflict = await draftPUT(request(input)); expect(conflict.status).toBe(409); privateResponse(conflict); expect((await conflict.json()).error.details.kind).toBe('SCHEDULING_CONFLICT');
  mock.context.mockRejectedValue(new ForbiddenError()); const response = await draftPUT(request(input)); expect(response.status).toBe(403); privateResponse(response);
});
