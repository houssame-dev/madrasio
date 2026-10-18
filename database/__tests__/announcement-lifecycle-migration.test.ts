import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createTestDb, createSupabaseAuth, migrationsFolder } from './helpers';

let client: PGlite;
afterEach(async () => { await client?.close(); });

it('replays the current chain with 51 RLS tables and the minimal announcement schema', async () => {
  ({ client } = await createTestDb());
  expect((await client.query<{ count: number }>('select count(*)::int as count from drizzle.__drizzle_migrations')).rows[0].count).toBe(25);
  const snapshot = JSON.parse(await readFile(join(migrationsFolder, 'meta/0019_snapshot.json'), 'utf8'));
  expect(snapshot.tables['public.announcement_versions'].columns.body_format).toMatchObject({ type: 'text', notNull: true, default: "'PLAIN_TEXT'" });
  expect((await client.query("select data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='announcement_versions' and column_name='body_format'")).rows).toEqual([{ data_type: 'text', is_nullable: 'NO', column_default: "'PLAIN_TEXT'::text" }]);
  expect((await client.query<{ count: number }>("select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity")).rows[0].count).toBe(51);
});

it('upgrades populated legacy content without reinterpretation; cancellation requires unpublished scheduled intent', async () => {
  client = new PGlite(); await createSupabaseAuth(client);
  for (const file of (await readdir(migrationsFolder)).filter((name) => /^\d{4}_.+\.sql$/.test(name) && Number(name.slice(0, 4)) < 19).sort()) {
    for (const statement of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) {
      if (statement.trim()) await client.exec(statement);
    }
  }
  const user = randomUUID(), school = randomUUID(), announcement = randomUUID(), version = randomUUID(), publication = randomUUID();
  await client.query('insert into auth.users(id,email) values ($1,$2)', [user, 'announcement-migration@example.test']);
  await client.query('insert into public.users(id,email) values ($1,$2)', [user, 'announcement-migration@example.test']);
  await client.query('insert into schools(id,name) values ($1,$2)', [school, 'Local migration School']);
  await client.query('insert into announcements(id,school_id,created_by) values ($1,$2,$3)', [announcement, school, user]);
  await client.query('insert into announcement_versions(id,school_id,announcement_id,version_number,title,body,created_by) values ($1,$2,$3,1,$4,$5,$6)', [version, school, announcement, 'Legacy', '<script>literal legacy text</script>', user]);
  await client.query("insert into announcement_publications(id,school_id,announcement_id,announcement_version_id,publication_version,status,scheduled_at,published_by,idempotency_key) values ($1,$2,$3,$4,1,'SCHEDULED','2035-01-01T00:00:00Z',$5,$6)", [publication, school, announcement, version, user, randomUUID()]);
  const before = (await client.query('select to_jsonb(v) as row from announcement_versions v')).rows;
  const intentBefore = (await client.query('select to_jsonb(p) as row from announcement_publications p')).rows;
  // A single migration transaction, including ADD VALUE and the text-cast CHECK.
  await client.exec('BEGIN');
  for (const statement of (await readFile(join(migrationsFolder, '0019_announcement-lifecycle-content.sql'), 'utf8')).split('--> statement-breakpoint')) {
    if (statement.trim()) await client.exec(statement);
  }
  await client.exec('COMMIT');
  expect((await client.query("select to_jsonb(v) - 'body_format' as row from announcement_versions v")).rows).toEqual(before);
  expect((await client.query('select body_format from announcement_versions')).rows).toEqual([{ body_format: 'PLAIN_TEXT' }]);
  expect((await client.query('select to_jsonb(p) as row from announcement_publications p')).rows).toEqual(intentBefore);
  await client.query("update announcement_publications set status='CANCELLED' where id=$1", [publication]);
  await expect(client.query("update announcement_publications set published_at=now() where id=$1", [publication])).rejects.toThrow();
  await expect(client.query("update announcement_publications set scheduled_at=null where id=$1", [publication])).rejects.toThrow();
  await expect(client.query("update announcement_versions set body_format='UNSAFE' where id=$1", [version])).rejects.toThrow();
  await expect(client.query('update announcement_versions set body_format=null where id=$1', [version])).rejects.toThrow();
  expect((await client.query('select * from publication_recipient_snapshots')).rows).toHaveLength(0);
  expect((await client.query('select * from outbox_events')).rows).toHaveLength(0);
}, 30000);
