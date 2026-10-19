// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { applicationSecurityAuditSql } from '@school/database/security';
import { APPLICATION_TABLES, RECOVERY_TABLES } from '@/scripts/recovery/contracts';
import { assertRecoveryInventory, fingerprintTable, loadForeignKeys, loadStatusAggregates } from '@/scripts/recovery/inventory';
import { assertForeignKeyIntegrity, assertIdentityIntegrity, buildRestoreOrder } from '@/scripts/recovery/restore';
import { compareFingerprints } from '@/scripts/recovery/manifest';
import { pgDumpArguments, assertArchiveInventory } from '@/scripts/recovery/tools';
import type { QueryClient } from '@/scripts/recovery/snapshot';
import { adjustCharge, generateCharges, previewCharges, saveFeeType, saveStructure, type FinanceDb } from '@/lib/modules/finance/application/service';
import { recordPayment, reversePayment } from '@/lib/modules/finance/application/payments';
import { studentBalance, collectionsReport } from '@/lib/modules/finance/application/reports';
import { createGradesTestDb, seedSchool, seedStudentAndActors } from '../grades/test-helpers';

const finance = ['finance_charge_events', 'finance_fee_structures', 'finance_fee_types', 'finance_generation_batches', 'finance_payment_allocations', 'finance_payment_reversals', 'finance_payments', 'finance_student_charges'];
it('backs up and replays the entire Finance history in FK order, rejects drift and detects altered full rows', async () => {
  const source = await createGradesTestDb(), target = await createGradesTestDb();
  try {
    for (const instance of [source, target]) await instance.client.exec('create table auth.identities (id uuid primary key, user_id uuid not null references auth.users(id), provider text not null); create role anon; create role authenticated; create role service_role');
    const school = await seedSchool(source.seed), actors = await seedStudentAndActors(source.seed, school.schoolId, school.yearId, school.classId);
    const db = source.seed as unknown as FinanceDb, actor = { userId: actors.schoolAdminUserId, schoolId: school.schoolId }, now = new Date('2025-11-01T12:00:00Z');
    const fee = await saveFeeType(db, actor, { name: 'Tuition' });
    const structure = await saveStructure(db, actor, { feeTypeId: fee.id, academicYearId: school.yearId, cadence: 'MONTHLY', amountCents: 10000, periods: [{ period: '2025-11', dueDate: '2025-11-10' }, { period: '2025-12', dueDate: '2025-12-10' }, { period: '2026-01', dueDate: '2026-01-10' }] });
    const input = { structureId: structure.id, studentIds: [actors.studentId], periods: structure.periods.map(p => p.period) }, preview = await previewCharges(db, actor, input);
    const ids = (await generateCharges(db, actor, { ...input, previewHash: preview.previewHash, requestKey: randomUUID() })).chargeIds;
    await adjustCharge(db, actor, ids[0], { kind: 'REDUCTION', amountCents: 1000, reason: 'Approved reduction', requestKey: randomUUID() }, now);
    const payment = await recordPayment(db, actor, { requestKey: randomUUID(), confirmed: true, studentId: actors.studentId, method: 'BANK_TRANSFER', amountCents: 4000, receivedOn: '2025-11-01', allocations: [{ chargeId: ids[0], amountCents: 3000 }, { chargeId: ids[1], amountCents: 1000 }] }, now);
    await reversePayment(db, actor, payment.id, { requestKey: randomUUID(), confirmed: true, reason: 'Correct paper record' });
    await recordPayment(db, actor, { requestKey: randomUUID(), confirmed: true, studentId: actors.studentId, method: 'CASH', amountCents: 2500, receivedOn: '2025-11-01', allocations: [{ chargeId: ids[0], amountCents: 2500 }] }, now);
    await adjustCharge(db, actor, ids[2], { kind: 'CANCELLATION', reason: 'Future service cancelled', requestKey: randomUUID() }, now);
    await source.client.exec("insert into auth.identities select gen_random_uuid(),id,'email' from auth.users");
    const a = source.client as unknown as QueryClient, b = target.client as unknown as QueryClient;
    expect(APPLICATION_TABLES.filter(table => table.startsWith('finance_'))).toEqual(finance);
    expect(APPLICATION_TABLES).toHaveLength(57); expect([...APPLICATION_TABLES]).toEqual([...APPLICATION_TABLES].sort());
    await assertRecoveryInventory(a); await assertRecoveryInventory(b);
    const order = buildRestoreOrder(await loadForeignKeys(a)); expect(order).toHaveLength(59);
    expect(order.indexOf('public.finance_student_charges')).toBeGreaterThan(order.indexOf('public.finance_generation_batches'));
    expect(order.indexOf('public.finance_payment_allocations')).toBeGreaterThan(order.indexOf('public.finance_student_charges'));
    expect(order.indexOf('public.finance_payment_allocations')).toBeGreaterThan(order.indexOf('public.finance_payments'));
    expect(order.indexOf('public.finance_payment_reversals')).toBeGreaterThan(order.indexOf('public.finance_payments'));
    const before = await Promise.all(order.map(table => fingerprintTable(a, table)));
    for (const name of finance) expect(before.find(f => f.table === `public.${name}`)?.rowCount).toBeGreaterThan(0);
    expect((await loadStatusAggregates(a))['public.finance_student_charges']).toEqual({ CANCELLED: 1, OPEN: 2 });
    const dumpArgs = pgDumpArguments('recovery-data.dump', '00000001-00000002-1');
    for (const name of finance) expect(dumpArgs).toContain(`public.${name}`);
    const listing = RECOVERY_TABLES.map((table, i) => `${i}; 0 0 TABLE DATA ${table.replace('.', ' ')} postgres`).join('\n');
    expect(() => assertArchiveInventory(listing)).not.toThrow();
    expect(() => assertArchiveInventory(listing + '\n100; 0 0 TABLE DATA public.unreviewed postgres')).toThrow();
    expect(() => assertArchiveInventory(listing.split('\n').filter(line => !line.includes('finance_payments ')).join('\n'))).toThrow();
    for (const table of order) {
      const { rows } = await source.client.query<{ record: unknown }>(`select to_jsonb(t) record from ${table} t`);
      if (rows.length) await target.client.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(rows.map(row => row.record))]);
    }
    const restored = await Promise.all(order.map(table => fingerprintTable(b, table)));
    expect(() => compareFingerprints(before, restored)).not.toThrow();
    expect(await loadStatusAggregates(b)).toEqual(await loadStatusAggregates(a));
    await assertIdentityIntegrity(b); await assertForeignKeyIntegrity(b);
    expect((await target.client.query(applicationSecurityAuditSql)).rows).toEqual([]);
    const restoredDb = target.seed as unknown as FinanceDb;
    expect((await studentBalance(restoredDb, actor, actors.studentId, 1, now)).summary).toMatchObject({ netCents: 19000, paidCents: 2500, outstandingCents: 16500 });
    expect((await collectionsReport(restoredDb, actor, { from: '2025-11-01', to: '2025-11-01' }, now))).toMatchObject({ grossCents: 6500, reversedCents: 4000, netCents: 2500 });
    const changes: Record<string, string> = { finance_charge_events: "reason=reason||' changed'", finance_fee_structures: 'amount_cents=amount_cents+1', finance_fee_types: "name=name||' changed'", finance_generation_batches: "result=result||'{\"altered\":true}'::jsonb", finance_payment_allocations: "fee_name=fee_name||' changed'", finance_payment_reversals: "reason=reason||' changed'", finance_payments: "reference='changed'", finance_student_charges: "fee_name=fee_name||' changed'" };
    for (const name of finance) {
      await target.client.exec('begin');
      try {
        await target.client.exec(`update public.${name} set ${changes[name]}`);
        const original = before.find(f => f.table === `public.${name}`)!; const changed = await fingerprintTable(b, `public.${name}`);
        expect(changed.primaryKeySha256).toBe(original.primaryKeySha256); expect(changed.contentSha256).not.toBe(original.contentSha256);
        expect(() => compareFingerprints([original], [changed])).toThrow();
      } finally { await target.client.exec('rollback'); }
    }
    await target.client.exec('begin');
    try {
      await target.client.exec('update finance_payment_reversals set id=gen_random_uuid()');
      const original = before.find(f => f.table === 'public.finance_payment_reversals')!;
      const changed = await fingerprintTable(b, 'public.finance_payment_reversals');
      expect(changed.primaryKeySha256).not.toBe(original.primaryKeySha256);
      expect(() => compareFingerprints([original], [changed])).toThrow();
    } finally { await target.client.exec('rollback'); }
    await target.client.exec('create table public.unreviewed(id uuid primary key)');
    await expect(assertRecoveryInventory(b)).rejects.toMatchObject({ code: 'BACKUP_INVENTORY_VALIDATION_FAILED' });
    await target.client.exec('drop table public.unreviewed; drop table public.finance_payment_reversals');
    await expect(assertRecoveryInventory(b)).rejects.toMatchObject({ code: 'BACKUP_INVENTORY_VALIDATION_FAILED' });
  } finally { await source.client.close(); await target.client.close(); }
}, 30000);
