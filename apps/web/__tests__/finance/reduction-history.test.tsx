import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupportedLocale } from '@school/shared';
import { ReductionHistory } from '@/components/finance/reduction-history';
import type { chargeDetail } from '@/lib/modules/finance/application/service';
import { getCatalog } from '@/i18n/catalogs';
type Detail = Awaited<ReturnType<typeof chargeDetail>>;
const onWrite = vi.fn<Parameters<typeof ReductionHistory>[0]['onWrite']>();
const onReload = vi.fn();
const root = (id: string, beforeCents: number, afterCents: number): Detail['events'][number] => ({ id, schoolId: 'school', chargeId: 'charge', requestKey: id, requestHash: 'synthetic', kind: 'REDUCTION', reason: `Original ${id}`, beforeCents, afterCents, actorId: 'admin', occurredAt: new Date('2026-10-19T10:00:00Z'), reductionId: null, replacesEventId: null, reductionBeforeCents: null, reductionAfterCents: null });
function fixture(): Detail { return { charge: { id: 'charge', schoolId: 'school', studentId: 'student', academicYearId: 'year', feeTypeId: 'fee', structureId: 'structure', batchId: 'batch', classId: 'class', feeName: 'Tuition', structureRevision: 1, period: '2026-10', dueDate: '2026-10-30', originalCents: 10000, reductionCents: 3000, allocatedCents: 0, currency: 'EUR', status: 'OPEN', createdAt: new Date() }, events: [root('first', 10000, 8000), root('second', 8000, 7000)] }; }
function view(detail: Detail, locale: SupportedLocale) { return <NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC"><div dir={locale === 'ar' ? 'rtl' : 'ltr'}><ReductionHistory detail={detail} timezone="UTC" busy={false} onWrite={onWrite} onReload={onReload} /></div></NextIntlClientProvider>; }
afterEach(cleanup); beforeEach(() => { onWrite.mockReset(); onWrite.mockResolvedValue(true); onReload.mockReset(); });
it.each<SupportedLocale>(['en', 'fr', 'ar'])('edits an individual reduction with confirmation and retained audit display in %s', async locale => {
  const user = userEvent.setup(), t = getCatalog(locale).finance, detail = fixture(), shown = render(view(detail, locale));
  const first = within(document.getElementById('finance-event-first')!);
  await user.click(first.getByRole('button', { name: t.editReduction }));
  expect(first.getByRole('button', { name: t.applyCorrection })).toBeDisabled();
  await user.clear(first.getByLabelText(t.newReductionAmount)); await user.type(first.getByLabelText(t.newReductionAmount), '15.00');
  await user.type(first.getByLabelText(t.reason), 'Correct first only'); await user.click(first.getByLabelText(t.confirmCorrection));
  await user.click(first.getByRole('button', { name: t.applyCorrection }));
  await waitFor(() => expect(onWrite).toHaveBeenCalledOnce());
  expect(onWrite.mock.calls[0][0]).toMatchObject({ path: '/api/v1/finance/charges/charge/reductions/first', method: 'PATCH', body: { kind: 'REDUCTION_EDIT', amountCents: 1500, reason: 'Correct first only', expectedEventId: 'first', confirmed: true } });
  const correction = { ...root('correction', 7000, 7500), kind: 'REDUCTION_EDIT' as const, reductionId: 'first', replacesEventId: 'first', reductionBeforeCents: 2000, reductionAfterCents: 1500, reason: 'Correct first only' };
  shown.rerender(view({ ...detail, charge: { ...detail.charge, reductionCents: 2500 }, events: [...detail.events, correction] }, locale));
  expect(screen.getByText('Original first')).toBeInTheDocument(); expect(screen.getByText('Original second')).toBeInTheDocument();
  expect(screen.getByText(t.REDUCTION_EDIT, { exact: false })).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'first' })).toHaveAttribute('href', '#finance-event-first');
  expect(shown.container.firstElementChild).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
});
it('cancels only the chosen reduction and retains the same request key after an ambiguous failure', async () => {
  onWrite.mockResolvedValue(false); const user = userEvent.setup(), t = getCatalog('en').finance, detail = fixture();
  const shown = render(view(detail, 'en')), first = within(document.getElementById('finance-event-first')!);
  await user.click(first.getByRole('button', { name: t.cancelReduction })); expect(first.queryByLabelText(t.newReductionAmount)).not.toBeInTheDocument();
  await user.type(first.getByLabelText(t.reason), 'Undo first'); await user.click(first.getByLabelText(t.confirmCorrection));
  await user.click(first.getByRole('button', { name: t.applyCorrection })); await user.click(first.getByRole('button', { name: t.applyCorrection }));
  expect(onWrite.mock.calls[0][0]).toEqual(onWrite.mock.calls[1][0]);
  expect(onWrite.mock.calls[0][0].body).toMatchObject({ kind: 'REDUCTION_CANCEL', expectedEventId: 'first' });
  expect(onWrite.mock.calls[0][0].body).not.toHaveProperty('amountCents');
  expect(first.getByRole('alert')).toHaveTextContent(t.correctionReview);
  await user.click(first.getByRole('button', { name: t.retry })); expect(onReload).toHaveBeenCalledOnce();
  const undo = { ...root('undo', 7000, 9000), kind: 'REDUCTION_CANCEL' as const, reductionId: 'first', replacesEventId: 'first', reductionBeforeCents: 2000, reductionAfterCents: 0 };
  shown.rerender(view({ ...detail, events: [...detail.events, undo] }, 'en'));
  expect(first.queryByRole('button', { name: t.editReduction })).not.toBeInTheDocument();
  expect(within(document.getElementById('finance-event-second')!).getByRole('button', { name: t.editReduction })).toBeEnabled();
});
it('rejects invalid precision locally and disables corrections on cancelled charges', async () => {
  const user = userEvent.setup(), t = getCatalog('en').finance, detail = fixture(), shown = render(view(detail, 'en'));
  const first = within(document.getElementById('finance-event-first')!); await user.click(first.getByRole('button', { name: t.editReduction }));
  await user.clear(first.getByLabelText(t.newReductionAmount)); await user.type(first.getByLabelText(t.newReductionAmount), '1.001');
  await user.type(first.getByLabelText(t.reason), 'Invalid amount'); await user.click(first.getByLabelText(t.confirmCorrection)); await user.click(first.getByRole('button', { name: t.applyCorrection }));
  expect(screen.getByRole('alert')).toHaveTextContent(t.invalid); expect(onWrite).not.toHaveBeenCalled();
  shown.rerender(view({ ...detail, charge: { ...detail.charge, status: 'CANCELLED' } }, 'en'));
  expect(first.getByRole('button', { name: t.editReduction })).toBeDisabled(); expect(first.getByRole('button', { name: t.applyCorrection })).toBeDisabled();
});
it('does not silently submit against a newer revision while a form is open', async () => {
  const user = userEvent.setup(), t = getCatalog('en').finance, detail = fixture(), shown = render(view(detail, 'en'));
  const first = within(document.getElementById('finance-event-first')!); await user.click(first.getByRole('button', { name: t.editReduction }));
  await user.type(first.getByLabelText(t.reason), 'My edit'); await user.click(first.getByLabelText(t.confirmCorrection));
  const correction = { ...root('other-edit', 7000, 7500), kind: 'REDUCTION_EDIT' as const, reductionId: 'first', replacesEventId: 'first', reductionBeforeCents: 2000, reductionAfterCents: 1500 };
  shown.rerender(view({ ...detail, events: [...detail.events, correction] }, 'en'));
  expect(first.getByRole('alert')).toHaveTextContent(t.correctionReview); expect(first.getByRole('button', { name: t.applyCorrection })).toBeDisabled(); expect(onWrite).not.toHaveBeenCalled();
});
