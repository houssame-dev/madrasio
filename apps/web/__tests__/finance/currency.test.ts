// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { createGradesTestDb, seedSchool, seedStudentAndActors, seedParentActor, type GradesTestDb } from '../grades/test-helpers';
import { financeSettings, setFinanceCurrency, saveFeeType, saveStructure, previewCharges, generateCharges, type FinanceDb } from '@/lib/modules/finance/application/service';
import { paymentDetail, recordPayment, reversePayment } from '@/lib/modules/finance/application/payments';
import { collectionsReport, outstandingReport, studentBalance } from '@/lib/modules/finance/application/reports';
import { FINANCE_CURRENCIES, currencySettingsSchema } from '@/lib/modules/finance/domain/currency';
import { formatMoney, decimalMoney } from '@/lib/modules/finance/domain/csv';
import { receiptDocument } from '@/lib/modules/finance/domain/receipt';
import { parseMoney } from '@/lib/modules/finance/domain/contracts';

let test: GradesTestDb, db: FinanceDb;
let school: Awaited<ReturnType<typeof seedSchool>>, actors: Awaited<ReturnType<typeof seedStudentAndActors>>;
let actor: { userId: string; schoolId: string };
const now = new Date('2025-11-01T12:00:00Z');
beforeEach(async () => {
  test = await createGradesTestDb(); db = test.seed as unknown as FinanceDb;
  school = await seedSchool(test.seed); actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  actor = { userId: actors.schoolAdminUserId, schoolId: school.schoolId };
}, 30000);
afterEach(async () => { await test?.client.close(); });
async function structure() {
  const fee = await saveFeeType(db, actor, { name: 'Tuition' });
  return saveStructure(db, actor, { feeTypeId: fee.id, academicYearId: school.yearId, cadence: 'MONTHLY', amountCents: 12345, periods: [{ period: '2025-12', dueDate: '2025-12-10' }] });
}
it('defaults legacy-compatible School creation to MAD and keeps identical updates idempotent', async () => {
  expect(await financeSettings(db, actor)).toEqual({ currency: 'MAD', locked: false });
  const before = await test.seed.select().from(s.schools).where(eq(s.schools.id, school.schoolId));
  await setFinanceCurrency(db, actor, { currency: 'MAD' });
  expect(await test.seed.select().from(s.schools).where(eq(s.schools.id, school.schoolId))).toEqual(before);
  await saveFeeType(db, actor, { name: 'Transport' });
  expect(await setFinanceCurrency(db, actor, { currency: 'EUR' })).toEqual({ currency: 'EUR', locked: false });
});
it.each(FINANCE_CURRENCIES)('snapshots %s from structures through charges, allocations, receipts and reports', async currency => {
  await setFinanceCurrency(db, actor, { currency });
  const fee = await structure(); expect(fee.currency).toBe(currency);
  const selection = { structureId: fee.id, studentIds: [actors.studentId], periods: ['2025-12'] };
  const preview = await previewCharges(db, actor, selection);
  const batch = await generateCharges(db, actor, { ...selection, previewHash: preview.previewHash, requestKey: randomUUID() });
  const chargeId = batch.chargeIds[0];
  expect((await test.seed.select().from(s.studentCharges))[0]).toMatchObject({ currency, originalCents: 12345 });
  const input = { requestKey: randomUUID(), confirmed: true, studentId: actors.studentId, method: 'CASH', amountCents: 12345, receivedOn: '2025-11-01', allocations: [{ chargeId, amountCents: 12345 }] };
  const payment = await recordPayment(db, actor, input, now); expect(payment.currency).toBe(currency);
  expect(await recordPayment(db, actor, input, now)).toEqual(payment);
  const detail = await paymentDetail(db, actor, payment.id);
  expect(detail.allocations[0]).toMatchObject({ currency, amountCents: 12345 });
  for (const locale of ['en', 'fr', 'ar'] as const) {
    const html = receiptDocument(detail, locale);
    expect(html).toContain(`dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`);
    expect(html).toContain(formatMoney(12345, locale, currency));
  }
  expect(await collectionsReport(db, actor, { from: '2025-11-01', to: '2025-11-01' }, now)).toMatchObject({ currency, netCents: 12345 });
  expect(await outstandingReport(db, actor, {}, now)).toMatchObject({ currency, summary: { paidCents: 12345 } });
  expect(await studentBalance(db, actor, actors.studentId, 1, now)).toMatchObject({ currency, validPaymentsCents: 12345 });
  await reversePayment(db, actor, payment.id, { confirmed: true, requestKey: randomUUID(), reason: 'Correction' });
  await expect(setFinanceCurrency(db, actor, { currency: currency === 'MAD' ? 'EUR' : 'MAD' })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await paymentDetail(db, actor, payment.id)).payment).toEqual(payment);
});
it('keeps independent School currencies isolated and prevents cross-School authorization', async () => {
  const other = await seedSchool(test.seed), people = await seedStudentAndActors(test.seed, other.schoolId, other.yearId, other.classId);
  const otherActor = { userId: people.schoolAdminUserId, schoolId: other.schoolId };
  await setFinanceCurrency(db, actor, { currency: 'EUR' });
  await setFinanceCurrency(db, otherActor, { currency: 'GBP' });
  expect(await financeSettings(db, actor)).toMatchObject({ currency: 'EUR' });
  expect(await financeSettings(db, otherActor)).toMatchObject({ currency: 'GBP' });
  await expect(setFinanceCurrency(db, { ...actor, schoolId: other.schoolId }, { currency: 'USD' })).rejects.toThrow();
});
it('locks currency even for inactive structures; retains all snapshots and rejects direct mismatches', async () => {
  const fee = await structure();
  await saveStructure(db, actor, { amountCents: fee.amountCents, periods: fee.periods, active: false, revision: 1 }, fee.id);
  await expect(setFinanceCurrency(db, actor, { currency: 'EUR' })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(await setFinanceCurrency(db, actor, { currency: 'MAD' })).toMatchObject({ locked: true });
  await expect(test.seed.update(s.schools).set({ financeCurrency: 'EUR' }).where(eq(s.schools.id, school.schoolId))).rejects.toThrow();
  await expect(test.seed.update(s.feeStructures).set({ currency: 'USD' }).where(eq(s.feeStructures.id, fee.id))).rejects.toThrow();
});
it('denies teachers, parents and platform-only administrators', async () => {
  const parent = await seedParentActor(test.seed, school.schoolId);
  const platformId = randomUUID();
  await test.client.query('insert into auth.users(id,email) values ($1,$2)', [platformId, 'platform@example.test']);
  await test.seed.insert(s.users).values({ id: platformId, email: 'platform@example.test', isPlatformAdmin: true });
  for (const userId of [actors.teacherUserId, parent.parentUserId, platformId]) await expect(setFinanceCurrency(db, { userId, schoolId: school.schoolId }, { currency: 'EUR' })).rejects.toThrow();
});
it('denies suspended administrators', async () => {
  await test.seed.update(s.users).set({ status: 'SUSPENDED' }).where(eq(s.users.id, actor.userId));
  await expect(setFinanceCurrency(db, actor, { currency: 'EUR' })).rejects.toThrow();
});
it('accepts only explicit supported two-decimal currencies and strict setting input', () => {
  for (const currency of FINANCE_CURRENCIES) expect(new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits).toBe(2);
  for (const raw of [{ currency: 'JPY' }, { currency: 'KWD' }, { currency: 'eur' }, { currency: null }, {}, { currency: 'EUR', schoolId: school.schoolId }]) expect(currencySettingsSchema.safeParse(raw).success).toBe(false);
  expect(parseMoney('123.45')).toBe(12345); expect(decimalMoney(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
  for (const currency of FINANCE_CURRENCIES) for (const locale of ['en', 'fr', 'ar']) {
    expect(formatMoney(12345, locale, currency)).toBe(new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(123.45));
  }
});
