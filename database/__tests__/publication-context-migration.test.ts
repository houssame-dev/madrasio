import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import * as schema from '../drizzle/schema';
import { createTestDb, createSupabaseAuth, migrationsFolder } from './helpers';

let client: PGlite;
afterEach(async () => { await client?.close(); });

it('replays the current chain from zero and retains the nullable JSONB schema snapshot', async () => {
  ({ client } = await createTestDb());
  expect((await client.query<{ count: number }>('select count(*)::int as count from drizzle.__drizzle_migrations')).rows[0].count).toBe(23);
  expect((await client.query("select data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='result_publications' and column_name='display_context'")).rows).toEqual([{ data_type: 'jsonb', is_nullable: 'YES', column_default: null }]);
  const snapshot = JSON.parse(await readFile(join(migrationsFolder, 'meta/0018_snapshot.json'), 'utf8'));
  expect(snapshot.tables['public.result_publications'].columns.display_context).toMatchObject({ type: 'jsonb', notNull: false });
  expect((await client.query<{ count: number }>("select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity")).rows[0].count).toBe(43);
});

it('upgrades a populated 0000–0017 publication without inventing historical labels or changing existing fields', async () => {
  client = new PGlite(); await createSupabaseAuth(client);
  for (const file of (await readdir(migrationsFolder)).filter((name) => /^\d{4}_.+\.sql$/.test(name) && Number(name.slice(0, 4)) < 18).sort()) {
    for (const statement of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) {
      if (statement.trim()) await client.exec(statement);
    }
  }
  const db = drizzle(client, { schema });
  const userId = randomUUID();
  await client.query('insert into auth.users(id,email) values ($1,$2)', [userId, 'migration@example.test']);
  await db.insert(schema.users).values({ id: userId, email: 'migration@example.test' });
  const [school] = await db.insert(schema.schools).values({ name: 'Current school' }).returning();
  const schoolId = school.id;
  const [year] = await db.insert(schema.academicYears).values({ schoolId, name: 'Current year label', startDate: '2025-09-01', endDate: '2026-07-01' }).returning();
  const [stage] = await db.insert(schema.stages).values({ schoolId, name: 'Stage', sequence: 1 }).returning();
  const [level] = await db.insert(schema.levels).values({ schoolId, stageId: stage.id, name: 'Level', sequence: 1 }).returning();
  const [curriculum] = await db.insert(schema.curricula).values({ schoolId, name: 'Curriculum' }).returning();
  const [curriculumVersion] = await db.insert(schema.curriculumVersions).values({ schoolId, curriculumId: curriculum.id, name: 'Version' }).returning();
  const [klass] = await db.insert(schema.classes).values({ schoolId, academicYearId: year.id, levelId: level.id, curriculumVersionId: curriculumVersion.id, name: 'Class' }).returning();
  // This fixture is intentionally pre-0018: avoid current-schema INSERT/RETURNING
  // columns such as date_of_birth, which is introduced only by migration 0021.
  const student = { id: randomUUID() };
  await client.query(
    'insert into students(id,school_id,first_name,last_name) values ($1,$2,$3,$4)',
    [student.id, schoolId, 'Current', 'Name'],
  );
  const [config] = await db.insert(schema.gradingConfigurations).values({ schoolId, name: 'Configuration' }).returning();
  const [version] = await db.insert(schema.gradingConfigurationVersions).values({ schoolId, gradingConfigurationId: config.id, versionNumber: 1, rules: { schemaVersion: 1 } }).returning();
  const [result] = await db.insert(schema.annualResults).values({ schoolId, studentId: student.id, academicYearId: year.id, classId: klass.id, gradingConfigurationVersionId: version.id, value: '14.00', status: 'FINALIZED' }).returning();
  await client.query(`insert into result_publications(school_id,result_type,annual_result_id,student_id,academic_year_id,class_id,result_value,grading_configuration_version_id,publication_version,published_by,idempotency_key)
    values ($1,'ANNUAL',$2,$3,$4,$5,'14.00',$6,1,$7,$8)`, [schoolId, result.id, student.id, year.id, klass.id, version.id, userId, randomUUID()]);
  const before = (await client.query('select to_jsonb(p) as row from result_publications p')).rows;
  await client.exec(await readFile(join(migrationsFolder, '0018_result-publication-context.sql'), 'utf8'));
  expect((await client.query("select to_jsonb(p) - 'display_context' as row from result_publications p")).rows).toEqual(before);
  expect((await client.query('select display_context from result_publications')).rows).toEqual([{ display_context: null }]);
  expect(await db.select().from(schema.resultPublications)).toHaveLength(1);
}, 30000);
