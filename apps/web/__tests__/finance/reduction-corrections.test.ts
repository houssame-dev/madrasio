// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { createGradesTestDb, seedSchool, seedStudentAndActors, seedParentActor, type GradesTestDb } from '../grades/test-helpers';
import { adjustCharge, chargeDetail, correctReduction, generateCharges, previewCharges, saveFeeType, saveStructure, type FinanceDb } from '@/lib/modules/finance/application/service';
import { recordPayment, paymentDetail, reversePayment } from '@/lib/modules/finance/application/payments';
import { receiptDocument } from '@/lib/modules/finance/domain/receipt';
import { reductionCorrectionSchema } from '@/lib/modules/finance/domain/contracts';
import { effectiveReductions } from '@/lib/modules/finance/domain/reductions';

let test: GradesTestDb, db: FinanceDb, ids: string[];
let school: Awaited<ReturnType<typeof seedSchool>>, actors: Awaited<ReturnType<typeof seedStudentAndActors>>;
let actor: { userId: string; schoolId: string };
const now = new Date('2025-11-01T12:00:00Z');
beforeEach(async () => {
  test = await createGradesTestDb(); db = test.seed as unknown as FinanceDb;
  school = await seedSchool(test.seed); actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  actor = { userId: actors.schoolAdminUserId, schoolId: school.schoolId };
  const fee = await saveFeeType(db, actor, { name: 'Tuition' });
  const structure = await saveStructure(db, actor, { feeTypeId: fee.id, academicYearId: school.yearId, cadence: 'MONTHLY', amountCents: 10000, periods: [{ period: '2025-12', dueDate: '2025-12-10' }, { period: '2026-01', dueDate: '2026-01-10' }] });
  const selection = { structureId: structure.id, studentIds: [actors.studentId], periods: ['2025-12', '2026-01'] };
  ids = (await generateCharges(db, actor, { ...selection, previewHash: (await previewCharges(db, actor, selection)).previewHash, requestKey: randomUUID() })).chargeIds;
}, 30000);
afterEach(async () => { await test?.client.close(); });
const reduce = (amountCents: number) => adjustCharge(db, actor, ids[0], { kind: 'REDUCTION', amountCents, requestKey: randomUUID(), reason: 'Approved tuition reduction' }, now);
const edit = (expectedEventId: string, amountCents: number) => ({ expectedEventId, amountCents, kind: 'REDUCTION_EDIT', requestKey: randomUUID(), reason: 'Correct approved amount', confirmed: true });
const cancel = (expectedEventId: string) => ({ expectedEventId, kind: 'REDUCTION_CANCEL', requestKey: randomUUID(), reason: 'Withdraw this reduction', confirmed: true });
it('edits and cancels individual reductions without overwriting originals or other reductions', async () => {
  const first = await reduce(2000), second = await reduce(1000);
  const correction = await correctReduction(db, actor, ids[0], first.id, edit(first.id, 1500));
  expect(correction).toMatchObject({ reductionId: first.id, replacesEventId: first.id, reductionBeforeCents: 2000, reductionAfterCents: 1500, beforeCents: 7000, afterCents: 7500, actorId: actor.userId });
  expect(correction.occurredAt).toBeInstanceOf(Date);
  await correctReduction(db, actor, ids[0], second.id, cancel(second.id));
  expect((await chargeDetail(db, actor, ids[0])).charge).toMatchObject({ originalCents: 10000, reductionCents: 1500, allocatedCents: 0 });
  await correctReduction(db, actor, ids[0], first.id, cancel(correction.id));
  const detail = await chargeDetail(db, actor, ids[0]); expect(detail.charge.reductionCents).toBe(0);
  expect(detail.events.find(e => e.id === first.id)).toEqual(first); expect(detail.events.find(e => e.id === second.id)).toEqual(second);
  expect(detail.events).toHaveLength(5); expect(effectiveReductions(detail.events).map(r => r.amountCents)).toEqual([0, 0]);
});
it('preserves payment, allocation and receipt bytes; refuses to reduce payable below valid allocations', async () => {
  const root = await reduce(2000);
  const p = await recordPayment(db, actor, { requestKey: randomUUID(), confirmed: true, studentId: actors.studentId, method: 'CASH', amountCents: 6000, receivedOn: '2025-11-01', allocations: [{ chargeId: ids[0], amountCents: 6000 }] }, now);
  const before = await paymentDetail(db, actor, p.id), receipt = receiptDocument(before, 'fr');
  await expect(correctReduction(db, actor, ids[0], root.id, edit(root.id, 4001))).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
  const changed = await correctReduction(db, actor, ids[0], root.id, edit(root.id, 4000));
  expect((await chargeDetail(db, actor, ids[0])).charge).toMatchObject({ reductionCents: 4000, allocatedCents: 6000 });
  await correctReduction(db, actor, ids[0], root.id, cancel(changed.id));
  expect(await paymentDetail(db, actor, p.id)).toEqual(before); expect(receiptDocument(await paymentDetail(db, actor, p.id), 'fr')).toBe(receipt);
  expect((await chargeDetail(db, actor, ids[0])).charge).toMatchObject({ originalCents: 10000, reductionCents: 0, allocatedCents: 6000 });
  await reversePayment(db, actor, p.id, { requestKey: randomUUID(), confirmed: true, reason: 'Payment correction' });
  expect((await chargeDetail(db, actor, ids[0])).charge).toMatchObject({ reductionCents: 0, allocatedCents: 0 });
});
it('makes edit/cancel retries idempotent and rejects changed request payloads and stale revisions', async () => {
  const root = await reduce(1000), input = edit(root.id, 2000);
  const corrected = await correctReduction(db, actor, ids[0], root.id, input);
  expect(await correctReduction(db, actor, ids[0], root.id, input)).toEqual(corrected);
  await expect(correctReduction(db, actor, ids[0], root.id, { ...input, amountCents: 3000 })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(correctReduction(db, actor, ids[0], root.id, edit(root.id, 3000))).rejects.toMatchObject({ code: 'CONFLICT' });
  const undo = cancel(corrected.id), cancelled = await correctReduction(db, actor, ids[0], root.id, undo);
  expect(await correctReduction(db, actor, ids[0], root.id, undo)).toEqual(cancelled);
  await expect(correctReduction(db, actor, ids[0], root.id, edit(cancelled.id, 1000))).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
  expect((await chargeDetail(db, actor, ids[0])).events).toHaveLength(3);
});
it('keeps fully reduced charges reversible without accepting over-reductions or wrong targets', async () => {
  const root = await reduce(10000);
  await expect(correctReduction(db, actor, ids[0], root.id, edit(root.id, 10001))).rejects.toThrow();
  await expect(correctReduction(db, actor, ids[1], root.id, edit(root.id, 1000))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(correctReduction(db, actor, ids[0], randomUUID(), edit(root.id, 1000))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await correctReduction(db, actor, ids[0], root.id, cancel(root.id));
  expect((await chargeDetail(db, actor, ids[0])).charge.reductionCents).toBe(0);
});
it('rejects corrections after whole-charge cancellation', async () => {
  const root = await reduce(1000);
  const cancelled = await adjustCharge(db, actor, ids[0], { kind: 'CANCELLATION', requestKey: randomUUID(), reason: 'Cancel charge' }, now);
  await expect(correctReduction(db, actor, ids[0], root.id, cancel(root.id))).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
  expect((await chargeDetail(db, actor, ids[0])).events).toHaveLength(2); expect(cancelled.kind).toBe('CANCELLATION');
});
it('rolls back the aggregate if the append-only correction cannot be inserted', async () => {
  const root = await reduce(1000), before = await chargeDetail(db, actor, ids[0]);
  await test.client.exec("alter table finance_charge_events add constraint test_deny_correction check (kind <> 'REDUCTION_EDIT')");
  await expect(correctReduction(db, actor, ids[0], root.id, edit(root.id, 2000))).rejects.toThrow();
  expect(await chargeDetail(db, actor, ids[0])).toEqual(before);
});
it('enforces same-charge correction references and one successor per revision at the database boundary', async () => {
  const root = await reduce(1000), corrected = await correctReduction(db, actor, ids[0], root.id, edit(root.id, 2000));
  await expect(test.seed.insert(s.financeChargeEvents).values({ ...corrected, id: randomUUID(), requestKey: randomUUID() })).rejects.toThrow();
  await expect(test.seed.insert(s.financeChargeEvents).values({ ...corrected, id: randomUUID(), requestKey: randomUUID(), chargeId: ids[1] })).rejects.toThrow();
  await expect(test.seed.insert(s.financeChargeEvents).values({ ...corrected, id: randomUUID(), requestKey: randomUUID(), replacesEventId: corrected.id, reductionBeforeCents: null })).rejects.toThrow();
});
it('denies unauthenticated, Teacher, Parent, platform-only and inactive actors without changing history', async () => {
  const root = await reduce(1000), parent = await seedParentActor(test.seed, school.schoolId), platformId = randomUUID();
  await test.client.query('insert into auth.users(id,email) values ($1,$2)', [platformId, 'platform@example.test']);
  await test.seed.insert(s.users).values({ id: platformId, email: 'platform@example.test', isPlatformAdmin: true });
  for (const userId of [null, actors.teacherUserId, parent.parentUserId, platformId]) await expect(correctReduction(db, { ...actor, userId }, ids[0], root.id, cancel(root.id))).rejects.toThrow();
  await test.seed.update(s.users).set({ status: 'SUSPENDED' }).where(eq(s.users.id, actor.userId));
  await expect(correctReduction(db, actor, ids[0], root.id, cancel(root.id))).rejects.toThrow();
  await test.seed.update(s.users).set({ status: 'ACTIVE' }).where(eq(s.users.id, actor.userId));
  await test.client.query("update school_memberships set status='INACTIVE' where school_id=$1 and user_id=$2", [actor.schoolId, actor.userId]);
  await expect(correctReduction(db, actor, ids[0], root.id, cancel(root.id))).rejects.toThrow();
  await test.client.query("update school_memberships set status='ACTIVE' where school_id=$1 and user_id=$2", [actor.schoolId, actor.userId]);
  await test.seed.update(s.schools).set({ status: 'INACTIVE' }).where(eq(s.schools.id, actor.schoolId));
  await expect(correctReduction(db, actor, ids[0], root.id, cancel(root.id))).rejects.toThrow();
  expect(await test.seed.select().from(s.financeChargeEvents)).toEqual([root]);
});
it('hides foreign School charges and preserves tenant integrity', async () => {
  const root = await reduce(1000), other = await seedSchool(test.seed), people = await seedStudentAndActors(test.seed, other.schoolId, other.yearId, other.classId);
  await expect(correctReduction(db, { userId: people.schoolAdminUserId, schoolId: other.schoolId }, ids[0], root.id, cancel(root.id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(correctReduction(db, { ...actor, schoolId: other.schoolId }, ids[0], root.id, cancel(root.id))).rejects.toThrow();
  expect((await chargeDetail(db, actor, ids[0])).events).toEqual([root]);
});
it('requires exact supported correction inputs, confirmation, non-empty reason and a revision', () => {
  const valid = edit(randomUUID(), 1000); expect(reductionCorrectionSchema.parse(valid)).toEqual(valid);
  for (const input of [{ ...valid, confirmed: false }, { ...valid, reason: ' ' }, { ...valid, expectedEventId: undefined }, { ...valid, schoolId: school.schoolId }, { ...valid, amountCents: 0 }, { ...cancel(valid.expectedEventId), amountCents: 1 }]) expect(reductionCorrectionSchema.safeParse(input).success).toBe(false);
});
