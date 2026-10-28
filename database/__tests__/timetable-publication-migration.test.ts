import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createSupabaseAuth, migrationsFolder } from './helpers';
import { applicationSecurityAuditSql } from '../security';
it('appends 0029 to populated 0028, preserves all existing rows/snapshots and denies public access', async () => {
  const client = new PGlite();
  try {
    await createSupabaseAuth(client); await client.exec('create role anon; create role authenticated; create role service_role');
    for (const f of (await readdir(migrationsFolder)).filter(f => /^\d{4}_.*\.sql$/.test(f) && f < '0029').sort()) for (const sql of (await readFile(join(migrationsFolder, f), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
    const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    await client.query("insert into schools(id,name) values($1,'Pre-publication School')", [id(1)]);
    const before = await client.query('select to_jsonb(s) row from schools s');
    for (const sql of (await readFile(join(migrationsFolder, '0029_timetable-publications.sql'), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
    expect((await client.query('select to_jsonb(s) row from schools s')).rows).toEqual(before.rows); expect((await client.query(applicationSecurityAuditSql.replace('app_tables) <> 58', 'app_tables) <> 57'))).rows).toEqual([]);
    expect((await client.query('select * from timetable_publications')).rows).toEqual([]);
    const previous = JSON.parse(await readFile(join(migrationsFolder, 'meta/0028_snapshot.json'), 'utf8')), current = JSON.parse(await readFile(join(migrationsFolder, 'meta/0029_snapshot.json'), 'utf8'));
    expect(current.prevId).toBe(previous.id); for (const key of Object.keys(previous.tables)) expect(current.tables[key]).toEqual(previous.tables[key]);
    await client.exec('set role authenticated'); await expect(client.query('select * from timetable_publications')).rejects.toThrow(); await expect(client.query('insert into timetable_publications default values')).rejects.toThrow();
  } finally { await client.close(); }
}, 30000);
