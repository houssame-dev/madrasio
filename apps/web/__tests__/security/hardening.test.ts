import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSupabaseKeys } from '@/lib/config/supabase-keys';
import { securityHeaders, privateResponseHeaders } from '@/lib/config/security-headers';
import { postgresConnectionConfig, postgresMigrationCredentials } from '@school/database/connection';
import { EXPECTED_LATEST_MIGRATION, EXPECTED_MIGRATION_COUNT } from '@/scripts/deployment/contracts';

describe('Task 047 security contracts', () => {
  it('new-only key configuration needs no legacy aliases', () => {
    expect(resolveSupabaseKeys({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-fixture', SUPABASE_SECRET_KEY: 'private-fixture' }))
      .toEqual({ publishableKey: 'public-fixture', secretKey: 'private-fixture' });
  });
  it('retired aliases never satisfy the modern key contract', () => {
    expect(resolveSupabaseKeys({ SUPABASE_ANON_KEY: 'legacy-public', SUPABASE_SERVICE_ROLE_KEY: 'legacy-secret' }))
      .toEqual({ publishableKey: undefined, secretKey: undefined });
    expect(resolveSupabaseKeys({ SUPABASE_SECRET_KEY: 'never-public' }).publishableKey).toBeUndefined();
  });
  it('keeps runtime and operator code free of retired API-key aliases', async () => {
    const retired = /NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY/;
    for (const file of [
      'lib/config/env.ts',
      'lib/config/supabase-keys.ts',
      'lib/supabase/browser.ts',
      'lib/supabase/server.ts',
      'lib/auth/admin.ts',
      'scripts/operator/contracts.ts',
      'scripts/operator/runtime.ts',
      'scripts/operator/verify-staging-user-provisioning.ts',
      'scripts/deployment/contracts.ts',
    ]) {
      expect(await readFile(resolve(process.cwd(), file), 'utf8'), file).not.toMatch(retired);
    }
  });
  it('keeps normal SSR sessions on the publishable key and Auth Admin server-only', async () => {
    const session = await readFile(resolve(process.cwd(), 'lib/supabase/server.ts'), 'utf8');
    const admin = await readFile(resolve(process.cwd(), 'lib/auth/admin.ts'), 'utf8');
    expect(session).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    expect(session).not.toContain('SUPABASE_SECRET_KEY');
    expect(admin).toContain('SUPABASE_SECRET_KEY');
    expect(admin).toMatch(/^import 'server-only';/);
  });
  it('refuses elevated credentials in public/session key configuration without echoing values', () => {
    expect(() => resolveSupabaseKeys({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test_only' })).toThrow('cannot be public');
    const fixture = `fixture.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`;
    expect(() => resolveSupabaseKeys({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixture })).toThrow('cannot be public');
  });
  it('sets conservative headers and private caches without broad CSP or CORS allowances', () => {
    const headers = Object.fromEntries(securityHeaders.map(({ key, value }) => [key, value]));
    expect(headers).toMatchObject({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' });
    expect(privateResponseHeaders[0].value).toContain('no-store');
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(headers['Strict-Transport-Security']).not.toContain('includeSubDomains');
  });
  it('requires certificate-verified TLS remotely and permits plain loopback test databases', () => {
    const remote = 'postgresql://test:fixture@db.example.test:5432/postgres';
    expect(postgresConnectionConfig(remote).ssl).toEqual({ rejectUnauthorized: true });
    expect(postgresConnectionConfig(`${remote}?sslmode=require`, 'certificate-fixture').ssl).toEqual({ rejectUnauthorized: true, ca: 'certificate-fixture' });
    expect(postgresConnectionConfig(`${remote}?sslmode=no-verify`).ssl).toEqual({ rejectUnauthorized: true });
    expect(() => postgresConnectionConfig(`${remote}?sslmode=disable`)).toThrow('verified TLS');
    expect(() => postgresConnectionConfig(`${remote}?sslrootcert=untrusted-file`)).toThrow('TLS configuration');
    expect(postgresConnectionConfig('postgresql://localhost/test').ssl).toBeUndefined();
    const migration = postgresMigrationCredentials(remote, 'ca-fixture');
    expect(migration).not.toHaveProperty('url');
    expect(migration.ssl).toEqual({ rejectUnauthorized: true, ca: 'ca-fixture' });
  });
  it('keeps elevated and database clients server-only', async () => {
    for (const file of ['lib/auth/admin.ts','lib/db/client.ts','lib/supabase/server.ts']) {
      expect(await readFile(resolve(process.cwd(), file), 'utf8')).toMatch(/^import 'server-only';/);
    }
  });
  it('documents only the modern API-key names in the active environment template', async () => {
    const example = await readFile(resolve(process.cwd(), '../../.env.example'), 'utf8');
    expect(example).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=');
    expect(example).toContain('SUPABASE_SECRET_KEY=');
    expect(example).not.toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  });
  it('uses the complete redirect target once in the reviewable invite template', async () => {
    const template = await readFile(resolve(process.cwd(), '../../docs/operations/auth-invite-template.html'), 'utf8');
    expect(template).toContain('{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=invite');
    expect(template).not.toContain('ConfirmationURL');
    expect(template).not.toContain('/auth/confirm');
    expect(template).not.toContain('.Data');
  });
  it('requires the reviewed security migration before deployment', () => {
    expect(EXPECTED_MIGRATION_COUNT).toBe(16);
    expect(EXPECTED_LATEST_MIGRATION).toBe('0015_data-api-grants-hardening');
  });
});
