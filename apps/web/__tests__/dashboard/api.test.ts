import { beforeEach, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthenticatedError } from '@/lib/errors';
const mock = vi.hoisted(() => ({ context: vi.fn(), overview: vi.fn(), workspace: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getDb: () => 'local-db' }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: mock.context }));
vi.mock('@/lib/modules/dashboard/overview', () => ({ adminOverview: mock.overview, workspaceContext: mock.workspace }));
import { GET } from '@/app/api/v1/dashboard/route';
import { GET as contextGET } from '@/app/api/v1/dashboard/context/route';
const schoolId = '11111111-1111-4111-8111-111111111111', userId = '22222222-2222-4222-8222-222222222222';
beforeEach(() => { vi.clearAllMocks(); mock.context.mockResolvedValue({ userId, role: 'SCHOOL_ADMIN', schoolContext: { schoolId, isValid: true } }); mock.overview.mockResolvedValue({ metrics: null }); mock.workspace.mockResolvedValue({ academicYear: null }); });
it('binds aggregation to the verified school/user, never client-selected authority', async () => {
  const response = await GET(new Request('http://localhost/api/v1/dashboard'));
  expect(response.status).toBe(200); expect(mock.overview).toHaveBeenCalledWith('local-db', { schoolId, userId }, undefined);
  expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('vary')).toBe('Cookie');
});
it.each(['TEACHER', 'PARENT', 'SUPER_ADMIN'])('denies %s before school-wide aggregation', async role => {
  mock.context.mockResolvedValue({ userId, role, schoolContext: { schoolId } });
  expect((await GET(new Request('http://localhost/api/v1/dashboard'))).status).toBe(403); expect(mock.overview).not.toHaveBeenCalled();
});
it.each([`schoolId=${schoolId}`, 'academicYearId=bad', `academicYearId=${schoolId}&academicYearId=${userId}`, 'role=SCHOOL_ADMIN'])('rejects injected or invalid filters: %s', async query => {
  expect((await GET(new Request('http://localhost/api/v1/dashboard?'+query))).status).toBe(400); expect(mock.overview).not.toHaveBeenCalled();
});
it('keeps context-only Parent data separate from administrator financial data', async () => {
  mock.context.mockResolvedValue({ userId, role: 'PARENT', schoolContext: { schoolId } });
  expect((await contextGET(new Request('http://localhost/api/v1/dashboard/context'))).status).toBe(200); expect(mock.workspace).toHaveBeenCalledWith('local-db', { schoolId, userId }); expect(mock.overview).not.toHaveBeenCalled();
});
it.each([new ForbiddenError(), new UnauthenticatedError()])('preserves authenticated-context denial and private caching', async error => {
  mock.context.mockRejectedValue(error); const response = await GET(new Request('http://localhost/api/v1/dashboard'));
  expect([401,403]).toContain(response.status); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(mock.overview).not.toHaveBeenCalled();
});
