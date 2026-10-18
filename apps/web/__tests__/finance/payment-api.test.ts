// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
const mock = vi.hoisted(() => ({ actor: vi.fn(), record: vi.fn(), reverse: vi.fn(), detail: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getDb: () => 'synthetic-db' }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: mock.actor }));
vi.mock('@/lib/modules/finance/application/payments', () => ({ recordPayment: mock.record, reversePayment: mock.reverse, paymentDetail: mock.detail }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'ar' }) }) }));
import { paymentPOST, reversalPOST, receiptGET } from '@/lib/api/finance';
import * as paymentRoute from '@/app/api/v1/finance/payments/[id]/route';
import * as collectionRoute from '@/app/api/v1/finance/payments/route';
const id = randomUUID(), studentId = randomUUID(), schoolId = randomUUID(), userId = randomUUID();
const params = { params: Promise.resolve({ id }) };
const input = () => ({ requestKey: randomUUID(), confirmed: true, studentId, method: 'CASH', amountCents: 10000, receivedOn: '2025-11-01', allocations: [{ chargeId: randomUUID(), amountCents: 10000 }] });
it('exposes no edit/delete operation for historical payments', () => {
  expect(Object.keys(paymentRoute)).toEqual(['GET']);
  expect(Object.keys(collectionRoute).sort()).toEqual(['GET', 'POST']);
});
const request = (body: unknown, origin: string | null = 'https://school.example.test') => new Request('https://school.example.test/api/v1/finance/payments', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mock.actor.mockResolvedValue({ userId, schoolContext: { schoolId } }); mock.record.mockResolvedValue({ id }); mock.reverse.mockResolvedValue({ id: randomUUID() });
  mock.detail.mockResolvedValue({ payment: { id, receiptReference: `R-${id}`, schoolName: '<script>School</script>', schoolTimezone: 'UTC', currency: 'MAD', studentName: 'Amina Test', amountCents: 10000, receivedOn: '2025-11-01', method: 'CASH', reference: null, recordedBy: userId, recordedAt: new Date('2025-11-01T12:00:00Z') }, allocations: [], reversal: null }); });
it('binds payment and reversal writes to verified server identity and disables caching', async () => {
  const body = input(), response = await paymentPOST(request(body)); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mock.record).toHaveBeenCalledWith('synthetic-db', { userId, schoolId }, body);
  const reverse = { requestKey: randomUUID(), confirmed: true, reason: 'Correction' };
  expect((await reversalPOST(request(reverse), params)).status).toBe(200); expect(mock.reverse).toHaveBeenCalledWith('synthetic-db', { userId, schoolId }, id, reverse);
});
it.each([null, 'null', 'https://foreign.example.test', 'https://school.example.test/path'])('denies payment and reversal requests from Origin %s', async origin => {
  expect((await paymentPOST(request(input(), origin))).status).toBe(403);
  expect((await reversalPOST(request({ requestKey: randomUUID(), reason: 'Correction', confirmed: true }, origin), params)).status).toBe(403);
  expect(mock.record).not.toHaveBeenCalled(); expect(mock.reverse).not.toHaveBeenCalled();
});
it('rejects extra authority fields, absent confirmation and a mismatched allocation sum', async () => {
  for (const raw of [{ ...input(), schoolId }, { ...input(), confirmed: false }, { ...input(), amountCents: 9999 }]) expect((await paymentPOST(request(raw))).status).toBe(400);
  expect(mock.record).not.toHaveBeenCalled();
});
it('serves private, localized, escaped HTML downloads without executable or external content', async () => {
  const response = await receiptGET(new Request('https://school.example.test/api/v1/finance/payments/x/receipt?download=1'), params);
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('vary')).toBe('Cookie');
  expect(response.headers.get('content-disposition')).toBe(`attachment; filename="receipt-${id}.html"`);
  expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
  const html = await response.text(); expect(html).toContain('dir="rtl"'); expect(html).toContain('&lt;script&gt;School'); expect(html).not.toContain('<script>');
});
it.each([new ForbiddenError(), new NotFoundError()])('preserves private receipt denials', async error => {
  mock.detail.mockRejectedValue(error); const response = await receiptGET(new Request('https://school.example.test/receipt'), params);
  expect(response.status).toBe(error.status); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('content-disposition')).toBeNull();
});
