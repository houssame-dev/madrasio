import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createSupabaseAuth, migrationsFolder } from './helpers';
import { applicationSecurityAuditSql } from '../security';
let client: PGlite;
afterEach(async () => { await client?.close(); });
it('upgrades populated 0022 without rewriting existing records and revokes hosted-style default grants on every Finance table', async () => {
  client = new PGlite(); await createSupabaseAuth(client);
  const files = (await readdir(migrationsFolder)).filter(n => /^\d{4}_.+\.sql$/.test(n)).sort();
  for (const file of files.filter(n => Number(n.slice(0, 4)) < 23)) {
    for (const sql of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  }
  const school = randomUUID(), student = randomUUID();
  await client.query("insert into schools(id,name) values ($1,'Existing School')", [school]);
  await client.query("insert into students(id,school_id,first_name,last_name) values ($1,$2,'Existing','Student')", [student, school]);
  const before = (await client.query('select to_jsonb(s) row from students s')).rows;
  await client.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role');
  await client.exec('BEGIN');
  for (const sql of (await readFile(join(migrationsFolder, '0023_finance-student-fees.sql'), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  await client.exec('COMMIT; ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role');
  // Current security inventory includes the separately appended payment migration.
  for (const file of files.filter(n => Number(n.slice(0, 4)) > 23)) {
    for (const sql of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  }
  expect((await client.query('select to_jsonb(s) row from students s')).rows).toEqual(before);
  expect((await client.query(applicationSecurityAuditSql)).rows).toEqual([]);
  expect((await client.query('select * from finance_student_charges')).rows).toEqual([]);
  await client.exec('SET ROLE authenticated');
  await expect(client.query('select * from finance_student_charges')).rejects.toThrow();
  await client.exec('RESET ROLE');
  const previous = JSON.parse(await readFile(join(migrationsFolder, 'meta/0022_snapshot.json'), 'utf8'));
  const current = JSON.parse(await readFile(join(migrationsFolder, 'meta/0023_snapshot.json'), 'utf8'));
  expect(current.prevId).toBe(previous.id);
  for (const name of Object.keys(previous.tables)) expect(current.tables[name]).toEqual(previous.tables[name]);
  expect(Object.keys(current.tables).filter(n => !previous.tables[n])).toHaveLength(5);
}, 30_000);
