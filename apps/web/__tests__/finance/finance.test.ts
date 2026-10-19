// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { recordPayment } from '@/lib/modules/finance/application/payments';
import { applicationSecurityAuditSql } from '@school/database/security';
import { createGradesTestDb, seedSchool, seedStudentAndActors, seedParentActor, type GradesTestDb } from '../grades/test-helpers';
import { adjustCharge, chargeDetail, generateCharges, listFinance, previewCharges, saveFeeType, saveStructure, type FinanceDb } from '@/lib/modules/finance/application/service';
import { adjustmentSchema, generateSchema, parseMoney, previewSchema, schoolToday, validatePeriods } from '@/lib/modules/finance/domain/contracts';

let test: GradesTestDb; let db: FinanceDb;
let school: Awaited<ReturnType<typeof seedSchool>>;
let actors: Awaited<ReturnType<typeof seedStudentAndActors>>;
let actor: { userId: string; schoolId: string };
let structure: Awaited<ReturnType<typeof saveStructure>>;
const periods = [{ period: '2025-12', dueDate: '2025-12-10' }, { period: '2026-01', dueDate: '2026-01-10' }];
const now = new Date('2025-11-01T12:00:00Z');
const selection = () => ({ structureId: structure.id, studentIds: [actors.studentId], periods: periods.map(p => p.period) });
beforeEach(async () => {
  test = await createGradesTestDb(); db = test.seed as unknown as FinanceDb;
  school = await seedSchool(test.seed); actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  actor = { userId: actors.schoolAdminUserId, schoolId: school.schoolId };
  const type = await saveFeeType(db, actor, { name: 'Tuition' });
  structure = await saveStructure(db, actor, { feeTypeId: type.id, academicYearId: school.yearId, amountCents: 125099, cadence: 'MONTHLY', periods });
}, 30000);
afterEach(async () => { await test?.client.close(); });
async function generation() {
  const input = selection(); const preview = await previewCharges(db, actor, input);
  return { ...input, previewHash: preview.previewHash, requestKey: randomUUID() };
}

describe('Finance generation and retained snapshots', () => {
  it('keeps fee names and active structure scope unique, revision-checks edits and scopes configuration to the year', async () => {
    await expect(saveFeeType(db, actor, { name: 'tuition' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(saveStructure(db, actor, { feeTypeId: structure.feeTypeId, academicYearId: school.yearId, amountCents: 100, cadence: 'MONTHLY', periods })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(saveStructure(db, actor, { amountCents: 100, periods, active: true, revision: 99 }, structure.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(saveStructure(db, actor, { feeTypeId: structure.feeTypeId, academicYearId: school.yearId, amountCents: 100, cadence: 'MONTHLY', periods: [{ period: '2024-01', dueDate: '2025-12-01' }] })).rejects.toThrow();
    expect((await listFinance(db, actor, { page: 1, search: '', academicYearId: randomUUID() })).structures).toEqual([]);
    expect(await test.seed.select().from(s.studentCharges)).toEqual([]);
  });
  it('previews exact cross-calendar-year totals without writing, then records explicit charges', async () => {
    const preview = await previewCharges(db, actor, selection());
    expect(preview).toMatchObject({ created: 2, skipped: 0, totalCents: 250198 });
    expect((await test.seed.select().from(s.studentCharges))).toHaveLength(0);
    expect((await test.seed.select().from(s.financeBatches))).toHaveLength(0);
    const result = await generateCharges(db, actor, await generation());
    expect(result).toMatchObject({ created: 2, skipped: 0, totalCents: 250198 });
    const charges = await test.seed.select().from(s.studentCharges);
    expect(charges.map(c => c.period).sort()).toEqual(['2025-12', '2026-01']);
    expect(charges.every(c => c.originalCents === 125099 && c.classId === school.classId && c.reductionCents === 0 && c.allocatedCents === 0)).toBe(true);
  });
  it('makes identical concurrent/repeated generation return one batch and one logical charge per period', async () => {
    const input = await generation();
    const results = await Promise.all([generateCharges(db, actor, input), generateCharges(db, actor, input)]);
    expect(results[0]).toEqual(results[1]);
    expect(await generateCharges(db, actor, input)).toEqual(results[0]);
    expect(await test.seed.select().from(s.studentCharges)).toHaveLength(2);
    expect(await test.seed.select().from(s.financeBatches)).toHaveLength(1);
    await expect(generateCharges(db, actor, { ...input, periods: ['2025-12'] })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('rejects a concurrent stale preview under a different request key without duplicates', async () => {
    const input = await generation();
    const results = await Promise.allSettled([generateCharges(db, actor, input), generateCharges(db, actor, { ...input, requestKey: randomUUID() })]);
    expect(results.filter(v => v.status === 'fulfilled')).toHaveLength(1);
    expect(await test.seed.select().from(s.studentCharges)).toHaveLength(2);
    const next = await previewCharges(db, actor, selection());
    expect(next).toMatchObject({ created: 0, skipped: 2, totalCents: 0 });
  });
  it('independently enforces logical uniqueness at the database boundary', async () => {
    const result = await generateCharges(db, actor, await generation());
    const { charge } = await chargeDetail(db, actor, result.chargeIds[0]);
    await expect(test.seed.insert(s.studentCharges).values({ ...charge, id: randomUUID() })).rejects.toThrow();
  });
  it('rejects changed configuration and preserves earlier original amounts and due dates', async () => {
    const input = await generation();
    await saveStructure(db, actor, { amountCents: 150000, periods, revision: 1, active: true }, structure.id);
    await expect(generateCharges(db, actor, input)).rejects.toMatchObject({ code: 'CONFLICT' });
    const generated = await generateCharges(db, actor, await generation());
    await saveStructure(db, actor, { amountCents: 180000, periods: periods.map(p => ({ ...p, dueDate: '2026-02-01' })), revision: 2, active: true }, structure.id);
    const { charge } = await chargeDetail(db, actor, generated.chargeIds[0]);
    expect(charge.originalCents).toBe(150000); expect(charge.dueDate).toBe('2025-12-10'); expect(charge.structureRevision).toBe(2);
  });
  it('supports Class and Level bulk selection while requiring current enrollment', async () => {
    const [klass] = await test.seed.select().from(s.classes).where(eq(s.classes.id, school.classId));
    const second = randomUUID();
    await test.seed.insert(s.students).values({ id: second, schoolId: school.schoolId, firstName: 'Leila', lastName: 'Test' });
    await test.seed.insert(s.studentEnrollments).values({ schoolId: school.schoolId, studentId: second, academicYearId: school.yearId, classId: school.classId, effectiveFrom: '2025-09-01' });
    expect(await previewCharges(db, actor, { structureId: structure.id, classId: school.classId, periods: ['2025-12'] })).toMatchObject({ created: 2, totalCents: 250198 });
    expect(await previewCharges(db, actor, { structureId: structure.id, levelId: klass.levelId, periods: ['2025-12'] })).toMatchObject({ created: 2 });
  });
  it('generates a 500-student Class batch atomically across bounded insert chunks', async () => {
    const students = Array.from({ length: 499 }, () => ({ id: randomUUID(), schoolId: school.schoolId, firstName: 'Synthetic', lastName: 'Bulk' }));
    await test.seed.insert(s.students).values(students);
    await test.seed.insert(s.studentEnrollments).values(students.map(student => ({ schoolId: school.schoolId, studentId: student.id, academicYearId: school.yearId, classId: school.classId, effectiveFrom: '2025-09-01' })));
    const input = { structureId: structure.id, classId: school.classId, periods: periods.map(p => p.period) };
    const preview = await previewCharges(db, actor, input);
    expect(preview).toMatchObject({ created: 1000, totalCents: 125099000 });
    const confirmation = { ...input, previewHash: preview.previewHash, requestKey: randomUUID() };
    const result = await generateCharges(db, actor, confirmation);
    expect(result.chargeIds).toHaveLength(1000); expect(new Set(result.chargeIds).size).toBe(1000);
    expect(await generateCharges(db, actor, confirmation)).toEqual(result);
    expect((await listFinance(db, actor, { page: 1, search: '' }))).toMatchObject({ total: 1000 });
  });
  it('retains Class snapshots after transfer and prevents recharging the same fee/month', async () => {
    const original = await generateCharges(db, actor, await generation());
    const [klass] = await test.seed.select().from(s.classes).where(eq(s.classes.id, school.classId));
    const [nextClass] = await test.seed.insert(s.classes).values({ schoolId: school.schoolId, academicYearId: school.yearId, levelId: klass.levelId, curriculumVersionId: klass.curriculumVersionId, name: 'Transfer destination' }).returning();
    await test.seed.update(s.studentEnrollments).set({ status: 'ENDED', effectiveUntil: '2026-01-01' }).where(eq(s.studentEnrollments.studentId, actors.studentId));
    await test.seed.insert(s.studentEnrollments).values({ schoolId: school.schoolId, studentId: actors.studentId, academicYearId: school.yearId, classId: nextClass.id, effectiveFrom: '2026-01-02' });
    expect(await previewCharges(db, actor, selection())).toMatchObject({ created: 0, skipped: 2 });
    expect((await chargeDetail(db, actor, original.chargeIds[0])).charge.classId).toBe(school.classId);
    await expect(previewCharges(db, actor, { structureId: structure.id, classId: school.classId, periods: ['2025-12'] })).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
  });
  it.each(['INACTIVE', 'WITHDRAWN', 'ARCHIVED'] as const)('rejects %s Students with no partial batch', async status => {
    await test.seed.update(s.students).set({ status }).where(eq(s.students.id, actors.studentId));
    await expect(previewCharges(db, actor, selection())).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    expect(await test.seed.select().from(s.financeBatches)).toHaveLength(0);
  });
  it('rejects unenrolled IDs, ended enrollment, foreign years and wrong Levels', async () => {
    await expect(previewCharges(db, actor, { ...selection(), studentIds: [actors.studentId, randomUUID()] })).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    await test.seed.update(s.studentEnrollments).set({ status: 'ENDED' }).where(eq(s.studentEnrollments.studentId, actors.studentId));
    await expect(previewCharges(db, actor, selection())).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    await expect(saveStructure(db, actor, { feeTypeId: structure.feeTypeId, academicYearId: randomUUID(), amountCents: 100, cadence: 'MONTHLY', periods })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('enforces configured Level and academic-year placement', async () => {
    const [klass] = await test.seed.select().from(s.classes).where(eq(s.classes.id, school.classId));
    const [another] = await test.seed.insert(s.levels).values({ schoolId: school.schoolId, stageId: (await test.seed.select().from(s.levels).where(eq(s.levels.id, klass.levelId)))[0].stageId, name: 'Other level', sequence: 2 }).returning();
    const levelFee = await saveStructure(db, actor, { feeTypeId: structure.feeTypeId, academicYearId: school.yearId, levelId: another.id, amountCents: 100, cadence: 'MONTHLY', periods });
    await expect(previewCharges(db, actor, { ...selection(), structureId: levelFee.id })).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
  });
  it('blocks closed years and inactive types/structures', async () => {
    await test.seed.update(s.academicYears).set({ status: 'CLOSED' }).where(eq(s.academicYears.id, school.yearId));
    await expect(previewCharges(db, actor, selection())).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    await test.seed.update(s.academicYears).set({ status: 'ACTIVE' }).where(eq(s.academicYears.id, school.yearId));
    await saveFeeType(db, actor, { name: 'Tuition', active: false }, structure.feeTypeId);
    await expect(previewCharges(db, actor, selection())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('supports one-time fees with one annual identity', async () => {
    const type = await saveFeeType(db, actor, { name: 'Registration' });
    const once = await saveStructure(db, actor, { feeTypeId: type.id, academicYearId: school.yearId, cadence: 'ONCE', amountCents: 50000, periods: [{ period: 'once', dueDate: '2025-09-01' }] });
    const input = { structureId: once.id, studentIds: [actors.studentId], periods: ['once'] };
    const p = await previewCharges(db, actor, input);
    expect(await generateCharges(db, actor, { ...input, previewHash: p.previewHash, requestKey: randomUUID() })).toMatchObject({ created: 1, totalCents: 50000 });
    expect(await previewCharges(db, actor, input)).toMatchObject({ skipped: 1 });
  });
});

describe('adjustments, history and future payment boundary', () => {
  it('preserves original amount, requires reasons and makes a reduction idempotent', async () => {
    const result = await generateCharges(db, actor, await generation()); const id = result.chargeIds[0];
    const input = { requestKey: randomUUID(), kind: 'REDUCTION' as const, amountCents: 10099, reason: 'Approved manual reduction' };
    const event = await adjustCharge(db, actor, id, input, now);
    expect(await adjustCharge(db, actor, id, input, now)).toEqual(event);
    expect((await chargeDetail(db, actor, id))).toMatchObject({ charge: { originalCents: 125099, reductionCents: 10099 }, events: [{ beforeCents: 125099, afterCents: 115000, reason: input.reason, actorId: actor.userId }] });
    await expect(adjustCharge(db, actor, id, { ...input, amountCents: 200000, requestKey: randomUUID() }, now)).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    await expect(adjustCharge(db, actor, id, { ...input, reason: 'Different' }, now)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('cancels fully unpaid future charges, preserves history and prevents regeneration', async () => {
    const result = await generateCharges(db, actor, await generation()); const id = result.chargeIds[0];
    const input = { requestKey: randomUUID(), kind: 'CANCELLATION' as const, reason: 'Approved future cancellation' };
    const event = await adjustCharge(db, actor, id, input, now);
    expect(await adjustCharge(db, actor, id, input, now)).toEqual(event);
    expect((await chargeDetail(db, actor, id))).toMatchObject({ charge: { status: 'CANCELLED', originalCents: 125099 }, events: [{ kind: 'CANCELLATION', reason: input.reason }] });
    expect(await previewCharges(db, actor, selection())).toMatchObject({ created: 0, skipped: 2 });
    await expect(adjustCharge(db, actor, id, { requestKey: randomUUID(), kind: 'REDUCTION', amountCents: 1, reason: 'No' }, now)).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
  });
  it.each(['2025-12-10T00:00:00Z', '2025-12-11T00:00:00Z'])('rejects due-today/overdue cancellation at %s', async clock => {
    const result = await generateCharges(db, actor, await generation());
    await expect(adjustCharge(db, actor, result.chargeIds[0], { requestKey: randomUUID(), kind: 'CANCELLATION', reason: 'Too late' }, new Date(clock))).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
  });
  it('rejects cancellation or over-reduction after a future allocation', async () => {
    const result = await generateCharges(db, actor, await generation()); const id = result.chargeIds[0];
    // A real recorded allocation protects the Pass 1 adjustment boundary.
    await recordPayment(db, actor, { requestKey: randomUUID(), confirmed: true, studentId: actors.studentId, method: 'CASH', receivedOn: '2025-11-01', amountCents: 100, allocations: [{ chargeId: id, amountCents: 100 }] }, now);
    await expect(adjustCharge(db, actor, id, { requestKey: randomUUID(), kind: 'CANCELLATION', reason: 'No' }, now)).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    await expect(adjustCharge(db, actor, id, { requestKey: randomUUID(), kind: 'REDUCTION', amountCents: 125099, reason: 'No' }, now)).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
  });
  it('rolls back the charge change when mandatory event persistence fails', async () => {
    const result = await generateCharges(db, actor, await generation()); const id = result.chargeIds[0];
    await test.client.exec(`create function fail_finance_event() returns trigger language plpgsql as $$ begin raise exception 'synthetic event failure'; end $$;
      create trigger fail_event before insert on finance_charge_events for each row execute function fail_finance_event()`);
    await expect(adjustCharge(db, actor, id, { requestKey: randomUUID(), kind: 'REDUCTION', amountCents: 100, reason: 'Synthetic failure' }, now)).rejects.toThrow();
    expect((await chargeDetail(db, actor, id))).toMatchObject({ charge: { reductionCents: 0, status: 'OPEN' }, events: [] });
  });
});

describe('authorization and tenant integrity', () => {
  it('denies Teacher, Parent, anonymous and platform-only identities', async () => {
    const parent = await seedParentActor(test.seed, school.schoolId);
    for (const userId of [actors.teacherUserId, parent.parentUserId, null]) {
      await expect(listFinance(db, { ...actor, userId }, { page: 1, search: '' })).rejects.toThrow();
      await expect(saveFeeType(db, { ...actor, userId }, { name: 'Forbidden' })).rejects.toThrow();
    }
    await test.seed.update(s.users).set({ isPlatformAdmin: true }).where(eq(s.users.id, actors.schoolAdminUserId));
    await test.seed.update(s.schoolMemberships).set({ status: 'INACTIVE' }).where(eq(s.schoolMemberships.userId, actors.schoolAdminUserId));
    await expect(previewCharges(db, actor, selection())).rejects.toThrow();
  });
  it('rejects suspended administrators and inactive Schools', async () => {
    await test.seed.update(s.users).set({ status: 'SUSPENDED' }).where(eq(s.users.id, actor.userId));
    await expect(saveFeeType(db, actor, { name: 'No' })).rejects.toThrow();
    await test.seed.update(s.users).set({ status: 'ACTIVE' }).where(eq(s.users.id, actor.userId));
    await test.seed.update(s.schools).set({ status: 'INACTIVE' }).where(eq(s.schools.id, actor.schoolId));
    await expect(previewCharges(db, actor, selection())).rejects.toThrow();
  });
  it('hides foreign structures/charges and enforces composite tenant FKs', async () => {
    const other = await seedSchool(test.seed); const otherActors = await seedStudentAndActors(test.seed, other.schoolId, other.yearId, other.classId);
    const b = { userId: otherActors.schoolAdminUserId, schoolId: other.schoolId };
    await expect(previewCharges(db, b, selection())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const generated = await generateCharges(db, actor, await generation());
    await expect(chargeDetail(db, b, generated.chargeIds[0])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await listFinance(db, b, { page: 1, search: '' })).charges).toHaveLength(0);
    await expect(test.seed.insert(s.feeStructures).values({ schoolId: other.schoolId, academicYearId: other.yearId, feeTypeId: structure.feeTypeId, amountCents: 100, cadence: 'MONTHLY', periods, createdBy: b.userId, updatedBy: b.userId })).rejects.toThrow();
  });
  it('replays the new schema with all application ACL protections intact', async () => {
    await test.client.exec('create role anon;create role authenticated;create role service_role');
    expect((await test.client.query(applicationSecurityAuditSql)).rows).toEqual([]);
    expect((await test.client.query('select count(*)::int as n from drizzle.__drizzle_migrations')).rows).toEqual([{ n: 27 }]);
  });
});

describe('strict money/date/selection contracts', () => {
  it('uses exact two-decimal money arithmetic', () => { expect(parseMoney('1250.99')).toBe(125099); expect(parseMoney('0.01')).toBe(1); expect(parseMoney('9999999.99')).toBe(999999999); });
  it.each(['0', '-1', '1.001', '1e4', 'NaN', '0.0001', '10000000'])('rejects invalid money %s', value => { expect(() => parseMoney(value)).toThrow(); });
  it('handles school-local dates without UTC cancellation drift', () => { expect(schoolToday('Pacific/Kiritimati', new Date('2025-12-09T12:30:00Z'))).toBe('2025-12-10'); });
  it('rejects extra authority fields, duplicate months, multiple selection modes and missing reasons', () => {
    expect(previewSchema.safeParse({ ...selection(), schoolId: randomUUID() }).success).toBe(false);
    expect(previewSchema.safeParse({ ...selection(), periods: ['2025-12', '2025-12'] }).success).toBe(false);
    expect(previewSchema.safeParse({ ...selection(), classId: school.classId }).success).toBe(false);
    expect(generateSchema.safeParse({ ...selection(), previewHash: 'x', requestKey: randomUUID() }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ kind: 'CANCELLATION', requestKey: randomUUID(), reason: ' ' }).success).toBe(false);
    expect(() => validatePeriods('MONTHLY', [{ period: '2024-12', dueDate: '2025-12-10' }], { startDate: '2025-09-01', endDate: '2026-07-01' })).toThrow();
    expect(() => validatePeriods('ONCE', periods, { startDate: '2025-09-01', endDate: '2026-07-01' })).toThrow();
  });
});
