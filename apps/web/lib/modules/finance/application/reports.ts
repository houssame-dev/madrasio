import 'server-only';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { financePayments as payments, financeReversals as reversals, studentCharges as charges, students, schools, academicYears } from '@school/database';
import { authorize, type FinanceActor, type FinanceDb } from './service';
import { schoolToday } from '../domain/contracts';
import { BusinessRuleViolationError, NotFoundError } from '@/lib/errors';

const uuid = z.string().uuid();
export const outstandingFilters = z.object({ academicYearId: uuid.optional(), classId: uuid.optional(), studentId: uuid.optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export const collectionFilters = z.object({ from: z.string().date(), to: z.string().date(), studentId: uuid.optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict().refine(v => v.from <= v.to, 'Invalid date range.');
type Tx = Parameters<Parameters<FinanceDb['transaction']>[0]>[0];
type Filters = z.infer<typeof outstandingFilters>;
// PostgreSQL aggregates remain exact integers. Never silently round a school total.
export function exactCents(value: string | number) {
  const n = BigInt(value);
  if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new BusinessRuleViolationError('Report total exceeds supported range.');
  return Number(n);
}
const net = sql`${charges.originalCents}-${charges.reductionCents}`;
const remaining = sql`${charges.originalCents}-${charges.reductionCents}-${charges.allocatedCents}`;
function scope(actor: FinanceActor, f: Filters) {
  return and(eq(charges.schoolId, actor.schoolId), eq(charges.status, 'OPEN'), f.academicYearId ? eq(charges.academicYearId, f.academicYearId) : undefined,
    f.classId ? eq(charges.classId, f.classId) : undefined, f.studentId ? eq(charges.studentId, f.studentId) : undefined);
}
function sums(today: string) {
  // DATE subtraction counts calendar days, independent of DST and process timezone.
  const age = sql`${today}::date-${charges.dueDate}`;
  return {
    net: sql<string>`coalesce(sum(${net}),0)::text`, paid: sql<string>`coalesce(sum(${charges.allocatedCents}),0)::text`, outstanding: sql<string>`coalesce(sum(${remaining}),0)::text`,
    notOverdue: sql<string>`coalesce(sum(case when ${age}<=0 then ${remaining} else 0 end),0)::text`,
    days1to30: sql<string>`coalesce(sum(case when ${age} between 1 and 30 then ${remaining} else 0 end),0)::text`,
    days31to60: sql<string>`coalesce(sum(case when ${age} between 31 and 60 then ${remaining} else 0 end),0)::text`,
    days61plus: sql<string>`coalesce(sum(case when ${age}>=61 then ${remaining} else 0 end),0)::text`,
  };
}
function amounts(row: { net: string; paid: string; outstanding: string; notOverdue: string; days1to30: string; days31to60: string; days61plus: string }) {
  return { netCents: exactCents(row.net), paidCents: exactCents(row.paid), outstandingCents: exactCents(row.outstanding), notOverdueCents: exactCents(row.notOverdue), days1to30Cents: exactCents(row.days1to30), days31to60Cents: exactCents(row.days31to60), days61plusCents: exactCents(row.days61plus) };
}
async function reportDate(tx: Tx, actor: FinanceActor, now: Date) {
  await authorize(tx, actor);
  const [school] = await tx.select({ currency: schools.financeCurrency, timezone: schools.timezone }).from(schools).where(eq(schools.id, actor.schoolId));
  return { currency: school.currency, today: schoolToday(school.timezone, now), timezone: school.timezone };
}
// All statements share one MVCC snapshot: a concurrent reversal cannot split totals and rows.
export async function outstandingReport(db: FinanceDb, actor: FinanceActor, raw: unknown, now = new Date(), exporting = false) {
  const f = outstandingFilters.parse(raw);
  return db.transaction(async tx => {
    const { today, timezone, currency } = await reportDate(tx, actor, now); const where = scope(actor, f);
    const [total] = await tx.select({ ...sums(today), students: sql<number>`count(distinct ${charges.studentId})::int`, overdueStudents: sql<number>`count(distinct case when ${charges.dueDate}<${today}::date and ${remaining}>0 then ${charges.studentId} end)::int` }).from(charges).where(where);
    if (exporting && total.students > 10000) throw new BusinessRuleViolationError('Export exceeds 10000 students. Narrow the filters.');
    const rows = await tx.select({ studentId: charges.studentId, firstName: students.firstName, lastName: students.lastName, ...sums(today) }).from(charges)
      .innerJoin(students, and(eq(students.schoolId, charges.schoolId), eq(students.id, charges.studentId))).where(where)
      .groupBy(charges.studentId, students.firstName, students.lastName).orderBy(asc(students.lastName), asc(students.firstName), asc(charges.studentId)).limit(exporting ? 10000 : 50).offset(exporting ? 0 : (f.page - 1) * 50);
    return { today, timezone, currency, summary: { ...amounts(total), students: total.students, overdueStudents: total.overdueStudents }, items: rows.map(row => ({ studentId: row.studentId, studentName: `${row.firstName} ${row.lastName}`, ...amounts(row) })), page: f.page };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
export async function collectionsReport(db: FinanceDb, actor: FinanceActor, raw: unknown, now = new Date(), exporting = false) {
  const f = collectionFilters.parse(raw);
  return db.transaction(async tx => {
    const { today, timezone, currency } = await reportDate(tx, actor, now);
    const where = and(eq(payments.schoolId, actor.schoolId), gte(payments.receivedOn, f.from), lte(payments.receivedOn, f.to), f.studentId ? eq(payments.studentId, f.studentId) : undefined);
    // One reversal per payment; no allocation join and therefore no multiplied payment totals.
    const active = sql`${reversals.id} is null`;
    const [total] = await tx.select({ count: sql<number>`count(*)::int`, gross: sql<string>`coalesce(sum(${payments.amountCents}),0)::text`,
      reversed: sql<string>`coalesce(sum(case when not (${active}) then ${payments.amountCents} else 0 end),0)::text`,
      cash: sql<string>`coalesce(sum(case when ${active} and ${payments.method}='CASH' then ${payments.amountCents} else 0 end),0)::text`,
      bank: sql<string>`coalesce(sum(case when ${active} and ${payments.method}='BANK_TRANSFER' then ${payments.amountCents} else 0 end),0)::text`,
      cheque: sql<string>`coalesce(sum(case when ${active} and ${payments.method}='CHEQUE' then ${payments.amountCents} else 0 end),0)::text`,
    }).from(payments).leftJoin(reversals, and(eq(reversals.schoolId, payments.schoolId), eq(reversals.paymentId, payments.id))).where(where);
    if (exporting && total.count > 10000) throw new BusinessRuleViolationError('Export exceeds 10000 payments. Narrow the filters.');
    const items = await tx.select({ currency: payments.currency, id: payments.id, studentId: payments.studentId, studentName: payments.studentName, receivedOn: payments.receivedOn, method: payments.method, amountCents: payments.amountCents, receiptReference: payments.receiptReference,
      reversalReference: reversals.reversalReference, reversedAt: reversals.reversedAt }).from(payments).leftJoin(reversals, and(eq(reversals.schoolId, payments.schoolId), eq(reversals.paymentId, payments.id))).where(where)
      .orderBy(desc(payments.receivedOn), asc(payments.id)).limit(exporting ? 10000 : 50).offset(exporting ? 0 : (f.page - 1) * 50);
    const cashCents = exactCents(total.cash), bankCents = exactCents(total.bank), chequeCents = exactCents(total.cheque);
    return { today, timezone, currency, from: f.from, to: f.to, total: total.count, page: f.page, grossCents: exactCents(total.gross), reversedCents: exactCents(total.reversed), netCents: exactCents(total.gross) - exactCents(total.reversed), cashCents, bankCents, chequeCents, items };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
export async function studentBalance(db: FinanceDb, actor: FinanceActor, studentId: string, page = 1, now = new Date()) {
  uuid.parse(studentId); z.number().int().min(1).max(100000).parse(page);
  return db.transaction(async tx => {
    const { today, timezone, currency } = await reportDate(tx, actor, now);
    const [student] = await tx.select({ id: students.id, firstName: students.firstName, lastName: students.lastName }).from(students).where(and(eq(students.schoolId, actor.schoolId), eq(students.id, studentId)));
    if (!student) throw new NotFoundError();
    const [totals] = await tx.select(sums(today)).from(charges).where(scope(actor, { studentId, page: 1 }));
    const [valid] = await tx.select({ total: sql<string>`coalesce(sum(${payments.amountCents}),0)::text` }).from(payments).leftJoin(reversals, and(eq(reversals.schoolId, payments.schoolId), eq(reversals.paymentId, payments.id)))
      .where(and(eq(payments.schoolId, actor.schoolId), eq(payments.studentId, studentId), sql`${reversals.id} is null`));
    const where = and(eq(charges.schoolId, actor.schoolId), eq(charges.studentId, studentId));
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(charges).where(where);
    const items = await tx.select({ charge: charges, academicYear: academicYears.name }).from(charges).innerJoin(academicYears, and(eq(academicYears.schoolId, charges.schoolId), eq(academicYears.id, charges.academicYearId)))
      .where(where).orderBy(asc(charges.dueDate), asc(charges.id)).limit(50).offset((page - 1) * 50);
    return { today, timezone, currency, student, summary: amounts(totals), validPaymentsCents: exactCents(valid.total), items, total: count.n, page };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
