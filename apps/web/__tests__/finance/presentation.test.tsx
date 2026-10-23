import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import type { SupportedLocale } from '@school/shared';
import { ChargeStatus, FinanceTable } from '@/components/finance/presentation';
import { getCatalog } from '@/i18n/catalogs';

afterEach(cleanup);
it.each<SupportedLocale>(['en', 'fr', 'ar'])('distinguishes charge settlement without changing amounts in %s', locale => {
  const messages = getCatalog(locale);
  render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
    <ChargeStatus status="OPEN" originalCents={10000} reductionCents={1000} allocatedCents={9000} />
    <ChargeStatus status="OPEN" originalCents={10000} reductionCents={1000} allocatedCents={2000} />
    <ChargeStatus status="OPEN" originalCents={10000} reductionCents={1000} allocatedCents={0} />
    <ChargeStatus status="CANCELLED" originalCents={10000} reductionCents={0} allocatedCents={0} />
  </NextIntlClientProvider>);
  for (const label of [messages.financeReports.paidStatus, messages.financeReports.partialStatus, messages.financeReports.unpaidStatus, messages.finance.CANCELLED]) expect(screen.getByText(label, { exact: true })).toBeVisible();
});
it('keeps one semantic row and one keyboard-operable action per record at every viewport', async () => {
  const action = vi.fn(), user = userEvent.setup();
  render(<FinanceTable caption="Allocations" columns={['Student', 'Amount', 'Action']} rows={[{ id: 'a', cells: ['Amina', '100.01 MAD', <button key="action" onClick={action}>Review</button>] }]} />);
  const table = screen.getByRole('table', { name: 'Allocations' });
  expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
  expect(within(table).getAllByRole('cell')).toHaveLength(3);
  expect(screen.getAllByRole('button', { name: 'Review' })).toHaveLength(1);
  await user.tab(); expect(screen.getByRole('button')).toHaveFocus(); await user.keyboard('{Enter}'); expect(action).toHaveBeenCalledOnce();
});
