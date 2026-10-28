// @vitest-environment node
import { expect, it } from 'vitest';
import { applicationSecurityAuditSql } from '@school/database/security';
import { sessionFixture } from '../attendance/session-fixture';
import { createAuthTestDb } from '../auth/test-helpers';
import { mutateSchoolHoliday, schoolHolidaysOnDate } from '@/lib/modules/school-holidays/service';
import type { TimetableDb } from '@/lib/modules/timetable/application/service';
import { assertRecoveryInventory, fingerprintTable, loadForeignKeys } from '@/scripts/recovery/inventory';
import { buildRestoreOrder, assertForeignKeyIntegrity, assertIdentityIntegrity } from '@/scripts/recovery/restore';
import { compareFingerprints } from '@/scripts/recovery/manifest';
import type { QueryClient } from '@/scripts/recovery/snapshot';

it('replays active and removed holidays, revisions and immutable audits with all 60 full-row fingerprints', async () => {
  const source = await sessionFixture(), target = await createAuthTestDb();
  try {
    for (const client of [source.test.client, target.client]) await client.exec('create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));create role anon;create role authenticated;create role service_role');
    const db = source.test.seed as unknown as TimetableDb;
    const fields = { name: 'Closure', type: 'SCHOOL_HOLIDAY' as const, startDate: '2025-12-25', endDate: '2026-01-03', description: 'Across year boundary' };
    const removed = await mutateSchoolHoliday(db, source.admin, 'create', fields);
    await mutateSchoolHoliday(db, source.admin, 'update', { ...fields, name: 'Revised closure', expectedRevision: 1 }, removed.id);
    await mutateSchoolHoliday(db, source.admin, 'remove', { expectedRevision: 2, confirmed: true }, removed.id);
    await mutateSchoolHoliday(db, source.admin, 'create', { ...fields, type: 'PUBLIC_HOLIDAY', name: 'Active observance' });
    const a = source.test.client as unknown as QueryClient, b = target.client as unknown as QueryClient;
    await assertRecoveryInventory(a); await assertRecoveryInventory(b);
    const order = buildRestoreOrder(await loadForeignKeys(a)); expect(order).toHaveLength(60);
    const before = await Promise.all(order.map(table => fingerprintTable(a, table)));
    expect(before.find(v => v.table === 'public.school_holidays')?.rowCount).toBe(2);
    for (const table of order) {
      const { rows } = await a.query<{ record: unknown }>(`select to_jsonb(t) record from ${table} t`);
      if (rows.length) await b.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(rows.map(v => v.record))]);
    }
    expect(() => compareFingerprints(before, [])).toThrow();
    compareFingerprints(before, await Promise.all(order.map(table => fingerprintTable(b, table))));
    await assertForeignKeyIntegrity(b); await assertIdentityIntegrity(b);
    expect((await b.query(applicationSecurityAuditSql)).rows).toEqual([]);
    expect(await schoolHolidaysOnDate(target.seed as unknown as TimetableDb, source.schoolId, '2026-01-01')).toMatchObject([{ name: 'Active observance', revision: 1 }]);
    await b.query("update school_holidays set description='altered' where id=$1", [removed.id]);
    const changed = await fingerprintTable(b, 'public.school_holidays'), original = before.find(v => v.table === 'public.school_holidays')!;
    expect(changed.primaryKeySha256).toBe(original.primaryKeySha256);
    expect(() => compareFingerprints([original], [changed])).toThrow();
  } finally { await source.test.client.close(); await target.client.close(); }
}, 30000);
