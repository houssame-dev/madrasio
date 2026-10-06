import { expect, it } from 'vitest';
import { createAuthTestDb, seedMembership, seedSchool, seedUser } from '../auth/test-helpers';
import * as academic from '@/lib/modules/academic-structure/application';
import type { AcademicStructureDb } from '@/lib/modules/academic-structure/infrastructure/repositories/academic-structure-repository';
import { RECOVERY_TABLES } from '@/scripts/recovery/contracts';
import {
  assertRecoveryInventory,
  fingerprintTable,
  loadForeignKeys,
} from '@/scripts/recovery/inventory';
import {
  assertForeignKeyIntegrity,
  assertIdentityIntegrity,
  buildRestoreOrder,
} from '@/scripts/recovery/restore';
import type { QueryClient } from '@/scripts/recovery/snapshot';

it('replays nonempty audit history in recovery FK order and preserves all 42 fingerprints', async () => {
  const source = await createAuthTestDb();
  const target = await createAuthTestDb();
  try {
    // Minimal test-owned Auth foundation, not an application migration.
    for (const instance of [source, target])
      await instance.client.exec(
        'create table auth.identities (id uuid primary key, user_id uuid not null references auth.users(id))',
      );
    const sourceClient = source.client as unknown as QueryClient;
    const targetClient = target.client as unknown as QueryClient;
    const school = await seedSchool(source.seed);
    const userId = await seedUser(source.seed);
    await seedMembership(source.seed, userId, school.id, 'SCHOOL_ADMIN');
    await source.client.query('insert into auth.identities values ($1,$1)', [userId]);
    const actor = { userId, schoolId: school.id };
    const db = source.seed as unknown as AcademicStructureDb;
    const curriculum = await academic.createCurriculum(db, actor, { name: 'Recovery curriculum' });
    const version = await academic.createCurriculumVersion(db, actor, curriculum.id, {
      name: 'V1',
    });
    await academic.patchCurriculumVersion(db, actor, version.id, { status: 'ACTIVE' });
    await assertRecoveryInventory(sourceClient);
    await assertRecoveryInventory(targetClient);
    const order = buildRestoreOrder(await loadForeignKeys(sourceClient));
    expect(order).toHaveLength(42);
    for (const dependency of ['public.users', 'public.schools', 'public.school_memberships']) {
      expect(order.indexOf('public.audit_events')).toBeGreaterThan(
        order.indexOf(dependency as (typeof order)[number]),
      );
    }
    expect((await fingerprintTable(sourceClient, 'public.audit_events')).rowCount).toBe(1);
    // This is a hermetic row replay, not a claim of pg_dump/age execution.
    for (const table of order) {
      expect(RECOVERY_TABLES).toContain(table);
      const rows = await source.client.query<{ record: unknown }>(
        `select to_jsonb(t) record from ${table} t`,
      );
      if (rows.rows.length)
        await target.client.query(
          `insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,
          [JSON.stringify(rows.rows.map((row) => row.record))],
        );
    }
    for (const table of order)
      expect(await fingerprintTable(targetClient, table)).toEqual(
        await fingerprintTable(sourceClient, table),
      );
    await assertIdentityIntegrity(targetClient);
    await assertForeignKeyIntegrity(targetClient);
  } finally {
    await source.client.close();
    await target.client.close();
  }
}, 30_000);
