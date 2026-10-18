// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { UnauthenticatedError, ForbiddenError } from '@/lib/errors';
const mock = vi.hoisted(() => ({ context: vi.fn(), list: vi.fn(), save: vi.fn(), generate: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getDb: () => 'synthetic-db' }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: mock.context }));
vi.mock('@/lib/modules/finance/application/service', () => ({ listFinance: mock.list, saveFeeType: mock.save, generateCharges: mock.generate }));
import { stateGET, typePOST, generatePOST } from '@/lib/api/finance';
const userId = randomUUID(), schoolId = randomUUID();
beforeEach(() => { vi.resetAllMocks(); mock.context.mockResolvedValue({ userId, schoolContext: { schoolId } }); mock.list.mockResolvedValue({ charges: [] }); mock.save.mockResolvedValue({ name: 'Tuition' }); });
function request(body: unknown, origin: string | null = 'https://school.example.test') {
  return new Request('https://school.example.test/api/v1/finance/fee-types', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin === null ? {} : { origin }) }, body: JSON.stringify(body) });
}
function privateResponse(response: Response) { expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('vary')).toBe('Cookie'); }
describe('Finance HTTP boundary', () => {
  it('uses verified server identity and returns private success', async () => {
    const response = await typePOST(request({ name: 'Tuition' }));
    expect(response.status).toBe(200); privateResponse(response);
    expect(mock.save).toHaveBeenCalledWith('synthetic-db', { userId, schoolId }, { name: 'Tuition' });
  });
  it.each([null, 'null', 'https://foreign.example.test', 'https://school.example.test.evil.test', 'https://school.example.test/path', 'broken'])('rejects invalid Origin %s before service access', async origin => {
    const response = await typePOST(request({ name: 'Tuition' }, origin));
    expect(response.status).toBe(403); privateResponse(response); expect(mock.save).not.toHaveBeenCalled();
  });
  it.each([{ name: 'Tuition', schoolId }, { name: 'Tuition', createdBy: userId }, { name: '' }])('rejects invalid/authority-bearing payloads', async body => {
    const response = await typePOST(request(body)); expect(response.status).toBe(400); privateResponse(response); expect(mock.save).not.toHaveBeenCalled();
  });
  it.each([new UnauthenticatedError(), new ForbiddenError(), new Error('secret transport credential')])('sanitizes and prevents caching of errors', async error => {
    mock.context.mockRejectedValue(error);
    const response = await stateGET(new Request('https://school.example.test/api/v1/finance'));
    expect(response.status).toBe(error instanceof UnauthenticatedError ? 401 : error instanceof ForbiddenError ? 403 : 500);
    privateResponse(response); expect(await response.text()).not.toContain('secret transport credential'); expect(mock.list).not.toHaveBeenCalled();
  });
  it('requires preview and idempotency confirmation without accepting allocation writes', async () => {
    const response = await generatePOST(request({ structureId: randomUUID(), periods: ['2026-01'], studentIds: [randomUUID()], allocatedCents: 10 }));
    expect(response.status).toBe(400); expect(mock.generate).not.toHaveBeenCalled();
  });
});
