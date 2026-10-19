import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createSupabaseAuth, migrationsFolder } from './helpers';
import { applicationSecurityAuditSql } from '../security';

it('upgrades populated 0026 without changing existing rows, creates 54 private RLS tables and preserves snapshot parentage', async () => {
  const client = new PGlite();
  try {
    await createSupabaseAuth(client); await client.exec('create role anon; create role authenticated; create role service_role');
    for (const name of (await readdir(migrationsFolder)).filter(f => /^\d{4}_.*\.sql$/.test(f) && f < '0027').sort()) {
      for (const statement of (await readFile(join(migrationsFolder, name), 'utf8')).split('--> statement-breakpoint')) if (statement.trim()) await client.exec(statement);
    }
    await client.exec("insert into schools(id,name) values ('10000000-0000-4000-8000-000000000001','Existing school')");
    const before = (await client.query('select to_jsonb(s) row from schools s')).rows;
    for (const statement of (await readFile(join(migrationsFolder, '0027_timetable-foundation.sql'), 'utf8')).split('--> statement-breakpoint')) if (statement.trim()) await client.exec(statement);
    expect((await client.query('select to_jsonb(s) row from schools s')).rows).toEqual(before);
    expect((await client.query("select tablename from pg_tables where schemaname='public' and rowsecurity")).rows).toHaveLength(54);
    for (const table of ['timetable_configurations', 'timetable_loads', 'timetable_rooms']) expect((await client.query(`select * from ${table}`)).rows).toEqual([]);
    const previous = JSON.parse(await readFile(join(migrationsFolder, 'meta/0026_snapshot.json'), 'utf8'));
    const next = JSON.parse(await readFile(join(migrationsFolder, 'meta/0027_snapshot.json'), 'utf8'));
    expect(next.prevId).toBe(previous.id);
    for (const name of Object.keys(previous.tables).filter(name => name !== 'public.teacher_assignments')) expect(next.tables[name]).toEqual(previous.tables[name]);
    // Preserve this 0027 upgrade proof; the current ACL audit runs after later forward migrations.
    for (const file of (await readdir(migrationsFolder)).filter(f => /^\d{4}_.*\.sql$/.test(f) && f > '0027_timetable-foundation.sql').sort()) {
      for (const statement of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) if (statement.trim()) await client.exec(statement);
    }
    expect((await client.query(applicationSecurityAuditSql)).rows).toEqual([]);
    await client.exec('set role anon'); await expect(client.query('select * from timetable_rooms')).rejects.toThrow();
  } finally { await client.close(); }
}, 30000);
