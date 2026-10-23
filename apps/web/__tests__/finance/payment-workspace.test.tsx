import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupportedLocale } from '@school/shared';
import { PaymentsWorkspace } from '@/components/finance/payments-workspace';
import { getCatalog } from '@/i18n/catalogs';
const fetcher = vi.fn<typeof fetch>(); const clients: QueryClient[] = [];
const rows = ['old', 'new'].map((id, i) => ({ id, feeName: 'Tuition', period: i ? '2026-01' : '2025-12', dueDate: i ? '2026-01-10' : '2025-12-10', originalCents: 10000, reductionCents: 0, allocatedCents: 0 }));
beforeEach(() => { fetcher.mockReset(); vi.stubGlobal('fetch', fetcher); fetcher.mockImplementation(async path => {
  const url = String(path); let data: unknown;
  if (url.includes('/students?')) data = [{ id: 'student', firstName: 'Amina', lastName: 'Test' }];
  else if (url.includes('/options?')) data = { student: { id: 'student' }, charges: rows, hasMore: false, suggested: [] };
  else if (url.includes('/payments?')) data = { items: [], total: 0, page: 1 };
  else data = { payment: { id: 'payment', receiptReference: 'R-STABLE', currency: 'MAD', amountCents: 15000, studentName: 'Amina Test', method: 'CASH', receivedOn: '2026-01-01' }, allocations: [], reversal: null };
  return Response.json({ data });
}); });
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0; vi.unstubAllGlobals(); });
function show(locale: SupportedLocale, initialStudentId = '') { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client); return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC"><QueryClientProvider client={client}><div dir={locale === 'ar' ? 'rtl' : 'ltr'}><PaymentsWorkspace initialStudentId={initialStudentId} schoolId="school" timezone="UTC" currency="MAD" /></div></QueryClientProvider></NextIntlClientProvider>); }
it.each<SupportedLocale>(['en', 'fr', 'ar'])('allows editable oldest-first allocation with explicit confirmation in %s', async locale => {
  const user = userEvent.setup(), t = getCatalog(locale).financePayments; show(locale);
  await screen.findByRole('option', { name: 'Amina Test' }); await user.selectOptions(screen.getByLabelText(t.student), 'student');
  await user.type(screen.getByLabelText(t.amount), '150.00');
  await waitFor(() => expect(screen.getByRole('button', { name: t.suggest })).toBeEnabled()); await user.click(screen.getByRole('button', { name: t.suggest }));
  const old = screen.getByLabelText(`${t.allocated} Tuition 2025-12`), next = screen.getByLabelText(`${t.allocated} Tuition 2026-01`);
  expect(old).toHaveValue('100.00'); expect(next).toHaveValue('50.00');
  await user.clear(old); await user.type(old, '50.00'); await user.clear(next); await user.type(next, '100.00');
  expect(screen.getByRole('button', { name: t.record })).toBeDisabled(); await user.click(screen.getByLabelText(t.confirm));
  fetcher.mockResolvedValueOnce(Response.json({ data: { id: 'payment' } })); await user.click(screen.getByRole('button', { name: t.record }));
  await waitFor(() => expect(fetcher.mock.calls.some(c => String(c[0]) === '/api/v1/finance/payments')).toBe(true));
  const call = fetcher.mock.calls.find(c => String(c[0]) === '/api/v1/finance/payments')!;
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({ amountCents: 15000, confirmed: true, method: 'CASH', studentId: 'student', allocations: [{ chargeId: 'old', amountCents: 5000 }, { chargeId: 'new', amountCents: 10000 }], requestKey: expect.any(String) });
  expect(call[1]?.credentials).toBe('same-origin');
});
it('blocks mismatched allocations and invalid money', async () => {
  const user = userEvent.setup(), t = getCatalog('en').financePayments; show('en');
  await screen.findByRole('option', { name: 'Amina Test' }); await user.selectOptions(screen.getByLabelText(t.student), 'student');
  await user.type(screen.getByLabelText(t.amount), '1.001'); await user.click(screen.getByLabelText(t.confirm));
  expect(screen.getByRole('button', { name: t.record })).toBeDisabled(); expect(screen.getByRole('alert')).toHaveTextContent(t.invalid);
});
it('retains the balance-linked Student even when absent from the first search page', async () => {
  fetcher.mockImplementation(async path => Response.json({ data: String(path).includes('/students?') ? [] : String(path).includes('/options?') ? { student: { id: 'linked', firstName: 'Historical', lastName: 'Student' }, charges: [], hasMore: false } : { items: [], total: 0, page: 1 } }));
  show('en', 'linked'); await screen.findByRole('option', { name: 'Historical Student' });
  expect(screen.getByLabelText(getCatalog('en').financePayments.student)).toHaveValue('linked');
  expect(fetcher.mock.calls.some(([path]) => String(path).includes('/payments?page=1&studentId=linked'))).toBe(true);
});
it('retains payment edits and the request key after a version conflict without automatic retry', async () => {
  const user = userEvent.setup(), t = getCatalog('en').financePayments; show('en');
  await screen.findByRole('option', { name: 'Amina Test' }); await user.selectOptions(screen.getByLabelText(t.student), 'student');
  await user.type(screen.getByLabelText(t.amount), '150.00');
  await waitFor(() => expect(screen.getByRole('button', { name: t.suggest })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: t.suggest })); await user.click(screen.getByLabelText(t.confirm));
  const previous = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (path, init) => String(path) === '/api/v1/finance/payments' ? Response.json({ error: { code: 'CONFLICT', message: 'Private diagnostic' } }, { status: 409 }) : previous(path, init));
  await user.click(screen.getByRole('button', { name: t.record }));
  expect(await screen.findByRole('alert')).toHaveTextContent(t.conflict);
  expect(screen.queryByText('Private diagnostic')).not.toBeInTheDocument();
  expect(screen.getByLabelText(t.amount)).toHaveValue('150.00');
  expect(screen.getByLabelText(`${t.allocated} Tuition 2025-12`)).toHaveValue('100.00');
  expect(fetcher.mock.calls.filter(([path]) => String(path) === '/api/v1/finance/payments')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: t.record }));
  await waitFor(() => expect(fetcher.mock.calls.filter(([path]) => String(path) === '/api/v1/finance/payments')).toHaveLength(2));
  const bodies = fetcher.mock.calls.filter(([path]) => String(path) === '/api/v1/finance/payments').map(([, init]) => JSON.parse(String(init?.body)));
  expect(bodies[0]).toEqual(bodies[1]);
});
