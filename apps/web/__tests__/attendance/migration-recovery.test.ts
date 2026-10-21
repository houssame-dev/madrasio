// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { sessionFixture } from './session-fixture';
import { loadForeignKeys } from '@/scripts/recovery/inventory';
import { buildRestoreOrder } from '@/scripts/recovery/restore';
import type { QueryClient } from '@/scripts/recovery/snapshot';
it('upgrades a populated 0029 database without reinterpreting daily history or granting Data API access', async () => {
  const old = new PGlite(), f = await sessionFixture();
  try {
    await old.exec('create schema auth;create table auth.users(id uuid primary key,email varchar(255),phone text unique,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz);create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));create role anon;create role authenticated;create role service_role;');
    const folder = path.resolve(process.cwd(), '../../database/drizzle/migrations'), journal = JSON.parse(await readFile(path.join(folder,'meta/_journal.json'),'utf8'));
    for (const entry of journal.entries.slice(0,30)) await old.exec(await readFile(path.join(folder,entry.tag+'.sql'),'utf8'));
    await f.test.client.exec('create table auth.identities(id uuid primary key,user_id uuid references auth.users(id))');
    const source = f.test.client as unknown as QueryClient;
    for (const table of buildRestoreOrder(await loadForeignKeys(source))) { const rows = (await source.query<{ row: unknown }>(`select to_jsonb(t) row from ${table} t`)).rows.map(r => r.row); if(rows.length)await old.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(rows)]); }
    await old.query("insert into attendance_records(school_id,student_id,class_id,academic_year_id,attendance_date,status,note)values($1,$2,$3,$4,'2025-10-10','EXCUSED','Original daily meaning')",[f.schoolId,f.student.id,f.classAId,f.yearId]);
    const prior = (await old.query<{ row: Record<string,unknown> }>('select to_jsonb(a) row from attendance_records a')).rows[0].row;
    await old.exec(await readFile(path.join(folder,'0030_attendance-sessions.sql'),'utf8'));
    const after = (await old.query<{ row: Record<string,unknown> }>('select to_jsonb(a) row from attendance_records a')).rows[0].row;
    expect(after).toEqual({ ...prior, publication_id:null,lesson_key:null,session:null,version:1,updated_by:null });
    const values=[f.schoolId,f.student.id,f.classAId,f.yearId,f.publication.id,f.lessonKeys[0],JSON.stringify({lessonKey:f.lessonKeys[0]})];
    await old.query("insert into attendance_records(school_id,student_id,class_id,academic_year_id,attendance_date,status,publication_id,lesson_key,session) values($1,$2,$3,$4,'2025-10-10','PRESENT',$5,$6,$7)",values);
    await expect(old.query("insert into attendance_records(school_id,student_id,class_id,academic_year_id,attendance_date,status,publication_id,lesson_key,session) values($1,$2,$3,$4,'2025-10-10','ABSENT',$5,$6,$7)",values)).rejects.toMatchObject({code:'23505'});
    await expect(old.query('update attendance_records set class_id=$1 where publication_id is not null',[f.classBId])).rejects.toMatchObject({code:'23503'});
    await expect(old.query('update attendance_records set lesson_key=null where publication_id is not null')).rejects.toMatchObject({code:'23514'});
    await expect(old.query("update attendance_records set session='{}'::jsonb where publication_id is not null")).rejects.toMatchObject({code:'23514'});
    expect((await old.query("select count(*)::int n from information_schema.role_table_grants where table_schema='public' and table_name='attendance_records' and grantee in('anon','authenticated','service_role')")).rows).toEqual([{n:0}]);
  } finally { await old.close(); await f.test.client.close(); }
},30000);
