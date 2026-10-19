import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createSupabaseAuth, migrationsFolder } from './helpers';
import { applicationSecurityAuditSql } from '../security';
let client: PGlite;
afterEach(async () => { await client?.close(); });
it('upgrades populated 0023 with private payment history tables and same-Student keys', async () => {
  client = new PGlite(); await createSupabaseAuth(client);
  for (const file of (await readdir(migrationsFolder)).filter(n => /^\d{4}_.+\.sql$/.test(n) && Number(n.slice(0, 4)) < 24).sort()) {
    for (const sql of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  }
  await client.query("insert into schools(id,name) values ($1,'Existing School')", [randomUUID()]);
  const before = (await client.query('select to_jsonb(s) row from schools s')).rows;
  await client.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role');
  await client.exec('BEGIN');
  for (const sql of (await readFile(join(migrationsFolder, '0024_finance-offline-payments.sql'), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  await client.exec('COMMIT; ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon,authenticated,service_role');
  expect((await client.query('select to_jsonb(s) row from schools s')).rows).toEqual(before);
  // Verify the historical upgrade above, then reach the current schema for the current ACL inventory.
  for (const file of (await readdir(migrationsFolder)).filter(n => /^\d{4}_.+\.sql$/.test(n) && Number(n.slice(0, 4)) > 24).sort()) {
    for (const statement of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) if (statement.trim()) await client.exec(statement);
  }
  expect((await client.query(applicationSecurityAuditSql)).rows).toEqual([]);
  expect((await client.query("select proname from pg_proc where pronamespace='public'::regnamespace")).rows).toEqual([]);
  const previous = JSON.parse(await readFile(join(migrationsFolder, 'meta/0023_snapshot.json'), 'utf8'));
  const current = JSON.parse(await readFile(join(migrationsFolder, 'meta/0024_snapshot.json'), 'utf8'));
  expect(current.prevId).toBe(previous.id);
  expect(Object.keys(current.tables).length - Object.keys(previous.tables).length).toBe(3);
  for (const name of Object.keys(previous.tables).filter(n => n !== 'public.finance_student_charges')) expect(current.tables[name]).toEqual(previous.tables[name]);
  await client.exec('SET ROLE authenticated');
  await expect(client.query('select * from finance_payments')).rejects.toThrow();
  await expect(client.query('delete from finance_payment_allocations')).rejects.toThrow();
  await client.exec('RESET ROLE');
}, 30_000);
