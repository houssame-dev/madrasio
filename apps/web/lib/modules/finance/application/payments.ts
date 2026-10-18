import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { financePayments as payments, financeAllocations as allocations, financeReversals as reversals, studentCharges as charges, students } from '@school/database';
import { BusinessRuleViolationError, ConflictError, NotFoundError } from '@/lib/errors';
import { authorize, financeSettings, lock, type FinanceActor, type FinanceDb } from './service';
import { paymentSchema, reversalSchema, schoolToday } from '../domain/contracts';
import { recordFinanceAudit } from '@/lib/audit/finance';

const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function paymentStudents(db: FinanceDb, actor: FinanceActor, search = '') {
  await authorize(db, actor, true);
  const term = search.replace(/[\\%_]/g, '\\$&');
  return db.select({ id: students.id, firstName: students.firstName, lastName: students.lastName }).from(students)
    .where(and(eq(students.schoolId, actor.schoolId), search ? or(ilike(students.firstName, `%${term}%`), ilike(students.lastName, `%${term}%`), ilike(students.studentCode, `%${term}%`)) : undefined))
    .orderBy(asc(students.lastName), asc(students.id)).limit(100);
}
export function suggestAllocations(rows: { id: string; dueDate: string; originalCents: number; reductionCents: number; allocatedCents: number }[], amountCents: number) {
  let remaining = amountCents;
  return [...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id)).flatMap(c => {
    const amountCents = Math.min(remaining, c.originalCents - c.reductionCents - c.allocatedCents);
    remaining -= amountCents; return amountCents > 0 ? [{ chargeId: c.id, amountCents }] : [];
  });
}
export async function paymentOptions(db: FinanceDb, actor: FinanceActor, studentId: string, amountCents = 0) {
  await authorize(db, actor, true);
  const [student] = await db.select().from(students).where(and(eq(students.schoolId, actor.schoolId), eq(students.id, studentId)));
  if (!student) throw new NotFoundError();
  const rows = await db.select().from(charges).where(and(eq(charges.schoolId, actor.schoolId), eq(charges.studentId, studentId), eq(charges.status, 'OPEN'), sql`${charges.originalCents}-${charges.reductionCents}-${charges.allocatedCents}>0`)).orderBy(asc(charges.dueDate), asc(charges.id)).limit(501);
  // A bounded payment uses up to 500 charges; subsequent payments can use later pages.
  return { currency: (await financeSettings(db, actor)).currency, student, charges: rows.slice(0, 500), hasMore: rows.length > 500, suggested: suggestAllocations(rows.slice(0, 500), amountCents) };
}
export async function paymentHistory(db: FinanceDb, actor: FinanceActor, studentId?: string, page = 1) {
  await authorize(db, actor);
  const where = and(eq(payments.schoolId, actor.schoolId), studentId ? eq(payments.studentId, studentId) : undefined);
  const [items, totals] = await Promise.all([
    db.select({ payment: payments, reversal: reversals }).from(payments).leftJoin(reversals, and(eq(reversals.schoolId, payments.schoolId), eq(reversals.paymentId, payments.id)))
      .where(where).orderBy(desc(payments.recordedAt), asc(payments.id)).limit(50).offset((page - 1) * 50),
    db.select({ n: sql<number>`count(*)::int` }).from(payments).where(where),
  ]);
  return { items, total: totals[0].n, page };
}
export async function paymentDetail(db: FinanceDb, actor: FinanceActor, id: string) {
  await authorize(db, actor);
  const [payment] = await db.select().from(payments).where(and(eq(payments.schoolId, actor.schoolId), eq(payments.id, id)));
  if (!payment) throw new NotFoundError();
  const lines = await db.select().from(allocations).where(and(eq(allocations.schoolId, actor.schoolId), eq(allocations.paymentId, id))).orderBy(asc(allocations.dueDate), asc(allocations.chargeId));
  const reversal = (await db.select().from(reversals).where(and(eq(reversals.schoolId, actor.schoolId), eq(reversals.paymentId, id)))).at(0);
  return { payment, allocations: lines, reversal: reversal ?? null };
}
export async function recordPayment(db: FinanceDb, actor: FinanceActor, raw: unknown, now = new Date()) {
  const input = paymentSchema.parse(raw); await authorize(db, actor, true);
  const hash = digest({ ...input, allocations: [...input.allocations].sort((a, b) => a.chargeId.localeCompare(b.chargeId)) });
  return db.transaction(async tx => {
    const school = await lock(tx, actor);
    const [old] = await tx.select().from(payments).where(and(eq(payments.schoolId, actor.schoolId), eq(payments.requestKey, input.requestKey)));
    if (old) { if (old.requestHash !== hash) throw new ConflictError('Payment request key was reused.'); return old; }
    if (input.receivedOn < '1900-01-01' || input.receivedOn > schoolToday(school.timezone, now)) throw new BusinessRuleViolationError('Payment date must not be in the future.');
    const [student] = await tx.select().from(students).where(and(eq(students.schoolId, actor.schoolId), eq(students.id, input.studentId))).for('share');
    if (!student) throw new NotFoundError();
    const rows = await tx.select().from(charges).where(and(eq(charges.schoolId, actor.schoolId), eq(charges.studentId, student.id), inArray(charges.id, input.allocations.map(a => a.chargeId)))).orderBy(asc(charges.id)).for('update');
    if (rows.length !== input.allocations.length) throw new NotFoundError();
    for (const row of rows) {
      if (row.currency !== school.financeCurrency) throw new ConflictError('Charge currency does not match School currency.');
      const allocation = input.allocations.find(a => a.chargeId === row.id)!;
      if (row.status !== 'OPEN' || allocation.amountCents > row.originalCents - row.reductionCents - row.allocatedCents) throw new ConflictError('Charge balance changed. Review allocations.');
    }
    const id = randomUUID();
    const [payment] = await tx.insert(payments).values({ id, schoolId: actor.schoolId, studentId: student.id, requestKey: input.requestKey, requestHash: hash,
      receiptReference: `R-${id.replaceAll('-', '').toUpperCase()}`, schoolName: school.name, schoolTimezone: school.timezone, studentName: `${student.firstName} ${student.lastName}`,
      method: input.method, currency: school.financeCurrency, amountCents: input.amountCents, receivedOn: input.receivedOn, reference: input.reference || null, recordedBy: actor.userId! }).returning();
    await tx.insert(allocations).values(rows.map(row => ({ schoolId: actor.schoolId, studentId: student.id, paymentId: id, chargeId: row.id,
      currency: row.currency, amountCents: input.allocations.find(a => a.chargeId === row.id)!.amountCents, feeName: row.feeName, period: row.period, dueDate: row.dueDate })));
    for (const row of rows) await tx.update(charges).set({ allocatedCents: row.allocatedCents + input.allocations.find(a => a.chargeId === row.id)!.amountCents }).where(eq(charges.id, row.id));
    await recordFinanceAudit(tx, actor, { action: 'FinancePaymentRecorded', resourceId: payment.id, metadata: { studentId: student.id, requestKey: input.requestKey, amountCents: input.amountCents, method: input.method } });
    return payment;
  });
}
export async function reversePayment(db: FinanceDb, actor: FinanceActor, id: string, raw: unknown) {
  const input = reversalSchema.parse(raw); await authorize(db, actor, true); const hash = digest({ id, ...input });
  return db.transaction(async tx => {
    await lock(tx, actor);
    const [sameKey] = await tx.select().from(reversals).where(and(eq(reversals.schoolId, actor.schoolId), eq(reversals.requestKey, input.requestKey)));
    if (sameKey) { if (sameKey.requestHash !== hash) throw new ConflictError('Reversal request key was reused.'); return sameKey; }
    const [payment] = await tx.select().from(payments).where(and(eq(payments.schoolId, actor.schoolId), eq(payments.id, id))).for('update');
    if (!payment) throw new NotFoundError();
    if ((await tx.select().from(reversals).where(eq(reversals.paymentId, id))).length) throw new ConflictError('Payment already reversed.');
    const lines = await tx.select().from(allocations).where(and(eq(allocations.schoolId, actor.schoolId), eq(allocations.paymentId, id)));
    const rows = await tx.select().from(charges).where(and(eq(charges.schoolId, actor.schoolId), eq(charges.studentId, payment.studentId), inArray(charges.id, lines.map(a => a.chargeId)))).orderBy(asc(charges.id)).for('update');
    if (!lines.length || rows.length !== lines.length || lines.reduce((n, a) => n + a.amountCents, 0) !== payment.amountCents) throw new ConflictError('Payment history is inconsistent.');
    for (const row of rows) {
      const amount = lines.find(a => a.chargeId === row.id)!.amountCents;
      if (row.status !== 'OPEN' || row.allocatedCents < amount) throw new ConflictError('Payment balance is inconsistent.');
      await tx.update(charges).set({ allocatedCents: row.allocatedCents - amount }).where(eq(charges.id, row.id));
    }
    const reversalId = randomUUID();
    const [reversal] = await tx.insert(reversals).values({ id: reversalId, schoolId: actor.schoolId, studentId: payment.studentId, paymentId: id, requestKey: input.requestKey, requestHash: hash,
      reversalReference: `REV-${reversalId.replaceAll('-', '').toUpperCase()}`, reason: input.reason, reversedBy: actor.userId! }).returning();
    await recordFinanceAudit(tx, actor, { action: 'FinancePaymentReversed', resourceId: payment.id, metadata: { studentId: payment.studentId, requestKey: input.requestKey, amountCents: payment.amountCents, reversalId } });
    return reversal;
  });
}
