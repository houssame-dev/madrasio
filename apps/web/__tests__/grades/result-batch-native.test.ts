// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as s from '@school/database';
import { createGradesTestDb, seedStudentAndActors, type GradesTestDb } from './test-helpers';
import { seedBatchScenario } from './batch-test-helpers';
import {
  executeResultBatch,
  previewResultBatch,
} from '@/lib/modules/grades/application/result-batch';
import {
  assertRecoveryInventory,
  loadForeignKeys,
  fingerprintTable,
} from '@/scripts/recovery/inventory';
import { buildRestoreOrder } from '@/scripts/recovery/restore';
import type { QualifiedTable } from '@/scripts/recovery/inventory';
import type { QueryClient } from '@/scripts/recovery/snapshot';
const port = process.env.GRADES_LOCAL_PG_PORT;
describe.skipIf(!port)('native PostgreSQL Result batch serialization and recovery', () => {
  const pool = new Pool({
    host: '127.0.0.1',
    port: Number(port),
    database: 'grades_test',
    user: 'postgres',
    ssl: false,
    max: 6,
    options: '-c timezone=UTC',
    connectionTimeoutMillis: 5000,
    statement_timeout: 20000,
  });
  const db = drizzle(pool, { schema: s });
  let source: GradesTestDb;
  let f: Awaited<ReturnType<typeof seedBatchScenario>>;
  let order: QualifiedTable[];
  beforeAll(async () => {
    if (!/^\d{4,5}$/.test(port!) || Number(port) < 1024 || Number(port) > 65535)
      throw Error('Invalid owned local port');
    expect(
      (await pool.query('select current_database() name,version() version')).rows[0],
    ).toMatchObject({ name: 'grades_test', version: expect.stringContaining('17.6') });
    expect(
      (await pool.query("select tablename from pg_tables where schemaname='public'")).rows,
    ).toEqual([]);
    await pool.query(
      'create schema auth;create table auth.users(id uuid primary key,email varchar(255),phone text unique,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz);create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));create role anon;create role authenticated;create role service_role;',
    );
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), '../../database/drizzle/migrations'),
    });
    source = await createGradesTestDb();
    await source.client.exec(
      "set time zone 'UTC';create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));",
    );
    f = await seedBatchScenario(source);
    await seedStudentAndActors(source.seed, f.school.schoolId, f.school.yearId, f.school.classId);
    const reader = source.client as unknown as QueryClient;
    await assertRecoveryInventory(reader);
    order = buildRestoreOrder(await loadForeignKeys(reader));
    expect(order).toHaveLength(59);
    for (const table of order) {
      const rows = (
        await reader.query<{ row: unknown }>(`select to_jsonb(t) row from ${table} t`)
      ).rows.map((r) => r.row);
      if (rows.length)
        await pool.query(
          `insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,
          [JSON.stringify(rows)],
        );
    }
    for (const table of order)
      expect(await fingerprintTable(pool, table)).toEqual(await fingerprintTable(reader, table));
  }, 60000);
  afterAll(async () => {
    await source?.client.close();
    await pool.end();
  });
  it('commits successful entries atomically while reporting incomplete students without writing fabricated results', async () => {
    const preview = await previewResultBatch(db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      page: 1,
    });
    const result = await executeResultBatch(db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      confirm: true,
      entries: preview.data.map((r) => ({
        studentId: r.student.id,
        resultId: r.result?.id ?? null,
        expectedToken: r.expectedToken,
      })),
    });
    expect(result.outcomes.map((o) => o.status).sort()).toEqual(['COMPLETED', 'INCOMPLETE']);
    expect((await pool.query('select status,value from subject_results')).rows).toEqual([
      { status: 'CALCULATED', value: '17.00' },
    ]);
    expect((await pool.query('select * from result_publications')).rowCount).toBe(0);
  });
  it('serializes competing finalizations and refuses stale subsequent calculation', async () => {
    const preview = await previewResultBatch(db, f.actor, {
      scope: f.scope,
      operation: 'FINALIZE',
      page: 1,
    });
    const row = preview.data.find((r) => r.result)!;
    const command = {
      scope: f.scope,
      operation: 'FINALIZE' as const,
      confirm: true as const,
      entries: [
        { studentId: row.student.id, resultId: row.result!.id, expectedToken: row.expectedToken },
      ],
    };
    const results = await Promise.all([
      executeResultBatch(db, f.actor, command),
      executeResultBatch(db, f.actor, command),
    ]);
    expect(results.flatMap((r) => r.outcomes).filter((o) => o.status === 'COMPLETED')).toHaveLength(
      1,
    );
    expect(results.flatMap((r) => r.outcomes).filter((o) => o.status === 'CONFLICT')).toHaveLength(
      1,
    );
    const latest = await previewResultBatch(db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      page: 1,
    });
    const frozen = latest.data.find((r) => r.result)!;
    const denied = await executeResultBatch(db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      confirm: true,
      entries: [
        {
          studentId: frozen.student.id,
          resultId: frozen.result!.id,
          expectedToken: frozen.expectedToken,
        },
      ],
    });
    expect(denied.outcomes[0].code).toBe('RESULT_ALREADY_FINALIZED');
  });
  it('keeps concurrent same-intent publications replayable with exactly one immutable snapshot and frozen-recipient Outbox event', async () => {
    const preview = await previewResultBatch(db, f.actor, {
      scope: f.scope,
      operation: 'PUBLISH',
      page: 1,
    });
    const row = preview.data.find((r) => r.result)!;
    const command = {
      scope: f.scope,
      operation: 'PUBLISH' as const,
      confirm: true as const,
      entries: [
        {
          studentId: row.student.id,
          resultId: row.result!.id,
          expectedToken: row.expectedToken,
          idempotencyKey: randomUUID(),
        },
      ],
    };
    const results = await Promise.all([
      executeResultBatch(db, f.actor, command),
      executeResultBatch(db, f.actor, command),
    ]);
    expect(results.some((r) => r.outcomes[0].status === 'COMPLETED')).toBe(true);
    const replay = await executeResultBatch(db, f.actor, command);
    expect(replay.outcomes[0]).toMatchObject({ status: 'COMPLETED', code: 'REPLAYED' });
    const pubs = await pool.query(
      'select publication_version,result_value from result_publications',
    );
    expect(pubs.rows).toEqual([{ publication_version: 1, result_value: '17.00' }]);
    const events = await pool.query('select payload from outbox_events');
    expect(events.rowCount).toBe(1);
    expect(events.rows[0].payload.recipientUserIds).toContain(f.actors.parentUserId);
    await assertRecoveryInventory(pool);
    for (const table of order) expect(await fingerprintTable(pool, table)).toBeDefined();
  });
});
