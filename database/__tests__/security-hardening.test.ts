import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, describe, expect, it } from 'vitest';
import { applicationSecurityAuditSql, assertApplicationSecurity } from '../security';
import { createSupabaseAuth, migrationsFolder } from './helpers';

const clients: PGlite[] = [];
afterEach(async () => { await Promise.all(clients.splice(0).map((c) => c.close())); });

async function fixture(broadDefaults: boolean) {
  const client = new PGlite();
  clients.push(client);
  await createSupabaseAuth(client);
  await client.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA storage;
    ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES TO service_role;
    CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN END $$;`);
  if (broadDefaults) await client.exec(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;`);
  await migrate(drizzle(client), { migrationsFolder });
  return client;
}

describe('0015 application privilege hardening', () => {
  it.each([false, true])('replays the full chain with broad defaults=%s and preserves platform access', async (broad) => {
    const client = await fixture(broad);
    expect((await client.query(applicationSecurityAuditSql)).rows).toEqual([]);
    expect((await client.query<{ count: number }>('select count(*)::int as count from drizzle.__drizzle_migrations')).rows[0].count).toBe(16);
    expect((await client.query<{ ok: boolean }>(`select has_function_privilege('anon','public.rls_auto_enable()','EXECUTE') as ok`)).rows[0].ok).toBe(true);
    await client.exec('CREATE TABLE storage.platform_probe (id int)');
    expect((await client.query<{ ok: boolean }>(`select has_table_privilege('service_role','storage.platform_probe','SELECT') as ok`)).rows[0].ok).toBe(true);
    const fk = await client.query(`select 1 from pg_constraint where conrelid='public.users'::regclass and confrelid='auth.users'::regclass and confdeltype='c'`);
    expect(fk.rows).toHaveLength(1);
    await client.exec(`INSERT INTO auth.users(id,email) VALUES ('04700000-0000-4000-8000-000000000001','security@example.test');
      INSERT INTO public.users(id,email) VALUES ('04700000-0000-4000-8000-000000000001','security@example.test');`);
    expect((await client.query('select id from public.users')).rows).toHaveLength(1);
    await client.exec("SET ROLE anon");
    await expect(client.query('select * from public.users')).rejects.toThrow();
    await client.exec('RESET ROLE');
  });

  it('hardened defaults protect new tables and sequences without changing function defaults', async () => {
    const client = await fixture(true);
    await client.exec(`CREATE TABLE public.security_probe (id int);
      CREATE SEQUENCE public.security_probe_seq;
      CREATE FUNCTION public.security_probe_fn() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;`);
    for (const role of ['anon','authenticated','service_role']) {
      const result = await client.query<{ table_access: boolean; sequence_access: boolean; function_access: boolean }>(
        `select has_table_privilege($1,'public.security_probe','SELECT,INSERT,UPDATE,DELETE') as table_access,
          has_sequence_privilege($1,'public.security_probe_seq','USAGE,SELECT,UPDATE') as sequence_access,
          has_function_privilege($1,'public.security_probe_fn()','EXECUTE') as function_access`, [role]);
      expect(result.rows[0]).toEqual({ table_access: false, sequence_access: false, function_access: true });
    }
  });

  it('the deployment verifier refuses introduced grants, disabled RLS, policies and unsafe defaults', async () => {
    const client = await fixture(true);
    for (const mutation of [
      'GRANT SELECT ON public.users TO anon',
      'ALTER TABLE public.users DISABLE ROW LEVEL SECURITY',
      'CREATE POLICY unsafe ON public.users USING (true)',
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role',
      'CREATE FUNCTION public.unsafe_application_fn() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$',
    ]) {
      await client.exec('BEGIN');
      await client.exec(mutation);
      const rows = (await client.query<{ violation: string }>(applicationSecurityAuditSql)).rows;
      expect(() => assertApplicationSecurity(rows)).toThrow('security invariants failed');
      await client.exec('ROLLBACK');
    }
  });

  it('preserves creator-wide platform function behavior and all function default ACLs', async () => {
    const client = await fixture(true);
    await client.exec('CREATE FUNCTION storage.future_platform_fn() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect((await client.query<{ ok: boolean }>("select has_function_privilege($1,'storage.future_platform_fn()','EXECUTE') as ok", [role])).rows[0].ok).toBe(true);
    }
    // No creator-wide function default was added; the pre-existing public-schema
    // API grants remain too. Application migrations must revoke exact functions.
    expect((await client.query("select 1 from pg_default_acl where defaclrole='postgres'::regrole and defaclnamespace=0 and defaclobjtype='f'")).rows).toHaveLength(0);
    expect((await client.query("select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) x where d.defaclrole='postgres'::regrole and d.defaclnamespace='public'::regnamespace and d.defaclobjtype='f' and x.grantee in ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole)")).rows).toHaveLength(3);
  });

  it('requires exact-signature execution revokes in the application-function migration', async () => {
    const client = await fixture(true);
    await client.exec(`BEGIN;
      CREATE FUNCTION public.application_probe() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
      REVOKE ALL ON FUNCTION public.application_probe() FROM PUBLIC, anon, authenticated, service_role;
      COMMIT;`);
    expect((await client.query(applicationSecurityAuditSql)).rows).toEqual([]);
    for (const grantee of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
      await client.exec('BEGIN');
      await client.exec(`GRANT EXECUTE ON FUNCTION public.application_probe() TO ${grantee}`);
      const rows = (await client.query<{ violation: string }>(applicationSecurityAuditSql)).rows;
      expect(rows.map((row) => row.violation)).toContain('function_grants');
      expect(() => assertApplicationSecurity(rows)).toThrow();
      await client.exec('ROLLBACK');
    }
  });
});
