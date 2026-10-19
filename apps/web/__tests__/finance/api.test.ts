// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { UnauthenticatedError, ForbiddenError } from '@/lib/errors';
const mock = vi.hoisted(() => ({ context: vi.fn(), list: vi.fn(), save: vi.fn(), generate: vi.fn(), settings: vi.fn(), currency: vi.fn(), correct: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getDb: () => 'synthetic-db' }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: mock.context }));
vi.mock('@/lib/modules/finance/application/service', () => ({ listFinance: mock.list, saveFeeType: mock.save, generateCharges: mock.generate, financeSettings: mock.settings, setFinanceCurrency: mock.currency, correctReduction: mock.correct }));
import { stateGET, typePOST, generatePOST, settingsGET, settingsPATCH, reductionPATCH } from '@/lib/api/finance';
import * as reductionRoute from '@/app/api/v1/finance/charges/[id]/reductions/[reductionId]/route';
const userId = randomUUID(), schoolId = randomUUID();
beforeEach(() => { vi.resetAllMocks(); mock.context.mockResolvedValue({ userId, schoolContext: { schoolId } }); mock.list.mockResolvedValue({ charges: [] }); mock.save.mockResolvedValue({ name: 'Tuition' }); });
function request(body: unknown, origin: string | null = 'https://school.example.test') {
  return new Request('https://school.example.test/api/v1/finance/fee-types', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin === null ? {} : { origin }) }, body: JSON.stringify(body) });
}
function privateResponse(response: Response) { expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('vary')).toBe('Cookie'); }
describe('Finance HTTP boundary', () => {
  it('exposes only guarded PATCH for an individual reduction and binds both identifiers to server School context', async () => {
    expect(Object.keys(reductionRoute)).toEqual(['PATCH']); const id = randomUUID(), reductionId = randomUUID();
    const params = { params: Promise.resolve({ id, reductionId }) };
    const input = { kind: 'REDUCTION_EDIT', amountCents: 1200, reason: 'Correct amount', confirmed: true, expectedEventId: reductionId, requestKey: randomUUID() };
    mock.correct.mockResolvedValue({ id: randomUUID() });
    const response = await reductionPATCH(request(input), params); expect(response.status).toBe(200); privateResponse(response);
    expect(mock.correct).toHaveBeenCalledWith('synthetic-db', { userId, schoolId }, id, reductionId, input);
    mock.correct.mockClear();
    for (const body of [{ ...input, schoolId }, { ...input, confirmed: false }, { ...input, amountCents: 0 }, { ...input, expectedEventId: undefined }, { ...input, reason: ' ' }]) { const result = await reductionPATCH(request(body), params); expect(result.status).toBe(400); privateResponse(result); }
    for (const origin of [null, 'null', 'https://foreign.example.test', 'https://school.example.test.evil.test']) expect((await reductionPATCH(request(input, origin), params)).status).toBe(403);
    expect(mock.correct).not.toHaveBeenCalled();
    mock.context.mockRejectedValue(new ForbiddenError()); const denied = await reductionPATCH(request(input), params); expect(denied.status).toBe(403); privateResponse(denied);
  });
  it('binds currency settings to verified School identity and private responses', async () => {
    mock.settings.mockResolvedValue({ currency: 'EUR', locked: false }); mock.currency.mockResolvedValue({ currency: 'EUR', locked: false });
    for (const response of [await settingsGET(), await settingsPATCH(request({ currency: 'EUR' }))]) { expect(response.status).toBe(200); privateResponse(response); }
    expect(mock.currency).toHaveBeenCalledWith('synthetic-db', { userId, schoolId }, { currency: 'EUR' });
    for (const body of [{ currency: 'JPY' }, { currency: null }, { currency: 'USD', schoolId }, {}]) { const response = await settingsPATCH(request(body)); expect(response.status).toBe(400); privateResponse(response); }
    mock.currency.mockClear();
    for (const origin of [null, 'null', 'https://foreign.example.test']) { const response = await settingsPATCH(request({ currency: 'GBP' }, origin)); expect(response.status).toBe(403); privateResponse(response); }
    expect(mock.currency).not.toHaveBeenCalled();
  });
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
