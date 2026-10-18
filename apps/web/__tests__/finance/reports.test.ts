// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { createGradesTestDb, seedSchool, seedStudentAndActors, seedParentActor, type GradesTestDb } from '../grades/test-helpers';
import { adjustCharge, generateCharges, previewCharges, saveFeeType, saveStructure, type FinanceDb } from '@/lib/modules/finance/application/service';
import { recordPayment, reversePayment, paymentDetail } from '@/lib/modules/finance/application/payments';
import { collectionsReport, outstandingReport, studentBalance, collectionFilters, outstandingFilters, exactCents } from '@/lib/modules/finance/application/reports';
import { csvDocument, decimalMoney, formatMoney } from '@/lib/modules/finance/domain/csv';
let test: GradesTestDb, db: FinanceDb;
let school: Awaited<ReturnType<typeof seedSchool>>, actors: Awaited<ReturnType<typeof seedStudentAndActors>>, ids: string[];
let actor: { userId: string; schoolId: string };
const now = new Date('2026-02-10T12:00:00Z');
beforeEach(async () => {
  test = await createGradesTestDb(); db = test.seed as unknown as FinanceDb;
  school = await seedSchool(test.seed); actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  actor = { userId: actors.schoolAdminUserId, schoolId: school.schoolId };
  const fee = await saveFeeType(db, actor, { name: 'Tuition' });
  const structure = await saveStructure(db, actor, { feeTypeId: fee.id, academicYearId: school.yearId, cadence: 'MONTHLY', amountCents: 10000,
    periods: [{ period: '2025-12', dueDate: '2025-12-10' }, { period: '2026-01', dueDate: '2026-01-10' }, { period: '2026-02', dueDate: '2026-02-10' }, { period: '2026-03', dueDate: '2026-03-10' }] });
  const input = { structureId: structure.id, studentIds: [actors.studentId], periods: structure.periods.map(p => p.period) };
  const preview = await previewCharges(db, actor, input);
  ids = (await generateCharges(db, actor, { ...input, previewHash: preview.previewHash, requestKey: randomUUID() })).chargeIds;
}, 30000);
afterEach(async () => { await test?.client.close(); });
function payment(amountCents: number, index = 0, receivedOn = '2026-02-10', method = 'CASH') { return recordPayment(db, actor, { requestKey: randomUUID(), confirmed: true, studentId: actors.studentId, method, receivedOn, amountCents, allocations: [{ chargeId: ids[index], amountCents }] }, now); }
const collections = (from = '2026-02-01', to = '2026-02-28') => collectionsReport(db, actor, { from, to }, now);
it('reconciles the complete fee/reduction/multiple-payment/reversal/cancellation journey', async () => {
  await adjustCharge(db, actor, ids[0], { kind: 'REDUCTION', reason: 'Manual approval', amountCents: 2000, requestKey: randomUUID() }, now);
  const p = await payment(3000), receipt = await paymentDetail(db, actor, p.id);
  expect(receipt.allocations[0].amountCents).toBe(3000);
  await payment(5000);
  expect((await studentBalance(db, actor, actors.studentId, 1, now)).summary).toMatchObject({ netCents: 38000, paidCents: 8000, outstandingCents: 30000 });
  await reversePayment(db, actor, p.id, { requestKey: randomUUID(), confirmed: true, reason: 'Paper record correction' });
  await adjustCharge(db, actor, ids[3], { kind: 'CANCELLATION', reason: 'Future service cancelled', requestKey: randomUUID() }, now);
  const balance = await studentBalance(db, actor, actors.studentId, 1, now), report = await outstandingReport(db, actor, {}, now), collected = await collections();
  expect(balance.summary).toMatchObject({ netCents: 28000, paidCents: 5000, outstandingCents: 23000 });
  expect(balance.validPaymentsCents).toBe(5000); expect(report.summary).toMatchObject({ ...balance.summary, overdueStudents: 1 });
  expect(collected).toMatchObject({ grossCents: 8000, reversedCents: 3000, netCents: 5000 });
  expect(collected.items.find(row => row.id === p.id)?.reversalReference).toMatch(/^REV-/);
  expect((await paymentDetail(db, actor, p.id)).payment).toEqual(receipt.payment);
});
it('uses exact aging boundaries and treats due today as not overdue', async () => {
  const dates = ['2026-02-10', '2026-02-09', '2026-01-11', '2026-01-10'];
  for (let i = 0; i < ids.length; i++) await test.seed.update(s.studentCharges).set({ dueDate: dates[i] }).where(eq(s.studentCharges.id, ids[i]));
  const report = await outstandingReport(db, actor, {}, now);
  expect(report.summary).toMatchObject({ notOverdueCents: 10000, days1to30Cents: 20000, days31to60Cents: 10000, days61plusCents: 0 });
  await test.seed.update(s.studentCharges).set({ dueDate: '2025-12-11' }).where(eq(s.studentCharges.id, ids[3])); // 61 days
  expect((await outstandingReport(db, actor, {}, now)).summary.days61plusCents).toBe(10000);
  await test.seed.update(s.studentCharges).set({ dueDate: '2025-12-12' }).where(eq(s.studentCharges.id, ids[3])); // 60 days
  expect((await outstandingReport(db, actor, {}, now)).summary.days31to60Cents).toBe(10000);
});
it('uses School local date across UTC midnight and leap-day boundaries', async () => {
  await test.seed.update(s.schools).set({ timezone: 'Pacific/Honolulu' }).where(eq(s.schools.id, school.schoolId));
  expect((await outstandingReport(db, actor, {}, new Date('2026-02-11T01:00:00Z'))).today).toBe('2026-02-10');
  expect((await outstandingReport(db, actor, {}, new Date('2024-03-01T01:00:00Z'))).today).toBe('2024-02-29');
});
it('includes both received-date boundaries and all three methods without allocation fanout', async () => {
  await payment(1000, 0, '2026-02-01', 'CASH'); await payment(2000, 0, '2026-02-10', 'BANK_TRANSFER'); await payment(3000, 1, '2026-02-05', 'CHEQUE');
  await payment(500, 0, '2026-01-31');
  expect(await collections('2026-02-01', '2026-02-10')).toMatchObject({ total: 3, grossCents: 6000, netCents: 6000, cashCents: 1000, bankCents: 2000, chequeCents: 3000 });
  const body = { requestKey: randomUUID(), confirmed: true, studentId: actors.studentId, method: 'CASH', receivedOn: '2026-02-10', amountCents: 1000, allocations: [{ chargeId: ids[0], amountCents: 500 }, { chargeId: ids[1], amountCents: 500 }] };
  await recordPayment(db, actor, body, now);
  expect((await collections()).netCents).toBe(7000);
});
it('filters year, charge-generation Class and Student without depending on current enrollment', async () => {
  await test.seed.update(s.studentEnrollments).set({ status: 'ENDED', effectiveUntil: '2026-02-01' }).where(eq(s.studentEnrollments.studentId, actors.studentId));
  for (const filter of [{ academicYearId: school.yearId }, { classId: school.classId }, { studentId: actors.studentId }]) expect((await outstandingReport(db, actor, filter, now)).summary.netCents).toBe(40000);
  for (const filter of [{ academicYearId: randomUUID() }, { classId: randomUUID() }, { studentId: randomUUID() }]) expect((await outstandingReport(db, actor, filter, now)).items).toEqual([]);
  const balance = await studentBalance(db, actor, actors.studentId, 1, now);
  expect(balance.items.map(v => v.charge.period)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
});
it('keeps pagination totals complete and export semantics identical', async () => {
  await payment(1); await payment(2);
  const ordinary = await outstandingReport(db, actor, {}, now), exported = await outstandingReport(db, actor, {}, now, true);
  expect(exported).toEqual(ordinary);
  expect((await outstandingReport(db, actor, { page: 2 }, now)).summary).toEqual(ordinary.summary);
  expect((await outstandingReport(db, actor, { page: 2 }, now)).items).toEqual([]);
  expect(await collectionsReport(db, actor, { from: '2026-02-01', to: '2026-02-28' }, now, true)).toEqual(await collections());
});
it('paginates students and payments deterministically while exporting every filtered row', async () => {
  const [template] = await test.seed.select().from(s.studentCharges).where(eq(s.studentCharges.id, ids[0]));
  const extra = Array.from({ length: 51 }, (_, n) => ({ id: randomUUID(), schoolId: actor.schoolId, firstName: 'Synthetic', lastName: `Student ${String(n).padStart(2, '0')}` }));
  await test.seed.insert(s.students).values(extra);
  await test.seed.insert(s.studentCharges).values(extra.map(student => ({ ...template, id: randomUUID(), studentId: student.id })));
  const first = await outstandingReport(db, actor, {}, now), second = await outstandingReport(db, actor, { page: 2 }, now), all = await outstandingReport(db, actor, {}, now, true);
  expect(first.summary.students).toBe(52); expect(first.items).toHaveLength(50); expect(second.items).toHaveLength(2); expect(all.items).toHaveLength(52);
  expect([...first.items, ...second.items]).toEqual(all.items); expect(second.summary).toEqual(first.summary);
  for (let n = 0; n < 51; n++) await payment(1);
  const one = await collections(), two = await collectionsReport(db, actor, { from: '2026-02-01', to: '2026-02-28', page: 2 }, now), exported = await collectionsReport(db, actor, { from: '2026-02-01', to: '2026-02-28' }, now, true);
  expect(one.items).toHaveLength(50); expect(two.items).toHaveLength(1); expect(exported.items).toHaveLength(51); expect(exported.netCents).toBe(51);
  expect([...one.items, ...two.items]).toEqual(exported.items);
});
it('never exposes another School through report filters, balance IDs or exports', async () => {
  await payment(1000);
  const other = await seedSchool(test.seed), people = await seedStudentAndActors(test.seed, other.schoolId, other.yearId, other.classId);
  const foreign = { userId: people.schoolAdminUserId, schoolId: other.schoolId };
  expect((await outstandingReport(db, foreign, { studentId: actors.studentId }, now, true)).items).toEqual([]);
  expect((await collectionsReport(db, foreign, { from: '2026-01-01', to: '2026-12-31', studentId: actors.studentId }, now, true)).items).toEqual([]);
  await expect(studentBalance(db, foreign, actors.studentId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('denies teachers, parents, anonymous and platform-only users on every report', async () => {
  const parent = await seedParentActor(test.seed, school.schoolId);
  for (const userId of [actors.teacherUserId, parent.parentUserId, null]) {
    const caller = { ...actor, userId };
    await expect(outstandingReport(db, caller, {}, now, true)).rejects.toThrow();
    await expect(collectionsReport(db, caller, { from: '2026-01-01', to: '2026-12-31' }, now, true)).rejects.toThrow();
    await expect(studentBalance(db, caller, actors.studentId)).rejects.toThrow();
  }
  await test.seed.update(s.users).set({ isPlatformAdmin: true }).where(eq(s.users.id, actor.userId));
  await test.seed.update(s.schoolMemberships).set({ status: 'INACTIVE' }).where(eq(s.schoolMemberships.userId, actor.userId));
  await expect(outstandingReport(db, actor, {})).rejects.toThrow();
});
it('validates dates, scope identifiers and exact aggregate limits', () => {
  for (const f of [{ from: '2026-02-30', to: '2026-03-01' }, { from: '2026-02-11', to: '2026-02-10' }, { from: '2026-01-01', to: '2026-02-01', schoolId: actor.schoolId }]) expect(collectionFilters.safeParse(f).success).toBe(false);
  expect(outstandingFilters.safeParse({ classId: 'foreign' }).success).toBe(false);
  expect(exactCents('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  expect(() => exactCents('9007199254740992')).toThrow(); expect(() => exactCents('-1')).toThrow();
  expect(decimalMoney(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
  expect(formatMoney(Number.MAX_SAFE_INTEGER, 'en', 'MAD')).toContain('90,071,992,547,409.91');
});
it('exports Excel-friendly UTF-8, CRLF and quoted formula-safe cells without losing Arabic', () => {
  const csv = csvDocument([['Student', 'MAD'], ['=HYPERLINK("bad")', decimalMoney(12345)], [' +cmd', 'عربية, "اسم"'], ['\t@SUM(1)', 'line\r\nnext'], ['-1', 'normal']]);
  expect(csv.startsWith('\uFEFF')).toBe(true); expect(csv).toContain('"\'=HYPERLINK(""bad"")"'); expect(csv).toContain('"\' +cmd"');
  expect(csv).toContain('"عربية, ""اسم"""'); expect(csv).toContain('"123.45"'); expect(csv).toContain('"\'\t@SUM(1)"'); expect(csv.endsWith('\r\n')).toBe(true);
});
