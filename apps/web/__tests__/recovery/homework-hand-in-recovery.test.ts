import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { RECOVERY_TABLES } from '@/scripts/recovery/contracts';
import { assertRecoveryInventory, fingerprintTable, loadForeignKeys } from '@/scripts/recovery/inventory';
import { assertForeignKeyIntegrity, assertIdentityIntegrity, buildRestoreOrder } from '@/scripts/recovery/restore';
import type { QueryClient } from '@/scripts/recovery/snapshot';
import { createHomeworkSubmission } from '@/lib/modules/homework/application';
import { uploadSubmissionAttachment } from '@/lib/modules/homework/application/submission-attachments';
import { createAuthTestDb } from '../auth/test-helpers';
import { deliveryFixture } from '../homework/delivery-test-helpers';

it('recovers actual/unknown hand-in and immutable file associations in FK order; R2 bytes remain independent', async () => {
  const source = await deliveryFixture(), target = await createAuthTestDb();
  try {
    await source.test.client.exec('create table auth.identities (id uuid primary key, user_id uuid not null references auth.users(id))');
    await target.client.exec('create table auth.identities (id uuid primary key, user_id uuid not null references auth.users(id))');
    const recorded = await createHomeworkSubmission(source.homeworkDb, source.teacher, source.homework.id, { studentId: source.child.id, actualHandedInAt: '2025-10-10T10:00:00Z' });
    const legacy = await source.student('unknown');
    await createHomeworkSubmission(source.homeworkDb, source.teacher, source.homework.id, { studentId: legacy.id });
    await uploadSubmissionAttachment(source.homeworkDb, { async put() {}, async get() { throw new Error('metadata only'); }, async delete() {} }, source.teacher, recorded.id,
      { requestId: randomUUID(), name: 'work.pdf', mediaType: 'application/pdf', bytes: Buffer.from('%PDF-1.7 fixture') });
    const a = source.test.client as unknown as QueryClient, b = target.client as unknown as QueryClient;
    await assertRecoveryInventory(a); await assertRecoveryInventory(b);
    const original = await fingerprintTable(a, 'public.homework_submissions');
    await source.test.client.query("update homework_submissions set actual_handed_in_at='2025-10-09T10:00:00Z' where id=$1", [recorded.id]);
    expect(await fingerprintTable(a, 'public.homework_submissions')).not.toEqual(original);
    await source.test.client.query("update homework_submissions set actual_handed_in_at='2025-10-10T10:00:00Z' where id=$1", [recorded.id]);
    const order = buildRestoreOrder(await loadForeignKeys(a)); expect(order).toHaveLength(60);
    expect(order.indexOf('public.homework_submission_attachments')).toBeGreaterThan(order.indexOf('public.homework_submissions'));
    expect(order.indexOf('public.homework_submission_attachments')).toBeGreaterThan(order.indexOf('public.files'));
    for (const table of order) {
      expect(RECOVERY_TABLES).toContain(table);
      const { rows } = await source.test.client.query<{ record: unknown }>(`select to_jsonb(t) record from ${table} t`);
      if (rows.length) await target.client.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(rows.map((row) => row.record))]);
    }
    for (const table of order) expect(await fingerprintTable(b, table)).toEqual(await fingerprintTable(a, table));
    expect((await target.client.query('select count(*)::int count from homework_submissions where actual_handed_in_at is null')).rows).toEqual([{ count: 1 }]);
    expect((await target.client.query('select count(*)::int count from homework_submission_attachments')).rows).toEqual([{ count: 1 }]);
    await assertIdentityIntegrity(b); await assertForeignKeyIntegrity(b);
  } finally { await source.test.client.close(); await target.client.close(); }
}, 30_000);
