// @vitest-environment node

import { createServerClient } from '@supabase/ssr';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

const describeStaging = process.env.RUN_STAGING_INTEGRATION === '1' ? describe : describe.skip;

describeStaging('Supabase staging integration', () => {
  afterAll(async () => {
    const { closeDb } = await import('@/lib/db/client');
    await closeDb();
  });

  it('runs ordinary Drizzle queries through the configured runtime pool', async () => {
    const { getDb } = await import('@/lib/db/client');
    const result = await getDb().execute(sql`
      select current_database() as database, current_user as role
    `);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ database: 'postgres', role: 'postgres' });
  });

  it('supports application transaction behavior without leaving data', async () => {
    const { getDb } = await import('@/lib/db/client');
    const rollback = new Error('TASK_041_EXPECTED_ROLLBACK');

    await expect(
      getDb().transaction(async (transaction) => {
        const result = await transaction.execute(sql`select txid_current() as transaction_id`);
        expect(result.rows).toHaveLength(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('resolves unauthenticated browser and server Auth state', async () => {
    const [{ getServerEnv }, { getBrowserSupabase }] = await Promise.all([
      import('@/lib/config/env'),
      import('@/lib/supabase/browser'),
    ]);
    const env = getServerEnv();
    expect(new URL(env.SUPABASE_URL).hostname).toBe('cqeaxlttezunirsmkrxz.supabase.co');

    const browserResult = await getBrowserSupabase().auth.getUser();
    expect(browserResult.data.user).toBeNull();

    const serverClient = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => [],
        setAll: () => undefined,
      },
    });
    const serverResult = await serverClient.auth.getUser();
    expect(serverResult.data.user).toBeNull();

    const signInResult = await serverClient.auth.signInWithPassword({
      email: 'task041-nonexistent@invalid.example',
      password: 'Task041-not-a-real-password',
    });
    expect(signInResult.data.user).toBeNull();
    expect(signInResult.error).not.toBeNull();
  });
});
