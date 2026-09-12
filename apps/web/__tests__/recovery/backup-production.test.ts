import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  appendSafeBackupSummary,
  createRecoveryObjectKey,
  executeVerifiedBackup,
} from '@/scripts/recovery/automation';
import { RecoveryError, safeRecoveryError } from '@/scripts/recovery/contracts';
import type { ProductionRecoveryBundle } from '@/scripts/recovery/create-production-backup';
import {
  cleanupRecoveryWorkDirectory,
  createRecoveryWorkDirectory,
} from '@/scripts/recovery/filesystem';
import { CronitorRecoveryHeartbeat } from '@/scripts/recovery/heartbeat';
import { R2RecoveryObjectStore } from '@/scripts/recovery/r2';
import { PINNED_POSTGRES_CONTAINER } from '@/scripts/recovery/tools';

const sha = 'a'.repeat(64);
const bundle: ProductionRecoveryBundle = {
  backupId: '20260912T010203Z-2381dc311dff-0123456789abcdef',
  snapshotAt: '2026-09-12T01:02:03.000Z',
  outputPath: 'cipher.age',
  bytes: 6,
  ciphertextSha256: sha,
  applicationTableCount: 39,
  authUserCount: 0,
};

function workflowText(): Promise<string> {
  return readFile(resolve(process.cwd(), '../../.github/workflows/backup-production.yml'), 'utf8');
}

describe('Production backup workflow contract', () => {
  it('is manually confirmed, SHA-bound, environment-scoped, bounded and non-cancelling', async () => {
    const workflow = await workflowText();
    expect(workflow).toContain('name: Backup Production');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('test "$MANUAL_CONFIRMATION" = \'BACKUP_PRODUCTION\'');
    expect(workflow).toContain('^[a-f0-9]{40}$');
    expect(workflow).toContain('git merge-base --is-ancestor');
    expect(workflow).toContain("workflow_id: 'ci.yml'");
    expect(workflow).toContain('environment: Production');
    expect(workflow).toContain('group: production-backup');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('timeout-minutes: 60');
    expect(workflow).not.toMatch(/contents:\s*write/);
  });

  it('defines disabled-by-default offset schedules and deterministic weekly retention', async () => {
    const workflow = await workflowText();
    expect(workflow).toContain("cron: '23 1,5,9,13,17,21 * * *'");
    expect(workflow).toContain("cron: '47 2 * * 0'");
    expect(workflow).toContain(
      'AUTOMATION_ENABLED: ${{ vars.PRODUCTION_BACKUP_AUTOMATION_ENABLED }}',
    );
    expect(workflow).toContain('needs.gate.outputs.should-run');
    expect(workflow).toContain('"$AUTOMATION_ENABLED" != \'true\'');
    expect(workflow).toContain("github.event.schedule == '47 2 * * 0' && 'weekly'");
    expect(workflow).toContain('no recovery point was attempted');
  });

  it('keeps secrets step-local and invokes no migration, seed, restore or deploy action', async () => {
    const workflow = await workflowText();
    expect(workflow).toContain('MIGRATION_DATABASE_URL: ${{ secrets.MIGRATION_DATABASE_URL }}');
    expect(workflow).toContain('DATABASE_SSL_CA: ${{ secrets.DATABASE_SSL_CA }}');
    expect(workflow).toContain('R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}');
    expect(workflow).toContain('BACKUP_HEARTBEAT_URL: ${{ secrets.BACKUP_HEARTBEAT_URL }}');
    expect(workflow).toContain('run: pnpm recovery:backup:production');
    expect(workflow).not.toMatch(/pnpm (db:|seed|bootstrap|recovery:restore|deploy:)/);
    expect(workflow.indexOf('Validate backup request before privileged access')).toBeLessThan(
      workflow.indexOf('MIGRATION_DATABASE_URL: ${{ secrets.MIGRATION_DATABASE_URL }}'),
    );
  });

  it('pins verified tools and always performs bounded temporary cleanup', async () => {
    const workflow = await workflowText();
    expect(workflow).toContain('age-v1.3.1-linux-amd64.tar.gz');
    expect(workflow).toContain('bdc69c09cbdd6cf8b1f333d372a1f58247b3a33146406333e30c0f26e8f51377');
    expect(workflow).toContain(PINNED_POSTGRES_CONTAINER);
    expect(workflow).not.toMatch(/AGE_SECRET|AGE_PRIVATE|AGE_IDENTITY/);
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain("const prefixes = ['madrasio-recovery-', 'madrasio-pgssl-']");
  });
});

describe('verified backup orchestration', () => {
  async function fixture() {
    const directory = await createRecoveryWorkDirectory();
    const outputPath = join(directory, 'cipher.age');
    const readbackPath = join(directory, 'readback.age');
    await writeFile(outputPath, 'cipher');
    const events: string[] = [];
    const store = {
      putImmutable: vi.fn(async () => {
        events.push('upload');
      }),
      head: vi.fn(async (key: string) => {
        events.push('head');
        return { key, bytes: 6, sha256: sha };
      }),
      download: vi.fn(async (_key: string, destination: string) => {
        events.push('download');
        await writeFile(destination, 'cipher');
      }),
    };
    const heartbeat = {
      success: vi.fn(async () => {
        events.push('heartbeat-success');
      }),
      failure: vi.fn(async () => {
        events.push('heartbeat-failure');
      }),
    };
    return { directory, outputPath, readbackPath, events, store, heartbeat };
  }

  it('uploads immutably, independently reads back and hashes before success heartbeat', async () => {
    const item = await fixture();
    try {
      const actualSha = 'c806cd9c716cfbfdb4763c71dd1394b3e602fce81291a0338bf8e3225416ac32';
      const result = await executeVerifiedBackup({
        retentionClass: 'frequent',
        outputPath: item.outputPath,
        readbackPath: item.readbackPath,
        createBundle: async () => {
          item.events.push(
            'snapshot',
            'archive-and-fingerprints',
            'inventory-validation',
            'manifest',
            'encryption',
          );
          return { ...bundle, ciphertextSha256: actualSha };
        },
        store: {
          ...item.store,
          head: vi.fn(async (key: string) => {
            item.events.push('head');
            return { key, bytes: 6, sha256: actualSha };
          }),
        },
        heartbeat: item.heartbeat,
      });
      expect(result.classification).toBe('PRODUCTION_BACKUP_RECOVERY_POINT_VERIFIED');
      expect(item.events).toEqual([
        'snapshot',
        'archive-and-fingerprints',
        'inventory-validation',
        'manifest',
        'encryption',
        'upload',
        'head',
        'download',
        'heartbeat-success',
      ]);
      expect(result.objectKey).toBe(
        'frequent/2026/09/12/20260912T010203Z-2381dc311dff-0123456789abcdef.age',
      );
    } finally {
      await cleanupRecoveryWorkDirectory(item.directory);
    }
  });

  it.each([
    'BACKUP_SNAPSHOT_FAILED',
    'BACKUP_APPLICATION_EXPORT_FAILED',
    'BACKUP_AUTH_FEATURE_STATE_UNSUPPORTED',
    'BACKUP_INVENTORY_VALIDATION_FAILED',
    'BACKUP_MANIFEST_FAILED',
    'BACKUP_ENCRYPTION_FAILED',
  ] as const)('stops before upload after %s', async (code) => {
    const item = await fixture();
    try {
      await expect(
        executeVerifiedBackup({
          retentionClass: 'frequent',
          outputPath: item.outputPath,
          readbackPath: item.readbackPath,
          createBundle: async () => {
            throw new RecoveryError(code, 'safe');
          },
          store: item.store,
          heartbeat: item.heartbeat,
        }),
      ).rejects.toMatchObject({ code });
      expect(item.store.putImmutable).not.toHaveBeenCalled();
      expect(item.heartbeat.success).not.toHaveBeenCalled();
      expect(item.heartbeat.failure).toHaveBeenCalledOnce();
    } finally {
      await cleanupRecoveryWorkDirectory(item.directory);
    }
  });

  it('never sends success for upload, metadata, byte-count or SHA failures', async () => {
    for (const mode of ['upload', 'head', 'bytes', 'sha', 'download'] as const) {
      const item = await fixture();
      try {
        const store = {
          putImmutable: vi.fn(async () => {
            if (mode === 'upload') throw new Error('private');
          }),
          head: vi.fn(async (key: string) =>
            mode === 'head'
              ? null
              : {
                  key,
                  bytes: mode === 'bytes' ? 7 : 6,
                  sha256: mode === 'sha' ? 'b'.repeat(64) : sha,
                },
          ),
          download: vi.fn(async (_key: string, destination: string) => {
            if (mode === 'download') throw new Error('private');
            await writeFile(destination, 'cipher');
          }),
        };
        await expect(
          executeVerifiedBackup({
            retentionClass: 'frequent',
            outputPath: item.outputPath,
            readbackPath: item.readbackPath,
            createBundle: async () => bundle,
            store,
            heartbeat: item.heartbeat,
          }),
        ).rejects.toBeInstanceOf(RecoveryError);
        expect(item.heartbeat.success).not.toHaveBeenCalled();
      } finally {
        await cleanupRecoveryWorkDirectory(item.directory);
      }
    }
  });

  it('reports heartbeat failure after preserving a verified recovery point', async () => {
    const item = await fixture();
    try {
      const actualSha = 'c806cd9c716cfbfdb4763c71dd1394b3e602fce81291a0338bf8e3225416ac32';
      item.heartbeat.success.mockRejectedValueOnce(
        new RecoveryError('BACKUP_HEARTBEAT_FAILED', 'monitoring failed'),
      );
      await expect(
        executeVerifiedBackup({
          retentionClass: 'weekly',
          outputPath: item.outputPath,
          readbackPath: item.readbackPath,
          createBundle: async () => ({ ...bundle, ciphertextSha256: actualSha }),
          store: {
            ...item.store,
            head: vi.fn(async (key: string) => ({ key, bytes: 6, sha256: actualSha })),
          },
          heartbeat: item.heartbeat,
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_HEARTBEAT_FAILED' });
      expect(item.store.download).toHaveBeenCalledOnce();
      expect(item.heartbeat.failure).not.toHaveBeenCalled();
    } finally {
      await cleanupRecoveryWorkDirectory(item.directory);
    }
  });
});

describe('transport and log safety', () => {
  it('requires the exact private R2 endpoint shape and sends immutable signed requests', async () => {
    const directory = await createRecoveryWorkDirectory();
    const bodyPath = join(directory, 'cipher.age');
    await writeFile(bodyPath, 'cipher');
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
      const store = new R2RecoveryObjectStore(
        {
          NODE_ENV: 'test',
          R2_ENDPOINT: 'https://account.eu.r2.cloudflarestorage.com',
          R2_BUCKET_NAME: 'madrasio-production-backups',
          R2_ACCESS_KEY_ID: 'access-secret-shaped',
          R2_SECRET_ACCESS_KEY: 'secret-secret-shaped',
        },
        fetcher,
        () => new Date('2026-09-12T01:02:03Z'),
      );
      await store.putImmutable({ key: 'frequent/x.age', bodyPath, bytes: 6, sha256: sha });
      const headers = calls[0]?.init?.headers as Record<string, string>;
      expect(headers['if-none-match']).toBe('*');
      expect(headers['x-amz-meta-sha256']).toBe(sha);
      expect(calls[0]?.url).not.toContain('secret-shaped');
      expect(headers.authorization).not.toContain('secret-secret-shaped');
      expect(
        () =>
          new R2RecoveryObjectStore({
            NODE_ENV: 'test',
            R2_ENDPOINT: 'http://localhost:9000',
            R2_BUCKET_NAME: 'bucket',
            R2_ACCESS_KEY_ID: 'x',
            R2_SECRET_ACCESS_KEY: 'y',
          }),
      ).toThrow('private R2 target');
    } finally {
      await cleanupRecoveryWorkDirectory(directory);
    }
  });

  it('fails a duplicate immutable R2 key without selecting a replacement key', async () => {
    const directory = await createRecoveryWorkDirectory();
    const bodyPath = join(directory, 'cipher.age');
    await writeFile(bodyPath, 'cipher');
    const fetcher = vi.fn(async () => new Response(null, { status: 412 })) as typeof fetch;
    try {
      const store = new R2RecoveryObjectStore(
        {
          NODE_ENV: 'test',
          R2_ENDPOINT: 'https://account.eu.r2.cloudflarestorage.com',
          R2_BUCKET_NAME: 'madrasio-production-backups',
          R2_ACCESS_KEY_ID: 'access-secret-shaped',
          R2_SECRET_ACCESS_KEY: 'secret-secret-shaped',
        },
        fetcher,
      );
      await expect(
        store.putImmutable({ key: 'frequent/collision.age', bodyPath, bytes: 6, sha256: sha }),
      ).rejects.toMatchObject({ code: 'BACKUP_UPLOAD_FAILED' });
      expect(fetcher).toHaveBeenCalledOnce();
    } finally {
      await cleanupRecoveryWorkDirectory(directory);
    }
  });

  it('accepts only the dedicated Cronitor monitor without exposing its URL', async () => {
    const fetcher = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 200 }),
    );
    const heartbeat = new CronitorRecoveryHeartbeat(
      'https://cronitor.link/p/test-token/madrasio-production-backup',
      fetcher as typeof fetch,
    );
    await heartbeat.success({ backupId: 'safe', ciphertextSha256: sha, completedAt: 'now' });
    expect(fetcher).toHaveBeenCalledOnce();
    const target = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(target.searchParams.get('env')).toBe('production');
    expect(target.searchParams.has('state')).toBe(false);
    expect(() => new CronitorRecoveryHeartbeat('https://example.com/p/key/other')).toThrow(
      'heartbeat target',
    );
  });

  it('keeps secret-shaped values out of safe errors and summaries', async () => {
    const directory = await createRecoveryWorkDirectory();
    const summary = join(directory, 'summary.md');
    const secrets = [
      'postgresql://user:secret@host/db',
      'r2-access-secret',
      'r2-secret-secret',
      'https://cronitor.link/p/private/key',
      'BEGIN CERTIFICATE private material',
      'auth-password-hash',
    ];
    try {
      await appendSafeBackupSummary(summary, 'b'.repeat(40), {
        ...bundle,
        objectKey: createRecoveryObjectKey('frequent', bundle),
        retentionClass: 'frequent',
        classification: 'PRODUCTION_BACKUP_RECOVERY_POINT_VERIFIED',
      });
      const output = `${JSON.stringify(safeRecoveryError(new Error(secrets.join(' '))))}\n${await readFile(summary, 'utf8')}`;
      for (const secret of secrets) expect(output).not.toContain(secret);
    } finally {
      await cleanupRecoveryWorkDirectory(directory);
    }
  });
});
