import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createTestDb, createSupabaseAuth, migrationsFolder } from './helpers';
import { applicationSecurityAuditSql } from '../security';

let client: PGlite;
afterEach(async () => { await client?.close(); });

it('replays the current chain with 25 migrations, 51 private RLS tables, no policies and empty file metadata', async () => {
  ({ client } = await createTestDb());
  await client.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  expect((await client.query<{ count: number }>('select count(*)::int count from drizzle.__drizzle_migrations')).rows[0]!.count).toBe(25);
  expect((await client.query(applicationSecurityAuditSql)).rows).toEqual([]);
  expect((await client.query('select * from files')).rows).toEqual([]);
  expect((await client.query('select * from announcement_attachments')).rows).toEqual([]);
  const snapshot = JSON.parse(await readFile(join(migrationsFolder, 'meta/0020_snapshot.json'), 'utf8'));
  for (const table of ['files', 'announcement_attachments']) expect(snapshot.tables[`public.${table}`].isRLSEnabled).toBe(true);
}, 30_000);

it('upgrades populated publication history without fabricating files; constraints reject cross-School or reused associations', async () => {
  client = new PGlite(); await createSupabaseAuth(client);
  for (const file of (await readdir(migrationsFolder)).filter((n) => /^\d{4}_.+\.sql$/.test(n) && Number(n.slice(0, 4)) < 20).sort()) {
    for (const sql of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  }
  const user = randomUUID(), school = randomUUID(), otherSchool = randomUUID(), announcement = randomUUID(), version = randomUUID(), file = randomUUID();
  await client.query('insert into auth.users(id,email) values ($1,$2)', [user, 'file-migration@example.test']);
  await client.query('insert into public.users(id,email) values ($1,$2)', [user, 'file-migration@example.test']);
  await client.query("insert into schools(id,name) values ($1,'School'),($2,'Other')", [school, otherSchool]);
  await client.query('insert into announcements(id,school_id,created_by) values ($1,$2,$3)', [announcement, school, user]);
  await client.query("insert into announcement_versions(id,school_id,announcement_id,version_number,title,body,created_by) values ($1,$2,$3,1,'Title','Body',$4)", [version, school, announcement, user]);
  await client.query("insert into announcement_publications(school_id,announcement_id,announcement_version_id,publication_version,status,published_at,published_by,idempotency_key) values ($1,$2,$3,1,'PUBLISHED',now(),$4,$5)", [school, announcement, version, user, randomUUID()]);
  const before = (await client.query('select to_jsonb(p) row from announcement_publications p')).rows;
  await client.exec('BEGIN');
  for (const sql of (await readFile(join(migrationsFolder, '0020_private-application-files.sql'), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  await client.exec('COMMIT');
  expect((await client.query('select to_jsonb(p) row from announcement_publications p')).rows).toEqual(before);
  expect((await client.query('select * from files')).rows).toEqual([]);
  await client.query("insert into files(id,school_id,created_by,request_id,original_name,media_type,byte_size,sha256,object_key,state) values ($1,$2,$3,$4,'notice.pdf','application/pdf',12,$5,$6,'READY')", [file, school, user, randomUUID(), 'a'.repeat(64), `application-files/${school}/${randomUUID()}`]);
  await expect(client.query('insert into announcement_attachments(school_id,announcement_version_id,file_id) values ($1,$2,$3)', [otherSchool, version, file])).rejects.toThrow();
  await client.query('insert into announcement_attachments(school_id,announcement_version_id,file_id) values ($1,$2,$3)', [school, version, file]);
  const otherAnnouncement = randomUUID(), otherVersion = randomUUID();
  await client.query('insert into announcements(id,school_id,created_by) values ($1,$2,$3)', [otherAnnouncement, otherSchool, user]);
  await client.query("insert into announcement_versions(id,school_id,announcement_id,version_number,title,body,created_by) values ($1,$2,$3,1,'Other','Body',$4)", [otherVersion, otherSchool, otherAnnouncement, user]);
  // The Version is valid in the other School: the File FK must independently deny reuse.
  await expect(client.query('insert into announcement_attachments(school_id,announcement_version_id,file_id) values ($1,$2,$3)', [otherSchool, otherVersion, file])).rejects.toThrow();
  await expect(client.query('insert into announcement_attachments(school_id,announcement_version_id,file_id) values ($1,$2,$3)', [school, version, file])).rejects.toThrow();
  for (const [column, value] of [['byte_size', 0], ['byte_size', 2097153], ['state', 'PUBLIC'], ['media_type', 'text/html'], ['sha256', 'invalid'], ['original_name', '../bad.pdf'], ['original_name', 'a\\bad.pdf'], ['original_name', 'a\nb.pdf']] as const) {
    await expect(client.query(`update files set ${column}=$1 where id=$2`, [value, file])).rejects.toThrow();
  }
  await expect(client.query('delete from files where id=$1', [file])).rejects.toThrow();
}, 30_000);
