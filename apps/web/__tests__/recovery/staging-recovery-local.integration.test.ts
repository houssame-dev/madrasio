import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';

const acceptedTarget = vi.hoisted(() => ({ url: '' }));
vi.mock('@/scripts/recovery/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/scripts/recovery/contracts')>();
  return {
    ...actual,
    assertStagingRecoveryTarget: () => new URL(acceptedTarget.url),
  };
});

import { STAGING_PROJECT_REF } from '@/scripts/deployment/contracts';
import {
  cleanupStagingRecoveryBundle,
  createStagingRecoveryBundle,
  type StagingRecoveryBundle,
} from '@/scripts/recovery/create-staging-recovery-bundle';
import {
  cleanupLocalRecoveryTarget,
  createLocalRecoveryTarget,
  type LocalTargetState,
} from '@/scripts/recovery/local-target';
import { restoreLocalRecoveryBundle } from '@/scripts/recovery/restore-local';
import { PINNED_POSTGRES_CONTAINER, runCommand } from '@/scripts/recovery/tools';

const live = process.env.RECOVERY_TEST_LOCAL_TARGET === '1';
const gitSha = 'c'.repeat(40);
let target: LocalTargetState | undefined;
let bundle: StagingRecoveryBundle | undefined;
let keyDirectory: string | undefined;
let previousPostgresImage: string | undefined;

function databaseUrl(state: LocalTargetState): string {
  return (
    `postgresql://postgres:${encodeURIComponent(state.databasePassword)}` +
    `@127.0.0.1:${state.databasePort}/postgres`
  );
}

afterEach(async () => {
  if (target) await cleanupLocalRecoveryTarget(target.statePath).catch(() => undefined);
  if (bundle) await cleanupStagingRecoveryBundle(bundle).catch(() => undefined);
  if (keyDirectory) await rm(keyDirectory, { recursive: true, force: true });
  target = undefined;
  bundle = undefined;
  keyDirectory = undefined;
  acceptedTarget.url = '';
  process.env.RECOVERY_POSTGRES_CONTAINER_IMAGE = previousPostgresImage;
  previousPostgresImage = undefined;
});

describe.skipIf(!live)('STAGING recovery bundle local integration', () => {
  it('round-trips nonempty Auth and relational data through the guarded wrapper and V1 restore', async () => {
    target = await createLocalRecoveryTarget();
    acceptedTarget.url = databaseUrl(target);
    previousPostgresImage = process.env.RECOVERY_POSTGRES_CONTAINER_IMAGE;
    process.env.RECOVERY_POSTGRES_CONTAINER_IMAGE = PINNED_POSTGRES_CONTAINER;
    const sourcePool = new Pool({ connectionString: acceptedTarget.url, ssl: false });
    const userId = '11111111-1111-4111-8111-111111111111';
    const identityId = '22222222-2222-4222-8222-222222222222';
    const schoolId = '33333333-3333-4333-8333-333333333333';
    const membershipId = '44444444-4444-4444-8444-444444444444';
    try {
      await runCommand('pnpm', ['--filter', '@school/database', 'migrate'], {
        env: { MIGRATION_DATABASE_URL: acceptedTarget.url },
      });
      await sourcePool.query(
        `insert into auth.users
          (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
         values ($1,'authenticated','authenticated','synthetic@example.invalid','synthetic-not-a-real-hash',now(),'{}','{}',now(),now())`,
        [userId],
      );
      await sourcePool.query(
        `insert into auth.identities
          (id,provider_id,user_id,identity_data,provider,created_at,updated_at)
         values ($1::uuid,$2::text,$2::uuid,jsonb_build_object('sub',$2::text,'email','synthetic@example.invalid'),'email',now(),now())`,
        [identityId, userId],
      );
      await sourcePool.query(
        `insert into public.users (id,email) values ($1,'synthetic@example.invalid')`,
        [userId],
      );
      await sourcePool.query(
        `insert into public.schools (id,name) values ($1,'Synthetic STAGING Recovery School')`,
        [schoolId],
      );
      await sourcePool.query(
        `insert into public.school_memberships (id,school_id,user_id,role)
         values ($1,$2,$3,'SCHOOL_ADMIN')`,
        [membershipId, schoolId, userId],
      );
    } finally {
      await sourcePool.end();
    }

    keyDirectory = await mkdtemp(join(tmpdir(), 'madrasio-stage6-age-'));
    const identityPath = join(keyDirectory, 'identity.txt');
    await runCommand('age-keygen', ['-o', identityPath]);
    const identity = await readFile(identityPath, 'utf8');
    const recipient = /^# public key: (age1\S+)$/m.exec(identity)?.[1];
    expect(recipient).toMatch(/^age1/);

    bundle = await createStagingRecoveryBundle({
      NODE_ENV: 'test',
      DEPLOY_TARGET_ENV: 'staging',
      STAGING_EXPECTED_PROJECT_REF: STAGING_PROJECT_REF,
      MIGRATION_DATABASE_URL: acceptedTarget.url,
      STAGING_APP_ORIGIN: 'https://madrasio-staging.vercel.app',
      RECOVERY_GIT_SHA: gitSha,
      BACKUP_AGE_RECIPIENT: recipient,
      RECOVERY_POSTGRES_CONTAINER_IMAGE: PINNED_POSTGRES_CONTAINER,
    });
    expect(bundle.authUserCount).toBe(1);
    expect(bundle.applicationTableCount).toBe(39);

    await cleanupLocalRecoveryTarget(target.statePath);
    target = await createLocalRecoveryTarget();
    const restoredUrl = databaseUrl(target);
    await expect(
      restoreLocalRecoveryBundle({
        NODE_ENV: 'test',
        RESTORE_TARGET_ENV: 'isolated-local',
        RESTORE_CONFIRMATION: 'RESTORE_ISOLATED_LOCAL',
        RESTORE_DATABASE_URL: restoredUrl,
        RECOVERY_BUNDLE_PATH: bundle.outputPath,
        RECOVERY_AGE_IDENTITY_PATH: identityPath,
        RECOVERY_EXPECTED_SOURCE_PROJECT_REF: STAGING_PROJECT_REF,
        RECOVERY_REPOSITORY_GIT_SHA: gitSha,
        RECOVERY_POSTGRES_CONTAINER_IMAGE: PINNED_POSTGRES_CONTAINER,
      }),
    ).resolves.toMatchObject({ tables: 41 });
    const restoredPool = new Pool({ connectionString: restoredUrl, ssl: false });
    try {
      await expect(
        restoredPool.query(
          `select
            (select count(*)::int from auth.users) auth_users,
            (select count(*)::int from auth.identities) auth_identities,
            (select count(*)::int from public.users) users,
            (select count(*)::int from public.schools) schools,
            (select count(*)::int from public.school_memberships) memberships`,
        ),
      ).resolves.toMatchObject({
        rows: [{ auth_users: 1, auth_identities: 1, users: 1, schools: 1, memberships: 1 }],
      });
    } finally {
      await restoredPool.end();
    }
  }, 600_000);
});
