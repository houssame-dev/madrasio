// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ForbiddenError, BusinessRuleViolationError } from '@/lib/errors';
const mock = vi.hoisted(() => ({ actor: vi.fn(), collections: vi.fn(), outstanding: vi.fn(), balance: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getDb: () => 'synthetic-db' }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: mock.actor }));
vi.mock('@/lib/modules/finance/application/reports', async original => ({ ...await original<typeof import('@/lib/modules/finance/application/reports')>(), collectionsReport: mock.collections, outstandingReport: mock.outstanding, studentBalance: mock.balance }));
import { collectionsGET, outstandingGET, balanceGET } from '@/lib/api/finance';
const schoolId = randomUUID(), userId = randomUUID(), id = randomUUID();
const request = (query: string) => new Request(`https://school.example.test/api/v1/finance/reports/x?${query}`);
beforeEach(() => {
  vi.resetAllMocks(); mock.actor.mockResolvedValue({ userId, schoolContext: { schoolId } });
  mock.collections.mockResolvedValue({ currency: 'EUR', from: '2026-01-01', to: '2026-01-31', today: '2026-02-10', timezone: 'Africa/Casablanca', items: [{ id, studentName: '=HYPERLINK("secret")', method: 'CASH', amountCents: 123, receiptReference: 'R-test', receivedOn: '2026-01-01', reversalReference: 'REV-test', reversedAt: new Date('2026-02-10T12:00:00Z') }] });
  mock.outstanding.mockResolvedValue({ currency: 'GBP', today: '2026-02-10', timezone: 'UTC', items: [{ studentName: 'طالب', netCents: 1000, paidCents: 500, outstandingCents: 500, notOverdueCents: 0, days1to30Cents: 500, days31to60Cents: 0, days61plusCents: 0 }] });
  mock.balance.mockResolvedValue({ student: { id } });
});
it('binds all JSON reports to verified School and user and marks them private', async () => {
  for (const response of [await collectionsGET(request('from=2026-01-01&to=2026-01-31')), await outstandingGET(request('')), await balanceGET(request('page=2'), { params: Promise.resolve({ id }) })]) {
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('vary')).toBe('Cookie');
  }
  expect(mock.balance).toHaveBeenCalledWith('synthetic-db', { schoolId, userId }, id, 2);
  expect(mock.collections.mock.calls[0].slice(0, 3)).toEqual(['synthetic-db', { schoolId, userId }, { from: '2026-01-01', to: '2026-01-31', page: 1 }]);
});
it('exports all filtered rows through the same service, preserves reversal trace and sanitizes formulas', async () => {
  const response = await collectionsGET(request(`from=2026-01-01&to=2026-01-31&studentId=${id}&page=2&format=csv`));
  expect(mock.collections.mock.calls[0][4]).toBe(true); expect(mock.collections.mock.calls[0][2]).toMatchObject({ studentId: id, page: 2 });
  const csv = await response.text(); expect(csv).toContain('Gross EUR'); expect(csv).not.toContain('MAD'); expect(csv).toContain('"\'=HYPERLINK'); expect(csv).toContain('"1.23","0.00","R-test","REV-test"'); expect(csv).toContain('2026-02-10T12:00:00.000Z');
  expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8'); expect(response.headers.get('content-disposition')).toContain('attachment;'); expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('preserves year/Class/student filters and dates in outstanding CSV', async () => {
  const response = await outstandingGET(request(`academicYearId=${id}&classId=${id}&studentId=${id}&format=csv`));
  expect(mock.outstanding.mock.calls[0][2]).toMatchObject({ academicYearId: id, classId: id, studentId: id });
  expect(mock.outstanding.mock.calls[0][4]).toBe(true);
  expect(await response.text()).toContain(`"طالب","10.00","5.00","5.00","0.00","5.00","0.00","0.00","2026-02-10","UTC","${id}","${id}","${id}"`);
});
it('rejects duplicate parameters, authority injection, invalid dates and formats before querying', async () => {
  for (const q of ['page=1&page=2', `schoolId=${schoolId}`, 'format=html', 'classId=invalid']) expect((await outstandingGET(request(q))).status).toBe(400);
  for (const q of ['from=2026-02-30&to=2026-03-01', 'from=2026-02-11&to=2026-02-10', 'from=2026-01-01']) expect((await collectionsGET(request(q))).status).toBe(400);
  expect(mock.collections).not.toHaveBeenCalled(); expect(mock.outstanding).not.toHaveBeenCalled();
});
it('keeps authorization denials private in JSON and CSV modes', async () => {
  mock.actor.mockRejectedValue(new ForbiddenError());
  for (const format of ['', '&format=csv']) {
    const response = await outstandingGET(request(`page=1${format}`));
    expect(response.status).toBe(403); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('content-disposition')).toBeNull();
  }
  expect(mock.outstanding).not.toHaveBeenCalled();
});
it('fails an over-limit export explicitly without returning a partial CSV', async () => {
  mock.outstanding.mockRejectedValue(new BusinessRuleViolationError('Export exceeds 10000 students. Narrow the filters.'));
  const response = await outstandingGET(request('format=csv'));
  expect(response.ok).toBe(false); expect(response.headers.get('content-type')).toContain('application/json'); expect(response.headers.get('content-disposition')).toBeNull();
});
