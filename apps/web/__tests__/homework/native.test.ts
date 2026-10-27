// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as schema from '@school/database';
import * as app from '@/lib/modules/homework/application';
import * as files from '@/lib/modules/homework/application/submission-attachments';
import { deliveryFixture, type DeliveryFixture } from './delivery-test-helpers';
import { createActor, seedParentRelationship } from '../students/test-helpers';
import {
  assertRecoveryInventory,
  fingerprintTable,
  loadForeignKeys,
  type QualifiedTable,
} from '@/scripts/recovery/inventory';
import { buildRestoreOrder } from '@/scripts/recovery/restore';
import type { QueryClient } from '@/scripts/recovery/snapshot';
const port = process.env.HOMEWORK_LOCAL_PG_PORT;
describe.skipIf(!port)('native PostgreSQL Homework serialization and private metadata', () => {
  const pool = new Pool({
    host: '127.0.0.1',
    port: Number(port),
    database: 'homework_test',
    user: 'postgres',
    ssl: false,
    max: 6,
    options: '-c timezone=UTC',
    connectionTimeoutMillis: 5000,
    statement_timeout: 20000,
  });
  const db = drizzle(pool, { schema });
  let source: DeliveryFixture,
    order: QualifiedTable[],
    submissionId: string,
    parent: Awaited<ReturnType<typeof createActor>>;
  beforeAll(async () => {
    if (!/^\d{4,5}$/.test(port!) || Number(port) < 1024 || Number(port) > 65535)
      throw Error('Invalid owned loopback port');
    expect(
      (await pool.query('select current_database() name,version() version')).rows[0],
    ).toMatchObject({ name: 'homework_test', version: expect.stringContaining('17.6') });
    expect(
      (await pool.query("select tablename from pg_tables where schemaname='public'")).rows,
    ).toEqual([]);
    await pool.query(
      'create schema auth;create table auth.users(id uuid primary key,email varchar(255),phone text unique,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz);create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));create role anon;create role authenticated;create role service_role;',
    );
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), '../../database/drizzle/migrations'),
    });
    source = await deliveryFixture();
    parent = await createActor(source.test, source.schoolId, 'PARENT');
    await seedParentRelationship(source, parent, source.child.id);
    await source.test.client.exec(
      "set time zone 'UTC';create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));",
    );
    const reader = source.test.client as unknown as QueryClient;
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
    await source?.test.client.close();
    await pool.end();
  });
  it('serializes duplicate hand-ins and preserves immutable publication with server-owned timing', async () => {
    const command = { studentId: source.child.id, actualHandedInAt: null };
    const results = await Promise.allSettled([
      app.createHomeworkSubmission(db, source.teacher, source.homework.id, command),
      app.createHomeworkSubmission(db, source.teacher, source.homework.id, command),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((x) => x.status === 'rejected')).toHaveLength(1);
    const row = (await pool.query('select * from homework_submissions')).rows[0];
    submissionId = row.id;
    expect(row.actual_handed_in_at).toBeNull();
    expect(row.status).toBe('LATE');
    await expect(
      app.patchHomework(db, source.teacher, source.homework.id, { title: 'Changed' }),
    ).rejects.toBeDefined();
    await expect(
      app.addHomeworkTargets(db, source.teacher, source.homework.id, {
        classIds: [source.classBId],
      }),
    ).rejects.toBeDefined();
  });
  it('blocks review during uploading, replays READY privately and preserves one submission across return/resubmission', async () => {
    let start!: () => void, release!: () => void;
    const started = new Promise<void>((r) => (start = r)),
      gate = new Promise<void>((r) => (release = r));
    const bytes = Buffer.from('%PDF-1.7 safe local fixture');
    const store = {
      put: vi.fn(async () => {
        start();
        await gate;
      }),
      get: vi.fn(async () => bytes),
      delete: vi.fn(async () => {}),
    };
    const input = {
      requestId: randomUUID(),
      name: 'work.pdf',
      mediaType: 'application/pdf',
      bytes,
    };
    const upload = files.uploadSubmissionAttachment(db, store, source.teacher, submissionId, input);
    await started;
    await expect(
      app.reviewHomeworkSubmission(db, source.teacher, submissionId, { status: 'REVIEWED' }),
    ).rejects.toBeDefined();
    release();
    const ready = await upload;
    expect(ready.state).toBe('READY');
    expect(
      await files.uploadSubmissionAttachment(db, store, source.teacher, submissionId, input),
    ).toEqual(ready);
    expect(store.put).toHaveBeenCalledTimes(1);
    const before = await app.getHomeworkSubmission(db, source.teacher, submissionId);
    await app.reviewHomeworkSubmission(db, source.teacher, submissionId, { status: 'REVIEWED' });
    await app.reviewHomeworkSubmission(db, source.teacher, submissionId, { status: 'RETURNED' });
    const after = await app.patchHomeworkSubmission(db, source.teacher, submissionId, {
      content: 'Revised',
      actualHandedInAt: null,
    });
    expect(after.id).toBe(before.id);
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after.actualHandedInAt).toBeNull();
    expect(
      (await files.listSubmissionAttachments(db, parent, submissionId))[0].submissionRecordedAt,
    ).toEqual(ready.submissionRecordedAt);
    await expect(
      files.uploadSubmissionAttachment(db, store, parent, submissionId, {
        ...input,
        requestId: randomUUID(),
      }),
    ).rejects.toBeDefined();
    await pool.query("update parent_students set status='ENDED' where student_id=$1", [
      source.child.id,
    ]);
    await expect(files.listSubmissionAttachments(db, parent, submissionId)).rejects.toBeDefined();
    await app.patchHomework(db, source.teacher, source.homework.id, { status: 'CLOSED' });
    await app.reviewHomeworkSubmission(db, source.teacher, submissionId, { status: 'REVIEWED' });
    await app.reviewHomeworkSubmission(db, source.teacher, submissionId, { status: 'RETURNED' });
    await expect(
      app.patchHomeworkSubmission(db, source.teacher, submissionId, { content: 'No reopen' }),
    ).rejects.toBeDefined();
    const changed = new Set([
      'public.homework',
      'public.homework_submissions',
      'public.homework_submission_attachments',
      'public.files',
      'public.audit_events',
      'public.parent_students',
    ]);
    for (const table of order)
      if (!changed.has(table))
        expect(await fingerprintTable(pool, table)).toEqual(
          await fingerprintTable(source.test.client as unknown as QueryClient, table),
        );
  });
});
