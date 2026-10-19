import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createTestDb, createSupabaseAuth, migrationsFolder } from './helpers';
import { applicationSecurityAuditSql } from '../security';
let client: PGlite;
afterEach(async () => { await client?.close(); });

it('fresh current replay has 27 migrations, 51 RLS tables, private grants and nullable actual time', async () => {
  ({ client } = await createTestDb());
  await client.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  expect((await client.query<{ count: number }>('select count(*)::int count from drizzle.__drizzle_migrations')).rows[0]!.count).toBe(27);
  expect((await client.query(applicationSecurityAuditSql)).rows).toEqual([]);
  expect((await client.query("select data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='homework_submissions' and column_name='actual_handed_in_at'")).rows).toEqual([
    { data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null },
  ]);
  expect((await client.query('select * from homework_submission_attachments')).rows).toEqual([]);
  const snapshot = JSON.parse(await readFile(join(migrationsFolder, 'meta/0022_snapshot.json'), 'utf8'));
  expect(Object.keys(snapshot.tables)).toHaveLength(43);
  expect(snapshot.tables['public.homework_submission_attachments'].isRLSEnabled).toBe(true);
}, 30_000);

it('upgrades populated 0021 without inventing hand-in time or rewriting recording/status/history; enforces attachment FKs', async () => {
  client = new PGlite(); await createSupabaseAuth(client);
  for (const file of (await readdir(migrationsFolder)).filter((n) => /^\d{4}_.+\.sql$/.test(n) && Number(n.slice(0, 4)) < 22).sort()) {
    for (const sql of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  }
  const school = randomUUID(), otherSchool = randomUUID(), teacher = randomUUID(), year = randomUUID(), period = randomUUID(), subject = randomUUID(), homework = randomUUID(), user = randomUUID();
  await client.query("insert into schools(id,name) values ($1,'School'),($2,'Other')", [school, otherSchool]);
  await client.query("insert into teachers(id,school_id,first_name,last_name) values ($1,$2,'Teacher','Legacy')", [teacher, school]);
  await client.query("insert into subjects(id,school_id,name) values ($1,$2,'Math')", [subject, school]);
  await client.query("insert into academic_years(id,school_id,name,start_date,end_date) values ($1,$2,'Legacy','2020-09-01','2021-07-01')", [year, school]);
  await client.query("insert into academic_periods(id,school_id,academic_year_id,name,sequence,start_date,end_date) values ($1,$2,$3,'Term',1,'2020-09-01','2021-01-01')", [period, school, year]);
  await client.query("insert into homework(id,school_id,teacher_id,subject_id,academic_year_id,academic_period_id,title,due_date,status) values ($1,$2,$3,$4,$5,$6,'Legacy','2020-10-10','PUBLISHED')", [homework, school, teacher, subject, year, period]);
  const ids: string[] = [];
  for (const status of ['SUBMITTED','LATE','REVIEWED','RETURNED']) {
    const student = randomUUID(), id = randomUUID(); ids.push(id);
    await client.query("insert into students(id,school_id,first_name,last_name) values ($1,$2,'Legacy',$3)", [student, school, status]);
    // Version-matched SQL: never invoke current-schema Drizzle inserts before 0022.
    await client.query("insert into homework_submissions(id,school_id,homework_id,student_id,content,status,submitted_at,created_at,updated_at) values ($1,$2,$3,$4,'Original',$5,'2020-10-11T12:00:00Z','2020-10-10T12:00:00Z','2020-10-12T12:00:00Z')", [id, school, homework, student, status]);
  }
  const before = (await client.query('select to_jsonb(s) row from homework_submissions s order by id')).rows;
  // Hosted-style default grants must be revoked on the newly created private table.
  await client.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await client.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;');
  await client.exec('BEGIN');
  for (const sql of (await readFile(join(migrationsFolder, '0022_homework-actual-handin-attachments.sql'), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  await client.exec('COMMIT');
  await client.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;');
  expect((await client.query("select to_jsonb(s) - 'actual_handed_in_at' row from homework_submissions s order by id")).rows).toEqual(before);
  expect((await client.query('select actual_handed_in_at from homework_submissions')).rows).toEqual(Array.from({ length: 4 }, () => ({ actual_handed_in_at: null })));
  expect((await client.query('select * from homework_submission_attachments')).rows).toEqual([]);
  await client.query('insert into auth.users(id,email) values ($1,$2)', [user, 'homework-migration@example.test']);
  await client.query('insert into users(id,email) values ($1,$2)', [user, 'homework-migration@example.test']);
  const file = randomUUID(), foreignFile = randomUUID();
  for (const [fileId, schoolId] of [[file, school], [foreignFile, otherSchool]]) await client.query("insert into files(id,school_id,created_by,request_id,original_name,media_type,byte_size,sha256,object_key,state) values ($1,$2,$3,$4,'work.pdf','application/pdf',12,$5,$6,'READY')",
    [fileId, schoolId, user, randomUUID(), 'a'.repeat(64), `application-files/${schoolId}/${randomUUID()}`]);
  const insert = (schoolId: string, submissionId: string, fileId: string) => client.query("insert into homework_submission_attachments(school_id,submission_id,file_id,submission_recorded_at) values ($1,$2,$3,'2020-10-11T12:00:00Z')", [schoolId, submissionId, fileId]);
  await expect(insert(otherSchool, ids[0]!, foreignFile)).rejects.toThrow();
  await expect(insert(school, ids[0]!, foreignFile)).rejects.toThrow();
  await insert(school, ids[0]!, file);
  await expect(insert(school, ids[1]!, file)).rejects.toThrow();
  await expect(client.query('delete from files where id=$1', [file])).rejects.toThrow();
  await expect(client.query('delete from homework_submissions where id=$1', [ids[0]])).rejects.toThrow();
  // Bring the historical upgrade fixture to the current head before the current ACL audit.
  for (const file of (await readdir(migrationsFolder)).filter(n => /^\d{4}_.+\.sql$/.test(n) && Number(n.slice(0, 4)) > 22).sort()) {
    for (const sql of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  }
  expect((await client.query(applicationSecurityAuditSql)).rows).toEqual([]);
}, 30_000);
