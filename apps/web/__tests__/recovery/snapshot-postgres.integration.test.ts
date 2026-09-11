import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import { withExportedSnapshot, withSnapshotConsumer } from '@/scripts/recovery/snapshot';

const url = process.env.RECOVERY_TEST_DATABASE_URL;

describe.skipIf(!url)('recovery exported snapshot (real PostgreSQL opt-in)', () => {
  it('keeps dump/fingerprint consumers on the exported state after a concurrent write', async () => {
    const pool = new Pool({ connectionString: url });
    try {
      await pool.query(
        'create unlogged table if not exists recovery_snapshot_probe(id int primary key)',
      );
      await pool.query('truncate recovery_snapshot_probe');
      await pool.query('insert into recovery_snapshot_probe values (1)');
      await withExportedSnapshot(pool, async ({ snapshot }) => {
        await pool.query('insert into recovery_snapshot_probe values (2)');
        const observed = await withSnapshotConsumer(pool, snapshot, (client) =>
          client.query<{ count: number }>(
            'select count(*)::int count from recovery_snapshot_probe',
          ),
        );
        expect(observed.rows[0]?.count).toBe(1);
      });
    } finally {
      await pool.query('drop table if exists recovery_snapshot_probe').catch(() => undefined);
      await pool.end();
    }
  });
});
