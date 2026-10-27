import { beforeEach, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthenticatedError } from '@/lib/errors';
const mock = vi.hoisted(() => ({ context: vi.fn(), workspace: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getDb: () => 'local-db' }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: mock.context }));
vi.mock('@/lib/modules/dashboard/teacher-workspace', () => ({ teacherWorkspace: mock.workspace }));
import { GET } from '@/app/api/v1/dashboard/teacher/route';
const schoolId = '11111111-1111-4111-8111-111111111111', userId = '22222222-2222-4222-8222-222222222222';
beforeEach(() => { vi.clearAllMocks(); mock.context.mockResolvedValue({ userId, role: 'TEACHER', schoolContext: { schoolId } }); mock.workspace.mockResolvedValue({ lessons: [] }); });
it('binds Teacher aggregation to authenticated context and disables shared caching', async () => {
  const response = await GET(new Request('http://localhost/api/v1/dashboard/teacher'));
  expect(response.status).toBe(200); expect(mock.workspace).toHaveBeenCalledWith('local-db', { schoolId, userId });
  expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('vary')).toBe('Cookie');
});
it.each(['SCHOOL_ADMIN', 'PARENT', 'SUPER_ADMIN'])('rejects %s before Teacher reads', async role => { mock.context.mockResolvedValue({ role }); expect((await GET(new Request('http://localhost/api/v1/dashboard/teacher'))).status).toBe(403); expect(mock.workspace).not.toHaveBeenCalled(); });
it.each(['schoolId=x', 'userId=x', 'date=2026-01-01', 'role=TEACHER'])('rejects scope override %s', async query => { expect((await GET(new Request('http://localhost/api/v1/dashboard/teacher?'+query))).status).toBe(400); expect(mock.workspace).not.toHaveBeenCalled(); });
it.each([new ForbiddenError(), new UnauthenticatedError()])('preserves context denial', async error => { mock.context.mockRejectedValue(error); const response = await GET(new Request('http://localhost/api/v1/dashboard/teacher')); expect([401,403]).toContain(response.status); expect(mock.workspace).not.toHaveBeenCalled(); });
