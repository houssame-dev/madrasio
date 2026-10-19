// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ context: vi.fn(), read: vi.fn(), publish: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getDb: () => 'db' }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: mock.context }));
vi.mock('@/lib/modules/timetable/application/publication', () => ({ readPublished: mock.read, publishDraft: mock.publish }));
import { GET, POST } from '@/lib/api/timetable-publication';
import { tid } from './builder-fixture';
const input = { academicYearId: tid(2), academicPeriodId: tid(3), classId: tid(4), draftId: tid(50), expectedRevision: 1, expectedSequence: 0, effectiveFrom: '2025-09-01', requestKey: tid(51), confirm: true };
beforeEach(() => { vi.resetAllMocks(); mock.context.mockResolvedValue({ userId: tid(14), schoolContext: { schoolId: tid(1) } }); mock.read.mockResolvedValue({ schedules: [] }); mock.publish.mockResolvedValue({ id: tid(80), sequence: 1 }); });
const request = (body: unknown, origin: string | null = 'https://school.test') => new Request('https://school.test/api/v1/timetable/published', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
function privateResponse(r: Response) { expect(r.headers.get('cache-control')).toBe('private, no-store'); expect(r.headers.get('vary')).toBe('Cookie'); }
it('uses verified actor only and requires explicit confirmation', async () => {
  const read = await GET(new Request('https://school.test/api/v1/timetable/published')); expect(read.status).toBe(200); privateResponse(read);
  const saved = await POST(request(input)); expect(saved.status).toBe(200); privateResponse(saved); expect(mock.publish).toHaveBeenCalledWith('db', { userId: tid(14), schoolId: tid(1) }, input);
  for (const body of [{ ...input, confirm: false }, { ...input, schoolId: tid(7) }, { ...input, expectedSequence: -1 }]) { const invalid = await POST(request(body)); expect(invalid.status).toBe(400); privateResponse(invalid); }
});
it.each([null, 'null', 'https://school.test.evil', 'https://school.test/path', 'invalid'])('rejects unsafe Origin %s before mutation dispatch', async origin => { const r = await POST(request(input, origin)); expect(r.status).toBe(403); privateResponse(r); expect(mock.publish).not.toHaveBeenCalled(); });
it('rejects authority injection, repeated parameters, mixed scopes and invalid dates', async () => {
  for (const query of [`schoolId=${tid(1)}`, `date=2025-02-30`, `classId=${tid(4)}&studentId=${tid(37)}`, 'date=2025-09-01&date=2025-09-02']) { const r = await GET(new Request(`https://school.test/api/v1/timetable/published?${query}`)); expect(r.status).toBe(400); privateResponse(r); }
  expect(mock.read).not.toHaveBeenCalled();
});
