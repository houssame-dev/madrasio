// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as schema from '@school/database';
import { applicationSecurityAuditSql } from '@school/database/security';
import { seedSchool, seedStudentAndActors } from '../grades/test-helpers';
import { adjustCharge, chargeDetail, generateCharges, previewCharges, saveFeeType, saveStructure, setFinanceCurrency } from '@/lib/modules/finance/application/service';
import { recordPayment, reversePayment } from '@/lib/modules/finance/application/payments';
import { collectionsReport, outstandingReport, studentBalance } from '@/lib/modules/finance/application/reports';
import { paymentDetail } from '@/lib/modules/finance/application/payments';

// Opt-in runner injects only its owned ephemeral loopback port; never DATABASE_URL.
const portText = process.env.FINANCE_LOCAL_PG_PORT;
const appName = 'FINANCE_V1_IMPLEMENT_02';
describe.skipIf(!portText)('real local PostgreSQL: distinct connections and row-lock contention', () => {
  const pool = new Pool({ host: '127.0.0.1', port: Number(portText), database: 'finance_test', user: 'postgres', ssl: false, max: 8, connectionTimeoutMillis: 5000, statement_timeout: 10000, application_name: appName });
  const db = drizzle(pool, { schema });
  let actor: { userId: string; schoolId: string }, studentId: string, id: string;
  const now = new Date('2025-11-01T12:00:00Z');
  beforeAll(async () => {
    if (!/^\d{4,5}$/.test(portText!) || Number(portText) < 1024 || Number(portText) > 65535) throw new Error('Invalid local test port');
    await pool.query(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key,email varchar(255),phone text unique,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;`);
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), '../../database/drizzle/migrations') });
    expect((await pool.query(applicationSecurityAuditSql)).rows).toEqual([]);
    const a = await pool.connect(), b = await pool.connect();
    try { expect((await a.query('select pg_backend_pid() id')).rows[0].id).not.toBe((await b.query('select pg_backend_pid() id')).rows[0].id); }
    finally { a.release(); b.release(); }
  }, 30000);
  beforeEach(async () => {
    // Existing seed helpers use the same Drizzle query API; application service uses the real node-postgres DB directly.
    const seed = db as unknown as Parameters<typeof seedSchool>[0];
    const school = await seedSchool(seed), actors = await seedStudentAndActors(seed, school.schoolId, school.yearId, school.classId);
    actor = { userId: actors.schoolAdminUserId, schoolId: school.schoolId }; studentId = actors.studentId;
    const fee = await saveFeeType(db, actor, { name: 'Tuition' });
    const structure = await saveStructure(db, actor, { academicYearId: school.yearId, feeTypeId: fee.id, amountCents: 10000, cadence: 'MONTHLY', periods: [{ period: '2025-12', dueDate: '2025-12-10' }] });
    const input = { structureId: structure.id, periods: ['2025-12'], studentIds: [studentId] }, preview = await previewCharges(db, actor, input);
    id = (await generateCharges(db, actor, { ...input, previewHash: preview.previewHash, requestKey: randomUUID() })).chargeIds[0];
  });
  afterAll(async () => { await pool.end(); });
  it.each(['currency-first', 'structure-first'] as const)('serializes currency configuration against first structure creation: %s', async order => {
    const seed = db as unknown as Parameters<typeof seedSchool>[0];
    const fresh = await seedSchool(seed), people = await seedStudentAndActors(seed, fresh.schoolId, fresh.yearId, fresh.classId);
    const admin = { schoolId: fresh.schoolId, userId: people.schoolAdminUserId };
    const fee = await saveFeeType(db, admin, { name: 'Tuition' });
    const blocker = await pool.connect(); await blocker.query('BEGIN');
    await blocker.query('select id from schools where id=$1 for update', [fresh.schoolId]);
    const create = () => saveStructure(db, admin, { academicYearId: fresh.yearId, feeTypeId: fee.id, amountCents: 12345, cadence: 'ONCE', periods: [{ period: 'once', dueDate: '2025-12-10' }] });
    const change = () => setFinanceCurrency(db, admin, { currency: 'EUR' });
    const pending = order === 'currency-first' ? Promise.allSettled([change(), create()]) : Promise.allSettled([create(), change()]);
    try { await waitForBlocked(2); } finally { await blocker.query('COMMIT'); blocker.release(); }
    const results = await pending;
    // PostgreSQL may schedule either waiting operation first. Both legal outcomes
    // must leave the School and the immutable structure snapshot identical.
    const schoolRow = (await pool.query('select finance_currency from schools where id=$1', [fresh.schoolId])).rows[0];
    const rows = (await pool.query('select currency,amount_cents from finance_fee_structures where school_id=$1', [fresh.schoolId])).rows;
    expect(rows).toHaveLength(1); expect(rows[0]).toEqual({ currency: schoolRow.finance_currency, amount_cents: 12345 });
    if (schoolRow.finance_currency === 'MAD') expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    else expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });
  const input = (amountCents = 6000) => ({ requestKey: randomUUID(), confirmed: true, studentId, method: 'CASH', amountCents, receivedOn: '2025-11-01', allocations: [{ chargeId: id, amountCents }] });
  const reversal = () => ({ requestKey: randomUUID(), confirmed: true, reason: 'Correct offline record' });
  async function waitForBlocked(minimum: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const count = (await pool.query("select count(*)::int n from pg_stat_activity where datname='finance_test' and application_name=$1 and wait_event_type='Lock'", [appName])).rows[0].n;
      if (count >= minimum) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Expected independent PostgreSQL row-lock waiters were not observed');
  }
  async function contested(work: () => Promise<PromiseSettledResult<unknown>[]>) {
    const blocker = await pool.connect();
    await blocker.query('BEGIN'); await blocker.query('select id from schools where id=$1 for update', [actor.schoolId]);
    const pending = work();
    try { await waitForBlocked(2); } finally { await blocker.query('COMMIT'); blocker.release(); }
    return pending;
  }
  it('commits one payment for simultaneous identical idempotency keys', async () => {
    const body = input(); const results = await contested(() => Promise.allSettled([recordPayment(db, actor, body, now), recordPayment(db, actor, body, now)]));
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    expect((await pool.query('select count(*)::int n from finance_payments where school_id=$1', [actor.schoolId])).rows[0].n).toBe(1);
    expect((await chargeDetail(db, actor, id)).charge.allocatedCents).toBe(6000);
  });
  it('prevents distinct concurrent requests from overpaying', async () => {
    const results = await contested(() => Promise.allSettled([recordPayment(db, actor, input(7000), now), recordPayment(db, actor, input(7000), now)]));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await chargeDetail(db, actor, id)).charge.allocatedCents).toBe(7000);
  });
  it('serializes payment versus reduction and cancellation', async () => {
    const results = await contested(() => Promise.allSettled([recordPayment(db, actor, input(6000), now), adjustCharge(db, actor, id, { requestKey: randomUUID(), kind: 'REDUCTION', amountCents: 5000, reason: 'Approved' }, now)]));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const c = (await chargeDetail(db, actor, id)).charge; expect(c.allocatedCents).toBeLessThanOrEqual(c.originalCents - c.reductionCents);
  });
  it('allows only payment or cancellation to win on a future fully unpaid charge', async () => {
    const results = await contested(() => Promise.allSettled([recordPayment(db, actor, input(6000), now), adjustCharge(db, actor, id, { requestKey: randomUUID(), kind: 'CANCELLATION', reason: 'Not due' }, now)]));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const c = (await chargeDetail(db, actor, id)).charge; expect(c.status === 'CANCELLED' ? c.allocatedCents === 0 : c.allocatedCents === 6000).toBe(true);
  });
  it('restores once for simultaneous reversal requests', async () => {
    const p = await recordPayment(db, actor, input(), now), body = reversal();
    const results = await contested(() => Promise.allSettled([reversePayment(db, actor, p.id, body), reversePayment(db, actor, p.id, body)]));
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    expect((await chargeDetail(db, actor, id)).charge.allocatedCents).toBe(0);
  });
  it('keeps the allocation aggregate consistent when reversal overlaps a new payment', async () => {
    const p = await recordPayment(db, actor, input(), now);
    const results = await contested(() => Promise.allSettled([reversePayment(db, actor, p.id, reversal()), recordPayment(db, actor, input(7000), now)]));
    expect(results[0].status).toBe('fulfilled');
    expect((await chargeDetail(db, actor, id)).charge.allocatedCents).toBe(results[1].status === 'fulfilled' ? 7000 : 0);
  });
  it('rechecks User lifecycle after an independently blocked write is admitted', async () => {
    const blocker = await pool.connect(); await blocker.query('BEGIN'); await blocker.query('select id from schools where id=$1 for update', [actor.schoolId]);
    const pending = recordPayment(db, actor, input(), now).then(() => false, () => true);
    try { await waitForBlocked(1); await pool.query("update users set status='SUSPENDED' where id=$1", [actor.userId]); }
    finally { await blocker.query('COMMIT'); blocker.release(); }
    expect(await pending).toBe(true);
    expect((await pool.query('select count(*)::int n from finance_payments where school_id=$1', [actor.schoolId])).rows[0].n).toBe(0);
  });
  it('completes the native PostgreSQL fee-to-receipt-to-reversal/report/cancellation journey', async () => {
    await adjustCharge(db, actor, id, { requestKey: randomUUID(), kind: 'REDUCTION', amountCents: 2000, reason: 'Approved reduction' }, now);
    const first = await recordPayment(db, actor, input(3000), now);
    expect((await paymentDetail(db, actor, first.id)).allocations[0].amountCents).toBe(3000);
    await recordPayment(db, actor, input(5000), now);
    expect((await studentBalance(db, actor, studentId, 1, now)).summary).toMatchObject({ netCents: 8000, paidCents: 8000, outstandingCents: 0 });
    await reversePayment(db, actor, first.id, reversal());
    const report = await outstandingReport(db, actor, { studentId }, now);
    expect(report.summary).toMatchObject({ netCents: 8000, paidCents: 5000, outstandingCents: 3000 });
    expect((await collectionsReport(db, actor, { from: '2025-11-01', to: '2025-11-01', studentId }, now))).toMatchObject({ grossCents: 8000, reversedCents: 3000, netCents: 5000 });
    const second = (await pool.query('select id from finance_payments where school_id=$1 and id<>$2', [actor.schoolId, first.id])).rows[0].id;
    await reversePayment(db, actor, second, reversal());
    await adjustCharge(db, actor, id, { requestKey: randomUUID(), kind: 'CANCELLATION', reason: 'Cancelled future fee' }, now);
    expect((await studentBalance(db, actor, studentId, 1, now)).summary).toMatchObject({ netCents: 0, paidCents: 0, outstandingCents: 0 });
    expect((await collectionsReport(db, actor, { from: '2025-11-01', to: '2025-11-01', studentId }, now)).netCents).toBe(0);
  });
  it('keeps totals and rows in one snapshot when reversal commits between report statements', async () => {
    const payment = await recordPayment(db, actor, input(6000), now);
    const blocker = await pool.connect(); await blocker.query('BEGIN');
    // The total query reads only charges; the following page query joins Students.
    // Pause that page query, then commit a reversal on an independent connection.
    await blocker.query('LOCK TABLE students IN ACCESS EXCLUSIVE MODE');
    const pending = outstandingReport(db, actor, { studentId }, now);
    try { await waitForBlocked(1); await reversePayment(db, actor, payment.id, reversal()); }
    finally { await blocker.query('COMMIT'); blocker.release(); }
    const snapshot = await pending;
    expect(snapshot.summary.paidCents).toBe(6000); expect(snapshot.items[0].paidCents).toBe(6000);
    const current = await outstandingReport(db, actor, { studentId }, now);
    expect(current.summary.paidCents).toBe(0); expect(current.items[0].paidCents).toBe(0);
  }, 15000);
});
