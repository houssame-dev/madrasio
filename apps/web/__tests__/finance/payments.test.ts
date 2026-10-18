// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { createGradesTestDb, seedSchool, seedStudentAndActors, seedParentActor, type GradesTestDb } from '../grades/test-helpers';
import { adjustCharge, chargeDetail, generateCharges, previewCharges, saveFeeType, saveStructure, type FinanceDb } from '@/lib/modules/finance/application/service';
import { recordPayment, reversePayment, paymentDetail, paymentHistory, paymentOptions, paymentStudents, suggestAllocations } from '@/lib/modules/finance/application/payments';
import { receiptDocument } from '@/lib/modules/finance/domain/receipt';
import { paymentSchema, reversalSchema } from '@/lib/modules/finance/domain/contracts';
let test: GradesTestDb, db: FinanceDb;
let school: Awaited<ReturnType<typeof seedSchool>>, actors: Awaited<ReturnType<typeof seedStudentAndActors>>;
let actor: { userId: string; schoolId: string }, ids: string[];
const now = new Date('2025-11-01T12:00:00Z');
beforeEach(async () => {
  test = await createGradesTestDb(); db = test.seed as unknown as FinanceDb;
  school = await seedSchool(test.seed); actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  actor = { userId: actors.schoolAdminUserId, schoolId: school.schoolId };
  const fee = await saveFeeType(db, actor, { name: 'Tuition' });
  const structure = await saveStructure(db, actor, { feeTypeId: fee.id, academicYearId: school.yearId, cadence: 'MONTHLY', amountCents: 10000, periods: [{ period: '2025-12', dueDate: '2025-12-10' }, { period: '2026-01', dueDate: '2026-01-10' }] });
  const input = { structureId: structure.id, studentIds: [actors.studentId], periods: ['2025-12', '2026-01'] };
  const preview = await previewCharges(db, actor, input);
  ids = (await generateCharges(db, actor, { ...input, previewHash: preview.previewHash, requestKey: randomUUID() })).chargeIds;
}, 30000);
afterEach(async () => { await test?.client.close(); });
function input(amountCents = 6000) { return { requestKey: randomUUID(), confirmed: true as const, studentId: actors.studentId, method: 'CASH' as const, receivedOn: '2025-11-01', reference: 'Synthetic reference', amountCents, allocations: [{ chargeId: ids[0], amountCents }] }; }
const reversal = () => ({ requestKey: randomUUID(), confirmed: true as const, reason: 'Correct duplicate paper entry' });
const pay = (body = input()) => recordPayment(db, actor, body, now);
const detail = () => chargeDetail(db, actor, ids[0]);

describe('offline payments and allocation safety', () => {
  it.each(['CASH', 'BANK_TRANSFER', 'CHEQUE'])('records %s as an offline method without provider calls', async method => {
    expect(await recordPayment(db, actor, { ...input(), method }, now)).toMatchObject({ method, recordedBy: actor.userId });
  });
  it('records multiple exact partial payments, excludes settled charges, and preserves original snapshots', async () => {
    const first = await pay(input(6001)), second = await pay(input(3999));
    expect(first.receiptReference).not.toBe(second.receiptReference);
    expect(await detail()).toMatchObject({ charge: { originalCents: 10000, reductionCents: 0, allocatedCents: 10000 } });
    expect((await paymentOptions(db, actor, actors.studentId)).charges.map(c => c.id)).toEqual([ids[1]]);
    expect((await paymentHistory(db, actor, actors.studentId))).toMatchObject({ total: 2 });
  });
  it('suggests deterministic oldest-first allocations and permits an explicit override across charges', async () => {
    const options = await paymentOptions(db, actor, actors.studentId, 15000);
    expect(options.suggested).toEqual([{ chargeId: ids[0], amountCents: 10000 }, { chargeId: ids[1], amountCents: 5000 }]);
    const p = await pay({ ...input(15000), allocations: [{ chargeId: ids[0], amountCents: 5000 }, { chargeId: ids[1], amountCents: 10000 }] });
    expect((await paymentDetail(db, actor, p.id)).allocations.map(a => a.amountCents)).toEqual([5000, 10000]);
  });
  it('uses stable ID tie-breaking for equal due dates without mutating input', () => {
    const rows = ['b', 'a'].map(id => ({ id, dueDate: '2025-12-01', originalCents: 10000, reductionCents: 2000, allocatedCents: 1000 }));
    expect(suggestAllocations(rows, 10000)).toEqual([{ chargeId: 'a', amountCents: 7000 }, { chargeId: 'b', amountCents: 3000 }]);
    expect(rows.map(r => r.id)).toEqual(['b', 'a']);
  });
  it('makes concurrent identical requests and later repeats return the same immutable payment', async () => {
    const body = input(); const [a, b] = await Promise.all([pay(body), pay(body)]);
    expect(a).toEqual(b); expect(await pay(body)).toEqual(a);
    expect(await test.seed.select().from(s.financePayments)).toHaveLength(1);
    expect((await test.seed.select().from(s.auditEvents).where(eq(s.auditEvents.action, 'FinancePaymentRecorded')))).toHaveLength(1);
    expect((await detail()).charge.allocatedCents).toBe(6000);
    await expect(pay({ ...body, reference: 'Changed' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('rejects concurrent overpayment with distinct operation keys', async () => {
    const outcomes = await Promise.allSettled([pay(input(7000)), pay(input(7000))]);
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await detail()).charge.allocatedCents).toBe(7000);
    expect(await test.seed.select().from(s.financePayments)).toHaveLength(1);
  });
  it('rejects incomplete, duplicate, negative, fractional and authority-bearing allocations before writing', async () => {
    const base = input();
    for (const raw of [{ ...base, confirmed: false }, { ...base, amountCents: 6001 }, { ...base, amountCents: 0 }, { ...base, amountCents: 1.1 }, { ...base, schoolId: school.schoolId },
      { ...base, amountCents: 12000, allocations: [...base.allocations, ...base.allocations] }]) {
      expect(paymentSchema.safeParse(raw).success).toBe(false); await expect(recordPayment(db, actor, raw, now)).rejects.toThrow();
    }
    expect(await test.seed.select().from(s.financePayments)).toEqual([]);
  });
  it('validates School-local dates and requires no active enrollment to settle historical balances', async () => {
    await expect(pay({ ...input(), receivedOn: '2025-11-02' })).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    await test.seed.update(s.students).set({ status: 'ARCHIVED' }).where(eq(s.students.id, actors.studentId));
    expect((await paymentStudents(db, actor)).map(s => s.id)).toContain(actors.studentId);
    expect(await pay()).toMatchObject({ studentId: actors.studentId, receivedOn: '2025-11-01' });
  });
  it('rejects cancelled charges and allocations beyond reduced remaining balance', async () => {
    await adjustCharge(db, actor, ids[0], { kind: 'REDUCTION', amountCents: 5000, reason: 'Approved', requestKey: randomUUID() }, now);
    await expect(pay()).rejects.toMatchObject({ code: 'CONFLICT' });
    await adjustCharge(db, actor, ids[0], { kind: 'CANCELLATION', reason: 'No future fee', requestKey: randomUUID() }, now);
    await expect(pay(input(5000))).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('serializes payment and reduction races without a negative balance', async () => {
    const result = await Promise.allSettled([pay(input(6000)), adjustCharge(db, actor, ids[0], { kind: 'REDUCTION', amountCents: 5000, reason: 'Approved', requestKey: randomUUID() }, now)]);
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const c = (await detail()).charge; expect(c.allocatedCents).toBeLessThanOrEqual(c.originalCents - c.reductionCents);
  });
});
describe('reversal history and atomicity', () => {
  it('restores balances once, preserves receipt/allocation history and retains later reductions', async () => {
    const p = await pay(); const before = await paymentDetail(db, actor, p.id);
    await adjustCharge(db, actor, ids[0], { kind: 'REDUCTION', amountCents: 4000, reason: 'Approved', requestKey: randomUUID() }, now);
    const body = reversal(), r = await reversePayment(db, actor, p.id, body);
    expect(await reversePayment(db, actor, p.id, body)).toEqual(r);
    const after = await paymentDetail(db, actor, p.id);
    expect(after.payment).toEqual(before.payment); expect(after.allocations).toEqual(before.allocations);
    expect(after.reversal).toMatchObject({ reason: body.reason, reversedBy: actor.userId });
    expect((await detail()).charge).toMatchObject({ originalCents: 10000, reductionCents: 4000, allocatedCents: 0 });
    await expect(reversePayment(db, actor, p.id, reversal())).rejects.toMatchObject({ code: 'CONFLICT' });
    await adjustCharge(db, actor, ids[0], { kind: 'CANCELLATION', reason: 'Future charge no longer due', requestKey: randomUUID() }, now);
  });
  it('requires explicit reversal confirmation and non-empty reason', async () => {
    const p = await pay();
    for (const raw of [{ ...reversal(), confirmed: false }, { ...reversal(), reason: ' ' }]) {
      expect(reversalSchema.safeParse(raw).success).toBe(false); await expect(reversePayment(db, actor, p.id, raw)).rejects.toThrow();
    }
    expect((await detail()).charge.allocatedCents).toBe(6000);
  });
  it('makes simultaneous reversals safe and does not restore twice', async () => {
    const p = await pay(), body = reversal();
    const [a, b] = await Promise.all([reversePayment(db, actor, p.id, body), reversePayment(db, actor, p.id, body)]);
    expect(a).toEqual(b); expect((await detail()).charge.allocatedCents).toBe(0);
    expect(await test.seed.select().from(s.financeReversals)).toHaveLength(1);
    expect((await test.seed.select().from(s.auditEvents).where(eq(s.auditEvents.action, 'FinancePaymentReversed')))).toHaveLength(1);
  });
  it('rolls back restoration if mandatory reversal evidence cannot be recorded', async () => {
    const p = await pay();
    await test.client.exec(`create function synthetic_reversal_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic'; end $$; create trigger fail_reversal before insert on finance_payment_reversals for each row execute function synthetic_reversal_failure()`);
    await expect(reversePayment(db, actor, p.id, reversal())).rejects.toThrow();
    expect((await detail()).charge.allocatedCents).toBe(6000); expect((await paymentDetail(db, actor, p.id)).reversal).toBeNull();
  });
  it('makes audit failure roll back both payment recording and reversal', async () => {
    const p = await pay();
    await test.client.exec(`create function synthetic_finance_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic'; end $$; create trigger fail_finance_audit before insert on audit_events for each row execute function synthetic_finance_audit_failure()`);
    await expect(pay(input(1000))).rejects.toMatchObject({ code: 'INTERNAL_ERROR', featureCode: 'AUDIT_PERSISTENCE_FAILED' });
    await expect(reversePayment(db, actor, p.id, reversal())).rejects.toMatchObject({ code: 'INTERNAL_ERROR', featureCode: 'AUDIT_PERSISTENCE_FAILED' });
    expect((await detail()).charge.allocatedCents).toBe(6000); expect((await paymentDetail(db, actor, p.id)).reversal).toBeNull();
    expect(await test.seed.select().from(s.financePayments)).toHaveLength(1);
  });
  it('retains every original payment/allocation after subsequent payments and reversals', async () => {
    const p = await pay(input(3000)), before = await paymentDetail(db, actor, p.id);
    await pay(input(2000)); await reversePayment(db, actor, p.id, reversal());
    const after = await paymentDetail(db, actor, p.id);
    expect(after.payment).toEqual(before.payment); expect(after.allocations).toEqual(before.allocations);
    expect((await detail()).charge.allocatedCents).toBe(2000);
  });
  it('rolls back the payment, allocations and balance when allocation persistence fails', async () => {
    // Fault injection is test-only, following the existing repository convention.
    await test.client.exec(`create function synthetic_allocation_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic'; end $$; create trigger fail_allocation before insert on finance_payment_allocations for each row execute function synthetic_allocation_failure()`);
    await expect(pay()).rejects.toThrow();
    expect((await detail()).charge.allocatedCents).toBe(0);
    expect(await test.seed.select().from(s.financePayments)).toEqual([]);
    expect(await test.seed.select().from(s.financeAllocations)).toEqual([]);
  });
});
describe('payment and receipt access boundaries', () => {
  it('rejects foreign School/Student allocations and tenant ID guessing', async () => {
    const other = await seedSchool(test.seed), otherActors = await seedStudentAndActors(test.seed, other.schoolId, other.yearId, other.classId);
    const foreign = { userId: otherActors.schoolAdminUserId, schoolId: other.schoolId };
    await expect(recordPayment(db, foreign, input(), now)).rejects.toThrow();
    const second = randomUUID(); await test.seed.insert(s.students).values({ id: second, schoolId: actor.schoolId, firstName: 'Other', lastName: 'Student' });
    await expect(pay({ ...input(), studentId: second })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const p = await pay();
    await expect(paymentDetail(db, foreign, p.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(reversePayment(db, foreign, p.id, reversal())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await paymentHistory(db, foreign)).items).toEqual([]);
    const line = (await paymentDetail(db, actor, p.id)).allocations[0];
    await expect(test.seed.insert(s.financeAllocations).values({ ...line, id: randomUUID(), studentId: second, chargeId: ids[1] })).rejects.toThrow();
  });
  it('denies teachers, parents, anonymous and platform-only authority', async () => {
    const parent = await seedParentActor(test.seed, school.schoolId), p = await pay();
    for (const userId of [actors.teacherUserId, parent.parentUserId, null]) {
      const caller = { ...actor, userId };
      await expect(recordPayment(db, caller, input(), now)).rejects.toThrow();
      await expect(paymentDetail(db, caller, p.id)).rejects.toThrow();
      await expect(reversePayment(db, caller, p.id, reversal())).rejects.toThrow();
    }
    await test.seed.update(s.users).set({ isPlatformAdmin: true }).where(eq(s.users.id, actor.userId));
    await test.seed.update(s.schoolMemberships).set({ status: 'INACTIVE' }).where(eq(s.schoolMemberships.userId, actor.userId));
    await expect(paymentDetail(db, actor, p.id)).rejects.toThrow();
  });
  it('retains escaped receipt snapshots and the same reference after reversal and renaming', async () => {
    await test.seed.update(s.schools).set({ name: '<script>synthetic</script>' }).where(eq(s.schools.id, school.schoolId));
    const p = await pay({ ...input(), reference: '<img src=x onerror=alert(1)>' });
    await test.seed.update(s.schools).set({ name: 'Renamed' }).where(eq(s.schools.id, school.schoolId));
    const before = await paymentDetail(db, actor, p.id), html = receiptDocument(before, 'ar');
    expect(html).toContain('dir="rtl"'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toMatch(/<script|<img/i);
    await reversePayment(db, actor, p.id, reversal()); const after = await paymentDetail(db, actor, p.id);
    expect(after.payment).toEqual(before.payment); expect(after.payment.receiptReference).toBe(p.receiptReference);
    const reversed = receiptDocument(after, 'en'); expect(reversed).toContain('Reversed'); expect(reversed).toContain(after.reversal!.reversalReference);
    expect(reversed).toContain('No monetary refund');
  });
});
