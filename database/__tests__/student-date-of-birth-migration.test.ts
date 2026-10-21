import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createTestDb, createSupabaseAuth, migrationsFolder } from './helpers';
import { applicationSecurityAuditSql } from '../security';

let client: PGlite;
afterEach(async () => { await client?.close(); });

it('replays the current chain with nullable date-only DOB, 30 migrations and 56-table security', async () => {
  ({ client } = await createTestDb());
  await client.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  expect((await client.query<{ count: number }>('select count(*)::int count from drizzle.__drizzle_migrations')).rows[0]!.count).toBe(31);
  expect((await client.query(applicationSecurityAuditSql)).rows).toEqual([]);
  expect((await client.query("select data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='students' and column_name='date_of_birth'")).rows).toEqual([
    { data_type: 'date', is_nullable: 'YES', column_default: null },
  ]);
  const snapshot = JSON.parse(await readFile(join(migrationsFolder, 'meta/0021_snapshot.json'), 'utf8'));
  expect(Object.keys(snapshot.tables)).toHaveLength(42);
  expect(snapshot.tables['public.students'].columns.date_of_birth).toMatchObject({ type: 'date', notNull: false });
}, 30_000);

it('upgrades populated 0020 without inventing DOB or changing identity/relationships/history', async () => {
  client = new PGlite(); await createSupabaseAuth(client);
  for (const file of (await readdir(migrationsFolder)).filter((n) => /^\d{4}_.+\.sql$/.test(n) && Number(n.slice(0, 4)) < 21).sort()) {
    for (const sql of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  }
  const school = randomUUID(), student = randomUUID(), parent = randomUUID();
  await client.query("insert into schools(id,name) values ($1,'Legacy School')", [school]);
  await client.query("insert into students(id,school_id,first_name,last_name,student_code,status) values ($1,$2,'Legacy','Student','LEGACY','INACTIVE')", [student, school]);
  await client.query("insert into parents(id,school_id,first_name,last_name) values ($1,$2,'Legacy','Parent')", [parent, school]);
  await client.query("insert into parent_students(school_id,parent_id,student_id) values ($1,$2,$3)", [school, parent, student]);
  const year = randomUUID(), stage = randomUUID(), level = randomUUID(), curriculum = randomUUID(), version = randomUUID(), klass = randomUUID();
  await client.query("insert into academic_years(id,school_id,name,start_date,end_date) values ($1,$2,'History','2020-09-01','2021-07-01')", [year, school]);
  await client.query("insert into stages(id,school_id,name,sequence) values ($1,$2,'Primary',1)", [stage, school]);
  await client.query("insert into levels(id,school_id,stage_id,name,sequence) values ($1,$2,$3,'Level',1)", [level, school, stage]);
  await client.query("insert into curricula(id,school_id,name) values ($1,$2,'Curriculum')", [curriculum, school]);
  await client.query("insert into curriculum_versions(id,school_id,curriculum_id,name) values ($1,$2,$3,'v1')", [version, school, curriculum]);
  await client.query("insert into classes(id,school_id,academic_year_id,level_id,curriculum_version_id,name) values ($1,$2,$3,$4,$5,'History')", [klass, school, year, level, version]);
  await client.query("insert into student_enrollments(school_id,student_id,academic_year_id,class_id,effective_from,effective_until,status) values ($1,$2,$3,$4,'2020-09-01','2021-07-01','ENDED')", [school, student, year, klass]);
  const before = (await client.query('select to_jsonb(s) row from students s')).rows;
  const relationships = (await client.query('select to_jsonb(p) row from parent_students p')).rows;
  const history = (await client.query('select to_jsonb(e) row from student_enrollments e')).rows;
  await client.exec(await readFile(join(migrationsFolder, '0021_student-date-of-birth.sql'), 'utf8'));
  expect((await client.query("select to_jsonb(s) - 'date_of_birth' row from students s")).rows).toEqual(before);
  expect((await client.query('select date_of_birth from students')).rows).toEqual([{ date_of_birth: null }]);
  expect((await client.query('select to_jsonb(p) row from parent_students p')).rows).toEqual(relationships);
  expect((await client.query('select to_jsonb(e) row from student_enrollments e')).rows).toEqual(history);
  for (const date of ['2023-02-29', '2024-04-31']) {
    await expect(client.query('update students set date_of_birth=$1 where id=$2', [date, student])).rejects.toThrow();
  }
  await client.query("update students set date_of_birth='2012-02-29' where id=$1", [student]);
  for (const timezone of ['Pacific/Kiritimati', 'America/Los_Angeles']) {
    await client.query("select set_config('TimeZone',$1,false)", [timezone]);
    expect((await client.query('select date_of_birth::text dob from students')).rows).toEqual([{ dob: '2012-02-29' }]);
  }
}, 30_000);
