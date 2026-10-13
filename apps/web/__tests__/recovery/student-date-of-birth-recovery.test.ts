import * as schema from '@school/database';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { assertRecoveryInventory, fingerprintTable, loadForeignKeys } from '@/scripts/recovery/inventory';
import { assertForeignKeyIntegrity, assertIdentityIntegrity, buildRestoreOrder } from '@/scripts/recovery/restore';
import type { QueryClient } from '@/scripts/recovery/snapshot';
import { createAuthTestDb, seedSchool } from '../auth/test-helpers';

it('preserves known/unknown DOB in full-row recovery and fingerprints with the current 45-table inventory', async () => {
  const source = await createAuthTestDb(); const target = await createAuthTestDb();
  try {
    for (const instance of [source, target]) await instance.client.exec('create table auth.identities (id uuid primary key, user_id uuid not null references auth.users(id))');
    const school = await seedSchool(source.seed);
    const [known] = await source.seed.insert(schema.students).values([
      { schoolId: school.id, firstName: 'Known', lastName: 'DOB', dateOfBirth: '2012-02-29' },
      { schoolId: school.id, firstName: 'Legacy', lastName: 'DOB' },
    ]).returning();
    const a = source.client as unknown as QueryClient, b = target.client as unknown as QueryClient;
    await assertRecoveryInventory(a); await assertRecoveryInventory(b);
    const fingerprint = await fingerprintTable(a, 'public.students');
    await source.seed.update(schema.students).set({ dateOfBirth: '2012-02-28' }).where(eq(schema.students.id, known.id));
    expect(await fingerprintTable(a, 'public.students')).not.toEqual(fingerprint);
    await source.seed.update(schema.students).set({ dateOfBirth: '2012-02-29' }).where(eq(schema.students.id, known.id));
    const order = buildRestoreOrder(await loadForeignKeys(a));
    expect(order).toHaveLength(45);
    for (const table of order) {
      const { rows } = await source.client.query<{ record: unknown }>(`select to_jsonb(t) record from ${table} t`);
      if (rows.length) await target.client.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(rows.map((row) => row.record))]);
    }
    expect((await target.client.query('select first_name,date_of_birth::text dob from students order by first_name')).rows).toEqual([
      { first_name: 'Known', dob: '2012-02-29' }, { first_name: 'Legacy', dob: null },
    ]);
    for (const table of order) expect(await fingerprintTable(b, table)).toEqual(await fingerprintTable(a, table));
    await assertIdentityIntegrity(b); await assertForeignKeyIntegrity(b);
  } finally { await source.client.close(); await target.client.close(); }
}, 30_000);
