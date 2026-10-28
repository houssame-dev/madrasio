import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createSupabaseAuth, migrationsFolder } from './helpers';
import { applicationSecurityAuditSql } from '../security';

it('appends 0028 to populated 0027, preserving foundation rows and private recovery-compatible schema', async () => {
  const client = new PGlite();
  try {
    await createSupabaseAuth(client); await client.exec('create role anon; create role authenticated; create role service_role');
    for (const name of (await readdir(migrationsFolder)).filter(f => /^\d{4}_.*\.sql$/.test(f) && f < '0028').sort()) {
      for (const statement of (await readFile(join(migrationsFolder, name), 'utf8')).split('--> statement-breakpoint')) if (statement.trim()) await client.exec(statement);
    }
    const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    await client.query("insert into schools(id,name) values($1,'Existing School')", [id(1)]);
    await client.query("insert into auth.users(id,email) values($1,'synthetic@example.test')", [id(2)]);
    await client.query("insert into users(id,email) values($1,'synthetic@example.test')", [id(2)]);
    await client.query("insert into academic_years(id,school_id,name,start_date,end_date) values($1,$2,'2025/26','2025-09-01','2026-07-01')", [id(3), id(1)]);
    await client.query(`insert into timetable_configurations(school_id,academic_year_id,scope_key,revision,days,created_by) values($1,$2,'school',1,'[{"day":1,"slots":[{"kind":"LESSON","start":"08:00","end":"09:00"}]}]',$3)`, [id(1), id(3), id(2)]);
    await client.query("insert into timetable_rooms(school_id,name,kind,created_by,updated_by) values($1,'Existing Lab','LAB',$2,$2)", [id(1), id(2)]);
    const before = await Promise.all(['schools', 'timetable_configurations', 'timetable_rooms', 'timetable_loads'].map(table => client.query(`select to_jsonb(t) row from ${table} t`)));
    for (const statement of (await readFile(join(migrationsFolder, '0028_timetable-weekly-drafts.sql'), 'utf8')).split('--> statement-breakpoint')) if (statement.trim()) await client.exec(statement);
    const after = await Promise.all(['schools', 'timetable_configurations', 'timetable_rooms', 'timetable_loads'].map(table => client.query(`select to_jsonb(t) row from ${table} t`)));
    expect(after.map(r => r.rows)).toEqual(before.map(r => r.rows));
    for (const statement of (await readFile(join(migrationsFolder, '0029_timetable-publications.sql'), 'utf8')).split('--> statement-breakpoint')) if (statement.trim()) await client.exec(statement);
    expect((await client.query(applicationSecurityAuditSql.replace('app_tables) <> 58', 'app_tables) <> 57'))).rows).toEqual([]);
    expect((await client.query("select tablename from pg_tables where schemaname='public' and rowsecurity")).rows).toHaveLength(57);
    const previous = JSON.parse(await readFile(join(migrationsFolder, 'meta/0027_snapshot.json'), 'utf8'));
    const current = JSON.parse(await readFile(join(migrationsFolder, 'meta/0028_snapshot.json'), 'utf8')); expect(current.prevId).toBe(previous.id);
    for (const table of Object.keys(previous.tables).filter(t => t !== 'public.timetable_configurations')) expect(current.tables[table]).toEqual(previous.tables[table]);
    expect((await client.query('select * from timetable_drafts')).rows).toEqual([]); expect((await client.query('select * from timetable_lessons')).rows).toEqual([]);
    await client.exec('set role authenticated'); await expect(client.query('select * from timetable_drafts')).rejects.toThrow(); await expect(client.query('insert into timetable_lessons default values')).rejects.toThrow();
  } finally { await client.close(); }
}, 30000);
