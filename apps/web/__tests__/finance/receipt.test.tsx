import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import { AppContextProvider } from '@/components/app/app-context';
import { PaymentReceipt } from '@/components/finance/payment-receipt';
import { getCatalog } from '@/i18n/catalogs';
import type { SupportedLocale } from '@school/shared';
import type { Role } from '@/lib/authorization/roles';
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0; vi.restoreAllMocks(); });
function show(locale: SupportedLocale = 'en', role: Role = 'SCHOOL_ADMIN') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC"><QueryClientProvider client={client}><AppContextProvider value={{ user: { id: 'admin' }, currentSchool: { id: 'school', role, timezone: 'UTC' }, memberships: [] }}><PaymentReceipt id="payment" /></AppContextProvider></QueryClientProvider></NextIntlClientProvider>);
}
it.each<SupportedLocale>(['en', 'fr', 'ar'])('preserves original receipt, reversed status and print/download actions in %s', async locale => {
  const t = getCatalog(locale).financePayments;
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: {
    payment: { id: 'payment', receiptReference: 'R-STABLE', schoolName: '<script>Original School</script>', schoolTimezone: 'UTC', studentName: 'Amina Test', receivedOn: '2025-11-01', recordedAt: '2025-11-01T12:00:00Z', method: 'CASH', amountCents: 10001, recordedBy: 'admin', reference: 'Paper record' },
    allocations: [{ id: 'allocation', feeName: 'Tuition', period: '2025-12', dueDate: '2025-12-10', amountCents: 10001 }],
    reversal: { reversalReference: 'REV-STABLE', reason: 'Correct record', reversedBy: 'admin', reversedAt: '2025-11-02T12:00:00Z' },
  } }));
  const print = vi.spyOn(window, 'print').mockImplementation(() => undefined), user = userEvent.setup();
  const view = show(locale); expect(await screen.findByRole('heading', { name: t.receipt })).toBeInTheDocument();
  expect(screen.getByText('R-STABLE')).toBeInTheDocument(); expect(screen.getByText(t.REVERSED)).toBeInTheDocument(); expect(screen.getByText('<script>Original School</script>')).toBeInTheDocument(); expect(view.container.querySelector('script')).toBeNull();
  expect(screen.getByRole('link', { name: t.download })).toHaveAttribute('href', '/api/v1/finance/payments/payment/receipt?download=1');
  await user.click(screen.getByRole('button', { name: t.print })); expect(print).toHaveBeenCalledOnce();
});
it.each<Role>(['TEACHER', 'PARENT', 'SUPER_ADMIN'])('hides receipts and performs no request for %s', role => {
  const fetch = vi.spyOn(globalThis, 'fetch'); show('en', role);
  expect(screen.queryByText('R-STABLE')).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
});
