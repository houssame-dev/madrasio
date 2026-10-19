import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createSupabaseAuth, migrationsFolder } from './helpers';
import { applicationSecurityAuditSql } from '../security';
let client: PGlite;
afterEach(async () => { await client?.close(); });
it('upgrades populated 0024 transactionally, retaining MAD history and existing security', async () => {
  client = new PGlite(); await createSupabaseAuth(client);
  for (const file of (await readdir(migrationsFolder)).filter(n => /^\d{4}_.+\.sql$/.test(n) && Number(n.slice(0, 4)) < 25).sort()) {
    for (const sql of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  }
  // Fixed synthetic UUIDs make every parent and immutable financial reference explicit.
  const id = (n: number) => `02500000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await client.query("insert into schools(id,name) values ($1,'Existing School')", [id(1)]);
  await client.query("insert into auth.users(id,email) values ($1,'admin@example.test')", [id(2)]);
  await client.query("insert into users(id,email) values ($1,'admin@example.test')", [id(2)]);
  await client.query("insert into school_memberships(school_id,user_id,role) values ($1,$2,'SCHOOL_ADMIN')", [id(1), id(2)]);
  await client.query("insert into academic_years(id,school_id,name,start_date,end_date) values ($1,$2,'2025/26','2025-09-01','2026-07-01')", [id(3), id(1)]);
  await client.query("insert into stages(id,school_id,name,sequence) values ($1,$2,'Primary',1)", [id(4), id(1)]);
  await client.query("insert into levels(id,school_id,stage_id,name,sequence) values ($1,$2,$3,'Level',1)", [id(5), id(1), id(4)]);
  await client.query("insert into curricula(id,school_id,name) values ($1,$2,'Curriculum')", [id(6), id(1)]);
  await client.query("insert into curriculum_versions(id,school_id,curriculum_id,name) values ($1,$2,$3,'Version')", [id(7), id(1), id(6)]);
  await client.query("insert into classes(id,school_id,academic_year_id,level_id,curriculum_version_id,name) values ($1,$2,$3,$4,$5,'Class')", [id(8), id(1), id(3), id(5), id(7)]);
  await client.query("insert into students(id,school_id,first_name,last_name) values ($1,$2,'Synthetic','Student')", [id(9), id(1)]);
  await client.query("insert into finance_fee_types(id,school_id,name) values ($1,$2,'Tuition')", [id(10), id(1)]);
  await client.query(`insert into finance_fee_structures(id,school_id,academic_year_id,fee_type_id,cadence,amount_cents,periods,created_by,updated_by) values ($1,$2,$3,$4,'ONCE',12345,'[{"period":"once","dueDate":"2025-12-10"}]',$5,$5)`, [id(11), id(1), id(3), id(10), id(2)]);
  await client.query(`insert into finance_generation_batches(id,school_id,request_key,request_hash,created_by,result) values ($1,$2,$1,'synthetic',$3,'{}')`, [id(12), id(1), id(2)]);
  await client.query("insert into finance_student_charges(id,school_id,student_id,academic_year_id,fee_type_id,structure_id,batch_id,class_id,fee_name,structure_revision,period,due_date,original_cents,reduction_cents,allocated_cents) values ($1,$2,$3,$4,$5,$6,$7,$8,'Tuition',1,'once','2025-12-10',12345,1000,2345)", [id(13), id(1), id(9), id(3), id(10), id(11), id(12), id(8)]);
  await client.query("insert into finance_payments(id,school_id,student_id,request_key,request_hash,receipt_reference,school_name,school_timezone,student_name,method,amount_cents,received_on,recorded_by) values ($1,$2,$3,$1,'synthetic','R-SYNTHETIC','Existing School','UTC','Synthetic Student','CASH',2345,'2025-11-01',$4)", [id(14), id(1), id(9), id(2)]);
  await client.query("insert into finance_payment_allocations(id,school_id,student_id,payment_id,charge_id,amount_cents,fee_name,period,due_date) values ($1,$2,$3,$4,$5,2345,'Tuition','once','2025-12-10')", [id(15), id(1), id(9), id(14), id(13)]);
  const tables = ['schools', 'finance_fee_structures', 'finance_student_charges', 'finance_payments', 'finance_payment_allocations'];
  const rows = async () => Promise.all(tables.map(t => client.query(`select to_jsonb(t)-'finance_currency'-'currency' row from ${t} t order by id`)));
  const before = (await rows()).map(r => r.rows);
  await client.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; BEGIN');
  for (const sql of (await readFile(join(migrationsFolder, '0025_school-finance-currency.sql'), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.exec(sql);
  await client.exec('COMMIT');
  expect((await rows()).map(r => r.rows)).toEqual(before);
  expect((await client.query('select finance_currency from schools')).rows).toEqual([{ finance_currency: 'MAD' }]);
  expect((await client.query('select currency from finance_payment_allocations')).rows).toEqual([{ currency: 'MAD' }]);
  // Verify the historical upgrade above, then reach the current schema for the current ACL inventory.
  for (const file of (await readdir(migrationsFolder)).filter(n => /^\d{4}_.+\.sql$/.test(n) && Number(n.slice(0, 4)) > 25).sort()) {
    for (const statement of (await readFile(join(migrationsFolder, file), 'utf8')).split('--> statement-breakpoint')) if (statement.trim()) await client.exec(statement);
  }
  expect((await client.query(applicationSecurityAuditSql)).rows).toEqual([]);
  await expect(client.query("update schools set finance_currency='EUR'")).rejects.toThrow();
  await expect(client.query("update finance_payment_allocations set currency='USD'")).rejects.toThrow();
  const previous = JSON.parse(await readFile(join(migrationsFolder, 'meta/0024_snapshot.json'), 'utf8'));
  const current = JSON.parse(await readFile(join(migrationsFolder, 'meta/0025_snapshot.json'), 'utf8'));
  expect(current.prevId).toBe(previous.id); expect(Object.keys(current.tables)).toEqual(Object.keys(previous.tables));
  for (const name of Object.keys(previous.tables).filter(n => !['public.schools', 'public.finance_fee_structures', 'public.finance_student_charges', 'public.finance_payments', 'public.finance_payment_allocations'].includes(n))) expect(current.tables[name]).toEqual(previous.tables[name]);
}, 30000);
