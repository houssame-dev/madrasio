// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGradesTestDb, type GradesTestDb } from '../grades/test-helpers';
import { ACCOUNT_KEYS, DATASET, SCHOOL_ID, buildDescartesPlan, descartesManifest, emailFor, fixtureId } from '../../scripts/operator/descartes-plan';
import { applyDescartes, inspectDescartes, type SeedIdentity } from '../../scripts/operator/descartes-seed';
import { main, parseDescartesConfig, descartesAuth, descartesReceipt } from '../../scripts/operator/seed-descartes-school';
import type { OperatorDatabase, OperatorSql } from '../../scripts/operator/platform-admin';
import { roleHasPermission } from '@/lib/authorization/permissions';
import { listSelfParentProfiles } from '@/lib/modules/parents/application/parent-service';
import { listChildAcademicYears } from '@/lib/modules/parents/application/parent-child-read-service';
import type { ParentsDb } from '@/lib/modules/parents/infrastructure/repositories/parent-repository';

function environment(): NodeJS.ProcessEnv {
  return { NODE_ENV: 'test', DESCARTES_TARGET_ENV: 'staging', STAGING_EXPECTED_PROJECT_REF: 'cqeaxlttezunirsmkrxz',
    MIGRATION_DATABASE_URL: 'postgresql://postgres.cqeaxlttezunirsmkrxz:local-only@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
    DATABASE_SSL_CA: rootCertificates[0], SUPABASE_URL: 'https://cqeaxlttezunirsmkrxz.supabase.co',
    SUPABASE_SECRET_KEY: 'synthetic-operator-key', DESCARTES_CONFIRMATION: 'CREATE_DESCARTES_STAGING_ONLY',
    DESCARTES_SILENT_AUTH_CONFIRMED: 'ADMIN_CREATE_CONFIRMED_NO_EMAIL_HOOKS', DESCARTES_PRIVATE_CUSTODY_CONFIRMED: 'PRIVATE_EXTERNAL_DIRECTORY_VERIFIED',
    DESCARTES_RECEIPT_PATH: `${process.cwd()}/test-results/operator.json`,
    DESCARTES_PASSWORDS_JSON: JSON.stringify(Object.fromEntries(ACCOUNT_KEYS.map(key => [key, `Synthetic-only!-${key}-123`]))),
  };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('offline plan and fail-closed operation boundary', () => {
  it('generates the exact deterministic distribution, validated slots, fees, and supported grading rules', () => {
    const manifest = descartesManifest();
    expect(buildDescartesPlan()).toEqual(buildDescartesPlan());
    expect(manifest.counts).toMatchObject({ users: 12, school_memberships: 12, schools: 1, academic_years: 1, academic_periods: 2,
      levels: 6, classes: 12, subjects: 6, curriculum_subjects: 36, students: 276, student_enrollments: 276,
      parents: 240, parent_students: 276, teachers: 6, teacher_assignments: 72, timetable_rooms: 15,
      timetable_configurations: 1, finance_fee_types: 4, finance_fee_structures: 4 });
    expect(manifest.parents).toEqual({ singleChild: 204, twoChildren: 36, totalRelationships: 276 });
    expect(manifest.accounts).toHaveLength(12);
    expect(manifest.accounts.some(a => a.twoChildren)).toBe(true);
    expect(manifest.fees.map(row => row.amount_cents)).toEqual([50000, 150000, 70000, 250000]);
    expect(manifest.fees[2].periods).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05'].map(period => ({ period, dueDate: `${period}-01` })));
    expect(manifest.operationalRecords).toBe(0);
  });
  it('dry-run needs no configuration and cannot call a provider or database', async () => {
    const fetch = vi.fn(() => { throw Error('Network prohibited'); }); vi.stubGlobal('fetch', fetch);
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    await main(['dry-run'], { NODE_ENV: 'test', SUPABASE_URL: 'https://untrusted.invalid' });
    expect(fetch).not.toHaveBeenCalled(); expect(JSON.parse(String(log.mock.calls[0][0])).counts.students).toBe(276);
    await expect(main(['invite'], { NODE_ENV: 'test' })).rejects.toThrow('EXPLICIT_DRY_RUN_OR_APPLY_REQUIRED');
  });
  it('requires distinct operator passwords and explicit apply, silent-Auth and private-custody confirmations', () => {
    expect(parseDescartesConfig(environment()).STAGING_EXPECTED_PROJECT_REF).toBe('cqeaxlttezunirsmkrxz');
    for (const key of ['DESCARTES_CONFIRMATION', 'DESCARTES_SILENT_AUTH_CONFIRMED', 'DESCARTES_PRIVATE_CUSTODY_CONFIRMED', 'DESCARTES_PASSWORDS_JSON']) {
      const env = environment(); delete env[key]; expect(() => parseDescartesConfig(env)).toThrow();
    }
    expect(() => parseDescartesConfig({ ...environment(), DESCARTES_PASSWORDS_JSON: JSON.stringify({ admin: 'One-password-only!' }) })).toThrow();
  });
  it.each([{ DESCARTES_TARGET_ENV: 'production' }, { STAGING_EXPECTED_PROJECT_REF: 'other' },
    { SUPABASE_URL: 'https://production.example.test' }, { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    { DATABASE_SSL_CA: 'invalid' }, { HTTPS_PROXY: 'http://proxy.example.test' }, { NODE_OPTIONS: '--require unexpected' }])('rejects unsafe configuration %#', change => {
    expect(() => parseDescartesConfig({ ...environment(), ...change })).toThrow();
  });
  it('uses only silent Admin createUser, with confirmed email and no authorization claims', async () => {
    const fetch = vi.fn(async (_input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.email_confirm).toBe(true); expect(body.email).toBe(emailFor('admin'));
      expect(body.user_metadata).toEqual({ fictional_dataset: DATASET, fictional_account: 'admin', preferred_locale: 'fr' });
      expect(body.app_metadata).toBeUndefined();
      return new Response(JSON.stringify({ id: fixtureId('auth:admin'), email: body.email, email_confirmed_at: '2026-01-01', user_metadata: body.user_metadata, app_metadata: {} }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    await descartesAuth(parseDescartesConfig(environment())).create('admin', 'Synthetic-only-password!');
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0][0])).toBe('https://cqeaxlttezunirsmkrxz.supabase.co/auth/v1/admin/users');
  });
  it('inspects only the reserved identities and verifies exact UUIDs without an Auth directory scan', async () => {
    const id = fixtureId('auth:admin');
    const fetch = vi.fn(async (_input: Parameters<typeof globalThis.fetch>[0]) => new Response(JSON.stringify({ id, email: emailFor('admin'), email_confirmed_at: '2026-01-01',
      user_metadata: { fictional_dataset: DATASET, fictional_account: 'admin', preferred_locale: 'fr' }, app_metadata: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const query = vi.fn(async () => ({ rows: [{ id }] }));
    expect(await descartesAuth(parseDescartesConfig(environment())).inspect({ query })).toHaveLength(1);
    expect(query).toHaveBeenCalledWith('select id::text from auth.users where lower(btrim(email))=any($1::text[])', [ACCOUNT_KEYS.map(emailFor)]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0][0])).toBe(`https://cqeaxlttezunirsmkrxz.supabase.co/auth/v1/admin/users/${id}`);
  });
  it('keeps receipts outside the repository, stores only safe evidence and never overwrites an existing operation', async () => {
    await expect(descartesReceipt(path.join(process.cwd(), 'operator.json'))).rejects.toThrow('EXTERNAL_PRIVATE_RECEIPT_REQUIRED');
    const folder = await mkdtemp(path.join(tmpdir(), 'madrasio-descartes-receipt-'));
    try {
      const filename = path.join(folder, 'receipt.json');
      const receipt = await descartesReceipt(filename);
      await receipt.start(); await receipt.record({ phase: 'auth-attempt', account: 'admin' });
      const evidence = JSON.parse(await readFile(filename, 'utf8'));
      expect(evidence.dataset).toBe(DATASET); expect(evidence.events[0].phase).toBe('auth-attempt');
      expect(Object.keys(evidence.events[0]).sort()).toEqual(['account', 'at', 'phase']);
      await expect(receipt.start()).rejects.toThrow();
    } finally {
      if (path.dirname(folder) !== path.resolve(tmpdir()) || !path.basename(folder).startsWith('madrasio-descartes-receipt-')) throw Error('UNEXPECTED_TEMP_PATH');
      await rm(folder, { recursive: true, force: true });
    }
  });
});

describe('canonical migration replay and tenant-safe apply (local PGlite only)', () => {
  let fixture: GradesTestDb;
  let db: OperatorDatabase;
  let tx: OperatorSql;
  let users: SeedIdentity[];
  let create: ReturnType<typeof vi.fn<(key: string, password: string) => Promise<SeedIdentity>>>;
  let start: ReturnType<typeof vi.fn>;
  let record: ReturnType<typeof vi.fn>;
  const passwords = Object.fromEntries(ACCOUNT_KEYS.map(key => [key, `Synthetic-${key}-only!`]));
  beforeEach(async () => {
    fixture = await createGradesTestDb(); users = [];
    tx = { query: async (text, values) => ({ rows: (await fixture.client.query<Record<string, unknown>>(text, values)).rows }) };
    db = { transaction: async (_readOnly, work) => fixture.client.transaction(async transaction => work({ query: async (text, values) => ({ rows: (await transaction.query<Record<string, unknown>>(text, values)).rows }) })) };
    // Test-only Auth projection. Production never uses SQL to create Auth users.
    for (const key of ACCOUNT_KEYS) await tx.query('insert into auth.users(id,email) values($1,$2)', [fixtureId(`auth:${key}`), emailFor(key)]);
    create = vi.fn(async (key: string) => {
      const user = { id: fixtureId(`auth:${key}`), email: emailFor(key), dataset: DATASET, account: key, locale: 'fr', eligible: true };
      users.push(user); return user;
    });
    start = vi.fn(async () => {}); record = vi.fn(async () => {});
  }, 30000);
  afterEach(async () => { await fixture?.client.close(); });
  const run = () => applyDescartes({ db, auth: { inspect: async () => users, create }, receipt: { start, record }, passwords });

  it('replays all prerequisites, exact parent/class distributions, memberships and historical fields; completed rerun writes nothing', async () => {
    expect((await run()).status).toBe('created');
    expect(await inspectDescartes(tx, buildDescartesPlan())).toBe('complete');
    expect(create).toHaveBeenCalledTimes(12);
    expect((await tx.query('select count(*)::int n from public.student_enrollments group by class_id')).rows.every(r => r.n === 23)).toBe(true);
    const distribution = (await tx.query('select n,count(*)::int parents from (select count(*)::int n from public.parent_students group by parent_id) p group by n order by n')).rows;
    expect(distribution).toEqual([{ n: 1, parents: 204 }, { n: 2, parents: 36 }]);
    expect((await tx.query("select role,count(*)::int n from public.school_memberships group by role order by role::text")).rows).toEqual([{ role: 'PARENT', n: 5 }, { role: 'SCHOOL_ADMIN', n: 1 }, { role: 'TEACHER', n: 6 }]);
    expect(roleHasPermission('PARENT', 'timetable.manage')).toBe(false); expect(roleHasPermission('TEACHER', 'finance.manage')).toBe(false);
    expect(roleHasPermission('SCHOOL_ADMIN', 'timetable.manage')).toBe(true);
    const before = (await tx.query('select id,created_at,updated_at from public.students order by id')).rows;
    expect((await run()).status).toBe('already-complete'); expect(create).toHaveBeenCalledTimes(12); expect(start).toHaveBeenCalledOnce();
    expect((await tx.query('select id,created_at,updated_at from public.students order by id')).rows).toEqual(before);
    expect((await tx.query('select count(*)::int n from public.parents where user_id is null')).rows).toEqual([{ n: 235 }]);
    expect((await tx.query("select count(distinct first_name || ' ' || last_name)::int n from public.parents")).rows).toEqual([{ n: 240 }]);
    expect((await tx.query('select s.id from public.students s join public.parent_students ps on ps.student_id=s.id join public.parents p on p.id=ps.parent_id where s.last_name<>p.last_name')).rows).toEqual([]);
  });
  it('resolves real Parent child scope from membership and relationships, not metadata', async () => {
    await run();
    const parentDb = fixture.seed as unknown as ParentsDb;
    const actor = { userId: fixtureId('auth:parent-205'), schoolId: SCHOOL_ID };
    const profiles = await listSelfParentProfiles(parentDb, actor);
    expect(profiles.data).toHaveLength(1);
    expect(profiles.data[0].children.map(child => child.student.id).sort()).toEqual([fixtureId('student:0'), fixtureId('student:230')].sort());
    expect((await listChildAcademicYears(parentDb, actor, fixtureId('student:0'))).data).toHaveLength(1);
    await expect(listChildAcademicYears(parentDb, actor, fixtureId('student:36'))).rejects.toThrow();
    await tx.query("update public.school_memberships set status='INACTIVE' where user_id=$1", [actor.userId]);
    await expect(listSelfParentProfiles(parentDb, actor)).rejects.toThrow();
  });
  it('serializes duplicate local apply attempts and creates each account once', async () => {
    expect((await Promise.all([run(), run()])).map(result => result.status).sort()).toEqual(['already-complete', 'created']);
    expect(create).toHaveBeenCalledTimes(12); expect(start).toHaveBeenCalledOnce();
  });
  it('preserves an unrelated School and rejects cross-School links at the actual FK', async () => {
    const other = randomUUID(); await tx.query("insert into public.schools(id,name) values($1,'Untouched tenant')", [other]);
    const before = (await tx.query('select * from public.schools where id=$1', [other])).rows;
    await run();
    expect((await tx.query('select * from public.schools where id=$1', [other])).rows).toEqual(before);
    await expect(tx.query('update public.parent_students set school_id=$1 where id=$2', [other, fixtureId('relationship:0')])).rejects.toThrow();
  });
  it('fails closed on a conflicting School name without creating any identities', async () => {
    await tx.query("insert into public.schools(name) values('Descartes School')");
    await expect(run()).rejects.toThrow('PARTIAL_OR_CHANGED_DATASET'); expect(create).not.toHaveBeenCalled();
  });
  it('rejects modified financial/configuration data rather than overwriting it', async () => {
    await run(); await tx.query('update public.finance_fee_structures set amount_cents=1 where school_id=$1', [SCHOOL_ID]);
    await expect(run()).rejects.toThrow('PARTIAL_OR_CHANGED_DATASET'); expect(create).toHaveBeenCalledTimes(12);
    expect((await tx.query('select amount_cents from public.finance_fee_structures')).rows.every(r => r.amount_cents === 1)).toBe(true);
  });
  it('rejects incomplete Auth inventory and refuses to adopt a different identity', async () => {
    await run(); users.pop(); await expect(run()).rejects.toThrow('PARTIAL_AUTH'); expect(create).toHaveBeenCalledTimes(12);
  });
  it('persists attempt evidence before each Auth call; ambiguous creation stops without retry or SQL application rows', async () => {
    create.mockImplementationOnce(async () => { throw Error('uncertain provider result'); });
    await expect(run()).rejects.toThrow('uncertain provider result'); expect(create).toHaveBeenCalledOnce();
    expect(record.mock.calls[0][0]).toEqual({ phase: 'auth-attempt', account: 'admin' });
    expect((await tx.query('select id from public.schools')).rows).toEqual([]);
  });
  it('does not create Auth identities if durable receipt creation fails', async () => {
    start.mockRejectedValueOnce(Error('custody failure')); await expect(run()).rejects.toThrow('custody failure'); expect(create).not.toHaveBeenCalled();
  });
  it('rolls back all application inserts on SQL failure and retains Auth evidence without unsafe retries', async () => {
    const original = db.transaction;
    db.transaction = (readOnly, work) => original(readOnly, connection => work({ query: async (sql, values) => {
      if (sql.startsWith('insert into public."timetable_rooms"')) throw Error('synthetic SQL failure');
      return connection.query(sql, values);
    } }));
    await expect(run()).rejects.toThrow('synthetic SQL failure'); expect(create).toHaveBeenCalledTimes(12);
    expect((await tx.query('select id from public.schools')).rows).toEqual([]);
    expect(record).toHaveBeenCalledWith({ phase: 'auth-created', account: 'parent-205', authId: fixtureId('auth:parent-205') });
    db.transaction = original;
    await expect(run()).rejects.toThrow('IDENTITY_RECONCILIATION_REQUIRED'); expect(create).toHaveBeenCalledTimes(12);
  });
  it('detects tenant context in outbox JSON while leaving other Schools events untouched', async () => {
    await tx.query("insert into public.outbox_events(event_type,payload) values('SyntheticOtherSchool',$1)", [JSON.stringify({ schoolId: randomUUID() })]);
    await run();
    await tx.query("insert into public.outbox_events(event_type,payload) values('SyntheticDescartes',$1)", [JSON.stringify({ schoolId: SCHOOL_ID })]);
    await expect(run()).rejects.toThrow('UNEXPECTED_TENANT_DATA');
    expect((await tx.query('select id from public.outbox_events')).rows).toHaveLength(2);
  });
  it('detects later operational data and does not reset it on rerun', async () => {
    await run();
    await tx.query("insert into public.timetable_loads(school_id,academic_year_id,class_id,subject_id,curriculum_version_id,teacher_assignment_id,lessons_per_week,duration_minutes,revision,created_by) values($1,$2,$3,$4,$5,$6,2,50,1,$7)", [SCHOOL_ID, fixtureId('year'), fixtureId('class:0'), fixtureId('subject:0'), fixtureId('version:0'), fixtureId('assignment:0:0'), fixtureId('auth:admin')]);
    await expect(run()).rejects.toThrow('UNEXPECTED_TENANT_DATA'); expect(create).toHaveBeenCalledTimes(12);
    expect((await tx.query('select id from public.timetable_loads')).rows).toHaveLength(1);
  });
});
