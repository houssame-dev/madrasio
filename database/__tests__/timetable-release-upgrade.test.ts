import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { createSupabaseAuth, migrationsFolder } from './helpers';
import { applicationSecurityAuditSql } from '../security';

it('upgrades the reviewed 0026 ledger through all three pending migrations without altering populated Finance or academic records', async () => {
  const client = new PGlite(), db = drizzle(client);
  const prefix = resolve(tmpdir(), 'madrasio-timetable-upgrade-'), directory = await mkdtemp(prefix);
  try {
    await createSupabaseAuth(client); await client.exec('create role anon; create role authenticated; create role service_role');
    const journal = JSON.parse(await readFile(join(migrationsFolder, 'meta/_journal.json'), 'utf8'));
    await mkdir(join(directory, 'meta'));
    await writeFile(join(directory, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 27) }));
    for (const entry of journal.entries.slice(0, 27)) await cp(join(migrationsFolder, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
    await migrate(db, { migrationsFolder: directory });
    expect((await client.query('select created_at::text from drizzle.__drizzle_migrations order by created_at')).rows).toEqual(journal.entries.slice(0, 27).map((e: { when: number }) => ({ created_at: String(e.when) })));
    const id = (n: number) => `06600000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    await client.query("insert into schools(id,name) values($1,'Synthetic pre-Timetable School')", [id(1)]);
    await client.query("insert into auth.users(id,email) values($1,'release-admin@example.test')", [id(2)]);
    await client.query("insert into users(id,email) values($1,'release-admin@example.test')", [id(2)]);
    await client.query("insert into school_memberships(school_id,user_id,role) values($1,$2,'SCHOOL_ADMIN')", [id(1), id(2)]);
    await client.query("insert into academic_years(id,school_id,name,start_date,end_date) values($1,$2,'2026/27','2026-09-01','2027-07-01')", [id(3), id(1)]);
    await client.query("insert into stages(id,school_id,name,sequence) values($1,$2,'Primary',1)", [id(4), id(1)]);
    await client.query("insert into levels(id,school_id,stage_id,name,sequence) values($1,$2,$3,'Level',1)", [id(5), id(1), id(4)]);
    await client.query("insert into curricula(id,school_id,name) values($1,$2,'Curriculum')", [id(6), id(1)]);
    await client.query("insert into curriculum_versions(id,school_id,curriculum_id,name) values($1,$2,$3,'Version')", [id(7), id(1), id(6)]);
    await client.query("insert into classes(id,school_id,academic_year_id,level_id,curriculum_version_id,name) values($1,$2,$3,$4,$5,'Class')", [id(8), id(1), id(3), id(5), id(7)]);
    await client.query("insert into students(id,school_id,first_name,last_name) values($1,$2,'Synthetic','Student')", [id(9), id(1)]);
    await client.query("insert into subjects(id,school_id,name) values($1,$2,'Math')", [id(16), id(1)]);
    await client.query("insert into teachers(id,school_id,first_name,last_name) values($1,$2,'Synthetic','Teacher')", [id(17), id(1)]);
    await client.query("insert into teacher_assignments(id,school_id,academic_year_id,class_id,subject_id,teacher_id,effective_from) values($1,$2,$3,$4,$5,$6,'2026-09-01')", [id(18), id(1), id(3), id(8), id(16), id(17)]);
    await client.query("insert into student_enrollments(school_id,academic_year_id,class_id,student_id,effective_from) values($1,$2,$3,$4,'2026-09-01')", [id(1), id(3), id(8), id(9)]);
    await client.query("insert into finance_fee_types(id,school_id,name) values($1,$2,'Tuition')", [id(10), id(1)]);
    await client.query(`insert into finance_fee_structures(id,school_id,academic_year_id,fee_type_id,cadence,amount_cents,periods,created_by,updated_by) values($1,$2,$3,$4,'ONCE',12345,'[{"period":"once","dueDate":"2026-12-10"}]',$5,$5)`, [id(11), id(1), id(3), id(10), id(2)]);
    await client.query("insert into finance_generation_batches(id,school_id,request_key,request_hash,created_by,result) values($1,$2,$1,'synthetic',$3,'{}')", [id(12), id(1), id(2)]);
    await client.query("insert into finance_student_charges(id,school_id,student_id,academic_year_id,fee_type_id,structure_id,batch_id,class_id,fee_name,structure_revision,period,due_date,original_cents,reduction_cents,allocated_cents) values($1,$2,$3,$4,$5,$6,$7,$8,'Tuition',1,'once','2026-12-10',12345,1000,2345)", [id(13), id(1), id(9), id(3), id(10), id(11), id(12), id(8)]);
    await client.query("insert into finance_payments(id,school_id,student_id,request_key,request_hash,receipt_reference,school_name,school_timezone,student_name,method,amount_cents,received_on,recorded_by) values($1,$2,$3,$1,'synthetic','R-SYNTHETIC-RELEASE','Synthetic School','UTC','Synthetic Student','CASH',2345,'2026-11-01',$4)", [id(14), id(1), id(9), id(2)]);
    await client.query("insert into finance_payment_allocations(id,school_id,student_id,payment_id,charge_id,amount_cents,fee_name,period,due_date) values($1,$2,$3,$4,$5,2345,'Tuition','once','2026-12-10')", [id(15), id(1), id(9), id(14), id(13)]);
    const tables = (await client.query<{ tablename: string }>("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r => r.tablename);
    expect(tables).toHaveLength(51);
    async function fingerprints() {
      return Promise.all(tables.map(async table => {
        if (!/^[a-z_]+$/.test(table)) throw new Error('Unexpected identifier');
        const result = await client.query<{ rows: string }>(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text rows from public.${table} t`);
        return { table, digest: createHash('sha256').update(result.rows[0].rows).digest('hex') };
      }));
    }
    const before = await fingerprints();
    await migrate(db, { migrationsFolder });
    expect(await fingerprints()).toEqual(before);
    const ledger = (await client.query('select created_at::text from drizzle.__drizzle_migrations order by created_at')).rows;
    expect(ledger).toEqual(journal.entries.map((e: { when: number }) => ({ created_at: String(e.when) })));
    expect((await client.query(applicationSecurityAuditSql)).rows).toEqual([]);
    expect((await client.query("select tablename from pg_tables where schemaname='public' and tablename like 'timetable_%'")).rows).toHaveLength(6);
    await migrate(db, { migrationsFolder });
    expect((await client.query('select created_at::text from drizzle.__drizzle_migrations order by created_at')).rows).toEqual(ledger);
    expect(await fingerprints()).toEqual(before);
  } finally {
    await client.close();
    if (!resolve(directory).startsWith(prefix)) throw new Error('Unexpected owned temporary path');
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
