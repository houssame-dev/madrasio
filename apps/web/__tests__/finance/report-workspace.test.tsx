import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReportsWorkspace } from '@/components/finance/reports-workspace';
import { getCatalog } from '@/i18n/catalogs';
import type { SupportedLocale } from '@school/shared';
const fetcher = vi.fn<typeof fetch>(), onPayments = vi.fn(); const clients: QueryClient[] = [];
const row = { studentId: 'student', studentName: 'Amina Test', netCents: 10000, paidCents: 3000, outstandingCents: 7000, notOverdueCents: 0, days1to30Cents: 7000, days31to60Cents: 0, days61plusCents: 0 };
beforeEach(() => {
  vi.stubGlobal('fetch', fetcher); fetcher.mockReset(); onPayments.mockReset();
  fetcher.mockImplementation(async input => {
    const path = String(input);
    const data = path.includes('/payments/students') ? [{ id: 'student', firstName: 'Amina', lastName: 'Test' }]
      : path.includes('/balance') ? { today: '2026-02-10', student: { id: 'student', firstName: 'Amina', lastName: 'Test' }, summary: row, validPaymentsCents: 3000, items: [], total: 0, page: 1 }
      : path.includes('/collections') ? { today: '2026-02-10', total: 0, page: 1, items: [], netCents: 0, grossCents: 0, reversedCents: 0, cashCents: 0, bankCents: 0, chequeCents: 0 }
      : { today: '2026-02-10', summary: { ...row, students: 1, overdueStudents: 1 }, items: [row], page: 1 };
    return Response.json({ data });
  });
});
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0; vi.unstubAllGlobals(); });
function show(locale: SupportedLocale = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC"><QueryClientProvider client={client}><ReportsWorkspace schoolId="school" timezone="UTC" years={[{ id: 'year', name: '2025/26' }]} classes={[{ id: 'class', academicYearId: 'year', name: 'A' }]} onPayments={onPayments} /></QueryClientProvider></NextIntlClientProvider>);
}
it.each<SupportedLocale>(['en', 'fr', 'ar'])('renders localized totals and links the selected balance to existing payment history in %s', async locale => {
  show(locale); const t = getCatalog(locale).financeReports;
  expect((await screen.findAllByText('Amina Test'))[0]).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: t.show }));
  expect(await screen.findByRole('button', { name: t.history })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: t.history })); expect(onPayments).toHaveBeenCalledWith('student');
  fireEvent.click(screen.getByRole('button', { name: t.collections }));
  expect(await screen.findByText(getCatalog(locale).finance.empty)).toBeVisible();
  expect(screen.getByText(t.collectionNotice)).toBeVisible();
});
it('retains year/Class/student filters in requests and rejects invalid collection intervals without fetching them', async () => {
  show(); await screen.findAllByText('Amina Test');
  fireEvent.change(screen.getByLabelText('Academic year'), { target: { value: 'year' } });
  fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'class' } });
  fireEvent.change(screen.getByLabelText('Student'), { target: { value: 'student' } });
  await waitFor(() => expect(fetcher.mock.calls.some(([path]) => String(path).includes('academicYearId=year') && String(path).includes('classId=class') && String(path).includes('studentId=student'))).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Collections' }));
  fireEvent.change(screen.getByLabelText('Received from'), { target: { value: '2026-03-01' } });
  fireEvent.change(screen.getByLabelText('Received through'), { target: { value: '2026-02-01' } });
  expect(screen.getByRole('alert')).toHaveTextContent(getCatalog('en').financeUi.dateRange);
  expect(fetcher.mock.calls.some(([path]) => String(path).includes('from=2026-03-01&to=2026-02-01'))).toBe(false);
});
it('shows sanitized report failures and a usable retry', async () => {
  fetcher.mockResolvedValue(Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Not shown' } }, { status: 500 }));
  show(); expect(await screen.findAllByRole('alert')).not.toHaveLength(0); expect(screen.queryByText('Not shown')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: getCatalog('en').finance.retry }).length).toBeGreaterThan(0);
});
