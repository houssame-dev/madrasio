import { tuitionEn, tuitionFr, tuitionAr } from '../i18n/messages/tuition';
import { workspaceContext, emptyFinanceOverview } from './fixtures/workspace';
import { expect, test } from '@playwright/test';
import { financeEn, financeFr, financeAr } from '../i18n/messages/finance';
import { paymentEn, paymentFr, paymentAr } from '../i18n/messages/finance-payments';
import { receiptDocument } from '../lib/modules/finance/domain/receipt';
import { reportsEn, reportsFr, reportsAr } from '../i18n/messages/finance-reports';
import { csvDocument } from '../lib/modules/finance/domain/csv';
import type { chargeDetail } from '../lib/modules/finance/application/service';

type ChargeDetail = Awaited<ReturnType<typeof chargeDetail>>;

for (const [locale, t, c, p] of [['en', reportsEn, financeEn, paymentEn], ['fr', reportsFr, financeFr, paymentFr], ['ar', reportsAr, financeAr, paymentAr]] as const) {
  for (const width of [390, 768, 1440]) {
    test(`Finance reports ${locale} at ${width}px: filters, balance, collections and CSV`, async ({ page, context, baseURL }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
      const requests: string[] = [];
      const student = { id: 'student', firstName: 'Amina', lastName: 'Test' };
      const row = { studentId: student.id, studentName: 'Amina Test', netCents: 18000, paidCents: 5000, outstandingCents: 13000, notOverdueCents: 10000, days1to30Cents: 3000, days31to60Cents: 0, days61plusCents: 0 };
      const summary = { ...row, students: 1, overdueStudents: 1 };
      await context.route('**/*', async route => {
        const url = new URL(route.request().url()); if (url.origin !== new URL(baseURL!).origin) return route.abort();
        if (!url.pathname.startsWith('/api/v1/')) return route.continue();
        let data: unknown;
        if (url.pathname === '/api/v1/me') data = { user: { id: 'admin' }, currentSchool: { id: 'school', role: 'SCHOOL_ADMIN', timezone: 'UTC' }, memberships: [{ schoolId: 'school', schoolName: 'Synthetic School', role: 'SCHOOL_ADMIN', status: 'ACTIVE' }] };
        else if (url.pathname === '/api/v1/dashboard/context') data = workspaceContext;
        else if (url.pathname.endsWith('/unread-count')) data = { count: 0 };
        else if (url.pathname === '/api/v1/finance/overview') data = emptyFinanceOverview;
        else if (url.pathname === '/api/v1/finance') data = { settings: { currency: 'MAD', locked: true }, types: [], structures: [], years: [{ id: 'year', name: '2025/26' }], classes: [{ id: 'class', academicYearId: 'year', name: 'Class A' }], students: [student], charges: [], levels: [], total: 0, page: 1 };
        else if (url.pathname.endsWith('/payments/students')) data = [student];
        else if (url.pathname.includes('/reports/')) {
          requests.push(url.pathname + url.search);
          if (url.searchParams.get('format') === 'csv') return route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body: csvDocument([['Student', 'MAD'], ['Amina Test', '130.00']]) });
          data = url.pathname.endsWith('/outstanding') ? { today: '2026-02-10', timezone: 'UTC', summary, items: [row], page: 1 } : { today: '2026-02-10', timezone: 'UTC', from: url.searchParams.get('from'), to: url.searchParams.get('to'), total: 1, page: 1, grossCents: 8000, reversedCents: 3000, netCents: 5000, cashCents: 5000, bankCents: 0, chequeCents: 0, items: [{ id: 'payment', studentName: 'Amina Test', method: 'CASH', receivedOn: '2026-02-01', amountCents: 3000, receiptReference: 'R-ORIGINAL', reversalReference: 'REV-ORIGINAL' }] };
        } else if (url.pathname.endsWith('/balance')) data = { today: '2026-02-10', timezone: 'UTC', student, summary, validPaymentsCents: 5000, total: 1, page: 1, items: [{ academicYear: '2025/26', charge: { id: 'charge', feeName: 'Tuition', period: '2025-12', dueDate: '2026-02-01', originalCents: 10000, reductionCents: 2000, allocatedCents: 5000, status: 'OPEN' } }] };
        else throw new Error('Unexpected synthetic reports API path: ' + url.pathname);
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
      });
      await page.goto('/finance'); await page.getByRole('navigation', { name: { en: tuitionEn, fr: tuitionFr, ar: tuitionAr }[locale].title }).getByRole('button', { name: { en: tuitionEn, fr: tuitionFr, ar: tuitionAr }[locale].reports, exact: true }).click();
      await expect(page.getByRole('region', { name: t.summary })).toBeVisible();
      await page.getByLabel(c.year, { exact: true }).selectOption('year'); await page.getByLabel(c.class, { exact: true }).selectOption('class'); await page.getByLabel(c.student, { exact: true }).selectOption('student');
      await expect.poll(() => requests.some(v => v.includes('academicYearId=year') && v.includes('classId=class') && v.includes('studentId=student'))).toBe(true);
      const download = page.waitForEvent('download'); await page.getByRole('button', { name: t.export }).click(); await (await download).saveAs(info.outputPath('outstanding.csv'));
      expect(requests.at(-1)).toContain('format=csv'); expect(requests.at(-1)).toContain('classId=class');
      await page.getByRole('button', { name: t.show, exact: true }).first().click();
      await expect(page.getByRole('region', { name: t.balance })).toBeVisible(); await expect(page.getByText(t.partialStatus, { exact: false })).toBeVisible(); await expect(page.getByRole('button', { name: t.history })).toBeVisible();
      await page.getByRole('button', { name: c.close, exact: true }).click(); await page.getByRole('button', { name: t.collections, exact: true }).click();
      await page.getByLabel(t.from).fill('2026-02-01'); await page.getByLabel(t.to).fill('2026-02-28');
      await expect(page.getByText('REV-ORIGINAL')).toBeVisible(); await expect(page.getByRole('link', { name: 'R-ORIGINAL' })).toHaveAttribute('href', '/finance/receipts/payment');
      const collectionsDownload = page.waitForEvent('download'); await page.getByRole('button', { name: t.export }).click(); await (await collectionsDownload).saveAs(info.outputPath('collections.csv'));
      expect(requests.at(-1)).toContain('from=2026-02-01'); expect(requests.at(-1)).toContain('to=2026-02-28'); expect(requests.at(-1)).not.toContain('classId');
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath('reports.png'), fullPage: true });
      await expect(page.getByText(p.REVERSED, { exact: false }).first()).toBeVisible();
    });
  }
}

test('long receipt prints all allocation rows across pages', async ({ page, context, baseURL }, info) => {
  const allocations = Array.from({ length: 60 }, (_, i) => ({ id: `line-${i}`, feeName: `Receipt item ${String(i + 1).padStart(3, '0')}`, period: '2025-12', dueDate: '2025-12-10', amountCents: 100 }));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.origin !== new URL(baseURL!).origin) return route.abort();
    if (!url.pathname.startsWith('/api/v1/')) return route.continue();
    const data = url.pathname === '/api/v1/me' ? { user: { id: 'admin' }, currentSchool: { id: 'school', role: 'SCHOOL_ADMIN', timezone: 'UTC' }, memberships: [{ schoolId: 'school', schoolName: 'Print Test School', role: 'SCHOOL_ADMIN', status: 'ACTIVE' }] }
      : url.pathname === '/api/v1/dashboard/context' ? workspaceContext
      : url.pathname.endsWith('/unread-count') ? { count: 0 }
      : url.pathname === '/api/v1/finance/payments/long-payment' ? { payment: { id: 'long-payment', receiptReference: 'R-MULTIPAGE', currency: 'MAD', schoolName: 'Print Test School', schoolTimezone: 'UTC', studentName: 'Synthetic Student', receivedOn: '2026-01-01', method: 'CASH', amountCents: 6000, recordedBy: 'admin', recordedAt: '2026-01-01T12:00:00Z', reference: null }, allocations, reversal: null } : undefined;
    if (!data) throw new Error('Unexpected synthetic receipt API path: ' + url.pathname);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.goto('/finance/receipts/long-payment'); await expect(page.getByRole('heading', { name: 'Receipt', exact: true })).toBeVisible();
  await expect(page.locator('#finance-receipt tbody tr')).toHaveCount(60);
  await page.pdf({ path: info.outputPath('long-receipt.pdf'), format: 'A4', printBackground: true });
});

// Browser presentation proof with synthetic API responses; server/DB rules are
// exercised separately by the canonical-migration Finance integration suite.
for (const [locale, t] of [['en', financeEn], ['fr', financeFr], ['ar', financeAr]] as const) {
  for (const width of [390, 1440]) {
    test(`Finance ${locale} at ${width}px: explicit preview, generation, reduction and cancellation`, async ({ page, context, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
      const structure = { id: 'structure', feeTypeId: 'type', academicYearId: 'year', amountCents: 125099, active: true, levelId: null, cadence: 'MONTHLY', revision: 1, periods: [{ period: '2099-01', dueDate: '2099-01-10' }] };
      const charge: ChargeDetail['charge'] = { id: 'charge', schoolId: 'school', studentId: 'student', academicYearId: 'year', feeTypeId: 'type', structureId: 'structure', batchId: 'batch', classId: 'class', structureRevision: 1, createdAt: new Date('2026-10-17T12:00:00Z'), feeName: 'Tuition', period: '2099-01', dueDate: '2099-01-10', originalCents: 125099, reductionCents: 0, allocatedCents: 0, currency: 'MAD', status: 'OPEN' };
      const state = { settings: { currency: 'MAD', locked: true }, types: [{ id: 'type', name: 'Tuition', active: true }], structures: [structure], years: [{ id: 'year', name: '2098/99', startDate: '2098-09-01', endDate: '2099-07-01' }], levels: [], classes: [], students: [{ id: 'student', firstName: 'Amina', lastName: 'Test' }], charges: [] as { charge: typeof charge; studentName: string }[], page: 1, total: 0 };
      let previews = 0, generations = 0; const events: ChargeDetail['events'] = [];
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(baseURL!).origin) return route.abort();
        if (!url.pathname.startsWith('/api/v1/')) return route.continue();
        let data: unknown;
        if (url.pathname === '/api/v1/me') data = { user: { id: 'admin' }, currentSchool: { id: 'school', role: 'SCHOOL_ADMIN', timezone: 'UTC' }, memberships: [{ schoolId: 'school', schoolName: 'Synthetic School', role: 'SCHOOL_ADMIN', status: 'ACTIVE' }] };
        else if (url.pathname === '/api/v1/dashboard/context') data = workspaceContext;
        else if (url.pathname === '/api/v1/notifications/unread-count') data = { count: 0 };
        else if (url.pathname === '/api/v1/finance/overview') data = emptyFinanceOverview;
        else if (url.pathname === '/api/v1/finance') data = state;
        else if (url.pathname.endsWith('/preview')) { previews++; data = { items: [{ studentId: 'student', studentName: 'Amina Test', period: '2099-01', dueDate: '2099-01-10', amountCents: 125099, existingChargeId: null }], created: 1, skipped: 0, totalCents: 125099, previewHash: 'a'.repeat(64) }; }
        else if (url.pathname.endsWith('/generate')) { generations++; expect(previews).toBe(1); expect(route.request().postDataJSON()).toMatchObject({ previewHash: 'a'.repeat(64), studentIds: ['student'], periods: ['2099-01'] }); state.charges = [{ charge, studentName: 'Amina Test' }]; state.total = 1; data = { chargeIds: ['charge'], created: 1, skipped: 0, totalCents: 125099 }; }
        else if (url.pathname.endsWith('/adjustments')) {
          const body = route.request().postDataJSON(); expect(body.reason).toBe('Synthetic operator reason');
          const beforeCents = charge.originalCents - charge.reductionCents;
          if (body.kind === 'REDUCTION') { expect(body.amountCents).toBe(10099); charge.reductionCents += body.amountCents; } else charge.status = 'CANCELLED';
          const event: ChargeDetail['events'][number] = { id: String(events.length), schoolId: charge.schoolId, chargeId: charge.id, requestKey: body.requestKey, requestHash: 'a'.repeat(64), actorId: 'admin', reductionId: null, replacesEventId: null, reductionBeforeCents: null, reductionAfterCents: null, kind: body.kind, reason: body.reason, beforeCents, afterCents: body.kind === 'REDUCTION' ? beforeCents - body.amountCents : 0, occurredAt: new Date('2026-10-17T12:00:00Z') }; events.push(event); data = event;
        } else if (url.pathname.endsWith('/charges/charge')) data = { charge, events };
        else throw new Error('Unexpected synthetic API path');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
      });
      await page.goto('/finance');
      await expect(page.locator('html')).toHaveAttribute('lang', locale); await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      const tuition = { en: tuitionEn, fr: tuitionFr, ar: tuitionAr }[locale];
      await expect(page.getByRole('heading', { level: 1, name: tuition.title })).toBeVisible();
      await page.getByRole('button', { name: tuition.configuration, exact: true }).click();
      await page.getByRole('button', { name: tuition.structures, exact: true }).click();
      await expect(page.getByRole('button', { name: t.addStructure })).toBeDisabled();
      await page.getByRole('navigation', { name: tuition.title }).getByRole('button', { name: tuition.charges, exact: true }).click();
      await page.getByRole('button', { name: t.generation, exact: true }).click();
      await page.getByLabel(t.structure, { exact: true }).selectOption('structure');
      await page.getByLabel('Amina Test').check();
      await page.getByRole('button', { name: t.preview, exact: true }).click();
      const preview = page.getByRole('region', { name: t.preview }); await expect(preview).toContainText('Amina Test');
      await page.screenshot({ path: testInfo.outputPath('preview.png'), fullPage: true });
      expect(generations).toBe(0); await preview.getByRole('button', { name: t.confirm }).click();
      await page.getByRole('button', { name: t.detail }).click();
      await page.getByLabel(t.amount, { exact: true }).fill('100.99');
      await page.getByLabel(t.reason).fill('Synthetic operator reason'); await page.getByRole('button', { name: t.reduce }).click();
      await expect(page.getByText('Synthetic operator reason', { exact: false })).toBeVisible();
      const history = page.getByRole('region', { name: t.history, exact: true });
      await expect(history.getByText(t.effectiveReduction, { exact: false })).toBeVisible();
      await expect(history.getByRole('button', { name: t.editReduction, exact: true })).toBeEnabled();
      await expect(history.getByRole('button', { name: t.cancelReduction, exact: true })).toBeEnabled();
      await expect(history.getByText('admin', { exact: true })).toBeVisible();
      await page.getByRole('combobox', { name: t.history, exact: true }).selectOption('CANCELLATION');
      await page.getByLabel(t.reason).fill('Synthetic operator reason'); await page.getByRole('button', { name: t.cancelCharge }).click();
      await expect(page.getByRole('button', { name: t.cancelCharge })).toBeDisabled();
      await expect(history.getByRole('button', { name: t.editReduction, exact: true })).toBeDisabled();
      await expect(history.getByRole('button', { name: t.cancelReduction, exact: true })).toBeDisabled();
      expect(events.map(e => e.kind)).toEqual(['REDUCTION', 'CANCELLATION']);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

for (const [locale, t, method] of [['en', paymentEn, 'CASH'], ['fr', paymentFr, 'BANK_TRANSFER'], ['ar', paymentAr, 'CHEQUE']] as const) {
  for (const width of [390, 1440]) {
    test(`Payments ${locale} at ${width}px: editable allocation, receipt download, print and reversal`, async ({ page, context, baseURL }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
      const charges = ['old', 'new'].map((id, i) => ({ id, feeName: 'Tuition', period: i ? '2026-01' : '2025-12', dueDate: i ? '2026-01-10' : '2025-12-10', originalCents: 10000, reductionCents: 0, allocatedCents: 0, status: 'OPEN' }));
      const payment = { id: 'payment', schoolId: 'school', studentId: 'student', requestKey: 'synthetic', requestHash: 'a'.repeat(64), receiptReference: 'R-STABLE', schoolName: 'Original School', schoolTimezone: 'UTC', studentName: 'Amina Test', method, amountCents: 15000, currency: 'MAD', receivedOn: '2026-01-01', reference: 'Paper reference', recordedBy: 'admin', recordedAt: new Date('2026-01-01T12:00:00Z') };
      const detail = { payment, allocations: charges.map((c, i) => ({ id: `allocation-${i}`, schoolId: 'school', studentId: 'student', paymentId: 'payment', chargeId: c.id, currency: 'MAD', feeName: c.feeName, period: c.period, dueDate: c.dueDate, amountCents: i ? 10000 : 5000 })), reversal: null as null | { id: string; schoolId: string; studentId: string; paymentId: string; requestKey: string; requestHash: string; reason: string; reversalReference: string; reversedBy: string; reversedAt: Date } };
      let recorded = false; const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await context.route('**/*', async route => {
        const url = new URL(route.request().url()); if (url.origin !== new URL(baseURL!).origin) return route.abort();
        if (!url.pathname.startsWith('/api/v1/')) return route.continue();
        let data: unknown;
        if (url.pathname === '/api/v1/me') data = { user: { id: 'admin' }, currentSchool: { id: 'school', role: 'SCHOOL_ADMIN', timezone: 'UTC' }, memberships: [{ schoolId: 'school', schoolName: 'Original School', role: 'SCHOOL_ADMIN', status: 'ACTIVE' }] };
        else if (url.pathname === '/api/v1/dashboard/context') data = workspaceContext;
        else if (url.pathname === '/api/v1/notifications/unread-count') data = { count: 0 };
        else if (url.pathname === '/api/v1/finance/overview') data = emptyFinanceOverview;
        else if (url.pathname === '/api/v1/finance') data = { settings: { currency: 'MAD', locked: true }, types: [], structures: [], years: [], levels: [], classes: [], students: [], charges: [], page: 1, total: 0 };
        else if (url.pathname.endsWith('/payments/students')) data = [{ id: 'student', firstName: 'Amina', lastName: 'Test' }];
        else if (url.pathname.endsWith('/payments/options')) data = { student: { id: 'student' }, charges: charges.filter(c => c.allocatedCents < c.originalCents), hasMore: false, suggested: [] };
        else if (url.pathname.endsWith('/payments') && route.request().method() === 'GET') data = { items: recorded ? [{ payment, reversal: detail.reversal }] : [], total: recorded ? 1 : 0, page: 1 };
        else if (url.pathname.endsWith('/payments') && route.request().method() === 'POST') {
          const body = route.request().postDataJSON(); expect(recorded).toBe(false); expect(body).toMatchObject({ method, amountCents: 15000, confirmed: true, allocations: [{ chargeId: 'old', amountCents: 5000 }, { chargeId: 'new', amountCents: 10000 }] });
          recorded = true; charges[0].allocatedCents = 5000; charges[1].allocatedCents = 10000; data = payment;
        } else if (url.pathname.endsWith('/payments/payment')) data = detail;
        else if (url.pathname.endsWith('/payments/payment/reversal')) {
          const body = route.request().postDataJSON(); expect(body).toMatchObject({ confirmed: true, reason: 'Correct paper record' });
          detail.reversal = { id: 'reversal', schoolId: 'school', studentId: 'student', paymentId: 'payment', requestKey: 'synthetic-reversal', requestHash: 'b'.repeat(64), reason: body.reason, reversalReference: 'REV-STABLE', reversedBy: 'admin', reversedAt: new Date('2026-01-02T12:00:00Z') };
          charges.forEach(c => { c.allocatedCents = 0; }); data = detail.reversal;
        } else if (url.pathname.endsWith('/payments/payment/receipt')) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'content-disposition': 'attachment; filename="receipt-payment.html"' }, body: receiptDocument(detail, locale) });
        else throw new Error('Unexpected synthetic payment API path');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
      });
      await page.goto('/finance'); await page.getByRole('navigation', { name: { en: tuitionEn, fr: tuitionFr, ar: tuitionAr }[locale].title }).getByRole('button', { name: { en: tuitionEn, fr: tuitionFr, ar: tuitionAr }[locale].payments, exact: true }).click();
      await page.getByLabel(t.student, { exact: true }).selectOption('student'); await page.getByLabel(t.amount, { exact: true }).fill('150.00');
      await page.getByLabel(t.method, { exact: true }).selectOption(method); await page.getByRole('button', { name: t.suggest }).click();
      await expect(page.getByLabel(`${t.allocated} Tuition 2025-12`)).toHaveValue('100.00');
      await page.getByLabel(`${t.allocated} Tuition 2025-12`).fill('50.00'); await page.getByLabel(`${t.allocated} Tuition 2026-01`).fill('100.00');
      await expect(page.getByRole('button', { name: t.record, exact: true })).toHaveCount(0); await page.getByRole('button', { name: { en: tuitionEn, fr: tuitionFr, ar: tuitionAr }[locale].review, exact: true }).click();
      await expect(page.getByRole('button', { name: t.record, exact: true })).toBeDisabled(); await page.getByLabel(t.confirm, { exact: true }).check();
      await page.screenshot({ path: info.outputPath('allocations.png'), fullPage: true });
      await page.getByRole('button', { name: t.record, exact: true }).click();
      const receiptPagePromise = context.waitForEvent('page'); await page.getByRole('link', { name: t.print }).click(); const receiptPage = await receiptPagePromise;
      await receiptPage.setViewportSize({ width, height: 900 });
      await expect(receiptPage.getByRole('heading', { name: t.receipt, exact: true })).toBeVisible(); await expect(receiptPage.getByText('R-STABLE', { exact: true })).toBeVisible();
      await expect(receiptPage.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      const downloadPromise = receiptPage.waitForEvent('download'); await receiptPage.getByRole('link', { name: t.download }).click(); const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('receipt-payment.html'); await download.saveAs(info.outputPath('receipt.html'));
      await receiptPage.pdf({ path: info.outputPath('receipt.pdf'), format: 'A4', printBackground: true });
      expect((await page.request.patch('/api/v1/finance/payments/payment', { data: { amountCents: 1 } })).status()).toBe(405);
      expect((await page.request.delete('/api/v1/finance/payments/payment')).status()).toBe(405);
      await page.getByLabel(t.reason, { exact: true }).fill('Correct paper record'); await expect(page.getByRole('button', { name: t.reverse, exact: true })).toBeDisabled();
      await page.getByLabel(t.confirmReverse, { exact: true }).check(); await page.getByRole('button', { name: t.reverse, exact: true }).click();
      await expect(page.getByText('REV-STABLE', { exact: false })).toBeVisible(); expect(charges.every(c => c.allocatedCents === 0)).toBe(true);
      await receiptPage.reload(); await expect(receiptPage.getByText(t.REVERSED, { exact: true })).toBeVisible(); await expect(receiptPage.getByText('R-STABLE', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); expect(errors).toEqual([]); await receiptPage.close();
    });
  }
}
